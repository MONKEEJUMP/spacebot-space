import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ControllerIpcAuthError,
  IPC_HEADERS,
  IPC_MAX_CLOCK_SKEW_MS,
  IPC_PROTOCOL,
  IPC_SOCKET_PATH,
  createSignedControllerHeaders,
  createSignedControllerResponseHeaders,
  readPrivateSigningSecretFile,
  verifySignedControllerRequest,
  verifySignedControllerResponse,
} from "../resident-identity-controller/PW7404-1125-ipc-auth.mjs";

const ARTIFACT = "PW7404-1125";
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const secret = Buffer.alloc(32, 0x2a);
const body = JSON.stringify({ session_token: "A".repeat(43) });
const pathname = "/v1/sessions/touch";
const now = 1_784_000_000_000;
let assertionCount = 0;

function check(value, label) {
  assertionCount += 1;
  assert.ok(value, label);
}

function equal(actual, expected, label) {
  assertionCount += 1;
  assert.equal(actual, expected, label);
}

function expectAuthCode(callback, expectedCode, label) {
  assertionCount += 1;
  assert.throws(
    callback,
    (error) =>
      error instanceof ControllerIpcAuthError && error.code === expectedCode,
    label,
  );
}

function rawHeaders(headers) {
  return Object.entries(headers).flatMap(([name, value]) => [name, value]);
}

function createNonceConsumer() {
  const seen = new Set();
  return (nonce) => {
    if (seen.has(nonce)) return false;
    seen.add(nonce);
    return true;
  };
}

function signedHeaders(options = {}) {
  return createSignedControllerHeaders({
    secret,
    pathname,
    body,
    now,
    nonce: crypto.randomBytes(32).toString("base64url"),
    ...options,
  });
}

const positiveHeaders = signedHeaders();
const defaultNonceHeaders = createSignedControllerHeaders({
  secret,
  pathname,
  body,
  now,
});
equal(
  defaultNonceHeaders[IPC_HEADERS.nonce].length,
  43,
  "the production signer default must generate a 32-byte nonce",
);
check(
  createSignedControllerHeaders({
    secret,
    pathname: "/v1/system/preflight",
    body: "{}",
    now,
  })[IPC_HEADERS.signature]?.length === 43,
  "the signed startup handshake must be on the reviewed path allowlist",
);
const consumePositiveNonce = createNonceConsumer();
const receipt = verifySignedControllerRequest({
  secret,
  method: "POST",
  pathname,
  body,
  rawHeaders: rawHeaders(positiveHeaders),
  now,
  consumeNonce: consumePositiveNonce,
});
equal(receipt.timestamp, now, "signed timestamp must round trip");
equal(receipt.nonce.length, 43, "nonce must encode 32 bytes");
equal(
  receipt.contentSha256,
  crypto.createHash("sha256").update(body).digest("hex"),
  "body digest must bind the exact bytes",
);
equal(
  positiveHeaders[IPC_HEADERS.protocol],
  IPC_PROTOCOL,
  "protocol header must be pinned",
);

expectAuthCode(
  () =>
    verifySignedControllerRequest({
      secret,
      method: "POST",
      pathname,
      body,
      rawHeaders: rawHeaders(positiveHeaders),
      now,
      consumeNonce: consumePositiveNonce,
    }),
  "replayed_request",
  "a nonce must be single use",
);

const tamperHeaders = signedHeaders();
expectAuthCode(
  () =>
    verifySignedControllerRequest({
      secret,
      method: "POST",
      pathname,
      body: `${body} `,
      rawHeaders: rawHeaders(tamperHeaders),
      now,
      consumeNonce: createNonceConsumer(),
    }),
  "body_mismatch",
  "body tampering must fail before execution",
);

const wrongPathHeaders = signedHeaders();
expectAuthCode(
  () =>
    verifySignedControllerRequest({
      secret,
      method: "POST",
      pathname: "/v1/sessions/revoke",
      body,
      rawHeaders: rawHeaders(wrongPathHeaders),
      now,
      consumeNonce: createNonceConsumer(),
    }),
  "signature_mismatch",
  "a signature must not move between controller paths",
);

