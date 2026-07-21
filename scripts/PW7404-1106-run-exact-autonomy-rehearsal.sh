#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

# Keep the process transcript machine-readable. Command diagnostics stay in the
# private rehearsal root and are represented in the final receipt by hashes.
exec 3>&1
exec 4>&2
exec 1>/dev/null
exec 2>/dev/null

readonly ARTIFACT="PW7404-1106"
readonly EXPECTED_DUMP_SHA256="639cd059053939abe6c1de0801b8056373b4b72b1e3128d78b6fd22217cf30d0"
readonly EXPECTED_MANIFEST_COUNT="246"
readonly EXPECTED_MANIFEST_SHA256="8702c3be7068295ed1300ae659705cd4e85bc32adfcccce430e0c6014f9d456e"
readonly EXPECTED_1086_SHA256="7b33208b75a2bf554e7bb73489050bde720a9992858c9874aee63086d81ecd89"
readonly EXPECTED_1101_SHA256="22f7ad3b7ed714f13cbed804a52945ed90a5279434ac8219cc78a104e103cbd4"
readonly INPUT_MANIFEST_RELATIVE_PATH="scripts/PW7404-1113-autonomy-rehearsal-input-manifest-20260712.sha256"
readonly EXPECTED_INPUT_MANIFEST_SHA256="b2ece04184e6e988d6f30d41a2906e1c20c0db1b5570a48521b2a17ffd2eace5"
readonly CLEANUP_TOKEN="PW7404-1106-DESTROY-EXACT-246-REHEARSAL"
readonly DB_HOSTNAME="localhost"
readonly DB_ADDRESS="127.0.0.1"
readonly DB_SERVER_ADDRESS_TEXT="127.0.0.1/32"
readonly ADMIN_USER="pw7404_rehearsal_admin"
readonly BASE_DB="pw7404_exact_base_1106"
readonly ROLLBACK_DB="pw7404_exact_canary_1106"
readonly APPLY_DB="pw7404_rehearsal_apply_1106"
readonly POSTGRES_OS_USER="postgres"
readonly CONTROLLER_OS_USER="nobody"

PHASE="preflight"
CLUSTER_STARTED=0
CONTROLLER_STARTED=0
CONTROLLER_PID=""
FINALIZED=0
ROOT_CREATED=0
DESTROY_REQUESTED=0
DESTROYED_JSON="false"
RUN_MODE="rehearsal"
RUN_ID=""
REHEARSAL_ROOT=""
DATA_DIR=""
MARKER_FILE=""
PG_CTL=""

emit_failure() {
  printf '{"artifact":"%s","status":"FAIL","phase":"%s","clusterStopped":%s,"destroyed":%s}\n' \
    "$ARTIFACT" "$PHASE" "$1" "$2" >&4
}

