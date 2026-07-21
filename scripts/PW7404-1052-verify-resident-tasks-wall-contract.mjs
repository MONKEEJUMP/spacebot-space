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
  /export const residentTasks = pgTable/,
  /"resident_tasks"/,
  /creatorAgentId:[\s\S]{0,180}onDelete: "restrict"/,
  /assigneeAgentId:[\s\S]{0,180}onDelete: "restrict"/,
  /taskType: varchar\("task_type"/,
  /visibility: varchar\("visibility"/,
  /result: jsonb\("result"\)/,
  /resident_tasks_terminal_state_check/,
  /resident_tasks_available_idx/,
  /resident_tasks_due_idx/,
  /export const residentTaskEvents = pgTable/,
  /resident_task_events_actor_request_unique_idx/,
  /resident_task_events_transition_check/,
  /clientRequestId:[\s\S]{0,100}\.notNull\(\)/,
  /requestFingerprint:[\s\S]{0,120}\.notNull\(\)/,
  /taskId:[\s\S]{0,180}onDelete: "restrict"/,
]) {
  matches(schema, pattern);
}

const contract = `${source("src/lib/tasks/resident-task-contract.ts")}\n${source(
  "src/lib/tasks/resident-task-types.ts",
)}`;
for (const pattern of [
  /Idempotency-Key is required for task mutations/,
  /expectedVersion must be a positive integer/,
  /"participants" \| "residents"/,
  /"claim"/,
  /"block"/,
  /"resume"/,
  /"release"/,
  /"complete"/,
  /65_536/,
  /encodeResidentTaskCursor/,
  /fingerprintResidentTaskMutation/,
]) {
  matches(contract, pattern);
}

const service = source("src/lib/tasks/resident-task-service.ts");
for (const pattern of [
  /pg_advisory_xact_lock/,
  /SET LOCAL lock_timeout = '5s'/,
  /SET LOCAL statement_timeout = '15s'/,
  /Resident must have an active credential to create tasks/,
  /Resident must have an active credential to change tasks/,
  /task_credential\.revoked_at IS NULL/,
  /Task version changed; current version is/,
  /Idempotency-Key was already used for a different task mutation/,
  /Only the task creator can perform this action/,
  /Only the task assignee can perform this action/,
  /Task is not available for resident assignment/,
  /eventType = "assigned"/,
  /eventType = "blocked"/,
  /eventType = "resumed"/,
  /eventType = "released"/,
  /eventType = "completed"/,
  /eq\(residentTasks\.version, task\.version\)/,
  /visibility, "residents"/,
]) {
  matches(service, pattern);
}
for (const pattern of [/isClaimed|humanAgentLinks|clerk|hermesTasks/]) {
  excludes(
    service,
    pattern,
    "resident tasks must not depend on human claim or Hermes",
  );
}

for (const routePath of [
  "src/app/api/v1/tasks/route.ts",
  "src/app/api/v1/tasks/[id]/route.ts",
  "src/app/api/v1/tasks/[id]/events/route.ts",
]) {
  const route = source(routePath);
  matches(route, /authenticateResidentRequest/);
  matches(route, /moderationStatus !== "active"/);
  matches(route, /validateCors/);
  matches(route, /checkRateLimit/);
  excludes(route, /auth\(\)|humanAgentLinks|isClaimed|claimStatus/, routePath);
}
matches(source("src/app/api/v1/tasks/route.ts"), /residentTask/);
matches(
  source("src/app/api/v1/tasks/route.ts"),
  /normalizeResidentTaskIdempotencyKey/,
);
matches(
  source("src/app/api/v1/tasks/[id]/route.ts"),
  /normalizeResidentTaskMutation/,
);

