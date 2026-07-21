import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const sourcePath = fileURLToPath(
  new URL("../src/lib/chat/chat-idempotency.ts", import.meta.url),
);
const source = fs.readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: sourcePath,
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(output, {
  exports: loaded.exports,
  module: loaded,
  require,
});

const base = {
  idempotencyKey: "browser-turn-42",
  actorPrincipalType: "agent",
  actorPrincipalId: "11111111-1111-4111-8111-111111111111",
  targetAgentId: "22222222-2222-4222-8222-222222222222",
  conversationId: "33333333-3333-4333-8333-333333333333",
};
const first = loaded.exports.buildChatCycleIds(base);
const replay = loaded.exports.buildChatCycleIds(base);
assert.deepEqual(first, replay);
assert.equal(first.isIdempotent, true);
assert.notEqual(first.requestId, first.turnId);
assert.match(first.requestId, /^[0-9a-f-]{36}$/);
assert.match(first.turnId, /^[0-9a-f-]{36}$/);

for (const mutation of [
  { idempotencyKey: "browser-turn-43" },
  { actorPrincipalType: "human" },
  { actorPrincipalId: "44444444-4444-4444-8444-444444444444" },
]) {
  const changed = loaded.exports.buildChatCycleIds({ ...base, ...mutation });
  assert.notEqual(changed.requestId, first.requestId);
  assert.notEqual(changed.turnId, first.turnId);
}
for (const mutation of [
  { targetAgentId: "55555555-5555-4555-8555-555555555555" },
  { conversationId: "66666666-6666-4666-8666-666666666666" },
]) {
  const changed = loaded.exports.buildChatCycleIds({ ...base, ...mutation });
  assert.equal(changed.requestId, first.requestId);
  assert.equal(changed.turnId, first.turnId);
}

assert.throws(
  () =>
    loaded.exports.buildChatCycleIds({ ...base, idempotencyKey: "bad key" }),
  /Invalid Idempotency-Key/,
);
assert.throws(
  () =>
    loaded.exports.buildChatCycleIds({
      ...base,
      idempotencyKey: "x".repeat(129),
    }),
  /Invalid Idempotency-Key/,
);
const unkeyed = loaded.exports.buildChatCycleIds({
  ...base,
  idempotencyKey: null,
});
assert.equal(unkeyed.isIdempotent, false);
assert.notEqual(unkeyed.requestId, unkeyed.turnId);

const repositorySource = fs.readFileSync(
  path.resolve(path.dirname(sourcePath), "../lucy/cycle-repository.ts"),
  "utf8",
);
assert.doesNotMatch(repositorySource, /immutableCommand[\s\S]{0,500}history/);
assert.match(repositorySource, /immutableCommand/);

const streamSource = fs.readFileSync(
  path.resolve(path.dirname(sourcePath), "../../app/api/chat/stream/route.ts"),
  "utf8",
);
assert.match(streamSource, /executeReservedLucyCycle\(/);
assert.match(streamSource, /buildChatCycleIds/);
assert.doesNotMatch(streamSource, /executeDorylusCycle\s*\(/);
assert.match(streamSource, /admitPublicLucyCycle\(/);
assert.match(streamSource, /beginReservedExternalLucyCycle\(/);
assert.match(streamSource, /completeExternalLucyCycle/);
assert.match(streamSource, /failExternalLucyCycle/);
assert.match(
  streamSource,
  /finalText\.trim\(\)\.length === 0[\s\S]{0,400}failExternalLucyCycle[\s\S]{0,400}type: "error"/,
);
assert.match(
  streamSource,
  /await completeExternalLucyCycle\([\s\S]{0,1200}cycleTerminal = true;[\s\S]{0,300}type: "done"/,
);
assert.match(
  streamSource,
  /if \(!cycleTerminal\)[\s\S]{0,200}failExternalLucyCycle[\s\S]{0,300}DeepResearch ended before producing a response/,
);

const jsonRouteSource = fs.readFileSync(
  path.resolve(path.dirname(sourcePath), "../../app/api/chat/route.ts"),
  "utf8",
);
const canonicalExecutionSource = fs.readFileSync(
  path.resolve(path.dirname(sourcePath), "canonical-chat-execution.ts"),
  "utf8",
);
assert.match(jsonRouteSource, /executeCanonicalChatTurn\(/);
assert.match(canonicalExecutionSource, /admitPublicLucyCycle\(/);
assert.match(canonicalExecutionSource, /executeReservedLucyCycle\(/);
assert.match(jsonRouteSource, /error instanceof LucyCycleConflictError/);
assert.ok(
  canonicalExecutionSource.indexOf("admitPublicLucyCycle({") <
    canonicalExecutionSource.indexOf("loadCanonicalChatHistory("),
  "cycle admission must happen before history or cognition work",
);

console.log("PW7404-1037 chat idempotency and research terminality: PASS (36 checks)");