path_is_cleanup_safe() {
  local candidate lower
  candidate="$1"
  lower="${candidate,,}"
  [[ "$candidate" == /* ]] || return 1
  [[ "$candidate" != "/" && "$candidate" != "/tmp" && "$candidate" != "/var/tmp" ]] || return 1
  [[ "$lower" =~ pw7404.*1106.*rehearsal|rehearsal.*pw7404.*1106 ]] || return 1
  [[ ! "$lower" =~ (^|[/_.-])(prod|production|live|primary|supabase|neon)([/_.-]|$) ]] || return 1
}

safe_destroy() {
  local expected_marker actual_marker resolved owner
  [[ "$ROOT_CREATED" -eq 1 && -n "$REHEARSAL_ROOT" && -n "$RUN_ID" ]] || return 1
  path_is_cleanup_safe "$REHEARSAL_ROOT" || return 1
  [[ -d "$REHEARSAL_ROOT" && ! -L "$REHEARSAL_ROOT" ]] || return 1
  resolved="$(realpath -e -- "$REHEARSAL_ROOT")" || return 1
  [[ "$resolved" == "$REHEARSAL_ROOT" ]] || return 1
  owner="$(stat -c '%u' -- "$REHEARSAL_ROOT")" || return 1
  [[ "$owner" == "0" ]] || return 1
  [[ -f "$MARKER_FILE" && ! -L "$MARKER_FILE" ]] || return 1
  expected_marker="artifact=${ARTIFACT}"$'\n'"root=${REHEARSAL_ROOT}"$'\n'"run_id=${RUN_ID}"
  actual_marker="$(cat -- "$MARKER_FILE")" || return 1
  [[ "$actual_marker" == "$expected_marker" ]] || return 1
  rm -rf --one-file-system -- "$REHEARSAL_ROOT"
}

stop_cluster_best_effort() {
  if [[ "$CLUSTER_STARTED" -eq 1 && -n "$PG_CTL" && -n "$DATA_DIR" ]]; then
    if runuser -u "$POSTGRES_OS_USER" -- "$PG_CTL" -D "$DATA_DIR" -m fast -w stop \
      >/dev/null 2>&1; then
      CLUSTER_STARTED=0
      return 0
    fi
    return 1
  fi
  return 0
}

stop_controller_best_effort() {
  if [[ "$CONTROLLER_STARTED" -eq 1 && -n "$CONTROLLER_PID" ]]; then
    if kill -TERM "$CONTROLLER_PID" >/dev/null 2>&1; then
      wait "$CONTROLLER_PID" >/dev/null 2>&1 || true
    fi
    CONTROLLER_STARTED=0
    CONTROLLER_PID=""
  fi
  return 0
}

on_exit() {
  local status stopped_json destroyed_json
  status=$?
  trap - EXIT INT TERM
  if [[ "$FINALIZED" -eq 1 ]]; then
    exit "$status"
  fi
  stop_controller_best_effort || true
  stopped_json="true"
  stop_cluster_best_effort || stopped_json="false"
  destroyed_json="false"
  emit_failure "$stopped_json" "$destroyed_json"
  exit "${status:-1}"
}
trap on_exit EXIT
trap 'exit 130' INT TERM

fail() {
  return 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail
}

sha256_file() {
  sha256sum -- "$1" | awk '{print tolower($1)}'
}

run_logged() {
  local label
  label="$1"
  shift
  "$@" >"$LOG_DIR/${label}.log" 2>&1
  chmod 0600 "$LOG_DIR/${label}.log"
}

log_sha256() {
  sha256_file "$LOG_DIR/$1.log"
}

postgres_env() {
  local database
  database="$1"
  shift
  env -i \
    PATH="$POSTGRES_BIN:/usr/sbin:/usr/bin:/sbin:/bin" \
    HOME="$SECRETS_DIR" \
    LANG="C.UTF-8" \
    PGHOST="$DB_HOSTNAME" \
    PGPORT="$DB_PORT" \
    PGDATABASE="$database" \
    PGUSER="$ADMIN_USER" \
    PGPASSWORD="$ADMIN_PASSWORD" \
    PGSSLMODE="verify-full" \
    PGSSLROOTCERT="$CA_CERT" \
    "$@"
}

admin_url_for() {
  printf 'postgresql://%s:%s@%s:%s/%s?sslmode=verify-full' \
    "$ADMIN_USER" "$ADMIN_PASSWORD" "$DB_HOSTNAME" "$DB_PORT" "$1"
}

role_url_for() {
  printf 'postgresql://%s:%s@%s:%s/%s?sslmode=verify-full' \
    "$1" "$2" "$DB_HOSTNAME" "$DB_PORT" "$3"
}

run_node_for_db() {
  local database traffic_confirmation script admin_url controller_url runtime_url service_url maintenance_url
  database="$1"
  traffic_confirmation="$2"
  script="$3"
  shift 3
  admin_url="$(admin_url_for "$database")"
  controller_url="$(role_url_for spacebot_autonomy_controller "$CONTROLLER_PASSWORD" "$database")"
  runtime_url="$(role_url_for spacebot_runtime "$RUNTIME_PASSWORD" "$database")"
  service_url="$(role_url_for service_role "$SERVICE_PASSWORD" "$database")"
  maintenance_url="$(role_url_for pw7404_task_maintenance "$MAINTENANCE_PASSWORD" "$database")"

  env -i \
    PATH="$(dirname -- "$NODE_BIN"):$POSTGRES_BIN:/usr/sbin:/usr/bin:/sbin:/bin" \
    HOME="$SECRETS_DIR" \
    LANG="C.UTF-8" \
    NODE_ENV="production" \
    DATABASE_URL="$admin_url" \
    SPACEBOT_ADMIN_DATABASE_URL="$admin_url" \
    SPACEBOT_DATABASE_CA_PATH="$CA_CERT" \
    SPACEBOT_EXPECTED_DATABASE_CA_SHA256="$CA_SHA256_UPPER" \
    SPACEBOT_EXPECTED_DATABASE="$database" \
    SPACEBOT_EXPECTED_DATABASE_USER="$ADMIN_USER" \
    SPACEBOT_EXPECTED_DATABASE_HOSTNAME="$DB_HOSTNAME" \
    SPACEBOT_EXPECTED_SERVER_ADDRESS="$DB_SERVER_ADDRESS_TEXT" \
    SPACEBOT_EXPECTED_SERVER_PORT="$DB_PORT" \
    SPACEBOT_EXPECTED_SENTINEL_AGENT_ID="$SENTINEL_AGENT_ID" \
    SPACEBOT_DATABASE_TLS_SERVERNAME="$DB_HOSTNAME" \
    SPACEBOT_PSQL_BIN="$PSQL" \
    SPACEBOT_TRAFFIC_FENCED="$traffic_confirmation" \
    SPACEBOT_APPLY_DATABASE_ROLES="1" \
    SPACEBOT_APPLY_PUBLIC_CREDENTIAL_DENYLIST="PW7404-1081" \
    SPACEBOT_APPLY_LUCY_AUTONOMY="PW7404-1086" \
    SPACEBOT_APPLY_AUTONOMY_CONTROLLER_BOUNDARY="PW7404-1103" \
    SPACEBOT_APPLY_AUTONOMY_CONTROLLER="PW7404-1101" \
    SPACEBOT_ROLLBACK_CANARY="$traffic_confirmation" \
    SPACEBOT_RUNTIME_DATABASE_PASSWORD="$RUNTIME_PASSWORD" \
    SPACEBOT_RESIDENT_TASK_MAINTENANCE_DATABASE_PASSWORD="$MAINTENANCE_PASSWORD" \
    SPACEBOT_AUTONOMY_CONTROLLER_DATABASE_PASSWORD="$CONTROLLER_PASSWORD" \
    SPACEBOT_RUNTIME_DATABASE_URL="$runtime_url" \
    SPACEBOT_SERVICE_ROLE_DATABASE_URL="$service_url" \
    SPACEBOT_RESIDENT_TASK_MAINTENANCE_DATABASE_URL="$maintenance_url" \
    SPACEBOT_AUTONOMY_CONTROLLER_DATABASE_URL="$controller_url" \
    SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_DATABASE_URL="$controller_url" \
    SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_URL="http://127.0.0.1:8110" \
    SPACEBOT_AUTONOMY_VERIFY_DISPOSABLE_DATABASE="$database" \
    SPACEBOT_AUTONOMY_VERIFY_DISPOSABLE_HOST="$DB_HOSTNAME" \
    SPACEBOT_AUTONOMY_VERIFY_DISPOSABLE_CONFIRMATION="PW7404-1107:${database}@${DB_HOSTNAME}" \
    SPACEBOT_AUTONOMY_VERIFY_EXPECTED_SERVER_ADDRESS="$DB_SERVER_ADDRESS_TEXT" \
    SPACEBOT_AUTONOMY_VERIFY_EXPECTED_SERVER_PORT="$DB_PORT" \
    SPACEBOT_AUTONOMY_VERIFY_EXPECTED_SENTINEL_AGENT_ID="$SENTINEL_AGENT_ID" \
    SPACEBOT_AUTONOMY_VERIFY_EXPECTED_ADMIN_USER="$ADMIN_USER" \
    SPACEBOT_AUTONOMY_VERIFY_EXPECTED_RUNTIME_USER="spacebot_runtime" \
    SPACEBOT_AUTONOMY_VERIFY_EXPECTED_CONTROLLER_USER="spacebot_autonomy_controller" \
    SPACEBOT_AUTONOMY_VERIFY_DATABASE_CA_PATH="$CA_CERT" \
    SPACEBOT_AUTONOMY_VERIFY_EXPECTED_CA_SHA256="$CA_SHA256_UPPER" \
    SPACEBOT_AUTONOMY_VERIFY_ADMIN_DATABASE_URL="$admin_url" \
    SPACEBOT_AUTONOMY_VERIFY_RUNTIME_DATABASE_URL="$runtime_url" \
    SPACEBOT_AUTONOMY_VERIFY_CONTROLLER_DATABASE_URL="$controller_url" \
    SPACEBOT_AUTONOMY_VERIFY_CONTROLLER_HTTP_URL="http://127.0.0.1:8110" \
    "$NODE_BIN" "$REPO_ROOT/$script" "$@"
}

start_controller() {
  local controller_url
  controller_url="$(role_url_for spacebot_autonomy_controller "$CONTROLLER_PASSWORD" "$APPLY_DB")"
  printf '%s\n' "$controller_url" >"$CONTROLLER_URL_FILE"
  chmod 0600 "$CONTROLLER_URL_FILE"
  chown "$CONTROLLER_OS_USER:$CONTROLLER_OS_GROUP" "$CONTROLLER_URL_FILE"
  [[ "$(stat -c '%U:%G:%a' -- "$CONTROLLER_URL_FILE")" == \
     "$CONTROLLER_OS_USER:$CONTROLLER_OS_GROUP:600" ]] || return 1
  runuser -u "$CONTROLLER_OS_USER" -- env -i \
    PATH="$CONTROLLER_DIR:$POSTGRES_BIN:/usr/sbin:/usr/bin:/sbin:/bin" \
    HOME="$CONTROLLER_DIR" \
    LANG="C.UTF-8" \
    NODE_ENV="production" \
    SPACEBOT_AUTONOMY_CONTROLLER_DATABASE_URL_FILE="$CONTROLLER_URL_FILE" \
    SPACEBOT_AUTONOMY_CONTROLLER_DATABASE_CA_PATH="$CONTROLLER_CA_CERT" \
    SPACEBOT_AUTONOMY_CONTROLLER_EXPECTED_CA_SHA256="$CA_SHA256_UPPER" \
    SPACEBOT_AUTONOMY_CONTROLLER_EXPECTED_HOSTNAME="$DB_HOSTNAME" \
    SPACEBOT_AUTONOMY_CONTROLLER_EXPECTED_DATABASE="$APPLY_DB" \
    SPACEBOT_AUTONOMY_CONTROLLER_EXPECTED_USER="spacebot_autonomy_controller" \
    SPACEBOT_AUTONOMY_CONTROLLER_EXPECTED_ADDRESS="$DB_SERVER_ADDRESS_TEXT" \
    SPACEBOT_AUTONOMY_CONTROLLER_EXPECTED_PORT="$DB_PORT" \
    "$CONTROLLER_NODE_BIN" "$REPO_ROOT/resident-autonomy-controller/PW7404-1101-controller.mjs" \
    >"$LOG_DIR/controller.log" 2>&1 &
  CONTROLLER_PID=$!
  CONTROLLER_STARTED=1
  for _ in $(seq 1 100); do
    kill -0 "$CONTROLLER_PID" >/dev/null 2>&1 || return 1
    if curl --fail --silent --show-error --max-time 2 \
      "http://127.0.0.1:8110/health" >/dev/null 2>&1; then
      chmod 0600 "$LOG_DIR/controller.log"
      return 0
    fi
    sleep 0.1
  done
  return 1
}

run_rollback_canary() {
  local admin_url
  admin_url="$(admin_url_for "$ROLLBACK_DB")"
  printf '%s\n' "$admin_url" >"$ADMIN_URL_FILE"
  chmod 0600 "$ADMIN_URL_FILE"
  env -i \
    PATH="$(dirname -- "$NODE_BIN"):$POSTGRES_BIN:/usr/sbin:/usr/bin:/sbin:/bin" \
    HOME="$SECRETS_DIR" \
    LANG="C.UTF-8" \
    NODE_ENV="production" \
    SPACEBOT_ADMIN_DATABASE_URL_FILE="$ADMIN_URL_FILE" \
    SPACEBOT_DATABASE_CA_PATH="$CA_CERT" \
    SPACEBOT_EXPECTED_DATABASE_CA_SHA256="$CA_SHA256_UPPER" \
    SPACEBOT_EXPECTED_DATABASE="$ROLLBACK_DB" \
    SPACEBOT_EXPECTED_DATABASE_USER="$ADMIN_USER" \
    SPACEBOT_EXPECTED_DATABASE_HOSTNAME="$DB_HOSTNAME" \
    SPACEBOT_EXPECTED_SERVER_ADDRESS="$DB_SERVER_ADDRESS_TEXT" \
    SPACEBOT_EXPECTED_SERVER_PORT="$DB_PORT" \
    SPACEBOT_DATABASE_TLS_SERVERNAME="$DB_HOSTNAME" \
    SPACEBOT_ROLLBACK_CANARY="PW7404-1098" \
    "$NODE_BIN" "$REPO_ROOT/scripts/PW7404-1098-run-lucy-migration-rollback-canary.mjs"
}

assert_json_receipt() {
  local file expression
  file="$1"
  expression="$2"
  "$NODE_BIN" -e \
    'const fs=require("fs"); const p=process.argv[1]; const test=process.argv[2]; const lines=fs.readFileSync(p,"utf8").trim().split(/\r?\n/); const value=JSON.parse(lines.at(-1)); if(!Function("r",`return (${test})`)(value)) process.exit(1);' \
    "$file" "$expression" >/dev/null 2>&1
}

PHASE="preflight_platform"
if [[ "$#" -eq 1 && "$1" == "--cleanup-only" ]]; then
  RUN_MODE="cleanup-only"
elif [[ "$#" -ne 0 ]]; then
  fail
fi
[[ "$(uname -s)" == "Linux" ]] || fail
[[ "$EUID" -eq 0 ]] || fail
for command_name in awk curl find findmnt flock getent grep head install openssl pg_config python3 realpath runuser seq sha256sum stat; do
  require_command "$command_name"
done
id "$POSTGRES_OS_USER" >/dev/null 2>&1 || fail
id "$CONTROLLER_OS_USER" >/dev/null 2>&1 || fail
[[ "$(id -u "$CONTROLLER_OS_USER")" != "0" ]] || fail
[[ "$(id -u "$CONTROLLER_OS_USER")" != "$(id -u "$POSTGRES_OS_USER")" ]] || fail
CONTROLLER_OS_GROUP="$(id -gn "$CONTROLLER_OS_USER")"

PHASE="preflight_inputs"
[[ -n "${PW7404_REHEARSAL_ROOT:-}" ]] || fail
if [[ "$RUN_MODE" == "cleanup-only" ]]; then
  [[ "${PW7404_REHEARSAL_CLEANUP_TOKEN:-}" == "$CLEANUP_TOKEN" ]] || fail
  DESTROY_REQUESTED=1
else
  [[ -n "${PW7404_SOURCE_DUMP:-}" ]] || fail
  [[ -z "${PW7404_REHEARSAL_CLEANUP_TOKEN:-}" ]] || fail
fi

# Refuse inherited database routing. Every connection below is rebuilt from the
# private cluster identity, so accepting an ambient target only adds risk.
for variable_name in \
  DATABASE_URL PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE \
  SPACEBOT_ADMIN_DATABASE_URL SPACEBOT_ADMIN_DATABASE_URL_FILE \
  SPACEBOT_AUTONOMY_CONTROLLER_DATABASE_URL \
  SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_DATABASE_URL; do
  [[ -z "${!variable_name:-}" ]] || fail
done

[[ "$PW7404_REHEARSAL_ROOT" == /* ]] || fail
[[ "$PW7404_REHEARSAL_ROOT" =~ ^[A-Za-z0-9_./-]+$ ]] || fail
REHEARSAL_ROOT="$(realpath -m -- "$PW7404_REHEARSAL_ROOT")"
path_is_cleanup_safe "$REHEARSAL_ROOT" || fail
[[ "$REHEARSAL_ROOT" != /mnt/* && "$REHEARSAL_ROOT" != /media/* && \
   "$REHEARSAL_ROOT" != /run/media/* ]] || fail
[[ ! -L "$REHEARSAL_ROOT" ]] || fail
if [[ "$RUN_MODE" == "cleanup-only" ]]; then
  [[ -d "$REHEARSAL_ROOT" ]] || fail
else
  [[ "$PW7404_SOURCE_DUMP" == /* ]] || fail
  [[ "$PW7404_SOURCE_DUMP" =~ ^[A-Za-z0-9_./-]+$ ]] || fail
  [[ ! -L "$PW7404_SOURCE_DUMP" && -f "$PW7404_SOURCE_DUMP" ]] || fail
  SOURCE_DUMP="$(realpath -e -- "$PW7404_SOURCE_DUMP")"
  [[ ! "${SOURCE_DUMP,,}" =~ (^|[/_.-])(prod|production|live|primary|supabase|neon)([/_.-]|$) ]] || fail
  [[ ! -e "$REHEARSAL_ROOT" || -d "$REHEARSAL_ROOT" ]] || fail
fi
if [[ "$RUN_MODE" == "rehearsal" && -d "$REHEARSAL_ROOT" ]]; then
  [[ -z "$(find "$REHEARSAL_ROOT" -mindepth 1 -print -quit)" ]] || fail
fi

probe_path="$(dirname -- "$REHEARSAL_ROOT")"
while [[ ! -e "$probe_path" ]]; do
  next_probe="$(dirname -- "$probe_path")"
  [[ "$next_probe" != "$probe_path" ]] || fail
  probe_path="$next_probe"
done
filesystem_type="$(findmnt -no FSTYPE -T "$probe_path")"
case "$filesystem_type" in
  ext2|ext3|ext4|xfs|btrfs|zfs|tmpfs) ;;
  *) fail ;;
esac

if [[ "$RUN_MODE" == "cleanup-only" ]]; then
  PHASE="cleanup_validate_marker"
  ROOT_CREATED=1
  MARKER_FILE="$REHEARSAL_ROOT/.pw7404-1106-owned"
  [[ -f "$MARKER_FILE" && ! -L "$MARKER_FILE" ]] || fail
  [[ "$(stat -c '%u:%a' -- "$MARKER_FILE")" == "0:600" ]] || fail
  mapfile -t marker_lines <"$MARKER_FILE"
  [[ "${#marker_lines[@]}" -eq 3 ]] || fail
  [[ "${marker_lines[0]}" == "artifact=$ARTIFACT" ]] || fail
  [[ "${marker_lines[1]}" == "root=$REHEARSAL_ROOT" ]] || fail
  [[ "${marker_lines[2]}" =~ ^run_id=([0-9a-f]{32})$ ]] || fail
  RUN_ID="${BASH_REMATCH[1]}"

  PHASE="cleanup_validate_receipt"
  cleanup_receipt="$REHEARSAL_ROOT/PW7404-1106-sanitized-receipt.json"
  [[ -f "$cleanup_receipt" && ! -L "$cleanup_receipt" ]] || fail
  [[ "$(stat -c '%u:%a' -- "$cleanup_receipt")" == "0:600" ]] || fail
  python3 - "$cleanup_receipt" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as handle:
    receipt = json.load(handle)
if not (
    receipt.get("artifact") == "PW7404-1106"
    and receipt.get("status") == "PASS"
    and receipt.get("clusterStopped") is True
    and receipt.get("controllerStopped") is True
    and receipt.get("destroyed") is False
):
    raise SystemExit(1)
PY
  prior_receipt_sha256="$(sha256_file "$cleanup_receipt")"

  PHASE="cleanup_verify_stopped"
  DATA_DIR="$REHEARSAL_ROOT/pgdata"
  [[ -d "$DATA_DIR" && ! -L "$DATA_DIR" ]] || fail
  [[ "$(stat -c '%U' -- "$DATA_DIR")" == "$POSTGRES_OS_USER" ]] || fail
  POSTGRES_BIN="$(pg_config --bindir)"
  PG_CTL="$POSTGRES_BIN/pg_ctl"
  [[ -x "$PG_CTL" ]] || fail
  if runuser -u "$POSTGRES_OS_USER" -- "$PG_CTL" -D "$DATA_DIR" status \
    >/dev/null 2>&1; then
    fail
  fi
  if [[ -f "$DATA_DIR/postmaster.pid" ]]; then
    stale_pid="$(head -n 1 "$DATA_DIR/postmaster.pid")"
    if [[ "$stale_pid" =~ ^[0-9]+$ ]] && kill -0 "$stale_pid" >/dev/null 2>&1; then
      fail
    fi
  fi

  PHASE="cleanup_destroy"
  safe_destroy || fail
  FINALIZED=1
  printf '{"artifact":"%s","status":"CLEANUP_PASS","priorReceiptSha256":"%s","clusterStopped":true,"destroyed":true}\n' \
    "$ARTIFACT" "$prior_receipt_sha256" >&3
  exit 0
fi

PHASE="preflight_dump"
actual_dump_sha256="$(sha256_file "$SOURCE_DUMP")"
[[ "$actual_dump_sha256" == "$EXPECTED_DUMP_SHA256" ]] || fail
[[ "$(head -c 5 -- "$SOURCE_DUMP")" == "PGDMP" ]] || fail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
actual_input_manifest_sha256="$(sha256_file "$REPO_ROOT/$INPUT_MANIFEST_RELATIVE_PATH")"
[[ "$actual_input_manifest_sha256" == "$EXPECTED_INPUT_MANIFEST_SHA256" ]] || fail
(cd -- "$REPO_ROOT" && sha256sum --check --strict "$INPUT_MANIFEST_RELATIVE_PATH") \
  >/dev/null 2>&1 || fail
for required_file in \
  "$INPUT_MANIFEST_RELATIVE_PATH" \
  scripts/PW7404-1055-provision-database-roles.mjs \
  scripts/PW7404-1081-apply-public-machine-credential-denylist.mjs \
  scripts/PW7404-1082-verify-public-machine-credential-denylist.mjs \
  scripts/PW7404-1086-apply-canonical-lucy-autonomy.mjs \
  scripts/PW7404-1098-run-lucy-migration-rollback-canary.mjs \
  scripts/PW7404-1101-provision-resident-autonomy-controller.mjs \
  scripts/PW7404-1103-apply-resident-autonomy-controller-boundary.mjs \
  scripts/PW7404-1107-verify-autonomy-controller-database.mjs \
  resident-autonomy-controller/PW7404-1101-controller.mjs \
  resident-autonomy-controller/package.json \
  resident-autonomy-controller/package-lock.json \
  config/PW7404-1101-spacebot-resident-autonomy-controller.service \
  drizzle/migrations/PW7404-1081-01-public-machine-credential-denylist-20260712.sql \
  drizzle/migrations/PW7404-1086-01-canonical-lucy-autonomy-ledger-20260712.sql \
  drizzle/migrations/PW7404-1101-01-resident-autonomy-controller-boundary-20260712.sql; do
  [[ -f "$REPO_ROOT/$required_file" && ! -L "$REPO_ROOT/$required_file" ]] || fail
done

migration_1081_sha256="$(sha256_file "$REPO_ROOT/drizzle/migrations/PW7404-1081-01-public-machine-credential-denylist-20260712.sql")"
migration_1086_sha256="$(sha256_file "$REPO_ROOT/drizzle/migrations/PW7404-1086-01-canonical-lucy-autonomy-ledger-20260712.sql")"
migration_1101_sha256="$(sha256_file "$REPO_ROOT/drizzle/migrations/PW7404-1101-01-resident-autonomy-controller-boundary-20260712.sql")"
verifier_1107_sha256="$(sha256_file "$REPO_ROOT/scripts/PW7404-1107-verify-autonomy-controller-database.mjs")"
[[ "$migration_1086_sha256" == "$EXPECTED_1086_SHA256" ]] || fail
[[ "$migration_1101_sha256" == "$EXPECTED_1101_SHA256" ]] || fail

POSTGRES_BIN="$(pg_config --bindir)"
[[ -x "$POSTGRES_BIN/initdb" && -x "$POSTGRES_BIN/pg_ctl" ]] || fail
for postgres_tool in createdb pg_restore psql; do
  [[ -x "$POSTGRES_BIN/$postgres_tool" ]] || fail
done
INITDB="$POSTGRES_BIN/initdb"
PG_CTL="$POSTGRES_BIN/pg_ctl"
CREATEDB="$POSTGRES_BIN/createdb"
PG_RESTORE="$POSTGRES_BIN/pg_restore"
PSQL="$POSTGRES_BIN/psql"
postgres_version="$($POSTGRES_BIN/postgres --version)"
postgres_version_regex='PostgreSQL[)][[:space:]]17([.][0-9]+)?([[:space:]]|$)'
[[ "$postgres_version" =~ $postgres_version_regex ]] || fail
"$PG_RESTORE" --list "$SOURCE_DUMP" >/dev/null 2>&1 || fail

NODE_BIN="${PW7404_NODE_BIN:-}"
if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node 2>/dev/null || true)"
fi
if [[ -z "$NODE_BIN" ]]; then
  for node_candidate in /usr/bin/node /usr/local/bin/node /home/*/.local/bin/node; do
    if [[ -x "$node_candidate" ]]; then
      NODE_BIN="$node_candidate"
      break
    fi
  done
fi
[[ -n "$NODE_BIN" && -x "$NODE_BIN" ]] || fail
"$NODE_BIN" --version >/dev/null 2>&1 || fail

PHASE="create_private_root"
mkdir -p -- "$REHEARSAL_ROOT"
ROOT_CREATED=1
chown root:"$POSTGRES_OS_USER" "$REHEARSAL_ROOT"
chmod 0711 "$REHEARSAL_ROOT"
[[ "$(stat -c '%u:%a' -- "$REHEARSAL_ROOT")" == "0:711" ]] || fail
exec 9>"$REHEARSAL_ROOT/.lock"
flock -n 9 || fail

RUN_ID="$(openssl rand -hex 16)"
MARKER_FILE="$REHEARSAL_ROOT/.pw7404-1106-owned"
printf 'artifact=%s\nroot=%s\nrun_id=%s\n' "$ARTIFACT" "$REHEARSAL_ROOT" "$RUN_ID" >"$MARKER_FILE"
chmod 0600 "$MARKER_FILE"

DATA_DIR="$REHEARSAL_ROOT/pgdata"
SECRETS_DIR="$REHEARSAL_ROOT/secrets"
LOG_DIR="$REHEARSAL_ROOT/private-logs"
CONTROLLER_DIR="$REHEARSAL_ROOT/controller-runtime"
mkdir -p -- "$DATA_DIR" "$SECRETS_DIR" "$LOG_DIR" "$CONTROLLER_DIR"
chown "$POSTGRES_OS_USER:$POSTGRES_OS_USER" "$DATA_DIR"
chown "$CONTROLLER_OS_USER:$CONTROLLER_OS_GROUP" "$CONTROLLER_DIR"
chmod 0700 "$DATA_DIR" "$SECRETS_DIR" "$LOG_DIR"
chmod 0700 "$CONTROLLER_DIR"
CONTROLLER_NODE_BIN="$CONTROLLER_DIR/node"
install -o root -g root -m 0755 "$NODE_BIN" "$CONTROLLER_NODE_BIN"

ADMIN_PASSWORD="$(openssl rand -hex 32)"
RUNTIME_PASSWORD="$(openssl rand -hex 32)"
SERVICE_PASSWORD="$(openssl rand -hex 32)"
MAINTENANCE_PASSWORD="$(openssl rand -hex 32)"
CONTROLLER_PASSWORD="$(openssl rand -hex 32)"
AUTHENTICATOR_PASSWORD="$(openssl rand -hex 32)"
ADMIN_URL_FILE="$SECRETS_DIR/admin-url"
CONTROLLER_URL_FILE="$CONTROLLER_DIR/database-url"
INITDB_PASSWORD_FILE="$REHEARSAL_ROOT/.initdb-password"
printf '%s\n' "$ADMIN_PASSWORD" >"$INITDB_PASSWORD_FILE"
chown "$POSTGRES_OS_USER:$POSTGRES_OS_USER" "$INITDB_PASSWORD_FILE"
chmod 0600 "$INITDB_PASSWORD_FILE"

PHASE="create_throwaway_tls"
CA_CERT="$SECRETS_DIR/ca.crt"
CA_KEY="$SECRETS_DIR/ca.key"
SERVER_KEY_STAGING="$SECRETS_DIR/server.key"
SERVER_CERT_STAGING="$SECRETS_DIR/server.crt"
SERVER_KEY="$DATA_DIR/server.key"
SERVER_CERT="$DATA_DIR/server.crt"
SERVER_CSR="$SECRETS_DIR/server.csr"
SERVER_EXT="$SECRETS_DIR/server.ext"
printf 'subjectAltName=DNS:%s,IP:%s\nextendedKeyUsage=serverAuth\n' \
  "$DB_HOSTNAME" "$DB_ADDRESS" >"$SERVER_EXT"
run_logged openssl_ca openssl req -x509 -newkey rsa:3072 -sha256 -days 2 -nodes \
  -subj "/CN=PW7404-1106 Throwaway Rehearsal CA" -keyout "$CA_KEY" -out "$CA_CERT"
run_logged openssl_server_csr openssl req -newkey rsa:3072 -sha256 -nodes \
  -subj "/CN=$DB_HOSTNAME" -keyout "$SERVER_KEY_STAGING" -out "$SERVER_CSR"
run_logged openssl_server_sign openssl x509 -req -sha256 -days 2 \
  -in "$SERVER_CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
  -extfile "$SERVER_EXT" -out "$SERVER_CERT_STAGING"
chmod 0600 "$CA_CERT" "$CA_KEY" "$SERVER_KEY_STAGING" "$SERVER_CERT_STAGING"
[[ "$(stat -c '%u:%a' -- "$CA_CERT")" == "0:600" ]] || fail
CA_SHA256="$(sha256_file "$CA_CERT")"
CA_SHA256_UPPER="${CA_SHA256^^}"
CONTROLLER_CA_CERT="$CONTROLLER_DIR/ca.crt"
install -o "$CONTROLLER_OS_USER" -g "$CONTROLLER_OS_GROUP" -m 0600 \
  "$CA_CERT" "$CONTROLLER_CA_CERT"
[[ "$(stat -c '%U:%G:%a' -- "$CONTROLLER_CA_CERT")" == \
   "$CONTROLLER_OS_USER:$CONTROLLER_OS_GROUP:600" ]] || fail
rm -f -- "$CA_KEY" "$SERVER_CSR" "$SERVER_EXT" "$SECRETS_DIR/ca.srl"

PHASE="initialize_pg17"
run_logged initdb runuser -u "$POSTGRES_OS_USER" -- "$INITDB" \
  -D "$DATA_DIR" --username="$ADMIN_USER" --pwfile="$INITDB_PASSWORD_FILE" \
  --auth-local=reject --auth-host=scram-sha-256 --encoding=UTF8 --locale=C.UTF-8 \
  --data-checksums
rm -f -- "$INITDB_PASSWORD_FILE"
install -o "$POSTGRES_OS_USER" -g "$POSTGRES_OS_USER" -m 0600 \
  "$SERVER_KEY_STAGING" "$SERVER_KEY"
install -o "$POSTGRES_OS_USER" -g "$POSTGRES_OS_USER" -m 0600 \
  "$SERVER_CERT_STAGING" "$SERVER_CERT"
rm -f -- "$SERVER_KEY_STAGING" "$SERVER_CERT_STAGING"

DB_PORT="$(python3 - <<'PY'
import socket
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
)"
[[ "$DB_PORT" =~ ^[0-9]{4,5}$ ]] || fail

cat >>"$DATA_DIR/postgresql.conf" <<EOF
listen_addresses = '$DB_ADDRESS'
port = $DB_PORT
unix_socket_directories = ''
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
ssl_min_protocol_version = 'TLSv1.2'
password_encryption = 'scram-sha-256'
log_connections = off
log_disconnections = off
log_statement = 'none'
EOF
cat >"$DATA_DIR/pg_hba.conf" <<'EOF'
local all all reject
hostssl all all 127.0.0.1/32 scram-sha-256
host all all 0.0.0.0/0 reject
host all all ::0/0 reject
EOF
chown "$POSTGRES_OS_USER:$POSTGRES_OS_USER" "$DATA_DIR/postgresql.conf" "$DATA_DIR/pg_hba.conf"
chmod 0600 "$DATA_DIR/postgresql.conf" "$DATA_DIR/pg_hba.conf"

PHASE="start_private_pg17"
run_logged pg_start runuser -u "$POSTGRES_OS_USER" -- "$PG_CTL" \
  -D "$DATA_DIR" -l "$DATA_DIR/postgresql.log" -w start
CLUSTER_STARTED=1

tls_proof="$(postgres_env postgres "$PSQL" -X -A -t -v ON_ERROR_STOP=1 -c \
  "SELECT current_setting('server_version_num')::int BETWEEN 170000 AND 179999 AND inet_server_addr() = inet '127.0.0.1' AND (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid());")"
[[ "$tls_proof" == "t" ]] || fail

PHASE="create_base_database"
run_logged create_base postgres_env postgres "$CREATEDB" --template=template0 "$BASE_DB"

PHASE="precreate_restore_roles"
PRECREATE_ROLES_SQL="$SECRETS_DIR/precreate-roles.sql"
cat >"$PRECREATE_ROLES_SQL" <<EOF
DO \$pw7404_roles\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'spacebot_runtime') THEN
    CREATE ROLE spacebot_runtime;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pw7404_task_maintenance') THEN
    CREATE ROLE pw7404_task_maintenance;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator;
  END IF;
END
\$pw7404_roles\$;
ALTER ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE service_role LOGIN PASSWORD '$SERVICE_PASSWORD'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS;
ALTER ROLE spacebot_runtime LOGIN PASSWORD '$RUNTIME_PASSWORD'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS;
ALTER ROLE pw7404_task_maintenance LOGIN PASSWORD '$MAINTENANCE_PASSWORD'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS;
ALTER ROLE authenticator LOGIN PASSWORD '$AUTHENTICATOR_PASSWORD'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
EOF
chmod 0600 "$PRECREATE_ROLES_SQL"
run_logged precreate_roles postgres_env "$BASE_DB" "$PSQL" \
  -X -v ON_ERROR_STOP=1 -f "$PRECREATE_ROLES_SQL"
rm -f -- "$PRECREATE_ROLES_SQL"

PHASE="restore_exact_dump"
RAW_RESTORE_LIST="$SECRETS_DIR/restore-list.raw"
RESTORE_LIST="$SECRETS_DIR/restore-list.filtered"
"$PG_RESTORE" --list "$SOURCE_DUMP" >"$RAW_RESTORE_LIST"
awk '
  /^;/ { print; next }
  /[[:space:]](vault|supabase_vault)[[:space:]]/ { print ";" $0; next }
  { print }
' "$RAW_RESTORE_LIST" >"$RESTORE_LIST"
excluded_vault_entries="$(awk '/^;[^;].*[[:space:]](vault|supabase_vault)[[:space:]]/ { count++ } END { print count + 0 }' "$RESTORE_LIST")"
[[ "$excluded_vault_entries" -gt 0 ]] || fail
if awk '!/^;/ && /[[:space:]](vault|supabase_vault)[[:space:]]/ { found=1 } END { exit(found ? 0 : 1) }' \
  "$RESTORE_LIST"; then
  fail
fi
run_logged restore_dump postgres_env "$BASE_DB" "$PG_RESTORE" \
  --exit-on-error --single-transaction --no-owner --no-privileges \
  --use-list="$RESTORE_LIST" --dbname="$BASE_DB" "$SOURCE_DUMP"

SENTINEL_AGENT_ID="$(postgres_env "$BASE_DB" "$PSQL" -X -A -t -v ON_ERROR_STOP=1 \
  -c "SELECT id::text FROM public.agents ORDER BY id LIMIT 1;")"
[[ "$SENTINEL_AGENT_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || fail

PHASE="seed_production_equivalent_roles"
run_logged seed_runtime_maintenance run_node_for_db "$BASE_DB" "PW7404-1055" \
  scripts/PW7404-1055-provision-database-roles.mjs --apply
run_logged seed_service_acl postgres_env "$BASE_DB" "$PSQL" -X -v ON_ERROR_STOP=1 <<SQL
GRANT CONNECT ON DATABASE $BASE_DB TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
REVOKE service_role FROM spacebot_runtime, pw7404_task_maintenance;
REVOKE pw7404_task_maintenance FROM spacebot_runtime;
GRANT service_role TO spacebot_runtime WITH INHERIT FALSE, SET TRUE;
SQL

role_acl_proof="$(postgres_env "$BASE_DB" "$PSQL" -X -A -t -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) = 3
     AND bool_and(rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
                  AND NOT rolinherit AND NOT rolreplication AND rolbypassrls)
   FROM pg_catalog.pg_roles
   WHERE rolname IN ('spacebot_runtime','service_role','pw7404_task_maintenance');
   SELECT has_table_privilege('spacebot_runtime','public.agents','SELECT,INSERT,UPDATE,DELETE')
     AND has_table_privilege('service_role','public.agents','SELECT,INSERT,UPDATE,DELETE')
     AND has_table_privilege('pw7404_task_maintenance','public.agents','SELECT,INSERT,UPDATE,DELETE')
     AND NOT has_table_privilege('pw7404_task_maintenance','public.humans','UPDATE')
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_auth_members AS membership
       JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
       JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
       WHERE granted.rolname = 'service_role'
         AND member.rolname = 'spacebot_runtime'
         AND NOT membership.inherit_option
         AND membership.set_option
     )
     AND NOT pg_has_role('spacebot_runtime','pw7404_task_maintenance','MEMBER');")"
[[ "$role_acl_proof" == $'t\nt' ]] || fail

PHASE="apply_1081"
run_logged apply_1081 run_node_for_db "$BASE_DB" "PW7404-1081" \
  scripts/PW7404-1081-apply-public-machine-credential-denylist.mjs --apply
grep -Fq "PW7404-1081 public credential denylist: PASS (apply;" "$LOG_DIR/apply_1081.log" || fail

PHASE="verify_1082_first"
run_logged verify_1082_first run_node_for_db "$BASE_DB" "PW7404-1082" \
  scripts/PW7404-1082-verify-public-machine-credential-denylist.mjs --database
grep -Fq "PW7404-1082 database credential-denylist proof: PASS" "$LOG_DIR/verify_1082_first.log" || fail

PHASE="verify_1082_second"
run_logged verify_1082_second run_node_for_db "$BASE_DB" "PW7404-1082" \
  scripts/PW7404-1082-verify-public-machine-credential-denylist.mjs --database
grep -Fq "PW7404-1082 database credential-denylist proof: PASS" "$LOG_DIR/verify_1082_second.log" || fail

PHASE="attest_exact_manifest"
manifest_proof="$(postgres_env "$BASE_DB" "$PSQL" -X -A -t -v ON_ERROR_STOP=1 -c \
  "SELECT count(*)::text || '|' || encode(sha256(convert_to(string_agg(
        bc.agent_id::text || ':' || bc.bot_name, E'\\n' ORDER BY bc.agent_id
      ), 'UTF8')), 'hex')
   FROM public.bot_configs AS bc
   JOIN public.agents AS resident ON resident.id = bc.agent_id
   WHERE bc.is_active = true
     AND bc.bot_type IN ('expert','super_machine','minion','labbot','lab-resident')
     AND resident.moderation_status = 'active';")"
[[ "$manifest_proof" == "$EXPECTED_MANIFEST_COUNT|$EXPECTED_MANIFEST_SHA256" ]] || fail

PHASE="clone_rehearsal_databases"
baseline_absence="$(postgres_env "$BASE_DB" "$PSQL" -X -A -t -v ON_ERROR_STOP=1 -c \
  "SELECT to_regclass('public.lucy_autonomy_control') IS NULL
      AND to_regclass('public.resident_autonomy_delegations') IS NULL
      AND to_regclass('public.resident_autonomy_mutation_receipts') IS NULL;")"
[[ "$baseline_absence" == "t" ]] || fail
unsafe_membership_baseline="$(postgres_env "$BASE_DB" "$PSQL" -X -A -t -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) = 1
     AND bool_and(NOT membership.inherit_option AND membership.set_option)
   FROM pg_catalog.pg_auth_members AS membership
   JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
   JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
   WHERE granted.rolname = 'service_role'
     AND member.rolname = 'spacebot_runtime';")"
[[ "$unsafe_membership_baseline" == "t" ]] || fail
run_logged clone_rollback postgres_env postgres "$CREATEDB" --template="$BASE_DB" "$ROLLBACK_DB"
run_logged clone_apply postgres_env postgres "$CREATEDB" --template="$BASE_DB" "$APPLY_DB"

PHASE="rollback_canary_1098_no_override"
unset SPACEBOT_CANARY_MANIFEST_OVERRIDE_COUNT SPACEBOT_CANARY_MANIFEST_OVERRIDE_SHA256
run_logged rollback_1098 run_rollback_canary
assert_json_receipt "$LOG_DIR/rollback_1098.log" \
  'r.artifact==="PW7404-1098" && r.manifestOverride===null && r.rollbackRestoredBaseline===true && Object.values(r.proof).every(Boolean)'
rollback_membership_restored="$(postgres_env "$ROLLBACK_DB" "$PSQL" -X -A -t -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) = 1
     AND bool_and(NOT membership.inherit_option AND membership.set_option)
   FROM pg_catalog.pg_auth_members AS membership
   JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
   JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
   WHERE granted.rolname = 'service_role'
     AND member.rolname = 'spacebot_runtime';")"
[[ "$rollback_membership_restored" == "t" ]] || fail

PHASE="apply_1086_committed"
run_logged apply_1086 run_node_for_db "$APPLY_DB" "PW7404-1086" \
  scripts/PW7404-1086-apply-canonical-lucy-autonomy.mjs --apply
assert_json_receipt "$LOG_DIR/apply_1086.log" \
  'r.artifact==="PW7404-1086" && r.mode==="apply" && r.verified===true'
committed_membership_removed="$(postgres_env "$APPLY_DB" "$PSQL" -X -A -t -v ON_ERROR_STOP=1 -c \
  "SELECT NOT EXISTS (
     SELECT 1
     FROM pg_catalog.pg_auth_members AS membership
     JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
     JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
     WHERE granted.rolname = 'service_role'
       AND member.rolname = 'spacebot_runtime'
   );")"
[[ "$committed_membership_removed" == "t" ]] || fail

PHASE="rollback_1103_boundary"
run_logged rollback_1103 run_node_for_db "$APPLY_DB" "PW7404-1103" \
  scripts/PW7404-1103-apply-resident-autonomy-controller-boundary.mjs --rollback-canary
assert_json_receipt "$LOG_DIR/rollback_1103.log" \
  'r.artifact==="PW7404-1103" && r.mode==="rollback-canary" && r.verified===true && r.rollbackRestoredBaseline===true'

PHASE="apply_1103_boundary"
run_logged apply_1103 run_node_for_db "$APPLY_DB" "PW7404-1103" \
  scripts/PW7404-1103-apply-resident-autonomy-controller-boundary.mjs --apply
assert_json_receipt "$LOG_DIR/apply_1103.log" \
  'r.artifact==="PW7404-1103" && r.mode==="apply" && r.verified===true'

PHASE="provision_1101_controller_role"
run_logged provision_1101 run_node_for_db "$APPLY_DB" "PW7404-1101" \
  scripts/PW7404-1101-provision-resident-autonomy-controller.mjs --apply
assert_json_receipt "$LOG_DIR/provision_1101.log" \
  'r.artifact==="PW7404-1101" && r.mode==="apply" && r.verified===true'

PHASE="verify_1107_database"
python3 - <<'PY'
import socket
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.bind(("127.0.0.1", 8110))
PY
start_controller || fail
run_logged verify_1107 run_node_for_db "$APPLY_DB" "PW7404-1107" \
  scripts/PW7404-1107-verify-autonomy-controller-database.mjs
assert_json_receipt "$LOG_DIR/verify_1107.log" \
  'r.artifact==="PW7404-1107" && r.status==="PASS" && r.cleanup==="PASS" && r.counts.failed===0'

PHASE="stop_controller"
stop_controller_best_effort

PHASE="stop_cluster"
run_logged pg_stop runuser -u "$POSTGRES_OS_USER" -- "$PG_CTL" \
  -D "$DATA_DIR" -m fast -w stop
CLUSTER_STARTED=0

PHASE="sanitize_receipt"
rm -f -- "$ADMIN_URL_FILE" "$CONTROLLER_URL_FILE" "$CONTROLLER_CA_CERT" "$CONTROLLER_NODE_BIN"
rmdir -- "$CONTROLLER_DIR"
apply_1081_output_sha256="$(log_sha256 apply_1081)"
verify_1082_first_output_sha256="$(log_sha256 verify_1082_first)"
verify_1082_second_output_sha256="$(log_sha256 verify_1082_second)"
rollback_1098_output_sha256="$(log_sha256 rollback_1098)"
apply_1086_output_sha256="$(log_sha256 apply_1086)"
rollback_1103_output_sha256="$(log_sha256 rollback_1103)"
apply_1103_output_sha256="$(log_sha256 apply_1103)"
provision_1101_output_sha256="$(log_sha256 provision_1101)"
verify_1107_output_sha256="$(log_sha256 verify_1107)"

DESTROYED_JSON="false"

receipt_json="$(printf \
  '{"artifact":"%s","status":"PASS","postgresMajor":17,"sourceDumpSha256":"%s","inputManifest":{"artifact":"PW7404-1113","entries":17,"sha256":"%s"},"tlsCaSha256":"%s","restoreExclusions":{"vaultSchemas":%s},"manifest":{"count":%s,"sha256":"%s"},"authoritySeparation":{"unsafeBaselineSeeded":true,"transactionCanaryRestoredBaseline":true,"committedMigrationRemovedMembership":true,"committedRollbackDrillProven":false},"migrationSha256":{"PW7404-1081":"%s","PW7404-1086":"%s","PW7404-1101":"%s"},"verifier1107Sha256":"%s","proofOutputSha256":{"apply1081":"%s","verify1082First":"%s","verify1082Second":"%s","rollback1098":"%s","apply1086":"%s","rollback1103":"%s","apply1103":"%s","provision1101":"%s","verify1107":"%s"},"manifestOverrideUsed":false,"controllerStopped":true,"clusterStopped":true,"destroyed":%s}' \
  "$ARTIFACT" "$actual_dump_sha256" "$actual_input_manifest_sha256" \
  "$CA_SHA256" "$excluded_vault_entries" \
  "$EXPECTED_MANIFEST_COUNT" "$EXPECTED_MANIFEST_SHA256" "$migration_1081_sha256" "$migration_1086_sha256" \
  "$migration_1101_sha256" "$verifier_1107_sha256" "$apply_1081_output_sha256" \
  "$verify_1082_first_output_sha256" "$verify_1082_second_output_sha256" \
  "$rollback_1098_output_sha256" "$apply_1086_output_sha256" \
  "$rollback_1103_output_sha256" \
  "$apply_1103_output_sha256" "$provision_1101_output_sha256" \
  "$verify_1107_output_sha256" "$DESTROYED_JSON")"

if [[ "$DESTROYED_JSON" == "false" ]]; then
  printf '%s\n' "$receipt_json" >"$REHEARSAL_ROOT/PW7404-1106-sanitized-receipt.json"
  chmod 0600 "$REHEARSAL_ROOT/PW7404-1106-sanitized-receipt.json"
fi

PHASE="complete"
FINALIZED=1
printf '%s\n' "$receipt_json" >&3
