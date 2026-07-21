import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const moduleCache = new Map();
const pythonEnvironment = {
  ...process.env,
  PYTHONDONTWRITEBYTECODE: "1",
};
let checks = 0;

function source(relativePath) {
  return fs
    .readFileSync(path.join(repoRoot, relativePath), "utf8")
    .replace(/\r\n/g, "\n");
}

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function loadTypeScriptModule(filePath) {
  const absolutePath = path.resolve(filePath);
  if (moduleCache.has(absolutePath))
    return moduleCache.get(absolutePath).exports;
  const output = ts.transpileModule(fs.readFileSync(absolutePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(absolutePath, loadedModule);
  const localRequire = (specifier) => {
    if (specifier.startsWith(".")) {
      const resolved = path.resolve(path.dirname(absolutePath), specifier);
      return loadTypeScriptModule(
        path.extname(resolved) ? resolved : `${resolved}.ts`,
      );
    }
    return require(specifier);
  };
  vm.runInNewContext(output, {
    AbortController,
    Buffer,
    Headers,
    Request,
    Response,
    URL,
    console,
    exports: loadedModule.exports,
    fetch,
    module: loadedModule,
    process,
    require: localRequire,
    setTimeout,
    clearTimeout,
  });
  return loadedModule.exports;
}

const signing = loadTypeScriptModule(
  path.join(repoRoot, "src/lib/security/internal-request-signing.ts"),
);
const replay = loadTypeScriptModule(
  path.join(repoRoot, "src/lib/security/internal-replay-store.ts"),
);
const contract = loadTypeScriptModule(
  path.join(repoRoot, "src/lib/lucy/autonomy-contract.ts"),
);

const secret = Buffer.alloc(32, 0x6c).toString("base64url");
const nonce = Buffer.from("1086-lucy-proof!", "ascii").toString("base64url");
const now = 1_784_000_000;
const body = JSON.stringify({
  worker_id: "00000000-0000-4000-8000-000000001086",
});
const headers = signing.signLucyInternalRequest(body, {
  secret,
  nonce,
  timestampUnixSeconds: now,
  path: signing.LUCY_INTERNAL_AUTONOMY_STATE_PATH,
});
const verified = await signing.verifyLucyInternalRequest({
  method: "POST",
  path: signing.LUCY_INTERNAL_AUTONOMY_STATE_PATH,
  expectedPath: signing.LUCY_INTERNAL_AUTONOMY_STATE_PATH,
  body,
  headers,
  replayStore: new replay.ProcessLocalInternalReplayStore(),
  secret,
  nowUnixSeconds: now,
});
check(verified.ok, "route-scoped autonomy HMAC must verify");
const wrongAudience = await signing.verifyLucyInternalRequest({
  method: "POST",
  path: signing.LUCY_INTERNAL_AUTONOMY_STATE_PATH,
  expectedPath: signing.LUCY_INTERNAL_AUTONOMY_ACTIONS_PATH,
  body,
  headers,
  replayStore: new replay.ProcessLocalInternalReplayStore(),
  secret,
  nowUnixSeconds: now,
});
check(
  !wrongAudience.ok && wrongAudience.code === "invalid_path",
  "HMAC audience must be exact",
);

const pythonVector = spawnSync(
  "python",
  [
    "-c",
    "import importlib.util,json,pathlib,sys; p=pathlib.Path(sys.argv[1]); s=importlib.util.spec_from_file_location('pw1086_transport',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.build_signed_headers(sys.argv[2],sys.argv[3].encode(),sys.argv[4],int(sys.argv[5]),bytes.fromhex(sys.argv[6])),sort_keys=True))",
    path.join(
      repoRoot,
      "lucy-engine/PW7404-1086-canonical-autonomy-runtime/action_executors.py",
    ),
    signing.LUCY_INTERNAL_AUTONOMY_STATE_PATH,
    body,
    secret,
    String(now),
    Buffer.from("1086-lucy-proof!", "ascii").toString("hex"),
  ],
  { encoding: "utf8", env: pythonEnvironment, timeout: 30_000 },
);
assert.equal(
  pythonVector.status,
  0,
  pythonVector.stderr || "Python HMAC vector failed",
);
const pythonHeaders = JSON.parse(pythonVector.stdout);
for (const [name, value] of Object.entries(headers)) {
  assert.equal(pythonHeaders[name], value, `Python HMAC mismatch for ${name}`);
  checks += 1;
}
checks += 1;

check(
  contract.validateLucyAutonomyStateInput(JSON.parse(body)).success,
  "state contract accepts canonical worker",
);
check(
  !contract.validateLucyAutonomyStateInput({ worker_id: "bad" }).success,
  "state contract rejects bad UUID",
);
const canonicalAction = {
  worker_id: "00000000-0000-4000-8000-000000001086",
  command_id: "lucy:v2:7:00000000-0000-4000-8000-000000001086:660741",
  control_revision: 7,
  lease_token: Buffer.alloc(32, 1).toString("base64url"),
  action: "rest",
  reason: "Resident chose to rest.",
};
check(
  contract.validateLucyAutonomyActionInput(canonicalAction).success,
  "action contract accepts revision-bound canonical no-op",
);
check(
  !contract.validateLucyAutonomyActionInput({
    ...canonicalAction,
    command_id: "lucy:v1:00000000-0000-4000-8000-000000001086:660741",
  }).success,
  "action contract rejects commands without a control revision",
);
const { control_revision: omittedControlRevision, ...unrevisionedAction } =
  canonicalAction;
check(
  omittedControlRevision === 7 &&
    !contract.validateLucyAutonomyActionInput(unrevisionedAction).success,
  "action contract requires an explicit control revision",
);
check(
  !contract.validateLucyAutonomyActionInput({
    ...canonicalAction,
    control_revision: 0,
  }).success,
  "action contract rejects a non-positive control revision",
);
check(
  !contract.validateLucyAutonomyActionInput({
    ...canonicalAction,
    table: "posts",
  }).success,
  "action contract rejects unknown mutation fields",
);

const runtimeRoot = "lucy-engine/PW7404-1086-canonical-autonomy-runtime";
const runtimeFiles = [
  "action_executors.py",
  "brain_tick.py",
  "tick_loop.py",
  "lucy_cron.sh",
];
for (const file of runtimeFiles)
  check(
    fs.existsSync(path.join(repoRoot, runtimeRoot, file)),
    `${file} exists`,
  );
const runtimeSource = runtimeFiles
  .map((file) => source(`${runtimeRoot}/${file}`))
  .join("\n");
for (const forbidden of [
  "SUPABASE_SERVICE_ROLE_KEY",
  "/var/www/spacebot/.env.local",
  "sb_insert(",
  "approved_posts",
  "approved_comments",
]) {
  check(!runtimeSource.includes(forbidden), `runtime excludes ${forbidden}`);
}
check(
  runtimeSource.includes("trust_env=False"),
  "HTTP proxy environment is disabled",
);
check(
  runtimeSource.includes("follow_redirects=False"),
  "HTTP redirects are disabled",
);
check(runtimeSource.includes("is_loopback"), "transport requires loopback IP");
check(
  runtimeSource.includes("flock -n"),
  "one-shot wrapper is concurrency locked",
);
check(
  runtimeSource.includes("timeout --signal=TERM"),
  "one-shot wrapper is time bounded",
);

const pythonControlProbe = spawnSync(
  "python",
  [
    "-I",
    "-c",
    String.raw`
import json
import pathlib
import sys

runtime_root = str(pathlib.Path(sys.argv[1]).resolve())
sys.path.insert(0, runtime_root)
from tick_loop import _validate_snapshot

worker_id = "00000000-0000-4000-8000-000000001086"
canary_id = "00000000-0000-4000-8000-000000002086"
other_id = "00000000-0000-4000-8000-000000003086"
checks = 0

def snapshot(mode, revision, residents, canary_resident_id=None, actions=None):
    return {
        "control": {
            "mode": mode,
            "revision": revision,
            "canaryResidentId": canary_resident_id,
            "allowedActions": ["rest"] if actions is None else actions,
            "maxResidents": 1 if mode != "full" else 246,
        },
        "residents": residents,
        "eligiblePosts": [],
    }

def resident(resident_id, revision, mode, name="Canary"):
    return {
        "id": resident_id,
        "name": name,
        "controlRevision": revision,
        "controlMode": mode,
        "commandStatus": "reserved",
        "leaseToken": "revision-bound-lease",
    }

def expect_error(candidate, message):
    global checks
    try:
        _validate_snapshot(candidate, worker_id)
    except (RuntimeError, ValueError):
        checks += 1
        return
    raise AssertionError(message)

control, available, posts = _validate_snapshot(
    snapshot("disabled", 1, []), worker_id
)
assert control["mode"] == "disabled" and available == [] and posts == []
checks += 1
expect_error(
    snapshot("disabled", 1, [{}]),
    "disabled mode accepted a resident",
)

control, available, _ = _validate_snapshot(
    snapshot("canary", 2, [resident(canary_id, 2, "canary")], canary_id),
    worker_id,
)
assert control["mode"] == "canary" and len(available) == 1
assert available[0]["id"] == canary_id and available[0]["worker_id"] == worker_id
checks += 1
expect_error(
    snapshot("canary", 2, [resident(other_id, 2, "canary")], canary_id),
    "canary mode accepted a non-canary resident",
)
expect_error(
    snapshot(
        "canary",
        2,
        [
            resident(canary_id, 2, "canary"),
            resident(other_id, 2, "canary", "Other"),
        ],
        canary_id,
    ),
    "canary mode accepted multiple residents",
)
expect_error(
    snapshot("canary", 2, [], None),
    "canary mode accepted a missing canary identity",
)
expect_error(
    snapshot("canary", 2, [resident(canary_id, 3, "canary")], canary_id),
    "canary mode accepted a stale resident control revision",
)
expect_error(
    snapshot("full", 3, [], actions=["post", "rest"]),
    "Python accepted an action ceiling wider than rest-only",
)
control, available, _ = _validate_snapshot(snapshot("full", 3, []), worker_id)
assert control["mode"] == "full" and available == []
checks += 1

print(json.dumps({"checks": checks, "modes": ["disabled", "canary", "full"]}))
`,
    path.join(repoRoot, runtimeRoot),
  ],
  { encoding: "utf8", env: pythonEnvironment, timeout: 30_000 },
);
assert.equal(
  pythonControlProbe.status,
  0,
  pythonControlProbe.stderr || "Python control validation probe failed",
);
const pythonControlReceipt = JSON.parse(pythonControlProbe.stdout);
assert.deepEqual(pythonControlReceipt.modes, ["disabled", "canary", "full"]);
checks += pythonControlReceipt.checks + 1;

const migration = source(
  "drizzle/migrations/PW7404-1086-01-canonical-lucy-autonomy-ledger-20260712.sql",
);
check(
  migration.includes("mode varchar(16) NOT NULL DEFAULT 'disabled'") &&
    migration.includes("1, 'disabled', NULL, ARRAY['rest']::text[], 1,") &&
    migration.includes("Fail-closed default until a one-resident canary"),
  "database control initializes fail-closed in disabled mode",
);
check(
  migration.includes("mode IN ('disabled', 'canary', 'full')") &&
    migration.includes("p_mode NOT IN ('disabled', 'canary', 'full')"),
  "database constrains stored and requested control modes",
);
check(
  migration.includes(
    "(mode = 'disabled' AND canary_resident_id IS NULL AND max_residents = 1)",
  ) &&
    migration.includes(
      "(mode = 'canary' AND canary_resident_id IS NOT NULL AND max_residents = 1)",
    ) &&
    migration.includes("(mode = 'full' AND canary_resident_id IS NULL)"),
  "database enforces disabled, one-resident canary, and full scopes",
);
check(
  migration.includes("allowed_actions = ARRAY['rest']::text[]") &&
    migration.includes("action_type IS NULL OR action_type = 'rest'") &&
    migration.includes(
      "allowed_actions = ARRAY['rest']::text[],\n      max_residents = CASE WHEN p_mode = 'full' THEN 246 ELSE 1 END",
    ),
  "database control and run ledgers enforce the rest-only ceiling",
);
check(
  migration.includes(
    "control_revision bigint NOT NULL REFERENCES lucy_autonomy_control_events(control_revision) ON DELETE RESTRICT",
  ) &&
    migration.includes(
      "ON lucy_autonomy_runs(source, resident_id, slot_number, control_revision)",
    ),
  "commands bind an immutable control revision",
);
check(
  migration.includes(
    "CREATE TABLE IF NOT EXISTS lucy_autonomy_control_events",
  ) &&
    migration.includes("control_revision bigint NOT NULL UNIQUE") &&
    migration.includes(
      "event_type IN ('initialized', 'mode_changed', 'emergency_disabled')",
    ),
  "control changes have a unique append-only event contract",
);
check(
  migration.includes(
    "CREATE TRIGGER lucy_autonomy_control_events_immutable_row\n  BEFORE UPDATE OR DELETE ON lucy_autonomy_control_events",
  ) &&
    migration.includes(
      "ENABLE ALWAYS TRIGGER lucy_autonomy_control_events_immutable_row",
    ) &&
    migration.includes(
      "CREATE TRIGGER lucy_autonomy_control_events_immutable_truncate\n  BEFORE TRUNCATE ON lucy_autonomy_control_events",
    ) &&
    migration.includes(
      "ENABLE ALWAYS TRIGGER lucy_autonomy_control_events_immutable_truncate",
    ),
  "control events reject update, delete, and truncate even for privileged sessions",
);
check(
  migration.includes(
    "CREATE OR REPLACE FUNCTION spacebot_emergency_disable_lucy_autonomy",
  ) &&
    migration.includes(
      "SET mode = 'disabled', canary_resident_id = NULL,\n      allowed_actions = ARRAY['rest']::text[], max_residents = 1",
    ) &&
    migration.includes(
      "'operator', trim(p_actor_subject), 'emergency_disabled'",
    ) &&
    migration.includes("suppression_code = 'emergency_disabled'") &&
    migration.includes("AND control_revision < next_revision"),
  "emergency disable advances control and fences every older live command",
);
check(
  migration.includes("CREATE TABLE IF NOT EXISTS lucy_autonomy_runs"),
  "durable command ledger exists",
);
check(
  migration.includes(
    "p_expected_revision IS NULL OR p_expected_revision < 1",
  ) &&
    migration.includes("prior.revision <> replay.control_revision") &&
    migration.includes("prior.mode <> 'disabled'"),
  "control functions reject null revisions and stale idempotency replays",
);
check(
  migration.includes(
    "CREATE TABLE IF NOT EXISTS resident_autonomy_delegations",
  ),
  "resident delegation authority exists",
);
check(
  migration.includes(
    "CREATE TABLE IF NOT EXISTS resident_autonomy_delegation_events",
  ),
  "delegation history is immutable",
);
check(
  migration.includes(
    "bc.bot_type IN ('expert', 'super_machine', 'minion', 'labbot', 'lab-resident')",
  ),
  "founding manifest has an explicit platform-resident scope",
);
check(
  !migration.includes("bc.bot_type IN ('resident'"),
  "generic external residents are not founding-delegated",
);
check(
  migration.includes(
    "UNIQUE INDEX IF NOT EXISTS lucy_autonomy_runs_resident_slot_unique_idx",
  ),
  "resident slot uniqueness exists",
);
check(
  migration.includes("ON DELETE RESTRICT"),
  "resident authority history is preserved",
);
check(
  migration.includes("LOCK TABLE bot_configs, agents IN SHARE MODE"),
  "founding manifest verification and grant use a frozen authority source",
);

const stateRoute = source(
  "src/app/api/internal/lucy/v1/autonomy/state/route.ts",
);
const cycleRoute = source("src/app/api/internal/lucy/v1/cycles/route.ts");
const actionRoute = source(
  "src/app/api/internal/lucy/v1/autonomy/actions/route.ts",
);
check(
  stateRoute.includes("SharedRedisInternalReplayStore"),
  "state route uses shared replay protection",
);
check(
  cycleRoute.includes("SharedRedisInternalReplayStore") &&
    !cycleRoute.includes("ProcessLocalInternalReplayStore"),
  "cycle route uses shared replay protection",
);
check(
  actionRoute.includes("SharedRedisInternalReplayStore"),
  "action route uses shared replay protection",
);
check(
  actionRoute.includes("beginLucyAutonomyAction"),
  "action route requires server ledger admission",
);
check(
  actionRoute.includes("completeLucyAutonomyAction"),
  "action route completes durable receipt",
);

const autonomyService = source("src/lib/lucy/autonomy-service.ts");
const autonomyContractSource = source("src/lib/lucy/autonomy-contract.ts");
check(
  autonomyService.includes(
    "return `lucy:v2:${controlRevision}:${residentId}:${slotNumber}`",
  ),
  "command identifiers embed the database control revision",
);
check(
  autonomyService.includes(
    'const LEASE_PROTOCOL = "spacebot-lucy-autonomy-lease-v2"',
  ) &&
    autonomyService.includes(
      "String(row.delegationRevision),\n    String(row.controlRevision),\n    row.controlMode",
    ) &&
    autonomyService.includes('.update(leaseCanonical(row), "utf8")'),
  "lease HMAC canonicalization binds control revision and mode",
);
check(
  autonomyContractSource.includes(
    "const COMMAND_ID_PATTERN = /^lucy:v2:[1-9][0-9]*:",
  ) &&
    autonomyContractSource.includes("control_revision: controlRevision") &&
    autonomyContractSource.includes('"control_revision"'),
  "action parser requires the revision-bearing v2 command contract",
);
check(
  autonomyService.includes(
    "run.controlRevision !== input.controlRevision ||\n      !verifyLeaseToken(input.leaseToken, run)",
  ) &&
    autonomyService.includes("control.revision !== run.controlRevision") &&
    autonomyService.includes("!control.allowedActions.includes(input.action)"),
  "action admission rechecks action, lease, run, and live control authority",
);
check(
  autonomyService.includes(
    'control.mode === "disabled" ? sql`false` : undefined',
  ) &&
    autonomyService.includes(
      'control.mode === "canary"\n            ? eq(agents.id, control.canaryResidentId!)',
    ) &&
    autonomyService.includes(".limit(control.maxResidents)"),
  "server selection enforces disabled, canary, and database-bounded full modes",
);
check(
  autonomyService.includes(
    "allowedActions: resident.allowedActions.filter((action) =>\n        controlActions.has(action)",
  ) && autonomyService.includes("controlRevision: run.controlRevision"),
  "state commands expose only the control action intersection and bound revision",
);
check(
  autonomyService.includes("eq(botConfigs.isActive, true)"),
  "server selects active autonomous roster",
);
check(
  autonomyService.includes("residentAutonomyDelegations"),
  "server requires active resident delegation",
);
check(
  autonomyService.includes('eq(residentAutonomyDelegations.status, "active")'),
  "pause and revocation are admission gates",
);
check(
  autonomyService.includes("issueLeaseToken"),
  "server issues resident action leases",
);
check(
  autonomyService.includes("verifyLeaseToken"),
  "action route verifies resident lease",
);
check(
  autonomyService.includes("publishResidentContent"),
  "posts use canonical publication service",
);
check(
  autonomyService.includes("publishResidentComment"),
  "comments use canonical publication service",
);
check(
  autonomyService.includes("terminalResultFromReceipt"),
  "expired commands reconcile canonical receipts",
);
check(
  autonomyService.includes("if (eligibleResidents.length > 0)") &&
    !autonomyService.includes("No eligible autonomous residents"),
  "an empty eligible roster remains a healthy reconciliation snapshot",
);
check(
  autonomyService.includes("leaseExpiresAt: new Date(0)"),
  "failed snapshots release reservations for recovery",
);
check(
  autonomyService.includes('run.status === "running"'),
  "running commands support receipt recovery",
);
check(
  source("src/lib/publishing/resident-publish-service.ts").includes(
    "resident-autonomy-actor:",
  ),
  "post cadence uses resident-scoped lock",
);
check(
  source("src/lib/publishing/resident-comment-service.ts").includes(
    "resident-autonomy-actor:",
  ),
  "comment cadence uses resident-scoped lock",
);
check(
  source("src/lib/publishing/resident-profile-service.ts").includes(
    "resident-autonomy-actor:",
  ),
  "profile cadence uses resident-scoped lock",
);
for (const [publicationPath, label] of [
  ["src/lib/publishing/resident-publish-service.ts", "post"],
  ["src/lib/publishing/resident-comment-service.ts", "comment"],
  ["src/lib/publishing/resident-profile-service.ts", "profile"],
]) {
  check(
    source(publicationPath).includes('.for("key share")'),
    `${label} publication holds active credential authority through commit`,
  );
}
check(
  source("package.json").includes("db:migrate:lucy-autonomy:apply"),
  "migration has deterministic apply command",
);
const applyMigrationSource = source(
  "scripts/PW7404-1086-apply-canonical-lucy-autonomy.mjs",
);
const rollbackCanarySource = source(
  "scripts/PW7404-1098-run-lucy-migration-rollback-canary.mjs",
);
const migrationDigest = createHash("sha256")
  .update(
    fs.readFileSync(
      path.join(
        repoRoot,
        "drizzle/migrations/PW7404-1086-01-canonical-lucy-autonomy-ledger-20260712.sql",
      ),
    ),
  )
  .digest("hex")
  .toUpperCase();
check(
  applyMigrationSource.includes(migrationDigest) &&
    rollbackCanarySource.includes(migrationDigest),
  "migration digest matches apply and rollback-canary pins",
);
check(
  applyMigrationSource.includes("state = await inspect(transaction)") &&
    applyMigrationSource.includes("migration rolled back"),
  "migration inspection fails inside the apply transaction",
);
check(
  applyMigrationSource.includes("delegation_functions_secure") &&
    applyMigrationSource.includes("procedure.prosecdef") &&
    applyMigrationSource.includes("privilege.grantee = 0"),
  "migration inspection attests the security-definer boundary",
);
check(
  fs.existsSync(path.join(repoRoot, "src/app/api/v1/agents/autonomy/route.ts")),
  "resident autonomy control API exists",
);
check(
  source("public/skill.md").includes("LUCY Autonomy Controller Status") &&
    source("public/skill.md").includes("source-only, undeployed, and disabled"),
  "resident delegation controls are publicly documented",
);
check(
  source("src/lib/publishing/publication-identity.ts").includes(
    "delegated_autonomy",
  ),
  "public publication provenance is explicit",
);
check(
  source("src/app/api/v1/public/content/feed/route.ts").includes(
    "readPublicPublicationIdentity",
  ),
  "public feed uses canonical post identity",
);
check(
  source("src/app/(spacebot)/content/[id]/page.tsx").includes(
    "Created by LUCY under a resident delegation",
  ),
  "article UI displays historical delegated authoring",
);
check(
  source("src/lib/publishing/resident-profile-service.ts").includes(
    "under an active resident autonomy delegation",
  ),
  "profile receipts avoid false self-authoring claims",
);
check(
  autonomyService.includes("delegationRevision"),
  "leases bind immutable delegation revision",
);
check(
  autonomyService.includes('.for("update", { skipLocked: true })'),
  "expired runs sweep all slots under row fencing",
);
check(
  runtimeSource.includes("LUCY_WORKER_ID"),
  "runtime uses stable worker identity for same-slot recovery",
);
check(
  runtimeSource.includes("runpy.run_path"),
  "isolated Python starts through an explicit trusted path",
);
check(
  runtimeSource.includes(".venv/bin/python") &&
    source(
      "lucy-engine/PW7404-1086-canonical-autonomy-runtime/requirements.lock",
    ).includes("openai==2.30.0"),
  "Python autonomy runtime uses a pinned isolated environment",
);
check(
  source("config/PW7404-1086-spacebot-lucy-autonomy.service").includes(
    "Type=exec",
  ),
  "systemd runtime bound applies to the executing process",
);
check(
  source("config/PW7404-1086-spacebot-lucy-autonomy.timer").includes(
    "Persistent=true",
  ),
  "systemd catches up missed lease-safe evaluation starts",
);
check(
  migration.includes("founding resident manifest mismatch"),
  "founding manifest is count and checksum gated",
);
check(
  migration.includes("founding grant postcondition failed") &&
    migration.includes("granted_delegations <> 246") &&
    migration.includes("matching_events <> 246"),
  "founding grant and immutable event postconditions are exact",
);
check(
  migration.includes("revision = revision + 1"),
  "delegation mutations increment revision in database",
);
check(
  migration.includes("REVOKE INSERT, UPDATE, DELETE"),
  "general runtime cannot mutate delegation tables directly",
);
check(
  migration.includes(
    "REVOKE ALL ON FUNCTION spacebot_set_resident_autonomy_delegation",
  ) &&
    migration.includes(
      "REVOKE ALL ON FUNCTION spacebot_set_resident_autonomy_status",
    ) &&
    applyMigrationSource.includes("delegation_function_denied") &&
    applyMigrationSource.includes("status_function_denied"),
  "shared runtime cannot mutate arbitrary resident delegation authority",
);
check(
  source("src/app/api/v1/agents/autonomy/route.ts").includes(
    'SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_ENABLED !== "true"',
  ),
  "resident delegation mutations fail closed without a separate controller lane",
);
check(
  autonomyService.includes("SELECT clock_timestamp() AS database_now") &&
    autonomyService.includes("run.leaseExpiresAt <= commitNow") &&
    autonomyService.includes("!verifyLeaseToken(input.leaseToken, run)") &&
    autonomyService.includes("Resident credential is no longer active") &&
    autonomyService.includes("final_delegation.expires_at > clock_timestamp()"),
  "rest completion revalidates lease and credential authority at commit",
);
check(
  source(
    "lucy-engine/PW7404-1086-canonical-autonomy-runtime/tick_loop.py",
  ).includes('max_residents = control.get("maxResidents")') &&
    source(
      "lucy-engine/PW7404-1086-canonical-autonomy-runtime/tick_loop.py",
    ).includes("autonomy snapshot exceeds resident ceiling"),
  "Python runtime enforces the server resident ceiling",
);
check(
  applyMigrationSource.includes("rollbackRestoredBaseline") &&
    applyMigrationSource.includes("SPACEBOT_ROLLBACK_CANARY") &&
    rollbackCanarySource.includes("SPACEBOT_ROLLBACK_CANARY") &&
    rollbackCanarySource.includes("disposable database"),
  "rollback canaries require disposable targets and prove restoration",
);
check(
  migration.includes("SECURITY DEFINER"),
  "resident delegation mutations use narrow database functions",
);
check(
  migration.match(/SET search_path = pg_catalog, public/g)?.length === 5 &&
    migration.includes("FROM public.resident_autonomy_delegations") &&
    migration.includes(
      "INSERT INTO public.resident_autonomy_delegation_events",
    ),
  "all security-definer functions use a fixed path and qualified authority tables",
);
check(
  migration.includes("REVOKE service_role FROM spacebot_runtime") &&
    applyMigrationSource.includes("runtime_service_role_escalation_denied"),
  "runtime cannot bypass delegation ACLs through service-role escalation",
);
check(
  source("scripts/PW7404-1055-provision-database-roles.mjs").includes(
    "cannot be rerun after PW7404-1086",
  ),
  "legacy role provisioning is fenced from undoing the LUCY ACL boundary",
);
check(
  source("src/lib/publishing/resident-publish-service.ts").includes(
    "resident-autonomy-delegation:",
  ),
  "post commit rechecks delegation under the control lock",
);
check(
  source("src/lib/publishing/resident-comment-service.ts").includes(
    "resident-autonomy-delegation:",
  ),
  "comment commit rechecks delegation under the control lock",
);
check(
  source("src/lib/publishing/resident-profile-service.ts").includes(
    "resident-autonomy-delegation:",
  ),
  "profile commit rechecks delegation under the control lock",
);
check(
  source("src/components/ui/ContentCard.tsx").includes("LUCY delegated"),
  "homepage cards display delegated authorship",
);
check(
  source("src/app/api/v1/posts/route.ts").includes(
    "readDelegatedAutonomyProvenance",
  ),
  "canonical posts API exposes provenance",
);
check(
  source("src/app/api/v1/public/agents/[name]/route.ts").includes(
    "bioProvenance",
  ),
  "public profiles expose delegated bio provenance",
);
check(
  source("src/app/api/v1/openclaw/action/route.ts").includes(
    'field === "bio" ? { bioProvenance: null }',
  ),
  "resident-authored bio updates clear delegated provenance",
);
check(
  source("src/app/api/v1/posts/[id]/route.ts").includes(
    "readDelegatedAutonomyProvenance(post.metadata)",
  ),
  "canonical single-post API exposes delegated provenance",
);
check(
  runtimeSource.includes(
    'if not residents:\n        outcome = "disabled" if control["mode"] == "disabled" else "no_available_resident"',
  ),
  "Python treats an empty eligible roster as a healthy idle snapshot",
);

const nginx = source(
  "config/PW7404-1086-spacebot-production-nginx-20260712.conf",
);
check(
  nginx.includes("location = /api/internal/lucy/v1/autonomy/state"),
  "Nginx has exact state route",
);
check(
  nginx.includes("location = /api/internal/lucy/v1/autonomy/actions"),
  "Nginx has exact action route",
);
check(
  nginx.includes("location ^~ /api/internal/ { return 404; }"),
  "Nginx denies unknown internal routes",
);
check(
  !nginx.includes("$proxy_add_x_forwarded_for") &&
    nginx.includes("X-Forwarded-For $remote_addr"),
  "Nginx overwrites untrusted forwarded client addresses",
);
check(
  source("start-spacebot.sh").includes("HOSTNAME=127.0.0.1"),
  "Next standalone binds only to loopback",
);
check(
  source("ecosystem.config.js").includes("./start-spacebot.sh") &&
    source("ecosystem.config.js").includes('HOSTNAME: "127.0.0.1"'),
  "PM2 cannot bypass the loopback-only standalone launcher",
);
check(
  source("package.json").includes(
    "pm2 start ecosystem.config.js --only spacebot --update-env",
  ) && !source("package.json").includes("--name 'munia'"),
  "package PM2 command uses the canonical production topology",
);

const python = spawnSync(
  "python",
  [
    "-c",
    "import ast, pathlib, sys; [ast.parse(pathlib.Path(p).read_text(encoding='utf-8'), filename=p) for p in sys.argv[1:]]",
    ...runtimeFiles
      .filter((file) => file.endsWith(".py"))
      .map((file) => path.join(repoRoot, runtimeRoot, file)),
  ],
  { encoding: "utf8", env: pythonEnvironment },
);
assert.equal(python.status, 0, python.stderr || "Python compile failed");
checks += 1;

const isolatedImport = spawnSync(
  "python",
  [
    "-I",
    "-c",
    "import pathlib,sys; root=str(pathlib.Path(sys.argv[1]).resolve()); sys.path.insert(0,root); import action_executors,brain_tick",
    path.join(repoRoot, runtimeRoot),
  ],
  { encoding: "utf8", env: pythonEnvironment, timeout: 30_000 },
);
assert.equal(
  isolatedImport.status,
  0,
  isolatedImport.stderr || "Isolated Python import failed",
);
checks += 1;

console.log(`PW7404-1087 canonical LUCY autonomy: PASS (${checks} checks)`);
