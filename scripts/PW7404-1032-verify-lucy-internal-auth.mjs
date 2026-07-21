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
    AbortController,
    Buffer,
    Headers,
    Request,
    Response,
    URL,
    console,
    exports: loadedModule.exports,
    fetch,
    module: loadedModule,
    process,
    require: localRequire,
    setTimeout,
    clearTimeout,
  });
  return loadedModule.exports;
}

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const signing = loadTypeScriptModule(
  path.join(repoRoot, "src/lib/security/internal-request-signing.ts"),
);
const replay = loadTypeScriptModule(
  path.join(repoRoot, "src/lib/security/internal-replay-store.ts"),
);
const client = loadTypeScriptModule(
  path.join(repoRoot, "src/lib/lucy/internal-cycle-client.ts"),
);

const secret = Buffer.alloc(32, 0x5a).toString("base64url");
const wrongSecret = Buffer.alloc(32, 0xa5).toString("base64url");
const now = 1_784_000_000;
const nonce = Buffer.from("0123456789abcdef", "ascii").toString("base64url");
const body = JSON.stringify({ cycle: "deterministic", sequence: 1032 });
const headerNames = signing.INTERNAL_REQUEST_HEADER_NAMES;

function signedHeaders(overrides = {}) {
  return signing.signLucyInternalRequest(body, {
    secret,
    timestampUnixSeconds: now,
    nonce,
    ...overrides,
  });
}

function newStore(maxEntries) {
  return new replay.ProcessLocalInternalReplayStore(
    maxEntries === undefined ? {} : { maxEntries },
  );
}

async function verify(overrides = {}) {
  return signing.verifyLucyInternalRequest({
    method: signing.LUCY_INTERNAL_CYCLE_METHOD,
    path: signing.LUCY_INTERNAL_CYCLE_PATH,
    body,
    headers: signedHeaders(),
    replayStore: newStore(),
    secret,
    nowUnixSeconds: now,
    ...overrides,
  });
}

function changedBase64Url(value) {
  const last = value.at(-1);
  return `${value.slice(0, -1)}${last === "A" ? "B" : "A"}`;
}

let checks = 0;
function checkResult(result, expected, label) {
  assert.equal(result.ok, expected === "ok", label);
  if (expected !== "ok") assert.equal(result.code, expected, label);
  checks += 1;
}

const digest = signing.sha256InternalRequestBody(body);
assert.equal(
  signing.buildLucyInternalCanonicalString({
    timestamp: String(now),
    nonce,
    contentSha256: digest,
  }),
  `spacebot-internal-v1\nPOST\n/api/internal/lucy/v1/cycles\n${now}\n${nonce}\n${digest}`,
);
checks += 1;

checkResult(await verify(), "ok", "valid signed request");

const tamperedSignatureHeaders = signedHeaders();
tamperedSignatureHeaders[headerNames.signature] = changedBase64Url(
  tamperedSignatureHeaders[headerNames.signature],
);
checkResult(
  await verify({ headers: tamperedSignatureHeaders }),
  "signature_mismatch",
  "tampered signature",
);

checkResult(
  await verify({
    headers: signedHeaders({ timestampUnixSeconds: now - 61 }),
  }),
  "stale_timestamp",
  "stale timestamp",
);
checkResult(
  await verify({
    headers: signedHeaders({ timestampUnixSeconds: now + 61 }),
  }),
  "future_timestamp",
  "future timestamp",
);

for (const [name, key, value, expected] of [
  ["timestamp", headerNames.timestamp, "01784000000", "malformed_timestamp"],
  ["nonce", headerNames.nonce, "not-a-22-char-nonce!!!", "malformed_nonce"],
  [
    "digest",
    headerNames.contentSha256,
    digest.toUpperCase(),
    "malformed_content_sha256",
  ],
  ["signature", headerNames.signature, "not_base64url", "malformed_signature"],
]) {
  const headers = signedHeaders();
  headers[key] = value;
  checkResult(await verify({ headers }), expected, `malformed ${name}`);
}

