#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ARTIFACT_ID="PW7404-1091"
CONFIRMATION="${PW7404_RETIRE_LEGACY_LUCY:-}"
LEGACY_NAME="lucy-brain"
LEGACY_DIR="/root/lucy-engine"
BACKUP_ROOT="/root/spacebot-backups"
BACKUP_KEY_ROOT="/root/spacebot-backup-keys"
MARKER_DIR="/var/lib/spacebot"
MARKER_PATH="$MARKER_DIR/PW7404-1091-legacy-lucy-retired.json"
OPERATION_PATH="$MARKER_DIR/PW7404-1091-operation.json"
LOCK_PATH="/run/lock/spacebot-lucy-single-writer.lock"
MODE="${1:---check}"

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "$ARTIFACT_ID requires root" >&2
    exit 77
  fi
}

require_commands() {
  local command_name
  for command_name in pm2 jq tar sha256sum python3 flock openssl timeout systemctl; do
    command -v "$command_name" >/dev/null 2>&1 || {
      echo "missing required command: $command_name" >&2
      exit 69
    }
  done
}

live_process_present() {
  local snapshot
  if ! snapshot="$(timeout 10s pm2 jlist 2>/dev/null)" ||
    ! jq -e 'type == "array"' <<<"$snapshot" >/dev/null; then
    echo "unable to inspect live PM2 state" >&2
    return 0
  fi
  jq -e --arg name "$LEGACY_NAME" 'any(.[]; .name == $name)' \
    <<<"$snapshot" >/dev/null
}

saved_process_present() {
  [[ -f /root/.pm2/dump.pm2 ]] || return 1
  if ! jq -e 'type == "array"' /root/.pm2/dump.pm2 >/dev/null; then
    echo "unable to parse root PM2 resurrection state" >&2
    return 0
  fi
  jq -e --arg name "$LEGACY_NAME" 'any(.[]; .name == $name)' \
    /root/.pm2/dump.pm2 >/dev/null
}

legacy_schedule_present() {
  local paths=() path status
  for path in /etc/crontab /etc/cron.d /etc/cron.daily /etc/cron.hourly \
    /var/spool/cron /etc/systemd/system /usr/lib/systemd/system \
    /etc/rc.local /etc/init.d; do
    [[ -e "$path" ]] && paths+=("$path")
  done
  set +e
  grep -RiqE 'lucy-brain|/root/lucy-engine' \
    "${paths[@]}" 2>/dev/null
  status=$?
  set -e
  case "$status" in
    0) return 0 ;;
    1) return 1 ;;
    *)
      echo "unable to inspect cron/systemd/startup paths" >&2
      return 0
      ;;
  esac
}

