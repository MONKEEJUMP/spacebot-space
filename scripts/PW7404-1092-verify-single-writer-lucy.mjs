import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const production = process.argv.includes("--production");
const sshTarget = process.env.SPACEBOT_PRODUCTION_SSH_TARGET;
let checks = 0;
const failures = [];
const receipts = [];

function source(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function check(condition, message, phase = "candidate") {
  checks += 1;
  const passed = Boolean(condition);
  receipts.push({ checkId: checks, phase, message, passed });
  if (!passed) failures.push({ phase, message });
}

const retirement = source("scripts/PW7404-1091-retire-legacy-lucy-writer.sh");
check(retirement.includes('pm2 delete "$LEGACY_NAME"'), "live PM2 deletion");
check(retirement.includes("pm2 save --force"), "saved PM2 state update");
check(
  retirement.includes("legacy-lucy-forensic-backup.tar.gz.enc"),
  "root-only encrypted backup",
);
check(retirement.includes("RETIRED BY PW7404-1091"), "entrypoint tombstones");
check(
  retirement.includes("canonical LUCY must be absent, disabled, or masked"),
  "zero-writer fence",
);
check(retirement.includes("archive_sha256"), "backup hash receipt");
check(!retirement.includes("SUPABASE_SERVICE_ROLE_KEY"), "no secret handling");
check(
  retirement.includes("pm2 stop") &&
    !retirement.includes('pm2 stop "$LEGACY_NAME" >/dev/null 2>&1 || true'),
  "PM2 stop failures are fatal",
);
check(
  source("config/PW7404-1086-spacebot-lucy-autonomy.service").includes(
    "ExecStartPre=+/usr/local/sbin/PW7404-1091-retire-legacy-lucy-writer.sh --check",
  ),
  "canonical startup requires the retirement receipt",
);
check(
  source("src/app/api/life/route.ts").includes(
    "SPACEBOT_LEGACY_LIFE_ENGINE_ENABLED !== 'true'",
  ),
  "legacy life writer defaults disabled in the next application release",
);
check(
  source("config/PW7404-1086-spacebot-production-nginx-20260712.conf").includes(
    "location = /api/life { return 404; }",
  ),
  "legacy life writer is denied at the public edge",
);

const supervisor = JSON.parse(
  source("config/PW7404-1027-spacebot-runtime-supervisor-v0-20260711.json"),
);
const legacySupervisor = supervisor.services.find(
  (service) => service.process?.identity === "lucy-brain",
);
check(!legacySupervisor, "legacy writer absent from canonical topology");
const canonicalSupervisor = supervisor.services.find(
  (service) => service.id === "lucy-canonical-autonomy",
);
check(
  canonicalSupervisor?.process?.manager === "systemd",
  "canonical writer uses systemd",
);
const autonomyMigration = source(
  "drizzle/migrations/PW7404-1086-01-canonical-lucy-autonomy-ledger-20260712.sql",
);
check(
  autonomyMigration.includes("mode varchar(16) NOT NULL DEFAULT 'disabled'") &&
    autonomyMigration.includes("allowed_actions = ARRAY['rest']::text[]"),
  "canonical control defaults disabled and rest-only",
);
check(
  autonomyMigration.includes("spacebot_set_lucy_autonomy_mode") &&
    autonomyMigration.includes("spacebot_emergency_disable_lucy_autonomy") &&
    autonomyMigration.includes("control_revision_fenced"),
  "canonical control has guarded transition and emergency fencing",
);
check(
  source("src/lib/lucy/autonomy-service.ts").includes(
    "control.revision !== run.controlRevision",
  ),
  "canonical admission rejects stale control revisions",
);
check(
  source(
    "lucy-engine/PW7404-1086-canonical-autonomy-runtime/tick_loop.py",
  ).includes('if mode == "disabled" and residents:'),
  "canonical runtime fails closed on disabled snapshots",
);

if (production) {
  if (!sshTarget || !/^(?:[a-z_][a-z0-9_-]*@)?[a-z0-9.-]+$/i.test(sshTarget)) {
    throw new Error("SPACEBOT_PRODUCTION_SSH_TARGET is required and invalid");
  }
  const remoteProgram = String.raw`
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess

def run(command):
    return subprocess.run(command, text=True, capture_output=True, check=False)

live_result = run(["pm2", "jlist"])
if live_result.returncode != 0:
    raise RuntimeError("pm2 jlist inspection failed")
live = json.loads(live_result.stdout or "[]")
dump_paths = [pathlib.Path("/root/.pm2/dump.pm2"), *pathlib.Path("/home").glob("*/.pm2/dump.pm2")]
saved = []
for dump_path in dump_paths:
    if not dump_path.exists():
        continue
    saved.extend(json.loads(dump_path.read_text() or "[]"))
marker_path = pathlib.Path("/var/lib/spacebot/PW7404-1091-legacy-lucy-retired.json")
marker = json.loads(marker_path.read_text()) if marker_path.exists() else {}
archive_path = pathlib.Path(marker.get("archive", ""))
archive_sha = None
if archive_path.is_file():
    digest = hashlib.sha256()
    with archive_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    archive_sha = digest.hexdigest()
entrypoints = {}
for name in ("lucy_cron.sh", "tick_loop.py", "action_executors.py"):
    entrypoint = pathlib.Path("/root/lucy-engine") / name
    text = entrypoint.read_text(errors="replace") if entrypoint.exists() else ""
    mode = stat.S_IMODE(entrypoint.stat().st_mode) if entrypoint.exists() else None
    entrypoints[name] = {
        "tombstoned": "RETIRED BY PW7404-1091" in text,
        "executable": bool(mode is not None and mode & 0o111),
    }
legacy_pattern = re.compile(r"lucy-brain|/root/lucy-engine", re.IGNORECASE)
inspection_errors = []
cron = []
scan_roots = [
    pathlib.Path("/etc/crontab"), pathlib.Path("/etc/cron.d"),
    pathlib.Path("/etc/cron.daily"), pathlib.Path("/etc/cron.hourly"),
    pathlib.Path("/var/spool/cron"), pathlib.Path("/etc/systemd/system"),
    pathlib.Path("/usr/lib/systemd/system"), pathlib.Path("/etc/rc.local"),
    pathlib.Path("/etc/init.d"),
]
for root in scan_roots:
    if not root.exists():
        continue
    candidates = [root] if root.is_file() else [path for path in root.rglob("*") if path.is_file()]
    for candidate in candidates:
        try:
            if legacy_pattern.search(candidate.read_text(errors="replace")):
                cron.append(str(candidate))
        except (OSError, PermissionError) as error:
            inspection_errors.append(f"read:{candidate}:{error.__class__.__name__}")

at_jobs = []
if shutil.which("atq"):
    atq_result = run(["atq"])
    if atq_result.returncode != 0:
        inspection_errors.append("atq")
    for line in atq_result.stdout.splitlines():
        job_id = line.split(maxsplit=1)[0]
        job = run(["at", "-c", job_id])
        if job.returncode != 0:
            inspection_errors.append(f"at:{job_id}")
        elif legacy_pattern.search(job.stdout):
            at_jobs.append(job_id)

other_pm2_daemons = [
    line for line in run(["ps", "-eo", "user=,args="]).stdout.splitlines()
    if "PM2 v" in line and "God Daemon" in line and not line.lstrip().startswith("root ")
]
containers = []
if shutil.which("docker"):
    docker = run(["timeout", "5s", "docker", "ps", "-a", "--format", "{{.Names}} {{.Image}} {{.Command}}"])
    if docker.returncode != 0:
        inspection_errors.append("docker")
    else:
        containers = [line for line in docker.stdout.splitlines() if legacy_pattern.search(line)]
targets = {
    "/root/lucy-engine/lucy_cron.sh",
    "/root/lucy-engine/tick_loop.py",
    "/root/lucy-engine/action_executors.py",
}
processes = []
for process_dir in pathlib.Path("/proc").iterdir():
    if not process_dir.name.isdigit():
        continue
    try:
        arguments = [part.decode(errors="replace") for part in (process_dir / "cmdline").read_bytes().split(b"\\0") if part]
        cwd = pathlib.Path(os.readlink(process_dir / "cwd"))
    except (FileNotFoundError, PermissionError, ProcessLookupError):
        continue
    resolved = {
        str(pathlib.Path(argument) if argument.startswith("/") else cwd / argument)
        for argument in arguments[1:]
    }
    if targets.intersection(resolved):
        processes.append({"pid": int(process_dir.name), "targets": sorted(targets.intersection(resolved))})
alternate_launchers = []
for candidate in [*pathlib.Path("/root/lucy-engine").glob("*.sh"), *pathlib.Path("/root/lucy-engine").glob("*.bak")]:
    try:
        text = candidate.read_text(errors="replace")
    except OSError as error:
        inspection_errors.append(f"launcher:{candidate}:{error.__class__.__name__}")
        continue
    if re.search(r"lucy_cron\.sh|tick_loop\.py|action_executors\.py", text) and "RETIRED BY PW7404-1091" not in text:
        alternate_launchers.append(str(candidate))
def unit_state(unit):
    show = run(["systemctl", "show", unit, "--property=LoadState", "--value"])
    load = show.stdout.strip()
    if not load:
        inspection_errors.append(f"systemctl-show:{unit}")
        load = "inspection-error"
    if load == "not-found":
        return {"load": load, "active": "unknown", "enabled": "not-found"}
    active_result = run(["systemctl", "is-active", unit])
    enabled_result = run(["systemctl", "is-enabled", unit])
    active = active_result.stdout.strip()
    enabled = enabled_result.stdout.strip()
    if not active:
        inspection_errors.append(f"systemctl-active:{unit}")
        active = "inspection-error"
    if not enabled:
        inspection_errors.append(f"systemctl-enabled:{unit}")
        enabled = "inspection-error"
    return {"load": load, "active": active, "enabled": enabled}

canonical_service = unit_state("spacebot-lucy-autonomy.service")
canonical_timer = unit_state("spacebot-lucy-autonomy.timer")
print(json.dumps({
    "live_legacy": [row.get("name") for row in live if row.get("name") == "lucy-brain"],
    "saved_legacy": [row.get("name") for row in saved if row.get("name") == "lucy-brain"],
    "cron_matches": cron,
    "at_job_matches": at_jobs,
    "container_matches": containers,
    "other_pm2_daemons": other_pm2_daemons,
    "inspection_errors": inspection_errors,
    "legacy_processes": processes,
    "alternate_launchers": alternate_launchers,
    "marker_artifact": marker.get("artifact"),
    "retirement_scope": marker.get("retirement_scope"),
    "legacy_database_authority_revoked": marker.get("legacy_database_authority_revoked"),
    "archive_hash_matches": bool(archive_sha) and archive_sha == marker.get("archive_sha256"),
    "entrypoints": entrypoints,
    "canonical_service": canonical_service,
    "canonical_timer": canonical_timer,
}))
`;
  const command = `python3 - <<'PY'\n${remoteProgram}\nPY`;
  const result = spawnSync("ssh", ["-o", "BatchMode=yes", sshTarget, command], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "production verifier SSH failed");
  }
  const state = JSON.parse(result.stdout.trim());
  check(
    state.live_legacy.length === 0,
    "legacy absent from live PM2",
    "legacy-containment",
  );
  check(
    state.saved_legacy.length === 0,
    "legacy absent from PM2 dump",
    "legacy-containment",
  );
  check(
    state.cron_matches.length === 0,
    "legacy absent from cron/systemd/startup",
    "legacy-containment",
  );
  check(
    state.at_job_matches.length === 0,
    "legacy absent from queued at jobs",
    "legacy-containment",
  );
  check(
    state.container_matches.length === 0,
    "legacy absent from containers",
    "legacy-containment",
  );
  check(
    state.other_pm2_daemons.length === 0,
    "legacy absent from other users' PM2 daemons",
    "legacy-containment",
  );
  check(
    state.inspection_errors.length === 0,
    "resurrection inspections completed without errors",
    "legacy-containment",
  );
  check(
    state.legacy_processes.length === 0,
    "legacy process absent",
    "legacy-containment",
  );
  check(
    state.alternate_launchers.length === 0,
    "alternate legacy launchers tombstoned",
    "legacy-containment",
  );
  check(
    state.marker_artifact === "PW7404-1091",
    "retirement marker",
    "legacy-containment",
  );
  check(
    state.retirement_scope === "host_execution",
    "retirement scope is explicit",
    "legacy-containment",
  );
  check(
    state.archive_hash_matches === true,
    "backup archive hash",
    "legacy-containment",
  );
  check(
    Object.values(state.entrypoints).every(
      (entrypoint) => entrypoint.tombstoned === true,
    ),
    "legacy entrypoint tombstones",
    "legacy-containment",
  );
  check(
    Object.values(state.entrypoints).every(
      (entrypoint) => entrypoint.executable === false,
    ),
    "legacy entrypoints non-executable",
    "legacy-containment",
  );
  check(
    state.canonical_service.active !== "active" &&
      state.canonical_service.active !== "activating" &&
      ["disabled", "masked", "static", "not-found"].includes(
        state.canonical_service.enabled,
      ),
    "canonical service disabled",
    "canonical-inert",
  );
  check(
    state.canonical_timer.active !== "active" &&
      state.canonical_timer.active !== "activating" &&
      ["disabled", "masked", "not-found"].includes(
        state.canonical_timer.enabled,
      ),
    "canonical timer disabled",
    "canonical-inert",
  );
}