const replayHeaders = signedHeaders();
const replayStore = newStore();
checkResult(
  await verify({ headers: replayHeaders, replayStore }),
  "ok",
  "first nonce consumption",
);
checkResult(
  await verify({ headers: replayHeaders, replayStore }),
  "replayed_nonce",
  "replayed nonce",
);

checkResult(await verify({ method: "GET" }), "invalid_method", "wrong method");
checkResult(
  await verify({ path: "/api/internal/lucy/v1/other" }),
  "invalid_path",
  "wrong path",
);
checkResult(
  await verify({ body: `${body}tampered` }),
  "body_digest_mismatch",
  "wrong body",
);
checkResult(
  await verify({ secret: wrongSecret }),
  "signature_mismatch",
  "wrong valid secret",
);
checkResult(
  await verify({ secret: "not-a-32-byte-secret" }),
  "invalid_secret",
  "malformed secret",
);

const priorSecret = process.env.LUCY_INTERNAL_SIGNING_SECRET;
delete process.env.LUCY_INTERNAL_SIGNING_SECRET;
try {
  assert.throws(
    () =>
      signing.signLucyInternalRequest(body, {
        timestampUnixSeconds: now,
        nonce,
      }),
    /LUCY_INTERNAL_SIGNING_SECRET is required/,
  );
  checks += 1;
} finally {
  if (priorSecret === undefined)
    delete process.env.LUCY_INTERNAL_SIGNING_SECRET;
  else process.env.LUCY_INTERNAL_SIGNING_SECRET = priorSecret;
}

const maximumBody = "x".repeat(signing.INTERNAL_REQUEST_MAX_BODY_BYTES);
assert.doesNotThrow(() =>
  signing.signLucyInternalRequest(maximumBody, {
    secret,
    timestampUnixSeconds: now,
    nonce,
  }),
);
assert.throws(
  () =>
    signing.signLucyInternalRequest(`${maximumBody}x`, {
      secret,
      timestampUnixSeconds: now,
      nonce,
    }),
  /128 KiB/,
);
checkResult(
  await verify({ body: `${maximumBody}x` }),
  "body_too_large",
  "oversize verifier body",
);
checks += 2;

const capacityStore = newStore(1);
const firstCapacityResult = await capacityStore.consume({
  nonce: "first",
  expiresAtUnixSeconds: now + 61,
  nowUnixSeconds: now,
});
assert.equal(firstCapacityResult.consumed, true);
const fullCapacityResult = await capacityStore.consume({
  nonce: "second",
  expiresAtUnixSeconds: now + 61,
  nowUnixSeconds: now,
});
assert.equal(fullCapacityResult.consumed, false);
assert.equal(fullCapacityResult.reason, "capacity");
checks += 2;

let capturedUrl;
let capturedInit;
const response = await client.requestLucyInternalCycle(
  { cycle: "client-header-proof" },
  {
    baseUrl: "https://user.example/internal/prefix?ignored=yes",
    trustedOrigin: "https://user.example",
    fetchImplementation: async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    signingSecret: secret,
    timestampUnixSeconds: now,
    nonce,
  },
);
assert.equal(response.status, 200);
assert.equal(
  capturedUrl.toString(),
  "https://user.example/api/internal/lucy/v1/cycles",
);
assert.equal(capturedInit.method, "POST");
assert.equal(capturedInit.credentials, "omit");
assert.equal(capturedInit.redirect, "error");
assert.equal(capturedInit.cache, "no-store");
const clientHeaders = Object.fromEntries(capturedInit.headers.entries());
assert.deepEqual(Object.keys(clientHeaders).sort(), [
  "accept",
  "content-type",
  "x-spacebot-content-sha256",
  "x-spacebot-nonce",
  "x-spacebot-signature",
  "x-spacebot-timestamp",
]);
assert.equal(clientHeaders.authorization, undefined);
assert.equal(clientHeaders.cookie, undefined);
checks += 9;

console.log(`PW7404-1032 LUCY internal auth: PASS (${checks} checks)`);
