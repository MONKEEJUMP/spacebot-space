import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const moduleCache = new Map();

function loadTypeScriptModule(filePath) {
  const absolutePath = path.resolve(filePath);
  if (moduleCache.has(absolutePath)) {
    return moduleCache.get(absolutePath).exports;
  }

  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: absolutePath,
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(absolutePath, loadedModule);

  const localRequire = (specifier) => {
    if (specifier.startsWith(".")) {
      const resolved = path.resolve(path.dirname(absolutePath), specifier);
      const candidate = path.extname(resolved) ? resolved : `${resolved}.ts`;
      return loadTypeScriptModule(candidate);
    }
    return require(specifier);
  };

  vm.runInNewContext(output, {
    exports: loadedModule.exports,
    module: loadedModule,
    require: localRequire,
  });
  return loadedModule.exports;
}

function canonical(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

const contractPath = new URL(
  "../src/lib/chat/public-chat-contract.ts",
  import.meta.url,
);
const fixturesPath = new URL(
  "../src/lib/chat/public-chat-contract.fixtures.ts",
  import.meta.url,
);
const contract = loadTypeScriptModule(fileURLToPath(contractPath));
const fixtures = loadTypeScriptModule(fileURLToPath(fixturesPath));

let checks = 0;

const success = contract.presentPublicChatSuccess(
  fixtures.publicChatSuccessFixture.input,
);
assert.deepEqual(
  canonical(success),
  canonical(fixtures.publicChatSuccessFixture.expected),
);
assert.deepEqual(
  sortedKeys(success),
  canonical(fixtures.publicChatExpectedKeySets.envelope),
);
assert.deepEqual(
  sortedKeys(success.body),
  canonical(fixtures.publicChatExpectedKeySets.success),
);
assert.deepEqual(
  sortedKeys(success.body.metrics),
  canonical(fixtures.publicChatExpectedKeySets.metrics),
);
checks += 4;

const dorylusError = contract.presentPublicChatDorylusError(
  fixtures.publicChatDorylusErrorFixture.input,
);
assert.deepEqual(
  canonical(dorylusError),
  canonical(fixtures.publicChatDorylusErrorFixture.expected),
);
assert.deepEqual(
  sortedKeys(dorylusError),
  canonical(fixtures.publicChatExpectedKeySets.envelope),
);
assert.deepEqual(
  sortedKeys(dorylusError.body),
  canonical(fixtures.publicChatExpectedKeySets.dorylusError),
);
assert.deepEqual(
  sortedKeys(dorylusError.body.metrics),
  canonical(fixtures.publicChatExpectedKeySets.metrics),
);
assert.equal(dorylusError.status, 200, "Dorylus error state remains HTTP 200");
checks += 5;

const defaultDorylusError = contract.presentPublicChatDorylusError(
  fixtures.publicChatDorylusDefaultErrorFixture.input,
);
assert.equal(
  defaultDorylusError.body.error,
  fixtures.publicChatDorylusDefaultErrorFixture.expectedError,
);
checks += 1;

for (const [code, status, error] of fixtures.publicChatStaticErrorFixtures) {
  const response = contract.presentPublicChatStaticError(code);
  assert.deepEqual(canonical(response), {
    status,
    body: { success: false, error },
  });
  assert.deepEqual(
    sortedKeys(response.body),
    canonical(fixtures.publicChatExpectedKeySets.staticError),
  );
  checks += 2;
}

const rateLimit = contract.presentPublicChatRateLimit(
  fixtures.publicChatRateLimitFixture.retryAfter,
);
assert.deepEqual(
  canonical(rateLimit),
  canonical(fixtures.publicChatRateLimitFixture.expected),
);
assert.deepEqual(
  sortedKeys(rateLimit.body),
  canonical(fixtures.publicChatExpectedKeySets.rateLimit),
);
checks += 2;

const conflict = contract.presentPublicChatConflict(
  fixtures.publicChatConflictFixture.error,
);
assert.deepEqual(
  canonical(conflict),
  canonical(fixtures.publicChatConflictFixture.expected),
);
assert.deepEqual(
  sortedKeys(conflict.body),
  canonical(fixtures.publicChatExpectedKeySets.staticError),
);
checks += 2;

const exactBoundary = contract.characterizePublicChatBody(
  fixtures.publicChatMessageBoundaryFixtures.exact,
);
assert.equal(exactBoundary.accepted, true);
assert.equal(
  exactBoundary.value.message.length,
  contract.PUBLIC_CHAT_MAX_MESSAGE_LENGTH,
);
assert.equal(
  exactBoundary.value.message,
  fixtures.publicChatMessageBoundaryFixtures.exact.message,
);
checks += 3;

const overflowBoundary = contract.characterizePublicChatBody(
  fixtures.publicChatMessageBoundaryFixtures.overflow,
);
assert.equal(overflowBoundary.accepted, true);
assert.equal(
  overflowBoundary.value.message.length,
  contract.PUBLIC_CHAT_MAX_MESSAGE_LENGTH,
);
assert.doesNotMatch(overflowBoundary.value.message, /DROP_ME/);
checks += 3;

const normalizedBody = contract.characterizePublicChatBody(
  fixtures.publicChatNormalizationFixture.input,
);
assert.equal(normalizedBody.accepted, true);
assert.equal(
  normalizedBody.value.botName,
  fixtures.publicChatNormalizationFixture.expected.botName,
);
assert.equal(
  normalizedBody.value.message,
  fixtures.publicChatNormalizationFixture.expected.message,
);
checks += 3;

for (const [body, expectedCode] of fixtures.publicChatRejectedBodyFixtures) {
  const decision = contract.characterizePublicChatBody(body);
  assert.equal(decision.accepted, false);
  assert.deepEqual(
    canonical(decision.response),
    canonical(contract.presentPublicChatStaticError(expectedCode)),
  );
  checks += 2;
}

for (const targetFixture of fixtures.publicChatTargetFixtures) {
  const sideEffects = [];
  const decision = contract.decidePublicChatTarget(targetFixture);

  if (decision.next === "begin_side_effects") {
    sideEffects.push("conversation", "memory", "persistence", "dorylus");
  }

  assert.equal(decision.accepted, false);
  assert.equal(decision.next, "respond");
  assert.deepEqual(
    canonical(decision.response),
    canonical(
      contract.presentPublicChatStaticError("bot_not_found_or_inactive"),
    ),
  );
  assert.deepEqual(sideEffects, []);
  checks += 4;
}

const activeTarget = { id: "active-target" };
const activeDecision = contract.decidePublicChatTarget({
  availability: "active",
  target: activeTarget,
});
assert.equal(activeDecision.accepted, true);
assert.equal(activeDecision.next, "begin_side_effects");
assert.equal(activeDecision.target, activeTarget);
checks += 3;

console.log(`PW7404-1033 public chat contract: PASS (${checks} checks)`);
