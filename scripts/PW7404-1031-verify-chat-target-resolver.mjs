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
  if (moduleCache.has(absolutePath))
    return moduleCache.get(absolutePath).exports;

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

const resolverPath = fileURLToPath(
  new URL("../src/lib/chat/chat-target-resolver.ts", import.meta.url),
);
const fixturesPath = fileURLToPath(
  new URL("../src/lib/chat/chat-target-resolver.fixtures.ts", import.meta.url),
);
const resolver = loadTypeScriptModule(resolverPath);
const fixtures = loadTypeScriptModule(fixturesPath);
let checks = 0;

async function expectFailure(name, requestedName, lookup, code, status) {
  const resolve = resolver.createChatTargetResolver({ lookupSnapshot: lookup });
  await assert.rejects(
    () => resolve(requestedName),
    (error) => {
      assert.equal(
        resolver.isChatTargetResolutionError(error),
        true,
        `${name} typed error`,
      );
      assert.equal(error.code, code, `${name} code`);
      assert.equal(error.status, status, `${name} status`);
      assert.equal(
        error.message,
        error.publicMessage,
        `${name} safe Error message`,
      );
      const publicError = resolver.toPublicChatTargetError(error);
      assert.equal(publicError.status, status, `${name} public status`);
      assert.doesNotMatch(
        JSON.stringify(publicError),
        /PRIVATE_|database|fallback/i,
      );
      checks += 6;
      return true;
    },
  );
}

const lookupCalls = [];
const resolveCanonical = resolver.createChatTargetResolver({
  lookupSnapshot: fixtures.snapshotLookup(
    fixtures.canonicalNameSnapshot,
    lookupCalls,
  ),
});
const canonical = await resolveCanonical("  LuCy  ");
assert.deepEqual(lookupCalls, ["lucy"]);
assert.equal(canonical.agentId, fixtures.fixtureIds.agent);
assert.equal(canonical.normalizedName, "lucy");
assert.equal(canonical.config.agentId, canonical.agentId);
assert.equal(canonical.config.isActive, true);
assert.equal(Object.isFrozen(canonical), true);
assert.equal(Object.isFrozen(canonical.config), true);
assert.equal(Object.isFrozen(canonical.matchedBy), true);
assert.equal(
  Reflect.set(canonical.config, "agentId", fixtures.fixtureIds.agentTwo),
  false,
);
assert.equal(canonical.config.agentId, fixtures.fixtureIds.agent);
checks += 10;

const resolveAlias = resolver.createChatTargetResolver({
  lookupSnapshot: fixtures.snapshotLookup(fixtures.canonicalAliasSnapshot),
});
const aliasTarget = await resolveAlias("oracle");
assert.equal(aliasTarget.agentId, fixtures.fixtureIds.agent);
assert.equal(aliasTarget.requestedName, "oracle");
assert.equal(aliasTarget.normalizedName, "lucy");
assert.deepEqual(Array.from(aliasTarget.matchedBy), ["alias"]);
checks += 4;

await expectFailure(
  "invalid type",
  null,
  () => {
    throw new Error("lookup must not run");
  },
  "invalid",
  400,
);
await expectFailure(
  "invalid syntax",
  "../lucy",
  () => {
    throw new Error("lookup must not run");
  },
  "invalid",
  400,
);
await expectFailure(
  "unknown",
  "missing",
  fixtures.snapshotLookup(fixtures.unknownSnapshot),
  "unknown",
  404,
);
await expectFailure(
  "unconfigured",
  "lucy",
  fixtures.snapshotLookup(fixtures.unconfiguredSnapshot),
  "unconfigured",
  404,
);
await expectFailure(
  "inactive",
  "lucy",
  fixtures.snapshotLookup(fixtures.inactiveSnapshot),
  "inactive",
  404,
);
await expectFailure(
  "ambiguous",
  "lucy",
  fixtures.snapshotLookup(fixtures.ambiguousSnapshot),
  "ambiguous",
  503,
);
await expectFailure(
  "unlinked",
  "lucy",
  fixtures.snapshotLookup(fixtures.unlinkedSnapshot),
  "unlinked",
  503,
);
await expectFailure(
  "inconsistent",
  "lucy",
  fixtures.snapshotLookup(fixtures.inconsistentSnapshot),
  "inconsistent",
  503,
);
await expectFailure(
  "lookup exception",
  "lucy",
  fixtures.failingLookup,
  "lookup_failed",
  503,
);
await expectFailure(
  "tampered request binding",
  "lucy",
  fixtures.snapshotLookup(fixtures.tamperedRequestedNameSnapshot),
  "lookup_failed",
  503,
);
await expectFailure(
  "tampered snapshot shape",
  "lucy",
  fixtures.snapshotLookup(fixtures.tamperedShapeSnapshot),
  "lookup_failed",
  503,
);

const source = fs.readFileSync(resolverPath, "utf8");
assert.match(source, /FROM agents AS agent/);
assert.match(source, /FROM bot_configs AS config/);
assert.match(source, /FROM agent_identity_aliases AS alias/);
assert.equal((source.match(/db\.execute\(/g) ?? []).length, 2);
assert.doesNotMatch(source, /(?:default|fallback)(?:Agent|Bot|Config|Target)/);
checks += 5;

assert.deepEqual(Array.from(resolver.CHAT_TARGET_ERROR_CODES), [
  "invalid",
  "unknown",
  "unconfigured",
  "inactive",
  "ambiguous",
  "unlinked",
  "inconsistent",
  "lookup_failed",
]);
checks += 1;

console.log(
  `PW7404-1031 canonical chat target resolver: PASS (${checks} checks)`,
);
