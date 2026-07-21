import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const IPC_PROTOCOL = "spacebot-resident-identity-ipc-v1";
export const IPC_MAX_CLOCK_SKEW_MS = 60_000;
export const IPC_SOCKET_PATH =
  "/run/spacebot-resident-identity-controller/controller.sock";
export const IPC_HEADERS = Object.freeze({
  protocol: "x-spacebot-ipc-protocol",
  timestamp: "x-spacebot-ipc-timestamp",
  nonce: "x-spacebot-ipc-nonce",
  contentSha256: "x-spacebot-ipc-content-sha256",
  signature: "x-spacebot-ipc-signature",
  responseContentSha256: "x-spacebot-ipc-response-content-sha256",
  responseSignature: "x-spacebot-ipc-response-signature",
});
export const IPC_ALLOWED_PATHS = Object.freeze([
  "/v1/system/preflight",
  "/v1/residents/register",
  "/v1/sessions/open",
  "/v1/sessions/touch",
  "/v1/sessions/rotate",
  "/v1/sessions/revoke",
]);

const ALLOWED_PATHS = new Set(IPC_ALLOWED_PATHS);
const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const EPOCH_MILLISECONDS = /^\d{13}$/;

export class ControllerIpcAuthError extends Error {
  constructor(readonlyCode) {
    super(`Resident identity IPC authentication failed: ${readonlyCode}`);
    this.name = "ControllerIpcAuthError";
    this.code = readonlyCode;
  }
}

function fail(code) {
  throw new ControllerIpcAuthError(code);
}

function asBodyBuffer(body) {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  return fail("invalid_body");
}

function assertSecret(secret) {
  if (!Buffer.isBuffer(secret) || secret.byteLength !== 32) {
    fail("invalid_secret");
  }
}

function assertRequestShape(method, pathname) {
  if (method !== "POST" || !ALLOWED_PATHS.has(pathname)) {
    fail("invalid_request_target");
  }
}

function sha256(body) {
  return crypto.createHash("sha256").update(body).digest("hex");
}

function canonicalRequest({
  method,
  pathname,
  timestamp,
  nonce,
  contentSha256,
}) {
  return [IPC_PROTOCOL, method, pathname, timestamp, nonce, contentSha256].join(
    "\n",
  );
}

function canonicalResponse({
  pathname,
  requestNonce,
  statusCode,
  contentSha256,
}) {
  return [
    IPC_PROTOCOL,
    "RESPONSE",
    pathname,
    requestNonce,
    String(statusCode),
    contentSha256,
  ].join("\n");
}

function sign(secret, canonical) {
  return crypto
    .createHmac("sha256", secret)
    .update(canonical, "utf8")
    .digest("base64url");
}

function timingSafeTextEqual(left, right, encoding) {
  try {
    const leftBytes = Buffer.from(left, encoding);
    const rightBytes = Buffer.from(right, encoding);
    return (
      leftBytes.byteLength === rightBytes.byteLength &&
      crypto.timingSafeEqual(leftBytes, rightBytes)
    );
  } catch {
    return false;
  }
}

function readSingleRawHeader(rawHeaders, headerName) {
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) {
    return fail("invalid_headers");
  }
  const values = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (String(rawHeaders[index]).toLowerCase() === headerName) {
      values.push(String(rawHeaders[index + 1]));
    }
  }
  if (values.length !== 1) return fail("invalid_headers");
  return values[0];
}

