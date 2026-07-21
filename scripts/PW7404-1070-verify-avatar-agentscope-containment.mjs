import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;

function source(path) {
  return readFileSync(path, "utf8");
}

function receipt(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

const routePaths = [
  "src/app/api/v1/avatar/generate/route.ts",
  "src/app/api/v1/avatar/set-from-gallery/route.ts",
  "src/app/api/v1/avatar/save-to-gallery/route.ts",
  "src/app/api/v1/avatar/delete-from-gallery/route.ts",
];

const forbiddenRouteMarkers = [
  "request.json",
  "renderAvatar",
  "pushToHumHub",
  "resolveUser",
  "getPool",
  "HUMHUB_",
  "humhubUserId",
  "username",
  "copyFile",
  "unlink",
  "chown",
];

for (const path of routePaths) {
  const route = source(path);
  receipt(
    route.includes('import { retiredAvatarMutationResponse } from "../legacy-mutation-retired";'),
    `${path} must use the shared retired response`,
  );
  receipt(
    route.includes("return retiredAvatarMutationResponse();"),
    `${path} must fail closed before processing input`,
  );
  for (const method of ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]) {
    receipt(route.includes(`retiredHandler as ${method}`), `${path} must retire ${method}`);
  }
  for (const marker of forbiddenRouteMarkers) {
    receipt(!route.includes(marker), `${path} must not retain ${marker}`);
  }
}

const helper = source("src/app/api/v1/avatar/legacy-mutation-retired.ts");
receipt(helper.includes("status: 404"), "retired mutations must return 404");
receipt(helper.includes('error: "Not found"'), "retired mutations must not disclose internals");
receipt(helper.includes('"Cache-Control": "private, no-store, max-age=0"'), "retired responses must not be cached");

const avatarBuilder = source("src/app/(spacebot)/peoplespace/build-avatar/page.tsx");
for (const legacyPath of [
  "/api/v1/avatar/generate",
  "/api/v1/avatar/set-from-gallery",
  "/api/v1/avatar/save-to-gallery",
  "/api/v1/avatar/delete-from-gallery",
]) {
  receipt(!avatarBuilder.includes(legacyPath), `current avatar builder must not call ${legacyPath}`);
}
receipt(
  avatarBuilder.includes("/api/v1/humans/avatar") || avatarBuilder.includes("/api/v1/humans/profile"),
  "current avatar builder must retain the authenticated human avatar flow",
);

const nginx = source("config/PW7404-1071-spacebot-production-nginx-20260712.conf");
receipt(nginx.includes("location = /api/agentscope { return 404; }"), "exact AgentScope path must be denied");
receipt(nginx.includes("location ^~ /api/agentscope/ { return 404; }"), "AgentScope subtree must be denied");
receipt(!nginx.includes("proxy_pass http://127.0.0.1:8090"), "Nginx must not publicly proxy AgentScope");

const agentScopeClient = source("src/lib/agentscope/client.ts");
receipt(agentScopeClient.includes('const DEFAULT_URL = "http://127.0.0.1:8090"'), "internal AgentScope client must remain loopback-only");
receipt(!agentScopeClient.includes("/api/agentscope"), "internal AgentScope client must not depend on the public path");

const supervisor = source("config/PW7404-1027-spacebot-runtime-supervisor-v0-20260711.json");
const supervisorManifest = JSON.parse(supervisor);
const agentScopeService = supervisorManifest.services.find((service) => service.id === "agentscope");
receipt(agentScopeService?.boundary?.bind_scope === "loopback", "AgentScope must bind to loopback");
receipt(agentScopeService?.boundary?.exposure === "private", "AgentScope must be private");
receipt(agentScopeService?.boundary?.auth?.mechanism === "loopback_only", "AgentScope must use the loopback boundary");

console.log(`PW7404-1070 avatar/AgentScope containment: PASS (${checks} checks)`);
