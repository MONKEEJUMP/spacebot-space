import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACT = "PW7404-1118";
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
let assertionCount = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function requireText(source, expected, label) {
  assertionCount += 1;
  assert.ok(source.includes(expected), `${label} is missing`);
}

function rejectText(source, rejected, label) {
  assertionCount += 1;
  assert.ok(!source.includes(rejected), `${label} must not be present`);
}

const migration = read(
  "drizzle/migrations/PW7404-1117-01-resident-identity-session-facades-20260713.sql",
);
const provisioner = read(
  "scripts/PW7404-1117-provision-resident-identity-session-facades.mjs",
);
const registration = read("src/app/api/v1/agents/register/route.ts");
const validation = read("src/lib/security/validation.ts");
const sessionRoute = read("src/app/api/v1/resident-session/route.ts");
const sessionLibrary = read("src/lib/security/resident-session.ts");
const taskspace = read("src/components/taskspace/TaskSpaceClient.tsx");
const schema = read("src/db/schema.ts");
const controller = read(
  "resident-identity-controller/PW7404-1117-controller.mjs",
);
const identityRollback = read(
  "drizzle/migrations/PW7404-1117-ROLLBACK-resident-identity-session-facades-20260713.sql",
);
const aclCutover = read(
  "drizzle/migrations/PW7404-1127-01-resident-identity-session-acl-cutover-20260713.sql",
);
const aclRollback = read(
  "drizzle/migrations/PW7404-1127-ROLLBACK-resident-identity-session-acl-cutover-20260713.sql",
);
const aclRunner = read(
  "scripts/PW7404-1129-apply-resident-identity-session-acl-cutover.mjs",
);
const packageJson = read("package.json");
const deploymentContract = read(
  "config/PW7404-1125-resident-identity-ipc-deployment.md",
);

const migrationDigest = crypto
  .createHash("sha256")
  .update(Buffer.from(migration))
  .digest("hex")
  .toUpperCase();
const aclCutoverDigest = crypto
  .createHash("sha256")
  .update(Buffer.from(aclCutover))
  .digest("hex")
  .toUpperCase();
const aclRollbackDigest = crypto
  .createHash("sha256")
  .update(Buffer.from(aclRollback))
  .digest("hex")
  .toUpperCase();

requireText(
  provisioner,
  `"${migrationDigest}"`,
  "reviewed migration digest pin",
);
requireText(
  migration,
  "CREATE OR REPLACE FUNCTION public.spacebot_register_resident_v1",
  "registration facade",
);
requireText(
  migration,
  "CREATE OR REPLACE FUNCTION public.spacebot_open_resident_session_v1",
  "session-open facade",
);
requireText(
  migration,
  "CREATE OR REPLACE FUNCTION public.spacebot_touch_resident_session_v1",
  "session-touch facade",
);
requireText(
  migration,
  "CREATE OR REPLACE FUNCTION public.spacebot_rotate_resident_session_v1",
  "session-rotation facade",
);
requireText(
  migration,
  "CREATE OR REPLACE FUNCTION public.spacebot_revoke_resident_session_v1",
  "session-revocation facade",
);
requireText(
  migration,
  "'residentName', created_resident.name",
  "durable receipt identity snapshot",
);
requireText(
  migration,
  "created_at + interval '30 days'",
  "absolute session ceiling",
);
requireText(
  migration,
  "active_sessions >= 8",
  "bounded multi-device session limit",
);
requireText(
  migration,
  "credential_security_denylist",
  "credential denylist enforcement",
);

requireText(
  registration,
  "registerResidentIdentity",
  "registration controller adapter",
);
requireText(
  registration,
  "const apiKey = credential;",
  "resident-retained registration credential",
);
requireText(validation, "credential: z", "registration credential schema");
rejectText(
  validation.match(/credential: z[\s\S]*?\n\s*\}\);/u)?.[0] ?? "",
  ".optional()",
  "optional registration credential",
);
rejectText(
  registration,
  "db.transaction",
  "registration direct database write",
);
rejectText(registration, ".insert(agents)", "registration direct agent insert");

