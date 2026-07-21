import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const checks = [];
const check = (condition, message) => {
  assert.ok(condition, message);
  checks.push(message);
};

const life = read("src/app/api/life/route.ts");
check(life.indexOf("configuredSecret") < life.indexOf("req.json()"), "life authenticates before parsing");
check(life.includes("if (!configuredSecret)"), "life fails closed without a secret");

const hermes = read("src/lib/hermes-auth.ts");
check(hermes.includes("timingSafeEqual"), "Hermes key comparison is timing safe");
check(hermes.includes("if (params.responseCode === 401) return"), "unauthorized Hermes calls do not write audit rows");
check(hermes.includes("redacted: true"), "Hermes request bodies are metadata-only");

for (const config of [
  "config/PW7404-1026-spacebot-production-nginx-20260711.conf",
  "config/PW7404-1071-spacebot-production-nginx-20260712.conf",
  "config/PW7404-1086-spacebot-production-nginx-20260712.conf",
]) {
  const source = read(config);
  const nextLocation = source.slice(source.indexOf("location / {"));
  check(nextLocation.includes('if ($http_upgrade != "") { return 426; }'), `${config} rejects upgrades`);
  check(!nextLocation.includes("proxy_set_header Upgrade $http_upgrade"), `${config} never forwards upgrades to Next`);
}

const visit = read("deepresearch-service/tools/dashscope_visit.py");
const parser = read("deepresearch-service/tools/dashscope_file_parser.py");
check(visit.includes("validate_public_http_url"), "DeepResearch validates each web destination");
check(visit.includes("trust_env=False"), "DeepResearch ignores ambient proxy configuration");
check(parser.includes("resolve_contained_file"), "DeepResearch file parsing is root-contained");

console.log(JSON.stringify({
  artifact: "PW7404-1136",
  status: "PASS_SOURCE_CONTRACT",
  assertions: checks.length,
  databaseContacted: false,
  productionContacted: false,
}));