for (const requestTime of [
  now - IPC_MAX_CLOCK_SKEW_MS - 1,
  now + IPC_MAX_CLOCK_SKEW_MS + 1,
]) {
  const clockHeaders = signedHeaders({ now: requestTime });
  expectAuthCode(
    () =>
      verifySignedControllerRequest({
        secret,
        method: "POST",
        pathname,
        body,
        rawHeaders: rawHeaders(clockHeaders),
        now,
        consumeNonce: createNonceConsumer(),
      }),
    "stale_request",
    "requests outside the clock window must fail",
  );
}

const duplicateHeaders = rawHeaders(signedHeaders());
duplicateHeaders.push(IPC_HEADERS.signature, duplicateHeaders.at(-1));
expectAuthCode(
  () =>
    verifySignedControllerRequest({
      secret,
      method: "POST",
      pathname,
      body,
      rawHeaders: duplicateHeaders,
      now,
      consumeNonce: createNonceConsumer(),
    }),
  "invalid_headers",
  "duplicate authentication headers must fail",
);

const protocolHeaders = signedHeaders();
protocolHeaders[IPC_HEADERS.protocol] = "unreviewed-protocol";
expectAuthCode(
  () =>
    verifySignedControllerRequest({
      secret,
      method: "POST",
      pathname,
      body,
      rawHeaders: rawHeaders(protocolHeaders),
      now,
      consumeNonce: createNonceConsumer(),
    }),
  "invalid_headers",
  "protocol downgrade must fail",
);

expectAuthCode(
  () =>
    createSignedControllerHeaders({
      secret,
      pathname: "/v1/unreviewed",
      body,
      now,
    }),
  "invalid_request_target",
  "the signer must enforce the path allowlist",
);

const responseBody = JSON.stringify({
  success: true,
  result: { sessionId: "reviewed-session" },
});
const responseHeaders = createSignedControllerResponseHeaders({
  secret,
  pathname,
  requestNonce: receipt.nonce,
  statusCode: 200,
  body: responseBody,
});
const responseReceipt = verifySignedControllerResponse({
  secret,
  pathname,
  requestNonce: receipt.nonce,
  statusCode: 200,
  body: responseBody,
  rawHeaders: rawHeaders(responseHeaders),
});
equal(
  responseReceipt.contentSha256,
  crypto.createHash("sha256").update(responseBody).digest("hex"),
  "response signature must bind the exact response bytes",
);

for (const [change, expectedCode, label] of [
  [
    { body: `${responseBody} ` },
    "response_body_mismatch",
    "response body tampering must fail",
  ],
  [
    { pathname: "/v1/sessions/revoke" },
    "response_signature_mismatch",
    "response signatures must not move between paths",
  ],
  [
    { statusCode: 201 },
    "response_signature_mismatch",
    "response signatures must bind the status code",
  ],
  [
    { requestNonce: crypto.randomBytes(32).toString("base64url") },
    "response_signature_mismatch",
    "response signatures must bind the originating request nonce",
  ],
]) {
  expectAuthCode(
    () =>
      verifySignedControllerResponse({
        secret,
        pathname,
        requestNonce: receipt.nonce,
        statusCode: 200,
        body: responseBody,
        rawHeaders: rawHeaders(responseHeaders),
        ...change,
      }),
    expectedCode,
    label,
  );
}

