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

const contractPath = new URL(
  "../src/lib/lucy/cycle-contract.ts",
  import.meta.url,
);
const fixturesPath = new URL(
  "../src/lib/lucy/cycle-contract.fixtures.ts",
  import.meta.url,
);
const contract = loadTypeScriptModule(fileURLToPath(contractPath));
const fixtures = loadTypeScriptModule(fileURLToPath(fixturesPath));

const cases = [
  [
    "passing input",
    contract.LucyCycleInputSchema,
    fixtures.passingInputFixture,
    true,
  ],
  [
    "successful output",
    contract.LucyCycleOutputSchema,
    fixtures.successfulOutputFixture,
    true,
  ],
  [
    "error output",
    contract.LucyCycleOutputSchema,
    fixtures.errorOutputFixture,
    true,
  ],
  [
    "malformed input",
    contract.LucyCycleInputSchema,
    fixtures.malformedInputFixture,
    false,
  ],
  [
    "unknown status enum",
    contract.LucyCycleOutputSchema,
    fixtures.unknownEnumOutputFixture,
    false,
  ],
  [
    "oversize message",
    contract.LucyCycleInputSchema,
    fixtures.oversizeInputFixture,
    false,
  ],
  [
    "missing canonical target ID",
    contract.LucyCycleInputSchema,
    fixtures.missingCanonicalTargetAgentIdFixture,
    false,
  ],
  [
    "non-canonical target ID",
    contract.LucyCycleInputSchema,
    fixtures.nonCanonicalTargetAgentIdFixture,
    false,
  ],
  [
    "missing actor",
    contract.LucyCycleInputSchema,
    fixtures.missingActorFixture,
    false,
  ],
  [
    "missing conversation ID",
    contract.LucyCycleInputSchema,
    fixtures.missingConversationIdFixture,
    false,
  ],
  [
    "client-assigned cycle ID",
    contract.LucyCycleInputSchema,
    fixtures.clientAssignedCycleIdFixture,
    false,
  ],
  [
    "legacy public keys at core output top level",
    contract.LucyCycleOutputSchema,
    fixtures.legacyTopLevelKeysOutputFixture,
    false,
  ],
  [
    "missing engine proof",
    contract.LucyCycleOutputSchema,
    fixtures.missingEngineOutputFixture,
    false,
  ],
  [
    "malformed engine proof",
    contract.LucyCycleOutputSchema,
    fixtures.malformedEngineOutputFixture,
    false,
  ],
];

for (const [name, schema, fixture, expectedSuccess] of cases) {
  const result = schema.safeParse(fixture);
  assert.equal(result.success, expectedSuccess, `${name} contract result`);
}

assert.deepEqual(Array.from(contract.LucyCycleStatusSchema.options), [
  "completed",
  "partial",
  "blocked",
  "refused",
  "failed",
]);
assert.equal(contract.LUCY_CYCLE_SCHEMA_VERSION, "2.0.0");
assert.equal(contract.LUCY_CYCLE_LIMITS.messageCharacters, 100_000);
assert.equal(
  contract.LucyCycleInputSchema.safeParse({
    ...fixtures.passingInputFixture,
    message: "M".repeat(contract.LUCY_CYCLE_LIMITS.messageCharacters),
  }).success,
  true,
);
assert.equal(
  contract.LucyEngineProofSchema.safeParse({
    ...fixtures.successfulOutputFixture.engine,
    queryId: fixtures.successfulOutputFixture.engine.query_id,
  }).success,
  false,
  "engine proof must reject legacy or unknown keys",
);

const correlationFields = [
  "request_id",
  "turn_id",
  "target_agent_id",
  "conversation_id",
];

for (const output of [
  fixtures.successfulOutputFixture,
  fixtures.errorOutputFixture,
]) {
  for (const field of correlationFields) {
    assert.equal(output[field], fixtures.passingInputFixture[field]);
  }
}

