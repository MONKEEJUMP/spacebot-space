import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifact = "PW7404-1132";
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function source(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const publicProfile = source(
  "src/app/api/v1/humans/profile/[name]/route.ts",
);
const buddyProfile = source("src/app/api/v1/buddy/profile/route.ts");

assert.ok(
  publicProfile.includes(
    "sql`${botActivity.metadata} ->> 'user_id' = ${human.id}`",
  ),
  "public profile wall posts are scoped to the requested human",
);
assert.ok(
  buddyProfile.includes(
    "sql`${botActivity.metadata} ->> 'user_id' = ${buddy.user_id}`",
  ),
  "Buddy profile wall posts are scoped to the authenticated token owner",
);
assert.doesNotMatch(
  publicProfile,
  /metadata:\s*botActivity\.metadata/,
  "public profile does not select private wall metadata",
);
assert.doesNotMatch(
  publicProfile,
  /metadata:\s*p\.metadata/,
  "public profile does not return private wall metadata",
);

console.log(
  JSON.stringify({
    artifact,
    status: "PASS_SOURCE_CONTRACT",
    assertions: 4,
    databaseContacted: false,
    productionContacted: false,
  }),
);
