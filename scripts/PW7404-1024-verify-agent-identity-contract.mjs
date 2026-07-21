import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const inputPath = new URL(
  "../src/lib/security/agent-credential-input.ts",
  import.meta.url,
);
const source = fs.readFileSync(inputPath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(output, { module, exports: module.exports, Set });

const { extractAgentCredentialInput } = module.exports;
const botspace = `botspace_${"A".repeat(32)}`;
const machine = `sb_${"a".repeat(64)}`;
const headers = (values = {}) => ({
  get(name) {
    return values[name.toLowerCase()] ?? null;
  },
});

const cases = [
  [headers(), { status: "missing" }],
  [
    headers({ authorization: `Bearer ${botspace}` }),
    { status: "valid", credential: botspace, family: "botspace" },
  ],
  [
    headers({ authorization: botspace }),
    { status: "valid", credential: botspace, family: "botspace" },
  ],
  [
    headers({ "x-api-key": machine }),
    { status: "valid", credential: machine, family: "machine" },
  ],
  [
    headers({ "x-machine-key": botspace }),
    { status: "valid", credential: botspace, family: "botspace" },
  ],
  [
    headers({ authorization: `Bearer ${machine}` }),
    { status: "valid", credential: machine, family: "machine" },
  ],
  [
    headers({ authorization: `Bearer ${botspace}`, "x-api-key": botspace }),
    { status: "valid", credential: botspace, family: "botspace" },
  ],
  [
    headers({ authorization: `Bearer ${botspace}`, "x-machine-key": machine }),
    { status: "conflict" },
  ],
  [
    headers({ authorization: "Bearer not-a-spacebot-key" }),
    { status: "invalid" },
  ],
];

for (const [input, expected] of cases) {
  assert.equal(
    JSON.stringify(extractAgentCredentialInput(input)),
    JSON.stringify(expected),
  );
}

const authSource = fs.readFileSync(
  new URL("../src/lib/auth.ts", import.meta.url),
  "utf8",
);
const machineSource = fs.readFileSync(
  new URL("../src/lib/machine-auth.ts", import.meta.url),
  "utf8",
);
assert.match(authSource, /authenticateAgentCredential/);
assert.match(machineSource, /authenticateAgentCredential/);

console.log(
  `PW7404-1024 agent identity contract: PASS (${cases.length + 2} checks)`,
);