export function readPrivateSigningSecretFile(
  filePath,
  label = "signing secret",
) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    return fail(`${label}_path`);
  }

  let descriptor;
  try {
    const before = fs.lstatSync(filePath);
    if (before.isSymbolicLink() || !before.isFile() || before.size > 128) {
      return fail(`${label}_type`);
    }
    if (process.platform !== "win32" && (before.mode & 0o077) !== 0) {
      return fail(`${label}_mode`);
    }

    let flags = fs.constants.O_RDONLY;
    if (process.platform !== "win32" && fs.constants.O_NOFOLLOW) {
      flags |= fs.constants.O_NOFOLLOW;
    }
    descriptor = fs.openSync(filePath, flags);
    const after = fs.fstatSync(descriptor);
    if (
      !after.isFile() ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size
    ) {
      return fail(`${label}_changed`);
    }

    const raw = fs.readFileSync(descriptor, "utf8");
    const encoded = raw.endsWith("\r\n")
      ? raw.slice(0, -2)
      : raw.endsWith("\n")
      ? raw.slice(0, -1)
      : raw;
    if (!BASE64URL_32_BYTES.test(encoded)) {
      return fail(`${label}_format`);
    }
    const secret = Buffer.from(encoded, "base64url");
    if (secret.byteLength !== 32 || secret.toString("base64url") !== encoded) {
      return fail(`${label}_format`);
    }
    return secret;
  } catch (error) {
    if (error instanceof ControllerIpcAuthError) throw error;
    return fail(`${label}_unavailable`);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

export function createSignedControllerHeaders({
  secret,
  method = "POST",
  pathname,
  body,
  now = Date.now(),
  nonce = crypto.randomBytes(32).toString("base64url"),
}) {
  assertSecret(secret);
  assertRequestShape(method, pathname);
  if (!Number.isSafeInteger(now) || now < 1_000_000_000_000) {
    return fail("invalid_timestamp");
  }
  if (!BASE64URL_32_BYTES.test(nonce)) return fail("invalid_nonce");

  const timestamp = String(now);
  const contentSha256 = sha256(asBodyBuffer(body));
  const signature = sign(
    secret,
    canonicalRequest({ method, pathname, timestamp, nonce, contentSha256 }),
  );
  return {
    [IPC_HEADERS.protocol]: IPC_PROTOCOL,
    [IPC_HEADERS.timestamp]: timestamp,
    [IPC_HEADERS.nonce]: nonce,
    [IPC_HEADERS.contentSha256]: contentSha256,
    [IPC_HEADERS.signature]: signature,
  };
}

export function verifySignedControllerRequest({
  secret,
  method,
  pathname,
  body,
  rawHeaders,
  now = Date.now(),
  consumeNonce,
}) {
  assertSecret(secret);
  assertRequestShape(method, pathname);
  if (!Number.isSafeInteger(now)) return fail("invalid_clock");

  const protocol = readSingleRawHeader(rawHeaders, IPC_HEADERS.protocol);
  const timestamp = readSingleRawHeader(rawHeaders, IPC_HEADERS.timestamp);
  const nonce = readSingleRawHeader(rawHeaders, IPC_HEADERS.nonce);
  const contentSha256 = readSingleRawHeader(
    rawHeaders,
    IPC_HEADERS.contentSha256,
  );
  const signature = readSingleRawHeader(rawHeaders, IPC_HEADERS.signature);
  if (
    protocol !== IPC_PROTOCOL ||
    !EPOCH_MILLISECONDS.test(timestamp) ||
    !BASE64URL_32_BYTES.test(nonce) ||
    !HEX_SHA256.test(contentSha256) ||
    !BASE64URL_32_BYTES.test(signature)
  ) {
    return fail("invalid_headers");
  }

  const requestTime = Number(timestamp);
  if (
    !Number.isSafeInteger(requestTime) ||
    Math.abs(now - requestTime) > IPC_MAX_CLOCK_SKEW_MS
  ) {
    return fail("stale_request");
  }

  const actualContentSha256 = sha256(asBodyBuffer(body));
  if (!timingSafeTextEqual(contentSha256, actualContentSha256, "hex")) {
    return fail("body_mismatch");
  }
  const expectedSignature = sign(
    secret,
    canonicalRequest({ method, pathname, timestamp, nonce, contentSha256 }),
  );
  if (!timingSafeTextEqual(signature, expectedSignature, "base64url")) {
    return fail("signature_mismatch");
  }
  if (
    typeof consumeNonce !== "function" ||
    consumeNonce(nonce, requestTime + IPC_MAX_CLOCK_SKEW_MS, now) !== true
  ) {
    return fail("replayed_request");
  }

  return Object.freeze({ timestamp: requestTime, nonce, contentSha256 });
}

export function createSignedControllerResponseHeaders({
  secret,
  pathname,
  requestNonce,
  statusCode,
  body,
}) {
  assertSecret(secret);
  assertRequestShape("POST", pathname);
  if (!BASE64URL_32_BYTES.test(requestNonce)) return fail("invalid_nonce");
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
    return fail("invalid_status");
  }

  const contentSha256 = sha256(asBodyBuffer(body));
  const signature = sign(
    secret,
    canonicalResponse({ pathname, requestNonce, statusCode, contentSha256 }),
  );
  return {
    [IPC_HEADERS.protocol]: IPC_PROTOCOL,
    [IPC_HEADERS.responseContentSha256]: contentSha256,
    [IPC_HEADERS.responseSignature]: signature,
  };
}

export function verifySignedControllerResponse({
  secret,
  pathname,
  requestNonce,
  statusCode,
  body,
  rawHeaders,
}) {
  assertSecret(secret);
  assertRequestShape("POST", pathname);
  if (!BASE64URL_32_BYTES.test(requestNonce)) return fail("invalid_nonce");
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
    return fail("invalid_status");
  }

  const protocol = readSingleRawHeader(rawHeaders, IPC_HEADERS.protocol);
  const contentSha256 = readSingleRawHeader(
    rawHeaders,
    IPC_HEADERS.responseContentSha256,
  );
  const signature = readSingleRawHeader(
    rawHeaders,
    IPC_HEADERS.responseSignature,
  );
  if (
    protocol !== IPC_PROTOCOL ||
    !HEX_SHA256.test(contentSha256) ||
    !BASE64URL_32_BYTES.test(signature)
  ) {
    return fail("invalid_response_headers");
  }

  const actualContentSha256 = sha256(asBodyBuffer(body));
  if (!timingSafeTextEqual(contentSha256, actualContentSha256, "hex")) {
    return fail("response_body_mismatch");
  }
  const expectedSignature = sign(
    secret,
    canonicalResponse({ pathname, requestNonce, statusCode, contentSha256 }),
  );
  if (!timingSafeTextEqual(signature, expectedSignature, "base64url")) {
    return fail("response_signature_mismatch");
  }

  return Object.freeze({ contentSha256 });
}
