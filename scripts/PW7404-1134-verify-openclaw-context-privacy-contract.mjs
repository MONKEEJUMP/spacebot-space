import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(
  path.join(root, "src/app/api/v1/openclaw/context/route.ts"),
  "utf8",
);

const assertions = [
  () => assert.match(route, /isPublicResidentId\(botProfiles\.agentId\)/u),
  () => assert.match(route, /\.from\(agents\)\s*\.where\(isPublicResident\(\)\)/u),
  () => assert.ok((route.match(/isPublicResident\(\)/gu) ?? []).length >= 2),
  () => assert.match(route, /eq\(botActivity\.activityType, "creation"\)[\s\S]*isPublicResident\(\)/u),
];

for (const verify of assertions) verify();

console.log(JSON.stringify({
  artifact: "PW7404-1134",
  status: "PASS_SOURCE_CONTRACT",
  assertions: assertions.length,
  databaseContacted: false,
  productionContacted: false,
}));