const migration = source(
  "drizzle/migrations/PW7404-1051-01-canonical-resident-tasks-20260712.sql",
);
for (const pattern of [
  /PW7404-1051 same-connection database target guard failed/,
  /refuses pre-existing resident task tables/,
  /ON DELETE RESTRICT/,
  /resident_task_events_transition_check/,
  /pw7404_resident_task_event_immutable_trigger/,
  /pw7404_resident_task_event_matches_snapshot_trigger/,
  /pw7404_resident_task_guard_trigger/,
  /pw7404_resident_task_requires_event_trigger/,
  /DEFERRABLE INITIALLY DEFERRED/,
  /version must increment by exactly one/,
  /cannot be physically deleted/,
  /append-only/,
  /current_user = 'pw7404_task_maintenance'/,
  /created open at version one/,
  /snapshot \?& ARRAY/,
  /date_trunc\('milliseconds', task_row\.created_at\)/,
  /snapshot must exactly match the task row/,
  /continue the prior ledger state/,
  /active credentialed resident/,
]) {
  matches(migration, pattern);
}

const applyScript = source(
  "scripts/PW7404-1051-apply-canonical-resident-tasks.mjs",
);
for (const pattern of [
  /SPACEBOT_APPLY_RESIDENT_TASKS/,
  /SPACEBOT_EXPECTED_SENTINEL_AGENT_ID/,
  /Refusing wrong database target/,
  /partially present; refusing apply/,
  /missing_current_events/,
  /ledger_gaps/,
  /snapshot_mismatches/,
  /current_snapshot_mismatches/,
  /ledger_chain_mismatches/,
  /pg_get_constraintdef/,
  /pg_get_indexdef/,
  /pg_get_triggerdef/,
  /pg_get_functiondef/,
  /expectedFunctionBodyHashes/,
  /function-body-hash/,
]) {
  matches(applyScript, pattern);
}
excludes(applyScript, /const targetGuards = apply/);

const residentQuery = source("src/lib/residency/agent-resident-query.ts");
matches(residentQuery, /export function isPublicResidentId/);
matches(residentQuery, /export function isDirectlyViewableResidentId/);

for (const publicReader of [
  "src/app/api/v1/public/activity/route.ts",
  "src/app/api/v1/public/agents/[name]/route.ts",
  "src/app/(spacebot)/agents/[name]/page.tsx",
  "src/app/(spacebot)/live/page.tsx",
]) {
  const reader = source(publicReader);
  matches(
    reader,
    /isPublicResidentId\(botActivity\.targetAgentId\)/,
    publicReader,
  );
  matches(reader, /ne\(botActivity\.activityType, "wall_post"\)/, publicReader);
}

const openClaw = source("src/app/api/v1/openclaw/action/route.ts");
matches(openClaw, /lower\(\$\{agents\.name\}\) = lower\(\$\{name\}\)/);
matches(openClaw, /isDirectlyViewableResident\(\)/);
matches(openClaw, /isPublicResident\(\)/);
matches(
  openClaw,
  /Resident must be public and active to post on a public wall/,
);

const botspacePage = source("src/app/(spacebot)/botspace/[name]/page.tsx");
for (const pattern of [
  /activity\.activity_type = 'wall_post'/,
  /author\.resident_visibility = 'public'/,
  /author\.moderation_status = 'active'/,
  /COUNT\(\*\) OVER/,
  /activity\.created_at AT TIME ZONE 'UTC' AS created_at/,
  /ORDER BY activity\.created_at DESC, activity\.id DESC/,
  /notFound\(\)/,
  /renderedAt: new Date\(\)\.toISOString\(\)/,
]) {
  matches(botspacePage, pattern);
}
excludes(botspacePage, /agent_credentials/);

