import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
let checks = 0;

function source(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function matches(value, pattern, message) {
  assert.match(value, pattern, message);
  checks += 1;
}

const schema = source("src/db/schema.ts");
for (const pattern of [
  /residentVisibility: varchar\("resident_visibility"/,
  /moderationStatus: varchar\("moderation_status"/,
  /agents_resident_visibility_check/,
  /agents_moderation_status_check/,
  /agents_visibility_name_idx/,
  /agents_name_casefold_unique_idx/,
  /bot_configs_name_casefold_unique_idx/,
  /export const botProfiles[\s\S]{0,1000}onDelete: "cascade"/,
  /export const botConfigs[\s\S]{0,1000}agentId:[\s\S]{0,180}\.notNull\(\)/,
]) {
  matches(schema, pattern);
}

const residentService = source("src/lib/residency/agent-resident-service.ts");
for (const pattern of [
  /lockAgentResidentIdentity/,
  /resident:\$\{name\.toLowerCase\(\)\}/,
  /ensureAgentResidentProjection/,
  /assertAgentResidentProjection/,
  /onConflictDoNothing/,
  /category: "Resident"/,
  /mood: "Curious"/,
]) {
  matches(residentService, pattern);
}

const registerRoute = source("src/app/api/v1/agents/register/route.ts");
matches(registerRoute, /ensureAgentResidentProjection\(tx/);
matches(registerRoute, /residentCreated: true/);
matches(registerRoute, /ownershipClaimAvailable: true/);
assert.doesNotMatch(registerRoute, /claimRequired: true/);
checks += 1;

const claimRoute = source("src/app/api/v1/humans/claim/route.ts");
matches(claimRoute, /assertAgentResidentProjection\(tx, agent\)/);
assert.doesNotMatch(claimRoute, /ensureAgentResidentProjection/);
checks += 1;
matches(claimRoute, /replayed: true/);
matches(claimRoute, /lower\(\$\{agents\.name\}\) = \$\{trimmedHandle\}/);

const claimCodeRoute = source("src/app/api/v1/agents/claim-code/route.ts");
for (const pattern of [
  /authenticateRequest\(request\)/,
  /checkRateLimit\(agent\.id, "claimCode"\)/,
  /getClaimCodeLookupValue\(claimCode\)/,
  /CLAIM_CODE_TTL_MS/,
  /Agent already has a human ownership link/,
]) {
  matches(claimCodeRoute, pattern);
}

const meRoute = source("src/app/api/v1/agents/me/route.ts");
matches(meRoute, /revalidateTag\("agents"\)/);
matches(meRoute, /revalidateTag\("content"\)/);

const residentQuery = source("src/lib/residency/agent-resident-query.ts");
for (const pattern of [
  /resident_credential\.revoked_at IS NULL/,
  /residentVisibility} = 'public'/,
  /residentVisibility} IN \('public', 'unlisted'\)/,
  /moderationStatus} = 'active'/,
]) {
  matches(residentQuery, pattern);
}

for (const publicListPath of [
  "src/app/api/v1/public/agents/route.ts",
  "src/app/api/v1/public/content/feed/route.ts",
  "src/app/api/v1/public/content/search/route.ts",
  "src/app/api/v1/public/activity/route.ts",
  "src/components/homepage/FeaturedContent.tsx",
]) {
  const value = source(publicListPath);
  matches(value, /isPublicResident\(\)/, publicListPath);
  assert.doesNotMatch(value, /isClaimed|FOUNDING_AGENTS/, publicListPath);
  checks += 1;
}

for (const directPath of [
  "src/app/api/v1/public/agents/[name]/route.ts",
  "src/app/api/v1/public/content/[id]/route.ts",
  "src/app/(spacebot)/agents/[name]/page.tsx",
  "src/app/(spacebot)/content/[id]/page.tsx",
]) {
  matches(source(directPath), /isDirectlyViewableResident\(\)/, directPath);
}
assert.doesNotMatch(
  source("src/app/(spacebot)/agents/[name]/page.tsx"),
  /const getAgent = unstable_cache/,
);
checks += 1;
assert.doesNotMatch(
  source("src/app/(spacebot)/content/[id]/page.tsx"),
  /const getContent = unstable_cache/,
);
checks += 1;

const botspaceDirectory = source("src/app/(spacebot)/botspace/page.tsx");
for (const pattern of [
  /resident_visibility = 'public'/,
  /moderation_status = 'active'/,
  /credential\.revoked_at IS NULL/,
]) {
  matches(botspaceDirectory, pattern);
}

const botspaceDetail = source("src/app/(spacebot)/botspace/[name]/page.tsx");
matches(botspaceDetail, /resident_visibility IN \('public', 'unlisted'\)/);
matches(botspaceDetail, /credential\.revoked_at IS NULL/);
assert.doesNotMatch(botspaceDetail, /config\.is_active = true/);
checks += 1;

const agentStrip = source("src/components/homepage/AgentStrip.tsx");
matches(agentStrip, /agent\.resident_visibility = 'public'/);
assert.doesNotMatch(agentStrip, /agentsList = FOUNDING_AGENTS\.map/);
checks += 1;
matches(
  source("src/components/homepage/HomepageBotChat.tsx"),
  /fetch\("\/api\/v1\/public\/agents"/,
);

const publishService = source("src/lib/publishing/resident-publish-service.ts");
for (const pattern of [
  /db\.transaction/,
  /pg_advisory_xact_lock/,
  /resident-publish:/,
  /activityType: "creation"/,
  /visibility: "public"/,
  /moderationStatus, "active"/,
  /publication_credential\.revoked_at IS NULL/,
  /ResidentPublishAuthorizationError/,
  /Idempotency-Key was already used for a different publication/,
  /postCount: sql/,
]) {
  matches(publishService, pattern);
}

const postsRoute = source("src/app/api/v1/posts/route.ts");
matches(postsRoute, /publishResidentContent\(/);
matches(postsRoute, /checkRateLimit\(agent\.id, "post"\)/);
assert.doesNotMatch(postsRoute, /\.insert\(posts\)/);
checks += 1;
const openClaw = source("src/app/api/v1/openclaw/action/route.ts");
matches(openClaw, /publishResidentContent\(/);
matches(openClaw, /ResidentPublishAuthorizationError/);
assert.doesNotMatch(openClaw, /\.insert\(posts\)/);
checks += 1;

const postDetail = source("src/app/api/v1/posts/[id]/route.ts");
matches(postDetail, /isDirectlyViewableResident\(\)/);
matches(postDetail, /eq\(agents\.id, agent\.id\)/);

const tickerActivity = source("src/app/api/v1/ticker/bot-activity/route.ts");
matches(tickerActivity, /isPublicResident\(\)/);
matches(tickerActivity, /private, no-store/);
assert.doesNotMatch(tickerActivity, /lastGoodPayload/);
checks += 1;

const buddyBlog = source("src/app/api/v1/buddy/blog/route.ts");
for (const pattern of [
  /authenticateAgentCredential\(request\)/,
  /ownedAgentId !== principal\.agent\.id/,
  /humanAgentLinks\.status, ["']active["']/,
  /publishResidentContent\(/,
  /idempotency-key/,
]) {
  matches(buddyBlog, pattern);
}
assert.doesNotMatch(buddyBlog, /\.insert\(posts\)|\.insert\(botActivity\)/);
checks += 1;

matches(
  source("src/app/api/v1/posts/[id]/comments/route.ts"),
  /moderationStatus !== "active"/,
);
const postVoteRoute = source("src/app/api/v1/posts/[id]/vote/route.ts");
assert.equal(postVoteRoute.match(/moderationStatus !== "active"/g)?.length, 2);
checks += 1;
matches(
  source("src/app/api/v1/comments/[id]/vote/route.ts"),
  /moderationStatus !== "active"/,
);

const migration = source(
  "drizzle/migrations/PW7404-1047-01-credential-first-residency-20260711.sql",
);
for (const pattern of [
  /ADD COLUMN IF NOT EXISTS resident_visibility/,
  /ADD COLUMN IF NOT EXISTS moderation_status/,
  /claim_code NOT LIKE 'v1:%'/,
  /INSERT INTO bot_profiles/,
  /INSERT INTO bot_configs/,
  /ALTER COLUMN agent_id SET NOT NULL/,
  /ON DELETE CASCADE/,
  /Credential-first residency backfill incomplete/,
  /same-connection database target guard failed/,
  /canonical credential trigger prerequisite failed/,
  /trigger\.tgenabled IN \('O', 'A'\)/,
]) {
  matches(migration, pattern);
}

const indexMigration = source(
  "drizzle/migrations/PW7404-1047-02-resident-visibility-index-20260711.sql",
);
matches(indexMigration, /CREATE INDEX CONCURRENTLY/);
matches(indexMigration, /CREATE UNIQUE INDEX CONCURRENTLY/);
matches(indexMigration, /bot_activity_agent_publication_request_unique_idx/);

const applyScript = source(
  "scripts/PW7404-1047-apply-credential-first-residency.mjs",
);
matches(applyScript, /SPACEBOT_APPLY_CREDENTIAL_FIRST_RESIDENCY/);
matches(applyScript, /SPACEBOT_PSQL_BIN/);
matches(applyScript, /SPACEBOT_EXPECTED_SENTINEL_AGENT_ID/);
matches(applyScript, /assertExpectedTarget/);
matches(applyScript, /PW7404_EXPECTED_DATABASE=/);
matches(applyScript, /\["O", "A"\]\.includes/);
matches(applyScript, /ensureVisibilityIndex/);
matches(applyScript, /ensurePublicationIndex/);
matches(applyScript, /expectedPublicationPredicate/);
matches(applyScript, /pw7404_sync_agent_primary_credential_trigger/);
matches(applyScript, /unsafe_claim_codes/);

const rollback = source(
  "drizzle/migrations/PW7404-1047-ROLLBACK-preserve-forward-residency-20260711.sql",
);
matches(rollback, /forward-data-preserving/);
matches(rollback, /rollback would preserve incomplete residents/);
matches(rollback, /rollback found unsafe ownership codes/);

const httpCanary = source(
  "scripts/PW7404-1049-verify-credential-first-residency-http.mjs",
);
matches(httpCanary, /assertExpectedTarget/);
matches(httpCanary, /pw1049-binding-/);
matches(httpCanary, /profiles: 0/);
matches(httpCanary, /credentials: 0/);
matches(httpCanary, /comments: 0/);

const publicProtocol = source("public/skill.md");
matches(publicProtocol, /already an autonomous/);
matches(publicProtocol, /Claiming does[\s\S]{0,100}not create residency/);
matches(publicProtocol, /POST \/agents\/claim-code/);

const productionStart = source("start-spacebot.sh");
matches(productionStart, /cp -a "\$APP_ROOT\/\.next\/static" "\$STANDALONE_DIR\/\.next\/"/);
matches(productionStart, /cp -a "\$APP_ROOT\/public" "\$STANDALONE_DIR\/"/);
matches(productionStart, /exec node "\$STANDALONE_DIR\/server\.js"/);

const packageJson = JSON.parse(source("package.json"));
assert.equal(
  packageJson.scripts.postbuild,
  "node scripts/PW7404-1050-package-standalone-assets.mjs",
);
checks += 1;
const standalonePackager = source(
  "scripts/PW7404-1050-package-standalone-assets.mjs",
);
matches(standalonePackager, /fs\.cpSync/);
matches(standalonePackager, /path\.join\(standaloneRoot, "public"\)/);
matches(standalonePackager, /path\.join\(standaloneRoot, "\.next", "static"\)/);

console.log(
  `PW7404-1048 credential-first residency contract: ${checks} checks passed`,
);
