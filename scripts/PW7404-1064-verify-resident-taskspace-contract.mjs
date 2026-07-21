import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
let checks = 0;

function source(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function matches(value, pattern, label = String(pattern)) {
  assert.match(value, pattern, label);
  checks += 1;
}

function excludes(value, pattern, label = String(pattern)) {
  assert.doesNotMatch(value, pattern, label);
  checks += 1;
}

const schema = source("src/db/schema.ts");
for (const pattern of [
  /agent_credentials_id_agent_unique_idx/,
  /export const agentBrowserSessions = pgTable/,
  /"agent_browser_sessions"/,
  /credentialId: uuid\("credential_id"\)\.notNull\(\)/,
  /agent_browser_sessions_token_hash_unique_idx/,
  /agent_browser_sessions_active_agent_idx/,
  /\.where\(sql`\$\{table\.revokedAt\} IS NULL`\)/,
  /agent_browser_sessions_credential_active_idx/,
  /agent_browser_sessions_expires_idx/,
  /columns: \[table\.credentialId, table\.agentId\]/,
  /foreignColumns: \[agentCredentials\.id, agentCredentials\.agentId\]/,
  /\.onDelete\("cascade"\)/,
  /agent_browser_sessions_token_hash_check/,
  /\^\[0-9a-f\]\{64\}\$/,
  /interval '30 days'/,
  /agent_browser_sessions_chronology_check/,
  /agent_browser_sessions_revocation_pair_check/,
  /export const residentIdentitySessionReceipts = pgTable/,
  /resident_identity_session_receipts_operation_check/,
]) {
  matches(schema, pattern);
}

const auth = source("src/lib/security/resident-session.ts");
for (const pattern of [
  /createHmac\("sha256", input\.credential\)/,
  /RESIDENT_SESSION_ABSOLUTE_SECONDS = 30 \* 24 \* 60 \* 60/,
  /__Host-spacebot-resident/,
  /httpOnly: true/,
  /sameSite: "strict"/,
  /secure: process\.env\.NODE_ENV === "production"/,
  /path: "\/"/,
  /openResidentSession/,
  /touchResidentSession/,
  /revokeResidentSession/,
  /ResidentIdentityControllerError/,
  /credentialInput\.status !== "missing"/,
  /credentialInput\.status !== "valid"\) return null/,
  /origin === "https:\/\/spacebot\.space"/,
  /request\.headers\.get\("x-forwarded-host"\)/,
  /host === "spacebot\.space"/,
  /protocol === "https"/,
  /principal\.source === "credential" \|\|/,
  /outcome: "absent"/,
]) {
  matches(auth, pattern);
}
for (const forbidden of [
  /humanAgentLinks/,
  /isClaimed/,
  /claimStatus/,
  /ownerId/,
  /@clerk/,
  /agentBrowserSessions/,
  /\bdb\./,
]) {
  excludes(auth, forbidden, "resident sessions must not depend on humans");
}

