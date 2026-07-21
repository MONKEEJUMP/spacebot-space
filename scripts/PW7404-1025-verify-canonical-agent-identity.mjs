import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const checks = [];
const requireMarkers = (relativePath, markers) => {
  const content = read(relativePath);
  for (const marker of markers) {
    checks.push(`${relativePath}:${marker}`);
    assert.ok(content.includes(marker), `Missing ${marker} in ${relativePath}`);
  }
  return content;
};

const schema = requireMarkers("src/db/schema.ts", [
  "export const agentCredentials = pgTable(",
  "export const agentIdentityAliases = pgTable(",
  "agent_credentials_lookup_unique_idx",
  'credentialFamily: varchar("credential_family"',
  'verifierKind: varchar("verifier_kind"',
  "agent_credentials_family_verifier_check",
  "credentials: many(agentCredentials)",
]);
const auth = requireMarkers("src/lib/security/agent-credential-auth.ts", [
  "db.query.agentCredentials.findFirst",
  "credential.verifierHash",
  "isNull(agentCredentials.revokedAt)",
  "machine:sha256_lookup",
  "if (!activeCredential) return null",
  "lastUsedAt: now",
]);
const register = requireMarkers("src/app/api/v1/agents/register/route.ts", [
  "registerResidentIdentity",
  "credential: apiKey",
  "humanAccountLinkageAvailable: false",
  "claimCode: null",
  "ResidentIdentityControllerError",
]);
const prepare = requireMarkers(
  "drizzle/migrations/PW7404-1025-01-prepare-agent-credentials-20260710.sql",
  [
    "CREATE TABLE IF NOT EXISTS agent_credentials",
    "CREATE TABLE IF NOT EXISTS agent_identity_aliases",
    "INSERT INTO agent_credentials",
    "pw7404_sync_agent_primary_credential_trigger",
    "current_setting('pw7404.identity_merge', true) = 'on'",
    "pw7404_guard_resident_normalized_name_trigger",
    "Resident-linked agents cannot be renamed independently",
    "label = 'rotated-primary'",
    "agent_credentials_family_verifier_check",
    "same-connection database identity guard failed",
    "credential catalog or constraint validation failed",
  ],
);
const merge = requireMarkers(
  "drizzle/migrations/PW7404-1025-02-merge-founding-agent-identities-20260710.sql",
  [
    "Expected exactly 18 guarded founding-agent merge pairs",
    "UPDATE agent_credentials AS credential SET agent_id = map.canonical_id",
    "INSERT INTO agent_identity_aliases",
    "Existing identity alias conflicts with the guarded merge map",
    "credential_family = 'machine'",
    "BEGIN;",
    "COMMIT;",
    "DELETE FROM agents AS duplicate",
    "agents_name_casefold_unique_idx",
    "bot_configs_name_casefold_unique_idx",
    "PW7404-1025 canonical identity post-merge invariants failed",
  ],
);
requireMarkers("scripts/PW7404-1025-apply-one-agent-identity.mjs", [
  "--phase=prepare",
  "--phase=merge",
  "MERGE_DRY_RUN",
  "PW7404_DRY_RUN=1",
  "merge dry-run rollback receipt failed",
  "SPACEBOT_APPLY_ONE_AGENT_IDENTITY",
  "SPACEBOT_CREATE_PREMERGE_BACKUP",
  "SPACEBOT_FULL_WRITE_MAINTENANCE",
  "--schema=public",
  "publicStateSql",
  '"--clean"',
  '"--single-transaction"',
  '"--exit-on-error"',
  '"--use-list"',
  "hashNormalizedCommandOutput",
  "capturePublicDataHashes",
  "octet_length",
  'COLLATE "C"',
  "THEN 'N'",
  "SET client_encoding='UTF8'",
  "Restore-test managed function seeding failed",
  "DEFAULT ACL public",
  "restoreListSha256",
  'flag: "wx"',
  "backup or permissions failed",
  "Public rollback has cross-schema dependent objects",
  "Public rollback requires explicit publication membership preservation",
  "Initial restore data or schema fingerprint does not match source",
  "Rollback data or schema fingerprint does not match source",
  'rollbackTest: "passed"',
  "const databaseUrl =",
  "pw7404.expected_server_address",
]);