const duplicateResponseHeaders = rawHeaders(responseHeaders);
duplicateResponseHeaders.push(
  IPC_HEADERS.responseSignature,
  duplicateResponseHeaders.at(-1),
);
expectAuthCode(
  () =>
    verifySignedControllerResponse({
      secret,
      pathname,
      requestNonce: receipt.nonce,
      statusCode: 200,
      body: responseBody,
      rawHeaders: duplicateResponseHeaders,
    }),
  "invalid_headers",
  "duplicate response authentication headers must fail",
);

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "pw7404-1125-"),
);
try {
  const secretPath = path.join(temporaryDirectory, "ipc.key");
  fs.writeFileSync(secretPath, `${secret.toString("base64url")}\n`, {
    mode: 0o600,
  });
  const loadedSecret = readPrivateSigningSecretFile(secretPath, "test_secret");
  check(loadedSecret.equals(secret), "private secret file must load exactly");
  expectAuthCode(
    () => readPrivateSigningSecretFile("relative.key", "test_secret"),
    "test_secret_path",
    "relative secret paths must fail",
  );
  fs.writeFileSync(secretPath, "not-a-secret\n", { mode: 0o600 });
  expectAuthCode(
    () => readPrivateSigningSecretFile(secretPath, "test_secret"),
    "test_secret_format",
    "non-canonical secret material must fail",
  );
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

const clientSource = fs.readFileSync(
  path.join(repoRoot, "src/lib/residency/resident-identity-controller.ts"),
  "utf8",
);
const controllerSource = fs.readFileSync(
  path.join(
    repoRoot,
    "resident-identity-controller/PW7404-1117-controller.mjs",
  ),
  "utf8",
);
const sharedEnvironment = fs.readFileSync(
  path.join(repoRoot, ".env.example"),
  "utf8",
);
const controllerEnvironment = fs.readFileSync(
  path.join(
    repoRoot,
    "config/PW7404-1125-resident-identity-controller.env.example",
  ),
  "utf8",
);
const serviceSource = fs.readFileSync(
  path.join(
    repoRoot,
    "config/PW7404-1117-spacebot-resident-identity-controller.service",
  ),
  "utf8",
);
const provisionerSource = fs.readFileSync(
  path.join(
    repoRoot,
    "scripts/PW7404-1117-provision-resident-identity-session-facades.mjs",
  ),
  "utf8",
);
const preflightSource = fs.readFileSync(
  path.join(
    repoRoot,
    "scripts/PW7404-1125-preflight-resident-identity-app.mjs",
  ),
  "utf8",
);
const launcherSource = fs.readFileSync(
  path.join(repoRoot, "start-spacebot.sh"),
  "utf8",
);
const sessionSource = fs.readFileSync(
  path.join(repoRoot, "src/lib/security/resident-session.ts"),
  "utf8",
);
const ecosystemSource = fs.readFileSync(
  path.join(repoRoot, "ecosystem.config.js"),
  "utf8",
);
const taskRouteSources = [
  "src/app/api/v1/tasks/route.ts",
  "src/app/api/v1/tasks/[id]/route.ts",
  "src/app/api/v1/tasks/[id]/events/route.ts",
].map((relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8"),
);

check(
  clientSource.includes('import "server-only"'),
  "client must stay server-only",
);
check(
  clientSource.includes("socketPath: controllerSocketPath()") &&
    clientSource.includes("verifySignedControllerResponse"),
  "client must use the guarded socket and authenticate controller responses",
);
check(
  /const requestBody = JSON\.stringify\(payload\)[\s\S]*body: requestBody[\s\S]*request\.end\(requestBody\)/.test(
    clientSource,
  ),
  "client must sign and send the same serialized body",
);
check(
  controllerSource.indexOf("verifySignedControllerRequest({") <
    controllerSource.indexOf('JSON.parse(rawBody.toString("utf8"))'),
  "controller authentication must precede JSON parsing",
);
check(
  clientSource.indexOf("verifySignedControllerResponse({") <
    clientSource.indexOf("JSON.parse(rawResponseBody.toString"),
  "response authentication must precede response parsing",
);
check(
  controllerSource.includes("createSignedControllerResponseHeaders") &&
    controllerSource.includes("request.rawHeaders"),
  "controller must sign responses and preserve duplicate-header evidence",
);
check(
  controllerSource.includes("MAX_REPLAY_NONCES"),
  "controller replay memory must be bounded",
);
check(
  sharedEnvironment.includes(
    `SPACEBOT_RESIDENT_IDENTITY_CONTROLLER_SOCKET_PATH=${IPC_SOCKET_PATH}`,
  ),
  "app environment must pin the reviewed Unix socket path",
);
check(
  sharedEnvironment.includes(
    "SPACEBOT_RESIDENT_IDENTITY_CONTROLLER_SIGNING_SECRET_FILE=",
  ),
  "app environment must accept only its IPC secret-file path",
);
for (const controllerOnlyVariable of [
  "SPACEBOT_IDENTITY_CONTROLLER_DATABASE_URL_FILE",
  "SPACEBOT_IDENTITY_CONTROLLER_DATABASE_PASSWORD",
  "SPACEBOT_APPLY_IDENTITY_CONTROLLER",
  "SPACEBOT_ADMIN_DATABASE_URL_FILE",
]) {
  check(
    !sharedEnvironment.includes(controllerOnlyVariable),
    `${controllerOnlyVariable} must not be in the shared app environment`,
  );
}
check(
  controllerEnvironment.includes(
    "SPACEBOT_IDENTITY_CONTROLLER_SIGNING_SECRET_FILE=",
  ),
  "controller environment must name its private IPC secret file",
);
check(
  serviceSource.includes("ReadOnlyPaths=/etc/spacebot"),
  "service must treat controller configuration as read-only",
);
check(
  serviceSource.includes("Group=spacebot-ipc") &&
    serviceSource.includes(
      "RuntimeDirectory=spacebot-resident-identity-controller",
    ) &&
    serviceSource.includes(
      "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
    ) &&
    serviceSource.includes("/usr/bin/node --jitless") &&
    controllerSource.includes("server.listen(IPC_SOCKET_PATH"),
  "service must use a Unix listener while retaining JIT-safe database egress",
);
check(
  controllerSource.includes("fs.constants.O_NOFOLLOW") &&
    controllerSource.includes("fs.fstatSync(descriptor)") &&
    controllerSource.includes('fs.readFileSync(descriptor, "utf8")'),
  "controller database files must resist symlink and path-swap races",
);
check(
  controllerSource.includes("async function verifyDatabaseIdentity()") &&
    controllerSource.includes("session_user AS session_user") &&
    controllerSource.includes("role.rolsuper AS superuser") &&
    controllerSource.includes("facade_execute_exact") &&
    controllerSource.includes("facade_grantees_exact") &&
    controllerSource.includes("identity_owner_isolated") &&
    controllerSource.includes("procedure.proconfig") &&
    controllerSource.includes("membership.roleid = role.oid") &&
    controllerSource.includes("protected_relations_exact") &&
    controllerSource.includes("protected_relation_owners_safe") &&
    controllerSource.includes("no_login_role_effective_writers") &&
    controllerSource.includes("'MAINTAIN'") &&
    controllerSource.includes("role_provenance") &&
    controllerSource.includes("relation_access_denied") &&
    controllerSource.includes(
      'expectedUser !== "spacebot_identity_controller"',
    ) &&
    controllerEnvironment.includes(
      "SPACEBOT_IDENTITY_CONTROLLER_EXPECTED_DATABASE_OID=",
    ) &&
    controllerSource.indexOf("\nawait verifyDatabaseIdentity();\n") >
      controllerSource.indexOf("const server = http.createServer") &&
    controllerSource.indexOf("\nawait verifyDatabaseIdentity();\n") <
      controllerSource.indexOf("server.listen(IPC_SOCKET_PATH"),
  "controller must prove its non-superuser database authority before listening",
);
check(
  !provisionerSource.includes('from "dotenv"') &&
    !provisionerSource.includes(".env.local") &&
    provisionerSource.includes("SPACEBOT_ADMIN_DATABASE_URL_FILE") &&
    provisionerSource.includes(
      "SPACEBOT_IDENTITY_CONTROLLER_DATABASE_PASSWORD_FILE",
    ),
  "provisioner must use one-shot private files, never shared dotenv",
);
check(
  preflightSource.includes("readPrivateSigningSecretFile") &&
    preflightSource.includes("isSocket()") &&
    preflightSource.includes("createSignedControllerHeaders") &&
    preflightSource.includes("verifySignedControllerResponse") &&
    launcherSource.indexOf("PW7404-1125-preflight-resident-identity-app.mjs") <
      launcherSource.indexOf('exec node "$STANDALONE_DIR/server.js"') &&
    ecosystemSource.includes('script: "./start-spacebot.sh"'),
  "PM2 must run a mutually authenticated preflight before serving",
);
check(
  sessionSource.includes(
    'error.status === 401 &&\n      error.code === "invalid_session"',
  ),
  "only a signed invalid-session result may invalidate a resident cookie",
);
check(
  taskRouteSources.every(
    (source) =>
      source.includes("Resident authentication is unavailable") &&
      /status: 503,\s*headers/.test(source),
  ),
  "every TaskSpace route must preserve CORS while failing controller outages as 503",
);

console.log(
  JSON.stringify({
    artifact: ARTIFACT,
    verdict: "PASS_LOCAL_CONTRACT",
    assertions: assertionCount,
    deploymentReady: false,
    requiredLiveReceipts: [
      "linux_node_jitless",
      "systemd_unit",
      "service_principals",
      "socket_acl",
      "signed_http",
      "outbound_database_network_policy",
      "launcher_fail_closed",
    ],
    production: false,
    database: false,
    gitMutated: false,
  }),
);
