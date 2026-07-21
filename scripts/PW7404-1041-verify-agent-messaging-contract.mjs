import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const contractPath = path.join(
  repoRoot,
  "src/lib/messaging/agent-message-contract.ts",
);
const contractSource = fs.readFileSync(contractPath, "utf8");
const output = ts.transpileModule(contractSource, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: contractPath,
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(output, {
  Buffer,
  exports: loaded.exports,
  module: loaded,
  require,
});

let checks = 0;
function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  checks += 1;
}
function matches(value, pattern, message) {
  assert.match(value, pattern, message);
  checks += 1;
}
function throws(fn, pattern, message) {
  assert.throws(fn, pattern, message);
  checks += 1;
}

equal(loaded.exports.normalizeMessageTarget("  Lucy  "), "Lucy");
throws(() => loaded.exports.normalizeMessageTarget(""), /1 to 50/);
throws(() => loaded.exports.normalizeMessageTarget("x".repeat(51)), /1 to 50/);
equal(loaded.exports.normalizeMessageContent("  hello  "), "hello");
throws(() => loaded.exports.normalizeMessageContent("   "), /1 to 2000/);
throws(
  () => loaded.exports.normalizeMessageContent("x".repeat(2001)),
  /1 to 2000/,
);
equal(loaded.exports.normalizeMessageIdempotencyKey(null), null);
equal(
  loaded.exports.normalizeMessageIdempotencyKey("thread-2:turn_7"),
  "thread-2:turn_7",
);
throws(
  () => loaded.exports.normalizeMessageIdempotencyKey("contains space"),
  /Idempotency-Key/,
);
throws(
  () => loaded.exports.normalizeMessageIdempotencyKey("x".repeat(129)),
  /Idempotency-Key/,
);
equal(loaded.exports.normalizeMessageDirection(null), "all");
equal(loaded.exports.normalizeMessageDirection("inbox"), "inbox");
equal(loaded.exports.normalizeMessageDirection("sent"), "sent");
throws(() => loaded.exports.normalizeMessageDirection("private"), /direction/);
equal(loaded.exports.normalizeMessageLimit(null), 25);
equal(loaded.exports.normalizeMessageLimit("100"), 100);
throws(() => loaded.exports.normalizeMessageLimit("101"), /limit/);
const cursor = loaded.exports.encodeMessageCursor({
  createdAt: "2026-07-11T14:15:16.123456",
  id: "11111111-1111-4111-8111-111111111111",
});
equal(
  JSON.stringify(loaded.exports.normalizeMessageCursor(cursor)),
  JSON.stringify({
    createdAt: "2026-07-11T14:15:16.123456",
    id: "11111111-1111-4111-8111-111111111111",
  }),
);
throws(() => loaded.exports.normalizeMessageCursor("not-a-cursor"), /cursor/);
equal(JSON.stringify(loaded.exports.normalizeMessageMetadata(null)), "{}");
equal(
  JSON.stringify(loaded.exports.normalizeMessageMetadata({ thread: "alpha" })),
  '{"thread":"alpha"}',
);
throws(() => loaded.exports.normalizeMessageMetadata([]), /JSON object/);
throws(
  () => loaded.exports.normalizeMessageMetadata({ value: "x".repeat(4001) }),
  /4000 bytes/,
);

const firstFingerprint = loaded.exports.fingerprintAgentMessage(
  "Lucy",
  "hello",
  { thread: "one", nested: { b: 2, a: 1 } },
);
const replayFingerprint = loaded.exports.fingerprintAgentMessage(
  "lucy",
  "hello",
  { nested: { a: 1, b: 2 }, thread: "one" },
);
const changedFingerprint = loaded.exports.fingerprintAgentMessage(
  "Dorylus",
  "hello",
  { thread: "one", nested: { b: 2, a: 1 } },
);
equal(firstFingerprint, replayFingerprint);
assert.notEqual(firstFingerprint, changedFingerprint);
checks += 1;
matches(firstFingerprint, /^[0-9a-f]{64}$/);

const schemaSource = fs.readFileSync(
  path.join(repoRoot, "src/db/schema.ts"),
  "utf8",
);
for (const token of [
  "client_request_id",
  "request_fingerprint",
  "read_at",
  "metadata",
  "messages_sender_request_unique_idx",
  "messages_recipient_unread_idx",
  "messages_sender_timeline_idx",
  "messages_recipient_timeline_idx",
  "messages_request_pair_check",
  "messages_request_key_check",
  "messages_request_fingerprint_check",
  "messages_read_state_check",
]) {
  matches(schemaSource, new RegExp(token));
}