const botspaceClient = source("src/components/botspace/BotProfileClient.tsx");
matches(botspaceClient, /title="Resident Wall"/);
matches(botspaceClient, /bot\.wallPosts\.map/);
matches(botspaceClient, /String\(bot\.wallPostCount\)/);
matches(
  botspaceClient,
  /Human visitor transmissions are shown on the separate\s+PeopleSpace rail/,
);
matches(botspaceClient, /timeZone: ["']UTC["']/);
matches(botspaceClient, /computeProfileAgeDays\(bot\.createdAt, bot\.renderedAt\)/);
excludes(botspaceClient, /wallPosts=\{0\}/);
excludes(botspaceClient, /No transmissions yet\. Be the first/);

const humanWall = source("src/app/api/v1/botspace/[name]/wall/route.ts");
matches(humanWall, /resolveViewableBot/);
matches(humanWall, /isDirectlyViewableResident\(\)/);

const skill = source("public/skill.md");
matches(skill, /version: 2\.4\.0/);
matches(skill, /### Resident Tasks/);
matches(skill, /Idempotency-Key/);
matches(skill, /linked human\s+account would receive no task authority by default/);

const packageJson = JSON.parse(source("package.json"));
assert.equal(
  packageJson.scripts["db:migrate:resident-tasks:apply"],
  "node scripts/PW7404-1051-apply-canonical-resident-tasks.mjs --apply",
);
checks += 1;
assert.equal(
  packageJson.scripts["db:roles:apply"],
  "node scripts/PW7404-1055-provision-database-roles.mjs --apply",
);
checks += 1;

const livePage = source("src/app/(spacebot)/live/page.tsx");
excludes(livePage, /unstable_cache/);
matches(livePage, /ne\(botActivity\.activityType, "message"\)/);
matches(
  livePage,
  /eq\(botActivity\.activityType, "message"\)[\s\S]*isPublicResidentId\(botActivity\.targetAgentId\)/,
);

const databaseCanary = source(
  "scripts/PW7404-1053-verify-resident-tasks-database.mjs",
);
matches(databaseCanary, /runtime maintenance impersonation guard/);
matches(databaseCanary, /target\.session_user[\s\S]*"spacebot_runtime"/);
matches(databaseCanary, /expectedRuntimeEffectiveUser/);
matches(databaseCanary, /fabricated snapshot guard/);
matches(databaseCanary, /broken ledger chain guard/);

const httpCanary = source(
  "scripts/PW7404-1054-verify-resident-tasks-wall-http.mjs",
);
matches(httpCanary, /SPACEBOT_RUN_LIVE_PRIVACY_CANARY/);
matches(httpCanary, /const privateLive = await request\(null, "\/live"\)/);
matches(httpCanary, /privateLive\.text\.includes\(liveMessage\), false/);

const roleProvisioner = source(
  "scripts/PW7404-1055-provision-database-roles.mjs",
);
for (const pattern of [
  /spacebot_runtime/,
  /pw7404_task_maintenance/,
  /NOSUPERUSER/,
  /BYPASSRLS/,
  /Refusing service_role delegation/,
  /REVOKE service_role FROM spacebot_runtime, pw7404_task_maintenance/,
  /NOINHERIT/,
  /pw7404_task_maintenance_all/,
  /REVOKE pw7404_task_maintenance FROM spacebot_runtime/,
  /isolated_role_graph/,
  /REVOKE DELETE ON resident_tasks/,
  /REVOKE UPDATE, DELETE ON resident_task_events/,
]) {
  matches(roleProvisioner, pattern);
}

const databaseClient = source("src/db/index.ts");
matches(
  databaseClient,
  /SPACEBOT_RUNTIME_DATABASE_URL[\s\S]*SPACEBOT_DATABASE_URL[\s\S]*DATABASE_URL/,
);
matches(
  databaseClient,
  /SPACEBOT_RUNTIME_DATABASE_URL is required in production/,
);
excludes(source(".gitignore"), /^start-spacebot\.sh$/m);

const releasePaths = source(
  "scripts/PW7404-1051-spacebot-resident-tasks-wall-release-paths-20260712.txt",
);
for (const path of [
  "start-spacebot.sh",
  ".gitignore",
  "scripts/PW7404-1050-package-standalone-assets.mjs",
  "scripts/PW7404-1055-provision-database-roles.mjs",
  "src/db/index.ts",
]) {
  matches(
    releasePaths,
    new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
}
assert.equal(
  packageJson.scripts["verify:resident-tasks:http"],
  "node scripts/PW7404-1054-verify-resident-tasks-wall-http.mjs",
);
checks += 1;

console.log(
  `PW7404-1052 resident tasks/wall contract: PASS (${checks} checks)`,
);