const digest = crypto
  .createHash("sha256")
  .update(retirement)
  .digest("hex")
  .toUpperCase();
const legacyFailure = failures.some(
  (failure) => failure.phase === "legacy-containment",
);
const verdict =
  failures.length === 0
    ? production
      ? "PASS_HOST_RETIRED_CANONICAL_INERT"
      : "PASS_CANDIDATE"
    : legacyFailure
    ? "FAIL_LEGACY_AUTHORITY"
    : "FAIL_CANONICAL_READINESS";
console.log(
  JSON.stringify(
    {
      artifact: "PW7404-1092",
      verdict,
      checks,
      passed: checks - failures.length,
      failures,
      retirementSha256: digest,
      cutoverReady: false,
      remainingAuthority: [
        "shared Supabase service-role authority is not yet separated or revoked",
        "resident autonomy mutation needs a separate resident-scoped controller database lane",
        "canonical disabled/canary/full control is locally verified but not database-applied or deployed",
        ...(production
          ? [
              "legacy /api/life remains a direct-loopback capability until the next application release",
            ]
          : [
              "candidate proof does not replace exact-246 production-equivalent rehearsal",
            ]),
      ],
      receipts,
    },
    null,
    2,
  ),
);
if (failures.length > 0) process.exitCode = 1;