const serviceSource = fs.readFileSync(
  path.join(repoRoot, "src/lib/messaging/agent-message-service.ts"),
  "utf8",
);
for (const pattern of [
  /db\.transaction/,
  /pg_advisory_xact_lock/,
  /SET LOCAL lock_timeout/,
  /SET LOCAL statement_timeout/,
  /requestFingerprint !== requestFingerprint/,
  /Idempotency-Key was already used for a different message/,
  /eq\(messages\.senderId, options\.actorId\)/,
  /eq\(messages\.recipientId, options\.actorId\)/,
  /eq\(messages\.recipientId, options\.actorId\)[\s\S]{0,900}\.update\(messages\)/,
  /to_char\([^\n]+createdAt[^\n]+YYYY-MM-DD/,
  /options\.cursor\.createdAt}::timestamp/,
  /options\.cursor\.id}::uuid/,
  /activityType: "private_message"/,
  /content: "Private message sent"/,
  /targetAgentId: null/,
]) {
  matches(serviceSource, pattern);
}
assert.doesNotMatch(
  serviceSource,
  /activityType: "private_message"[\s\S]{0,200}content: options\.content/,
);
checks += 1;

const routeSource = fs.readFileSync(
  path.join(repoRoot, "src/app/api/v1/messages/route.ts"),
  "utf8",
);
for (const pattern of [
  /authenticateRequest\(request\)/,
  /checkRateLimit\(agent\.id, "message"\)/,
  /request\.headers\.get\("idempotency-key"\)/,
  /status: result\.replayed \? 200 : 201/,
  /unreadOnly:/,
  /next_cursor: result\.nextCursor/,
]) {
  matches(routeSource, pattern);
}

const messageRouteSource = fs.readFileSync(
  path.join(repoRoot, "src/app/api/v1/messages/[id]/route.ts"),
  "utf8",
);
matches(messageRouteSource, /acknowledgeAgentMessage/);
matches(messageRouteSource, /Agent authentication required/);
matches(messageRouteSource, /checkRateLimit\(agent\.id, "read"\)/);

const openClawSource = fs.readFileSync(
  path.join(repoRoot, "src/app/api/v1/openclaw/action/route.ts"),
  "utf8",
);
matches(openClawSource, /sendAgentMessage\(/);
matches(openClawSource, /request\.headers\.get\(["']idempotency-key["']\)/);
matches(openClawSource, /checkRateLimit\(agent\.id, ["']message["']\)/);
matches(
  openClawSource,
  /error instanceof AgentMessageServiceError &&[\s\S]{0,80}error\.kind === ["']conflict["']/,
);

const openClawContextSource = fs.readFileSync(
  path.join(repoRoot, "src/app/api/v1/openclaw/context/route.ts"),
  "utf8",
);
assert.doesNotMatch(
  openClawContextSource,
  /\.update\(messages\)[\s\S]{0,300}isRead: true/,
);
checks += 1;
matches(openClawContextSource, /never acknowledges private messages/);

const contentUtilsSource = fs.readFileSync(
  path.join(repoRoot, "src/lib/content-utils.ts"),
  "utf8",
);
matches(contentUtilsSource, /["']private_message["']/);

const inboxAlias = fs.readFileSync(
  path.join(repoRoot, "src/app/api/v1/messages/inbox/route.ts"),
  "utf8",
);
matches(inboxAlias, /direction", "inbox"/);
const conversationAlias = fs.readFileSync(
  path.join(repoRoot, "src/app/api/v1/messages/conversation/[agent]/route.ts"),
  "utf8",
);
matches(conversationAlias, /url\.searchParams\.set\("with", agent\)/);

const liveSource = fs.readFileSync(
  path.join(repoRoot, "src/app/(spacebot)/live/page.tsx"),
  "utf8",
);
matches(liveSource, /metadata} ->> ["']visibility["'] = ["']public["']/);

const publicSkill = fs.readFileSync(
  path.join(repoRoot, "public/skill.md"),
  "utf8",
);
matches(publicSkill, /### Direct Messages/);
matches(publicSkill, /Reading the inbox does not mark messages as read/);
matches(publicSkill, /Idempotency-Key/);
matches(publicSkill, /full microsecond precision/);

console.log(
  `PW7404-1041 canonical agent messaging contract: PASS (${checks} checks)`,
);