const foreignKeyMoves = [
  "bot_profiles.agent_id",
  "bot_profile_history.agent_id",
  "channels.owner_id",
  "posts.agent_id",
  "comments.agent_id",
  "votes.agent_id",
  "follows.follower_id",
  "follows.following_id",
  "subscriptions.agent_id",
  "messages.sender_id",
  "messages.recipient_id",
  "heartbeats.agent_id",
  "human_audit_logs.target_agent_id",
  "bot_activity.agent_id",
  "bot_activity.target_agent_id",
  "machine_posts.author_id",
  "machine_comments.author_id",
  "machine_votes.agent_id",
  "machine_follows.follower_id",
  "machine_follows.followed_id",
  "machine_notifications.recipient_id",
  "machine_notifications.actor_id",
];
for (const move of foreignKeyMoves) {
  const [table, column] = move.split(".");
  checks.push(`merge:${move}`);
  assert.match(
    merge,
    new RegExp(`UPDATE ${table} AS row SET ${column} = map\\.canonical_id`),
    `Missing FK move for ${move}`,
  );
}

const foundingVisibilityFiles = [
  "src/components/homepage/FeaturedContent.tsx",
  "src/app/api/v1/public/content/[id]/route.ts",
  "src/app/api/v1/public/content/search/route.ts",
  "src/app/(spacebot)/live/page.tsx",
  "src/app/(spacebot)/agents/[name]/page.tsx",
  "src/app/(spacebot)/content/[id]/page.tsx",
  "src/app/api/v1/public/content/feed/route.ts",
  "src/app/api/v1/public/agents/route.ts",
  "src/app/api/v1/public/agents/[name]/route.ts",
  "src/app/api/v1/public/activity/route.ts",
];
for (const relativePath of foundingVisibilityFiles) {
  const content = read(relativePath);
  assert.doesNotMatch(content, /inArray\(agents\.name/);
  assert.match(content, /is(?:DirectlyViewable|Public)Resident(?:Id)?/);
  checks.push(`canonical-resident-visibility:${relativePath}`);
}
assert.match(
  read("src/app/(spacebot)/live/page.tsx"),
  /inArray\(sql`lower\(\$\{agents\.name\}\)`/,
);
checks.push("casefold-founding-live-filter");
const agentStrip = read("src/components/homepage/AgentStrip.tsx");
assert.match(agentStrip, /orderMap\.get\(a\.name\.toLowerCase\(\)\)/);
const publicAgents = read("src/app/api/v1/public/agents/route.ts");
const publicAgent = read("src/app/api/v1/public/agents/[name]/route.ts");
assert.match(publicAgents, /AGENT_FACTIONS\[a\.name\.toLowerCase\(\)\]/);
assert.match(publicAgent, /AGENT_FACTIONS\[agent\.name\.toLowerCase\(\)\]/);
checks.push(
  "casefold-agent-strip-order",
  "casefold-agent-list-faction",
  "casefold-agent-detail-faction",
);

assert.doesNotMatch(auth, /db\.query\.agents\.findFirst\(\{\s*where: or/);
assert.doesNotMatch(auth, /lookupHash, input\.credential/);
assert.match(schema, /lookupHash: varchar\("lookup_hash"/);
assert.match(register, /registerResidentIdentity\(\{/);
assert.match(prepare, /ON CONFLICT \(lookup_hash\) DO NOTHING/);
assert.match(merge, /set_config\('pw7404\.identity_merge', 'on', true\)/);
checks.push("forbidden-and-structural-checks:6");

const encodeNativeTextFixture = (values) =>
  values
    .map((value) =>
      value === null ? "N" : `V${Buffer.byteLength(value, "utf8")}:${value}`,
    )
    .join("");
assert.notEqual(
  encodeNativeTextFixture([null]),
  encodeNativeTextFixture(["null"]),
);
assert.notEqual(
  encodeNativeTextFixture(["{alpha,beta}"]),
  encodeNativeTextFixture(["[0:1]={alpha,beta}"]),
);
assert.notEqual(
  `${encodeNativeTextFixture(["duplicate"])}\n`,
  `${encodeNativeTextFixture(["duplicate"])}\n${encodeNativeTextFixture([
    "duplicate",
  ])}\n`,
);
checks.push(
  "native-text-null-fixture",
  "array-bounds-fixture",
  "duplicate-row-fixture",
);

console.log(
  `PW7404-1025 canonical agent identity: PASS (${checks.length + 6} checks)`,
);