requireText(
  sessionLibrary,
  "openResidentSession",
  "session-open controller adapter",
);
requireText(
  sessionLibrary,
  "touchResidentSession",
  "session-touch controller adapter",
);
requireText(
  sessionLibrary,
  "revokeResidentSession",
  "session-revoke controller adapter",
);
rejectText(
  sessionLibrary,
  "agentBrowserSessions",
  "browser-session direct table access",
);
requireText(
  sessionRoute,
  "result.terminal ? clearSessionCookie(response) : response",
  "failure-safe session cookie clearing",
);
requireText(
  sessionLibrary,
  'createHmac("sha256", input.credential)',
  "response-loss session token derivation",
);
requireText(taskspace, "5 * 60 * 1_000", "TaskSpace renewal interval");
requireText(
  taskspace,
  'document.addEventListener("visibilitychange", onVisibility)',
  "TaskSpace visible-tab renewal",
);
requireText(
  taskspace,
  'accessMode === "restricted"',
  "restricted resident identity view",
);
requireText(
  schema,
  '.default("private")',
  "private-by-default resident visibility",
);
requireText(schema, "residentIdentitySessionReceipts", "receipt schema model");
requireText(
  controller,
  "Object.keys(value).length === keys.length",
  "exact body keys",
);
requireText(controller, "IPC_SOCKET_PATH", "permissioned Unix socket boundary");
requireText(
  controller,
  "createSignedControllerResponseHeaders",
  "authenticated controller responses",
);
requireText(
  identityRollback,
  "LOCK TABLE public.agent_browser_sessions IN ACCESS EXCLUSIVE MODE",
  "concurrency-stable identity rollback",
);
requireText(
  identityRollback,
  "rollback-expired",
  "expired-session rollback receipts",
);
requireText(
  identityRollback,
  "rollback-legacy-expiry-policy",
  "overlong-session rollback terminalization receipts",
);
requireText(
  identityRollback,
  "restored_constraint_valid IS DISTINCT FROM true",
  "fully validated legacy rollback constraint",
);
requireText(
  aclCutover,
  "resident_identity_acl_cutover_events",
  "immutable ACL before-image ledger",
);
requireText(
  aclCutover,
  "service_role",
  "service-role cutover coverage",
);
requireText(
  aclCutover,
  "TO spacebot_identity_controller",
  "controller-only facade execution",
);
requireText(
  aclRollback,
  "rollback did not restore the exact ACL snapshot",
  "exact ACL rollback comparison",
);
requireText(aclRunner, `migration: "${aclCutoverDigest}"`, "cutover digest pin");
requireText(aclRunner, `rollback: "${aclRollbackDigest}"`, "rollback digest pin");
requireText(
  aclRunner,
  "findDependentWriters",
  "mounted dependent-writer deployment gate",
);
requireText(aclRunner, "loadPinnedSql", "single-read immutable SQL digest gate");
requireText(
  aclRunner,
  "SPACEBOT_EXPECTED_RUNTIME_SOURCE_SHA256",
  "reviewed runtime source identity gate",
);
requireText(controller, "facade_grantees_exact", "exclusive facade execute authority");
requireText(
  controller,
  "no_login_role_effective_writers",
  "effective login-role writer rejection",
);
requireText(
  packageJson,
  '"verify:resident-identity-session:acl-database"',
  "role-accurate ACL database command",
);
requireText(
  packageJson,
  '"db:identity-acl:rollback"',
  "guarded ACL rollback command",
);
requireText(
  schema,
  "residentIdentityAclCutoverEvents",
  "ACL cutover event schema model",
);
requireText(
  deploymentContract,
  "remains deployment\nNO-GO",
  "truthful cutover deployment state",
);

console.log(
  JSON.stringify({
    artifact: ARTIFACT,
    status: "PASS",
    migrationSha256: migrationDigest,
    aclCutoverSha256: aclCutoverDigest,
    aclRollbackSha256: aclRollbackDigest,
    assertions: assertionCount,
    productionContacted: false,
  }),
);
