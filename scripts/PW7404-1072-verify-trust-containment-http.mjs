import assert from "node:assert/strict";

const baseUrl = (process.env.BASE_URL || process.argv[2] || "").replace(/\/+$/, "");
const confirmation = process.env.PW7404_TRUST_CONTAINMENT_PROBE;
const expectNginxDeny = process.env.PW7404_EXPECT_NGINX_DENY === "true";

assert.ok(baseUrl, "BASE_URL or the first argument is required");
assert.equal(
  confirmation,
  "I_UNDERSTAND_POSTS_ARE_EXPECTED_TO_BE_SIDE_EFFECT_FREE",
  "Set PW7404_TRUST_CONTAINMENT_PROBE to the documented confirmation value",
);

let checks = 0;

function receipt(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

async function request(path, init) {
  return fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    ...init,
  });
}

const avatarPaths = [
  "/api/v1/avatar/generate",
  "/api/v1/avatar/set-from-gallery",
  "/api/v1/avatar/save-to-gallery",
  "/api/v1/avatar/delete-from-gallery",
];

const methods = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"];

for (const path of avatarPaths) {
  for (const method of methods) {
    const canHaveBody = !["GET", "HEAD"].includes(method);
    const response = await request(path, {
      method,
      headers: canHaveBody ? { "Content-Type": "application/json" } : undefined,
      body: canHaveBody
        ? JSON.stringify({
            username: "pw7404-forged-target",
            humhubUserId: 1,
            filename: "1.png",
          })
        : undefined,
    });
    receipt(response.status === 404, `${method} ${path} must return 404`);
    receipt(
      (response.headers.get("cache-control") || "").includes("no-store"),
      `${method} ${path} must return no-store`,
    );
    if (method !== "HEAD") {
      const body = await response.json();
      receipt(body?.success === false, `${method} ${path} must return success=false`);
      receipt(body?.error === "Not found", `${method} ${path} must not disclose legacy internals`);
    }
  }
}

for (const path of ["/api/agentscope", "/api/agentscope/", "/api/agentscope/run/stream"]) {
  const response = await request(path, { method: "GET" });
  const safeCandidateNormalization = path === "/api/agentscope/" && response.status === 308;
  receipt(
    response.status === 404 || (!expectNginxDeny && safeCandidateNormalization),
    `${path} must return ${expectNginxDeny ? "404" : "404 or safe local 308"}`,
  );
  if (safeCandidateNormalization) {
    const location = response.headers.get("location") || "";
    receipt(location === "/api/agentscope", `${path} must normalize only to the denied exact path`);
  }
  const body = await response.text();
  receipt(!/502 Bad Gateway|127\.0\.0\.1:8090/i.test(body), `${path} must not expose proxy topology`);
}

const homepage = await request("/", { method: "GET" });
receipt(homepage.status === 200, "homepage must remain healthy");

const health = await request("/api/health", { method: "GET" });
receipt(health.status === 200, "health endpoint must remain healthy");
const healthBody = await health.json();
receipt(healthBody?.status === "ok", "health response must remain ok");

console.log(`PW7404-1072 trust containment HTTP: PASS (${checks} checks; ${baseUrl})`);