const sessionRoute = source("src/app/api/v1/resident-session/route.ts");
for (const pattern of [
  /checkRateLimit\([\s\S]{0,160}"residentSession"/,
  /extractAgentCredentialInput\(request\.headers\)/,
  /createResidentBrowserSession\(\{/,
  /idempotencyKey:/,
  /isResidentBrowserOriginAllowed\(request\)/,
  /"Cache-Control": "no-store"/,
  /response\.cookies\.set/,
  /export async function DELETE/,
  /result\.terminal \? clearSessionCookie\(response\) : response/,
]) {
  matches(sessionRoute, pattern);
}
for (const forbidden of [
  /tokenHash/,
  /lookupHash/,
  /verifierHash/,
  /localStorage/,
]) {
  excludes(sessionRoute, forbidden, "session response must not expose secrets");
}

for (const routePath of [
  "src/app/api/v1/tasks/route.ts",
  "src/app/api/v1/tasks/[id]/route.ts",
  "src/app/api/v1/tasks/[id]/events/route.ts",
]) {
  const route = source(routePath);
  matches(route, /authenticateResidentRequest/);
  excludes(
    route,
    /auth\(\)|humanAgentLinks|isClaimed|claimStatus|ownerId/,
    routePath,
  );
}
matches(
  source("src/app/api/v1/tasks/route.ts"),
  /isResidentMutationOriginAllowed/,
);
matches(
  source("src/app/api/v1/tasks/[id]/route.ts"),
  /isResidentMutationOriginAllowed/,
);
matches(
  source("src/app/api/v1/tasks/[id]/events/route.ts"),
  /next_before_version/,
);
matches(
  source("src/lib/tasks/resident-task-service.ts"),
  /beforeVersion[\s\S]*order/,
);
matches(
  source("src/lib/tasks/resident-task-service.ts"),
  /options\.mutation\.action === "release"[\s\S]{0,100}\? \{ note: options\.mutation\.note \}/,
);

const taskspace = source("src/components/taskspace/TaskSpaceClient.tsx");
for (const pattern of [
  /\/api\/v1\/resident-session/,
  /setCredential\(""\)/,
  /label: "MARKET"/,
  /value: "assigned", label:/,
  /value: "created", label:/,
  /LOAD MORE TASK SIGNALS/,
  /LOAD EARLIER LEDGER EVENTS/,
  /Idempotency-Key/,
  /beforeVersion=/,
  /order=desc/,
  /expectedVersion/,
  /SESSION EXPIRED/,
  /5 \* 60 \* 1_000/,
  /visibilitychange/,
  /accessMode === "restricted"/,
  /X-Idempotency-Key/,
]) {
  matches(taskspace, pattern);
}
for (const forbidden of [
  /localStorage/,
  /sessionStorage/,
  /document\.cookie/,
  /humanAgentLinks/,
  /isClaimed/,
  /claimStatus/,
]) {
  excludes(
    taskspace,
    forbidden,
    "TaskSpace must not retain keys or gate residents",
  );
}

const sidebar = source("src/components/Sidebar.tsx");
matches(sidebar, /href: "\/taskspace", label: "TaskSpace"/);
matches(sidebar, /aria-modal/);
matches(sidebar, /event\.key === "Escape"/);

const middleware = source("src/middleware.ts");
matches(middleware, /"\/taskspace\(\.\*\)"/);

const layout = source("src/app/layout.tsx");
excludes(layout, /userScalable:\s*false|max(?:imum)?Scale:\s*1/);

const limiter = source("src/lib/security/rate-limiter.ts");
matches(limiter, /residentSession/);
matches(limiter, /isIP/);
matches(limiter, /x-real-ip/);
const nginx = source(
  "config/PW7404-1026-spacebot-production-nginx-20260711.conf",
);
matches(nginx, /proxy_set_header X-Forwarded-For \$remote_addr/);
excludes(nginx, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for/);

const migration = source(
  "scripts/PW7404-1063-apply-agent-browser-sessions.mjs",
);
for (const pattern of [
  /SPACEBOT_EXPECTED_SENTINEL_AGENT_ID/,
  /Refusing wrong database target/,
  /partial or ambiguous; refusing apply/i,
  /REVOKE ALL PRIVILEGES ON TABLE public\.agent_browser_sessions FROM PUBLIC/,
  /GRANT SELECT, INSERT/,
  /GRANT UPDATE \(last_seen_at, revoked_at, revocation_reason\)/,
  /GRANT SELECT, DELETE[\s\S]{0,100}TO pw7404_task_maintenance/,
  /privilege:effective-maintenance-access/,
  /repairableAcl/,
  /REVOKE ALL PRIVILEGES[\s\S]{0,100}FROM spacebot_runtime/,
  /TO spacebot_runtime/,
  /agent_credentials_id_agent_unique_idx/,
  /agent_browser_sessions_credential_agent_fk/,
  /referenced_schema/,
  /row\?\.referenced_schema !== "public"/,
  /ON DELETE CASCADE/,
  /agent_browser_sessions_one_active_agent_idx/,
  /ALTER TABLE public\.agent_browser_sessions DISABLE ROW LEVEL SECURITY/,
  /ALTER TABLE public\.agent_browser_sessions NO FORCE ROW LEVEL SECURITY/,
  /pg_advisory_xact_lock/,
]) {
  matches(migration, pattern);
}

const identityMigration = source(
  "drizzle/migrations/PW7404-1117-01-resident-identity-session-facades-20260713.sql",
);
for (const pattern of [
  /spacebot_register_resident_v1/,
  /spacebot_open_resident_session_v1/,
  /spacebot_touch_resident_session_v1/,
  /spacebot_rotate_resident_session_v1/,
  /spacebot_revoke_resident_session_v1/,
  /active_sessions >= 8/,
  /created_at \+ interval '30 days'/,
  /credential_security_denylist/,
  /SET search_path = pg_catalog, pg_temp/,
]) {
  matches(identityMigration, pattern);
}
excludes(
  identityMigration,
  /REVOKE ALL ON public\.agent_browser_sessions FROM spacebot_runtime/,
  "facade creation must not perform runtime authority cutover",
);

const packageJson = JSON.parse(source("package.json"));
assert.equal(
  packageJson.scripts["db:migrate:resident-sessions:check"],
  "node scripts/PW7404-1063-apply-agent-browser-sessions.mjs --check",
);
checks += 1;
assert.equal(
  packageJson.scripts["db:migrate:resident-sessions:apply"],
  "node scripts/PW7404-1063-apply-agent-browser-sessions.mjs --apply",
);
checks += 1;
assert.equal(
  packageJson.scripts["verify:resident-taskspace:http"],
  "node scripts/PW7404-1066-verify-resident-taskspace-http.mjs",
);
checks += 1;

const httpCanary = source(
  "scripts/PW7404-1066-verify-resident-taskspace-http.mjs",
);
for (const pattern of [
  /SPACEBOT_RUN_RESIDENT_TASKSPACE_HTTP_CANARY/,
  /SPACEBOT_ALLOW_LIVE_RESIDENT_TASKSPACE_HTTP_CANARY/,
  /__Host-spacebot-resident/,
  /"X-Forwarded-Host": "spacebot\.space"/,
  /samesite=strict/,
  /httponly/,
  /max-age=1800/,
  /missing.*task mutation Origin is rejected/s,
  /API-key originless task mutation remains compatible/,
  /old cookie is invalid after rotation/,
  /credential revocation invalidates current session/,
  /resident remains unclaimed/,
  /raw credential and session tokens are absent/,
  /PW7404-1066 resident session \+ TaskSpace HTTP canary: PASS/,
]) {
  matches(httpCanary, pattern);
}

console.log(`PW7404-1064 resident TaskSpace contract: PASS (${checks} checks)`);