assert.equal(
  Object.hasOwn(fixtures.passingInputFixture, "cycle_id"),
  false,
  "the coordinator, not the client, owns cycle_id assignment",
);
assert.equal(
  contract.LucyCycleOutputSchema.safeParse(fixtures.successfulOutputFixture)
    .data?.cycle_id,
  fixtures.successfulOutputFixture.cycle_id,
);

const legacyAdapterProjection = {
  queryId: fixtures.successfulOutputFixture.engine.query_id,
  metrics: {
    totalCycleMs: fixtures.successfulOutputFixture.usage.duration_ms,
    totalTokens: fixtures.successfulOutputFixture.usage.total_tokens,
    wingmenCompleted:
      fixtures.successfulOutputFixture.engine.completed_worker_count,
  },
};
assert.equal(
  legacyAdapterProjection.queryId,
  fixtures.successfulOutputFixture.engine.query_id,
);
assert.equal(
  legacyAdapterProjection.metrics.totalCycleMs,
  fixtures.successfulOutputFixture.usage.duration_ms,
);
assert.equal(
  legacyAdapterProjection.metrics.totalTokens,
  fixtures.successfulOutputFixture.usage.total_tokens,
);
assert.equal(
  legacyAdapterProjection.metrics.wingmenCompleted,
  fixtures.successfulOutputFixture.engine.completed_worker_count,
);

for (const legacyKey of [
  "queryId",
  "botName",
  "conversationId",
  "metrics",
  "totalCycleMs",
  "totalTokens",
  "wingmenCompleted",
]) {
  assert.equal(
    Object.hasOwn(fixtures.successfulOutputFixture, legacyKey),
    false,
    `${legacyKey} must not appear at the core output top level`,
  );
}

for (const output of [
  fixtures.successfulOutputFixture,
  fixtures.errorOutputFixture,
]) {
  assert.equal(
    contract.validateLucyCycleExchange(fixtures.passingInputFixture, output)
      .success,
    true,
  );
}

for (const [field, output] of [
  ["request_id", fixtures.mismatchedRequestIdOutputFixture],
  ["turn_id", fixtures.mismatchedTurnIdOutputFixture],
  ["target_agent_id", fixtures.mismatchedTargetAgentIdOutputFixture],
  ["conversation_id", fixtures.mismatchedConversationIdOutputFixture],
]) {
  const result = contract.validateLucyCycleExchange(
    fixtures.passingInputFixture,
    output,
  );
  assert.equal(result.success, false);
  assert.ok(result.errors.length > 0);
  assert.ok(
    result.errors.every(
      (error) => contract.LucySafeErrorSchema.safeParse(error).success,
    ),
  );
  assert.deepEqual(
    Array.from(result.errors, (error) => error.safe_message),
    [`Invalid value at output.${field}.`],
  );
}

const safeFailure = contract.validateLucyCycleInput({
  ...fixtures.oversizeInputFixture,
  message: `PRIVATE_MARKER_${"X".repeat(
    contract.LUCY_CYCLE_LIMITS.messageCharacters,
  )}`,
});
assert.equal(safeFailure.success, false);
assert.ok(safeFailure.errors.length > 0);
assert.ok(
  safeFailure.errors.every(
    (error) => contract.LucySafeErrorSchema.safeParse(error).success,
  ),
);
assert.doesNotMatch(JSON.stringify(safeFailure.errors), /PRIVATE_MARKER/);

const safeOutputFailure = contract.validateLucyCycleOutput({
  ...fixtures.successfulOutputFixture,
  engine: {
    ...fixtures.successfulOutputFixture.engine,
    name: `PRIVATE_MARKER_${"X".repeat(100)}`,
  },
});
assert.equal(safeOutputFailure.success, false);
assert.ok(safeOutputFailure.errors.length > 0);
assert.ok(
  safeOutputFailure.errors.every(
    (error) => contract.LucySafeErrorSchema.safeParse(error).success,
  ),
);
assert.doesNotMatch(JSON.stringify(safeOutputFailure.errors), /PRIVATE_MARKER/);

console.log(
  `PW7404-1028 LUCY cycle contract: PASS (${cases.length} schema fixtures plus correlation and safety assertions)`,
);
