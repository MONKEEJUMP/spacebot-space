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

const relationshipService = source(
  "src/lib/relationships/agent-relationship-service.ts",
);
for (const pattern of [
  /relationshipLockKey/,
  /\.sort\(\)\.join/,
  /pg_advisory_xact_lock/,
  /onConflictDoNothing/,
  /adjustRelationshipCounts/,
  /active_credential\.revoked_at IS NULL/,
  /Cannot follow yourself/,
  /Cannot unfollow yourself/,
]) {
  matches(relationshipService, pattern);
}
assert.doesNotMatch(relationshipService, /refreshRelationshipCounts/);
checks += 1;

const legacyFollowService = source(
  "src/lib/services/machine-follow-service.ts",
);
matches(legacyFollowService, /followAgent\(/);
matches(legacyFollowService, /unfollowAgent\(/);

for (const profilePath of [
  "src/app/api/v1/agents/me/route.ts",
  "src/app/api/v1/agents/profile/route.ts",
]) {
  const profileSource = source(profilePath);
  matches(profileSource, /machineFollows/);
  assert.doesNotMatch(profileSource, /\.from\(follows\)/);
  checks += 1;
}

const conversationService = source(
  "src/lib/messaging/agent-conversation-service.ts",
);
for (const prohibited of [
  /message\.content/,
  /message\.metadata/,
  /message\.client_request_id/,
  /message\.request_fingerprint/,
  /\.update\(messages\)/,
]) {
  assert.doesNotMatch(conversationService, prohibited);
  checks += 1;
}
for (const pattern of [
  /unread_count/,
  /machine_follows/,
  /latest_message/,
  /encodeMessageCursor/,
]) {
  matches(conversationService, pattern);
}

const openClawContext = source("src/app/api/v1/openclaw/context/route.ts");
assert.doesNotMatch(openClawContext, /\.update\(messages\)/);
checks += 1;

for (const routePath of [
  "src/app/api/v1/bot-conversations/[botName]/route.ts",
  "src/app/api/v1/bot-conversations/[botName]/[partner]/route.ts",
  "src/app/api/v1/bot-chatter/[name]/route.ts",
  "src/app/api/v1/bot-activity/[botName]/route.ts",
]) {
  matches(source(routePath), /legacyPrivateSurfaceRetired/);
}

assert.doesNotMatch(
  source("src/app/api/v1/feed/live-chat/route.ts"),
  /queryRows/,
);
assert.doesNotMatch(
  source("src/app/api/v1/feed/journal/route.ts"),
  /queryRows/,
);
checks += 2;
matches(
  source("src/app/api/v1/feed/wall/route.ts"),
  /event_type IN \('wall_post', 'public_broadcast'\)/,
);
assert.doesNotMatch(
  source("src/app/api/v1/feed/social/route.ts"),
  /event_type = 'decision'/,
);
checks += 1;

const migration = source(
  "drizzle/migrations/PW7404-1044-01-canonical-agent-relationships-20260711.sql",
);
for (const pattern of [
  /INSERT INTO machine_follows/,
  /ON CONFLICT \(follower_id, followed_id\) DO NOTHING/,
  /ck_machine_follows_no_self/,
]) {
  matches(migration, pattern);
}

const indexMigration = source(
  "drizzle/migrations/PW7404-1044-02-canonical-agent-conversation-indexes-20260711.sql",
);
for (const pattern of [
  /CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_sender_recipient_timeline_idx/,
  /CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_recipient_sender_timeline_idx/,
  /CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_recipient_unread_timeline_idx/,
]) {
  matches(indexMigration, pattern);
}

const applyScript = source(
  "scripts/PW7404-1044-apply-canonical-agent-relationships.mjs",
);
matches(applyScript, /ensureConcurrentIndex/);
matches(applyScript, /CREATE INDEX CONCURRENTLY/);

const rollback = source(
  "drizzle/migrations/PW7404-1044-ROLLBACK-preserve-canonical-relationships-20260711.sql",
);
matches(rollback, /INSERT INTO follows/);
matches(rollback, /SELECT follower_id, followed_id, created_at/);

const autoFollowRoute = source("src/app/api/social/setup/auto-follow/route.ts");
matches(autoFollowRoute, /status: 410/);
matches(autoFollowRoute, /residents control relationships/);
const autoFollowService = source("src/lib/services/machine-auto-follow.ts");
assert.doesNotMatch(autoFollowService, /machineFollows|INSERT INTO|\.insert\(/);
checks += 1;

console.log(
  `PW7404-1044 relationship/privacy contract: ${checks} checks passed`,
);