other_saved_process_present() {
  local dump
  for dump in /home/*/.pm2/dump.pm2; do
    [[ -f "$dump" ]] || continue
    jq -e 'type == "array"' "$dump" >/dev/null 2>&1 || {
      echo "unable to parse PM2 dump: $dump" >&2
      return 0
    }
    jq -e --arg name "$LEGACY_NAME" 'any(.[]; .name == $name)' "$dump" \
      >/dev/null 2>&1 && return 0
  done
  return 1
}

other_pm2_daemon_present() {
  ps -eo user=,args= |
    awk '$1 != "root" && /PM2 v.*God Daemon/ { found=1 } END { exit !found }'
}

legacy_at_job_present() {
  command -v atq >/dev/null 2>&1 || return 1
  local job_id
  atq >/dev/null 2>&1 || {
    echo "unable to inspect queued at jobs" >&2
    return 0
  }
  while read -r job_id _; do
    [[ -n "${job_id:-}" ]] || continue
    at -c "$job_id" 2>/dev/null |
      grep -qiE 'lucy-brain|/root/lucy-engine' && return 0
  done < <(atq 2>/dev/null)
  return 1
}

legacy_container_present() {
  command -v docker >/dev/null 2>&1 || return 1
  local containers
  if ! containers="$(
    timeout 5s docker ps -a --format '{{.Names}} {{.Image}} {{.Command}}' \
      2>/dev/null
  )"; then
    echo "unable to inspect containers" >&2
    return 0
  fi
  grep -qiE 'lucy-brain|/root/lucy-engine' <<<"$containers"
}

legacy_process_present() {
  python3 - <<'PY'
import os
import pathlib
import sys

targets = {
    "/root/lucy-engine/lucy_cron.sh",
    "/root/lucy-engine/tick_loop.py",
    "/root/lucy-engine/action_executors.py",
}
try:
    for process_dir in pathlib.Path("/proc").iterdir():
        if not process_dir.name.isdigit():
            continue
        try:
            arguments = [
                part.decode(errors="replace")
                for part in (process_dir / "cmdline").read_bytes().split(b"\0")
                if part
            ]
            cwd = pathlib.Path(os.readlink(process_dir / "cwd"))
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            continue
        resolved = {
            str(pathlib.Path(argument) if argument.startswith("/") else cwd / argument)
            for argument in arguments[1:]
        }
        if targets.intersection(resolved):
            sys.exit(0)
except OSError:
    sys.exit(2)
sys.exit(1)
PY
  local status=$?
  case "$status" in
    0) return 0 ;;
    1) return 1 ;;
    *)
      echo "unable to inspect legacy process arguments" >&2
      return 0
      ;;
  esac
}

canonical_units_safe_for_retirement() {
  local unit load_state active_state enabled_state
  for unit in spacebot-lucy-autonomy.service spacebot-lucy-autonomy.timer; do
    load_state="$(systemctl show "$unit" --property=LoadState --value 2>/dev/null || true)"
    [[ -n "$load_state" ]] || {
      echo "unable to inspect systemd unit: $unit" >&2
      return 1
    }
    [[ "$load_state" != "not-found" ]] || continue
    active_state="$(systemctl is-active "$unit" 2>/dev/null || true)"
    enabled_state="$(systemctl is-enabled "$unit" 2>/dev/null || true)"
    [[ "$active_state" != "active" && "$active_state" != "activating" ]] ||
      return 1
    case "$enabled_state" in
      disabled | masked) ;;
      *) return 1 ;;
    esac
  done
}

archive_receipt_valid() {
  [[ -f "$MARKER_PATH" ]] || return 1
  local archive expected actual
  archive="$(jq -r '.archive // empty' "$MARKER_PATH")"
  expected="$(jq -r '.archive_sha256 // empty' "$MARKER_PATH")"
  [[ "$archive" == "$BACKUP_ROOT"/* && -f "$archive" ]] || return 1
  [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || return 1
  actual="$(sha256sum "$archive" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]]
}

record_operation() {
  local status="$1"
  local line="${2:-0}"
  jq -n \
    --arg artifact "$ARTIFACT_ID" \
    --arg status "$status" \
    --arg phase "${OPERATION_PHASE:-unknown}" \
    --arg backup_dir "${OPERATION_BACKUP:-unknown}" \
    --argjson line "$line" \
    '{artifact:$artifact,status:$status,phase:$phase,backup_dir:$backup_dir,line:$line}' \
    >"$OPERATION_PATH.tmp"
  chmod 0600 "$OPERATION_PATH.tmp"
  mv -f "$OPERATION_PATH.tmp" "$OPERATION_PATH"
}

record_failure() {
  local exit_code="$1"
  local line="$2"
  set +e
  record_operation "failed_exit_$exit_code" "$line"
  echo "$ARTIFACT_ID failed during ${OPERATION_PHASE:-unknown}; see $OPERATION_PATH" >&2
  exit "$exit_code"
}

verify_retired() {
  local failed=0
  live_process_present && {
    echo "legacy PM2 process remains present" >&2
    failed=1
  }
  saved_process_present && {
    echo "legacy PM2 resurrection entry remains present" >&2
    failed=1
  }
  legacy_schedule_present && {
    echo "legacy cron/systemd/startup reference remains present" >&2
    failed=1
  }
  other_saved_process_present && {
    echo "legacy PM2 resurrection entry exists under another user" >&2
    failed=1
  }
  other_pm2_daemon_present && {
    echo "non-root PM2 daemon could resurrect an uninspected writer" >&2
    failed=1
  }
  legacy_at_job_present && {
    echo "legacy queued at job remains present" >&2
    failed=1
  }
  legacy_container_present && {
    echo "legacy container remains present" >&2
    failed=1
  }
  legacy_process_present && {
      echo "legacy LUCY mutation process remains running" >&2
      failed=1
    }
  archive_receipt_valid || {
    echo "retirement marker is absent" >&2
    failed=1
  }
  local retired_entrypoint
  for retired_entrypoint in lucy_cron.sh tick_loop.py action_executors.py; do
    [[ -f "$LEGACY_DIR/$retired_entrypoint" ]] &&
      grep -q 'RETIRED BY PW7404-1091' "$LEGACY_DIR/$retired_entrypoint" &&
      [[ ! -x "$LEGACY_DIR/$retired_entrypoint" ]] || {
        echo "legacy entrypoint is not tombstoned: $retired_entrypoint" >&2
        failed=1
      }
  done
  local alternate_launcher
  while IFS= read -r alternate_launcher; do
    grep -q 'RETIRED BY PW7404-1091' "$alternate_launcher" || {
      echo "alternate legacy launcher is not tombstoned: $alternate_launcher" >&2
      failed=1
    }
  done < <(
    grep -IlE 'lucy_cron\.sh|tick_loop\.py|action_executors\.py' \
      "$LEGACY_DIR"/*.sh "$LEGACY_DIR"/*.bak 2>/dev/null || true
  )
  [[ "$failed" -eq 0 ]]
}

write_tombstone() {
  local destination="$1"
  local kind="$2"
  local temporary
  temporary="$(mktemp "$LEGACY_DIR/.pw7404-1091.XXXXXX")"
  if [[ "$kind" == "shell" ]]; then
    cat >"$temporary" <<'EOF'
#!/usr/bin/env bash
echo "RETIRED BY PW7404-1091: legacy LUCY writer is permanently disabled" >&2
exit 78
EOF
  else
    cat >"$temporary" <<'EOF'
raise SystemExit("RETIRED BY PW7404-1091: legacy LUCY writer is permanently disabled")
EOF
  fi
  chmod 0444 "$temporary"
  mv -f "$temporary" "$destination"
}

apply_retirement() {
  if [[ "$CONFIRMATION" != "$ARTIFACT_ID" ]]; then
    echo "set PW7404_RETIRE_LEGACY_LUCY=$ARTIFACT_ID before --apply" >&2
    exit 64
  fi
  if [[ -f "$MARKER_PATH" ]]; then
    verify_retired
    echo "$ARTIFACT_ID legacy LUCY retirement already complete"
    return 0
  fi
  if [[ -f "$OPERATION_PATH" ]]; then
    echo "incomplete prior retirement exists; inspect $OPERATION_PATH before retry" >&2
    exit 75
  fi
  if ! canonical_units_safe_for_retirement; then
    echo "canonical LUCY must be absent, disabled, or masked during retirement" >&2
    exit 75
  fi
  [[ -d "$LEGACY_DIR" ]] || {
    echo "legacy LUCY directory is absent" >&2
    exit 66
  }
  if legacy_schedule_present || other_saved_process_present ||
    other_pm2_daemon_present ||
    legacy_at_job_present || legacy_container_present; then
    echo "alternate legacy resurrection path requires manual containment before apply" >&2
    exit 75
  fi

  local timestamp backup_dir archive archive_sha key_file staging_dir
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_dir="$BACKUP_ROOT/$ARTIFACT_ID-$timestamp"
  archive="$backup_dir/legacy-lucy-forensic-backup.tar.gz.enc"
  key_file="$BACKUP_KEY_ROOT/$ARTIFACT_ID-$timestamp.key"
  staging_dir="/root/.pw7404-1091-staging-$timestamp"
  mkdir -p "$backup_dir" "$BACKUP_KEY_ROOT" "$MARKER_DIR"
  chmod 0700 "$BACKUP_ROOT" "$BACKUP_KEY_ROOT" "$backup_dir" "$MARKER_DIR"
  openssl rand -out "$key_file" 32
  chmod 0600 "$key_file"
  mkdir -p "$staging_dir"
  chmod 0700 "$staging_dir"
  OPERATION_BACKUP="$backup_dir"
  OPERATION_PHASE="inventory"
  record_operation "running" 0
  trap 'record_failure "$?" "$LINENO"' ERR

  pm2 jlist | jq --arg name "$LEGACY_NAME" \
    '[.[] | select(.name == $name) | {
      name, pm_id, status: .pm2_env.status,
      autorestart: .pm2_env.autorestart,
      cron_restart: .pm2_env.cron_restart,
      pm_exec_path: .pm2_env.pm_exec_path,
      pm_cwd: .pm2_env.pm_cwd
    }]' >"$backup_dir/pm2-live-before.json"
  pm2 jlist | jq --arg name "$LEGACY_NAME" \
    '[.[] | select(.name != $name) | {
      name,
      pm_exec_path: .pm2_env.pm_exec_path,
      pm_cwd: .pm2_env.pm_cwd,
      autorestart: .pm2_env.autorestart,
      cron_restart: .pm2_env.cron_restart,
      args: .pm2_env.args,
      node_args: .pm2_env.node_args,
      exec_interpreter: .pm2_env.exec_interpreter,
      env_names: (.pm2_env.env | keys | sort)
    }] | sort_by(.name)' >"$backup_dir/pm2-non-lucy-before.json"
  [[ ! -f /root/.pm2/dump.pm2 ]] ||
    cp -a /root/.pm2/dump.pm2 "$staging_dir/dump.pm2.before"
  crontab -l >"$staging_dir/root-crontab.before" 2>/dev/null || true
  systemctl list-timers --all --no-pager \
    >"$staging_dir/systemd-timers.before.txt" 2>/dev/null || true
  printf '%s\n' \
    '{"legacy_authority":"shared_application_supabase_service_role","revoked":false,"scope":"host-execution-retirement-only"}' \
    >"$backup_dir/authority-boundary.json"

  OPERATION_PHASE="pm2_stop"
  pm2 stop "$LEGACY_NAME" >/dev/null
  [[ "$(pm2 jlist | jq -r --arg name "$LEGACY_NAME" \
    '.[] | select(.name == $name) | .pm2_env.status')" == "stopped" ]]
  ! legacy_process_present

  OPERATION_PHASE="pm2_delete_and_save"
  pm2 delete "$LEGACY_NAME" >/dev/null
  ! live_process_present
  pm2 save --force >/dev/null
  ! saved_process_present
  pm2 jlist | jq --arg name "$LEGACY_NAME" \
    '[.[] | select(.name != $name) | {
      name,
      pm_exec_path: .pm2_env.pm_exec_path,
      pm_cwd: .pm2_env.pm_cwd,
      autorestart: .pm2_env.autorestart,
      cron_restart: .pm2_env.cron_restart,
      args: .pm2_env.args,
      node_args: .pm2_env.node_args,
      exec_interpreter: .pm2_env.exec_interpreter,
      env_names: (.pm2_env.env | keys | sort)
    }] | sort_by(.name)' >"$backup_dir/pm2-non-lucy-after.json"
  diff -u "$backup_dir/pm2-non-lucy-before.json" \
    "$backup_dir/pm2-non-lucy-after.json" >"$backup_dir/pm2-parity.diff"

  OPERATION_PHASE="encrypted_backup"
  tar --acls --xattrs -cz -C / \
    root/lucy-engine \
    "$staging_dir" \
    $(
      [[ ! -d /root/.lucy/data ]] || printf '%s ' root/.lucy/data
      [[ ! -d /root/.lucy/logs ]] || printf '%s ' root/.lucy/logs
    ) |
    openssl enc -aes-256-cbc -salt -pbkdf2 -pass "file:$key_file" \
      -out "$archive"
  archive_sha="$(sha256sum "$archive" | awk '{print $1}')"
  openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:$key_file" \
    -in "$archive" |
    tar -tzf - >/dev/null
  rm -rf -- "$staging_dir"
  printf '%s  %s\n' "$archive_sha" "$(basename "$archive")" \
    >"$backup_dir/SHA256SUMS"
  chmod -R go-rwx "$backup_dir"

  OPERATION_PHASE="entrypoint_tombstones"
  write_tombstone "$LEGACY_DIR/lucy_cron.sh" shell
  write_tombstone "$LEGACY_DIR/tick_loop.py" python
  write_tombstone "$LEGACY_DIR/action_executors.py" python
  while IFS= read -r legacy_launcher; do
    write_tombstone "$legacy_launcher" shell
  done < <(
    grep -IlE 'lucy_cron\.sh|tick_loop\.py|action_executors\.py' \
      "$LEGACY_DIR"/*.sh "$LEGACY_DIR"/*.bak 2>/dev/null || true
  )
  find "$LEGACY_DIR" -type d -name __pycache__ -prune -exec rm -rf -- {} +

  OPERATION_PHASE="final_receipt"
  python3 - "$MARKER_PATH" "$backup_dir" "$archive" "$archive_sha" "$key_file" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

marker_path, backup_dir, archive, archive_sha, key_file = sys.argv[1:]
payload = {
    "artifact": "PW7404-1091",
    "retired_at": datetime.now(timezone.utc).isoformat(),
    "legacy_process": "lucy-brain",
    "backup_dir": backup_dir,
    "archive": archive,
    "archive_sha256": archive_sha,
    "decryption_key_path": key_file,
    "archive_restore_listing_verified": True,
    "legacy_mutation_entrypoints_tombstoned": True,
    "legacy_database_authority_revoked": False,
    "retirement_scope": "host_execution",
    "canonical_writer_enabled": False,
}
temporary = marker_path + ".tmp"
with open(temporary, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
os.chmod(temporary, 0o600)
os.replace(temporary, marker_path)
PY

  verify_retired
  trap - ERR
  rm -f -- "$OPERATION_PATH"
  echo "$ARTIFACT_ID legacy LUCY retirement: PASS"
  echo "backup_sha256=$archive_sha"
}

require_root
require_commands
exec 8>"$LOCK_PATH"
flock -n 8 || {
  echo "another LUCY cutover operation holds $LOCK_PATH" >&2
  exit 75
}
case "$MODE" in
  --check)
    verify_retired
    echo "$ARTIFACT_ID legacy LUCY retirement check: PASS"
    ;;
  --apply)
    apply_retirement
    ;;
  *)
    echo "usage: $0 [--check|--apply]" >&2
    exit 64
    ;;
esac
