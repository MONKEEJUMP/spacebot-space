import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const quarantineModule = "@/lib/experience/public-chat-quarantine";
const quarantineUtilityPath = path.join(
  repoRoot,
  "src/lib/experience/public-chat-quarantine.ts",
);

const routeFixtures = [
  {
    file: "src/lib/lucy/cycle-coordinator.ts",
    route: "chat",
    requiredSymbols: [
      "readPrivateMemories",
      "commitSuccessfulLucyCycle",
      "saveCanonicalUserMessage",
      "writePrivateMemory",
    ],
  },
  {
    file: "src/app/api/chat/stream/route.ts",
    route: "chat-stream",
    requiredSymbols: [
      "fireAndForgetMemoryWrite",
      "loadCanonicalChatHistory",
      "readMemoriesIfEnabled",
      "saveAssistantMessage",
      "saveUserMessage",
    ],
  },
];

const bannedExperienceModules = new Set([
  "@/lib/experience/context",
  "@/lib/experience/evaluator",
  "@/lib/experience/reme-experience",
  "@/lib/experience/schema",
]);
const bannedExperienceCalls = new Set([
  "buildExperienceContext",
  "checkDuplicate",
  "checkExperienceDuplicate",
  "evaluateConversation",
  "fireAndForgetExperienceEval",
  "readExperiences",
  "readExperiencesIfEnabled",
  "writeExperience",
]);
const safeQuarantineLogKeys = [
  "mode",
  "phase",
  "route",
  "sharedReadEnabled",
  "sharedWriteEnabled",
];

function parseTypeScript(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  return {
    source,
    sourceFile: ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  };
}

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function getCallName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function getPropertyName(property) {
  if (!property.name) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }
  return null;
}

function verifyRouteSource(fixture) {
  const absolutePath = path.join(repoRoot, fixture.file);
  const { source, sourceFile } = parseTypeScript(absolutePath);
  const imports = [];
  const calls = [];
  const quarantineLogs = [];

  visit(sourceFile, (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }

    if (!ts.isCallExpression(node)) return;
    const callName = getCallName(node.expression);
    if (callName) calls.push({ callName, node });

    if (
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "logger" &&
      node.expression.name.text === "info" &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text ===
        "Public chat shared experience quarantine enforced"
    ) {
      quarantineLogs.push(node);
    }
  });

  assert.ok(
    imports.includes(quarantineModule),
    `${fixture.file} imports the quarantine boundary`,
  );
  for (const moduleName of imports) {
    assert.ok(
      !bannedExperienceModules.has(moduleName),
      `${fixture.file} must not import ${moduleName}`,
    );
    if (moduleName.startsWith("@/lib/experience/")) {
      assert.equal(
        moduleName,
        quarantineModule,
        `${fixture.file} has no direct shared experience dependency`,
      );
    }
  }

  for (const { callName } of calls) {
    assert.ok(
      !bannedExperienceCalls.has(callName),
      `${fixture.file} must not call ${callName}`,
    );
  }

  const establishCalls = calls.filter(
    ({ callName }) => callName === "establishPublicChatExperienceQuarantine",
  );
  assert.equal(
    establishCalls.length,
    1,
    `${fixture.file} establishes exactly one quarantine boundary`,
  );
  assert.ok(
    ts.isStringLiteral(establishCalls[0].node.arguments[0]) &&
      establishCalls[0].node.arguments[0].text === fixture.route,
    `${fixture.file} uses its fixed route fixture`,
  );
  assert.equal(
    calls.filter(
      ({ callName }) => callName === "buildPromptWithinExperienceQuarantine",
    ).length,
    1,
    `${fixture.file} builds its public prompt through the quarantine`,
  );

  assert.equal(
    quarantineLogs.length,
    1,
    `${fixture.file} emits one safe quarantine metadata log`,
  );
  const metadata = quarantineLogs[0].arguments[1];
  assert.ok(
    metadata && ts.isObjectLiteralExpression(metadata),
    `${fixture.file} quarantine log has explicit metadata`,
  );
  const logKeys = metadata.properties
    .map(getPropertyName)
    .filter((name) => name !== null)
    .sort();
  assert.deepEqual(
    logKeys,
    [...safeQuarantineLogKeys].sort(),
    `${fixture.file} quarantine log contains safe metadata only`,
  );

  for (const symbol of fixture.requiredSymbols) {
    assert.match(
      source,
      new RegExp(`\\b${symbol}\\b`),
      `${fixture.file} preserves ${symbol}`,
    );
  }
}

function loadQuarantineUtility() {
  const source = fs.readFileSync(quarantineUtilityPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: quarantineUtilityPath,
  }).outputText;
  const loadedModule = { exports: {} };

  vm.runInNewContext(output, {
    exports: loadedModule.exports,
    module: loadedModule,
    require,
  });
  return { exports: loadedModule.exports, source };
}

for (const fixture of routeFixtures) {
  verifyRouteSource(fixture);
}

const publicJsonRoute = fs.readFileSync(
  path.join(repoRoot, "src/app/api/chat/route.ts"),
  "utf8",
);
assert.match(
  publicJsonRoute,
  /from ['"]@\/lib\/lucy\/cycle-coordinator['"]/,
  "public JSON chat delegates to the quarantined coordinator",
);
assert.doesNotMatch(
  publicJsonRoute,
  /from ['"]@\/lib\/experience\//,
  "public JSON adapter has no direct experience dependency",
);

const utility = loadQuarantineUtility();
assert.doesNotMatch(
  utility.source,
  /process\s*\.\s*env/,
  "quarantine has no environment opt-out",
);
assert.doesNotMatch(
  utility.source,
  /reme-experience|evaluateConversation|buildExperienceContext/,
  "quarantine has no shared experience implementation dependency",
);

for (const fixture of routeFixtures) {
  const boundary = utility.exports.establishPublicChatExperienceQuarantine(
    fixture.route,
  );
  const normalizedBoundary = JSON.parse(JSON.stringify(boundary));
  assert.deepEqual(normalizedBoundary, {
    route: fixture.route,
    mode: "quarantined",
    promptContext: "",
    sharedReadEnabled: false,
    sharedWriteEnabled: false,
  });
  assert.equal(
    Object.isFrozen(boundary),
    true,
    `${fixture.route} boundary is frozen`,
  );

  const privateMarker = `PRIVATE_${fixture.route}_MESSAGE_RESPONSE_SUMMARY`;
  assert.equal(
    utility.exports.buildPromptWithinExperienceQuarantine(
      boundary,
      privateMarker,
    ),
    privateMarker,
    `${fixture.route} fixture receives no shared experience prompt context`,
  );
}

assert.throws(
  () =>
    utility.exports.buildPromptWithinExperienceQuarantine(
      {
        route: "chat",
        mode: "quarantined",
        promptContext: "SHARED_EXPERIENCE",
        sharedReadEnabled: true,
        sharedWriteEnabled: false,
      },
      "PRIVATE_MESSAGE",
    ),
  /quarantine invariant failed/,
  "tampered boundary fails closed",
);

console.log(
  `PW7404-1029 experience privacy boundary: PASS (${routeFixtures.length} routes + fixtures)`,
);
