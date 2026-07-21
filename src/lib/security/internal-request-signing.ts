import crypto from "node:crypto";

import type { InternalReplayStore } from "./internal-replay-store";

export const INTERNAL_REQUEST_PROTOCOL = "spacebot-internal-v1" as const;
export const LUCY_INTERNAL_CYCLE_METHOD = "POST" as const;
export const LUCY_INTERNAL_CYCLE_PATH = "/api/internal/lucy/v1/cycles" as const;
export const LUCY_INTERNAL_AUTONOMY_STATE_PATH =
  "/api/internal/lucy/v1/autonomy/state" as const;
export const LUCY_INTERNAL_AUTONOMY_ACTIONS_PATH =
  "/api/internal/lucy/v1/autonomy/actions" as const;
export type LucyInternalRequestPath =
  | typeof LUCY_INTERNAL_CYCLE_PATH
  | typeof LUCY_INTERNAL_AUTONOMY_STATE_PATH
  | typeof LUCY_INTERNAL_AUTONOMY_ACTIONS_PATH;
export const INTERNAL_REQUEST_MAX_BODY_BYTES = 128 * 1024;
export const INTERNAL_REQUEST_CLOCK_SKEW_SECONDS = 60;

export const INTERNAL_REQUEST_HEADER_NAMES = {
  timestamp: "X-SpaceBot-Timestamp",
  nonce: "X-SpaceBot-Nonce",
  contentSha256: "X-SpaceBot-Content-SHA256",
  signature: "X-SpaceBot-Signature",
} as const;

export interface InternalSignedHeaders {
  "X-SpaceBot-Timestamp": string;
  "X-SpaceBot-Nonce": string;
  "X-SpaceBot-Content-SHA256": string;
  "X-SpaceBot-Signature": string;
}

export type InternalRequestHeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>;

export type InternalRequestVerificationCode =
  | "invalid_secret"
  | "invalid_method"
  | "invalid_path"
  | "body_too_large"
  | "malformed_timestamp"
  | "stale_timestamp"
  | "future_timestamp"
  | "malformed_nonce"
  | "malformed_content_sha256"
  | "malformed_signature"
  | "body_digest_mismatch"
  | "signature_mismatch"
  | "replayed_nonce"
  | "replay_store_unavailable";

export type InternalRequestVerificationResult =
  | { ok: true; timestampUnixSeconds: number; nonce: string }
  | { ok: false; code: InternalRequestVerificationCode };

export interface SignLucyInternalRequestOptions {
  secret?: string;
  timestampUnixSeconds?: number;
  nonce?: string;
  path?: LucyInternalRequestPath;
}

export interface VerifyLucyInternalRequestInput {
  method: string;
  path: string;
  body: string | Uint8Array;
  headers: InternalRequestHeaderSource;
  replayStore: InternalReplayStore;
  secret?: string;
  nowUnixSeconds?: number;
  expectedPath?: LucyInternalRequestPath;
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const TIMESTAMP_PATTERN = /^[1-9][0-9]{0,15}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function toBodyBuffer(body: string | Uint8Array): Buffer {
  return typeof body === "string"
    ? Buffer.from(body, "utf8")
    : Buffer.from(body);
}

function decodeCanonicalBase64Url(
  value: string,
  expectedBytes: number,
): Buffer | null {
  if (!BASE64URL_PATTERN.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (
      decoded.length !== expectedBytes ||
      decoded.toString("base64url") !== value
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function resolveLucyInternalSigningSecret(
  secret: string | undefined = process.env.LUCY_INTERNAL_SIGNING_SECRET,
): Buffer {
  if (typeof secret !== "string") {
    throw new Error("LUCY_INTERNAL_SIGNING_SECRET is required");
  }
  const decoded = decodeCanonicalBase64Url(secret, 32);
  if (decoded === null) {
    throw new Error(
      "LUCY_INTERNAL_SIGNING_SECRET must be canonical base64url for exactly 32 bytes",
    );
  }
  return decoded;
}

export function sha256InternalRequestBody(body: string | Uint8Array): string {
  return crypto.createHash("sha256").update(toBodyBuffer(body)).digest("hex");
}

export function buildLucyInternalCanonicalString(input: {
  timestamp: string;
  nonce: string;
  contentSha256: string;
  path?: LucyInternalRequestPath;
}): string {
  return [
    INTERNAL_REQUEST_PROTOCOL,
    LUCY_INTERNAL_CYCLE_METHOD,
    input.path ?? LUCY_INTERNAL_CYCLE_PATH,
    input.timestamp,
    input.nonce,
    input.contentSha256,
  ].join("\n");
}

function validateTimestamp(value: string): number | null {
  if (!TIMESTAMP_PATTERN.test(value)) return null;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}

function validateNonce(value: string): boolean {
  return (
    NONCE_PATTERN.test(value) && decodeCanonicalBase64Url(value, 16) !== null
  );
}

function timingSafeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getSingleHeader(
  headers: InternalRequestHeaderSource,
  expectedName: string,
): string | null {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(expectedName);
  }

  const matches = Object.entries(headers).filter(
    ([name]) => name.toLowerCase() === expectedName.toLowerCase(),
  );
  if (matches.length !== 1 || typeof matches[0][1] !== "string") return null;
  return matches[0][1];
}

export function signLucyInternalRequest(
  body: string | Uint8Array,
  options: SignLucyInternalRequestOptions = {},
): InternalSignedHeaders {
  const bodyBuffer = toBodyBuffer(body);
  if (bodyBuffer.byteLength > INTERNAL_REQUEST_MAX_BODY_BYTES) {
    throw new RangeError("Internal request body exceeds 128 KiB");
  }

  const timestampUnixSeconds =
    options.timestampUnixSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestampUnixSeconds) || timestampUnixSeconds < 1) {
    throw new TypeError("timestampUnixSeconds must be a positive safe integer");
  }
  const timestamp = String(timestampUnixSeconds);
  if (validateTimestamp(timestamp) === null) {
    throw new TypeError("timestampUnixSeconds has an invalid canonical format");
  }

  const nonce = options.nonce ?? crypto.randomBytes(16).toString("base64url");
  if (!validateNonce(nonce)) {
    throw new TypeError(
      "nonce must be canonical base64url for exactly 16 bytes",
    );
  }

  const contentSha256 = sha256InternalRequestBody(bodyBuffer);
  const canonical = buildLucyInternalCanonicalString({
    timestamp,
    nonce,
    contentSha256,
    path: options.path,
  });
  const signature = crypto
    .createHmac("sha256", resolveLucyInternalSigningSecret(options.secret))
    .update(canonical, "utf8")
    .digest("base64url");

  return {
    [INTERNAL_REQUEST_HEADER_NAMES.timestamp]: timestamp,
    [INTERNAL_REQUEST_HEADER_NAMES.nonce]: nonce,
    [INTERNAL_REQUEST_HEADER_NAMES.contentSha256]: contentSha256,
    [INTERNAL_REQUEST_HEADER_NAMES.signature]: signature,
  };
}

export async function verifyLucyInternalRequest(
  input: VerifyLucyInternalRequestInput,
): Promise<InternalRequestVerificationResult> {
  let secret: Buffer;
  try {
    secret = resolveLucyInternalSigningSecret(input.secret);
  } catch {
    return { ok: false, code: "invalid_secret" };
  }

  if (input.method !== LUCY_INTERNAL_CYCLE_METHOD) {
    return { ok: false, code: "invalid_method" };
  }
  const expectedPath = input.expectedPath ?? LUCY_INTERNAL_CYCLE_PATH;
  if (input.path !== expectedPath) {
    return { ok: false, code: "invalid_path" };
  }

  const body = toBodyBuffer(input.body);
  if (body.byteLength > INTERNAL_REQUEST_MAX_BODY_BYTES) {
    return { ok: false, code: "body_too_large" };
  }

  const timestampHeader = getSingleHeader(
    input.headers,
    INTERNAL_REQUEST_HEADER_NAMES.timestamp,
  );
  if (timestampHeader === null) {
    return { ok: false, code: "malformed_timestamp" };
  }
  const timestamp = validateTimestamp(timestampHeader);
  if (timestamp === null) {
    return { ok: false, code: "malformed_timestamp" };
  }

  const nowUnixSeconds = input.nowUnixSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(nowUnixSeconds) || nowUnixSeconds < 1) {
    throw new TypeError("nowUnixSeconds must be a positive safe integer");
  }
  if (timestamp < nowUnixSeconds - INTERNAL_REQUEST_CLOCK_SKEW_SECONDS) {
    return { ok: false, code: "stale_timestamp" };
  }
  if (timestamp > nowUnixSeconds + INTERNAL_REQUEST_CLOCK_SKEW_SECONDS) {
    return { ok: false, code: "future_timestamp" };
  }

  const nonce = getSingleHeader(
    input.headers,
    INTERNAL_REQUEST_HEADER_NAMES.nonce,
  );
  if (nonce === null || !validateNonce(nonce)) {
    return { ok: false, code: "malformed_nonce" };
  }

  const contentSha256 = getSingleHeader(
    input.headers,
    INTERNAL_REQUEST_HEADER_NAMES.contentSha256,
  );
  if (contentSha256 === null || !SHA256_PATTERN.test(contentSha256)) {
    return { ok: false, code: "malformed_content_sha256" };
  }

  const signature = getSingleHeader(
    input.headers,
    INTERNAL_REQUEST_HEADER_NAMES.signature,
  );
  const signatureBytes =
    signature !== null && SIGNATURE_PATTERN.test(signature)
      ? decodeCanonicalBase64Url(signature, 32)
      : null;
  if (signatureBytes === null) {
    return { ok: false, code: "malformed_signature" };
  }

  const actualBodyDigest = crypto.createHash("sha256").update(body).digest();
  const suppliedBodyDigest = Buffer.from(contentSha256, "hex");
  if (!timingSafeEqual(actualBodyDigest, suppliedBodyDigest)) {
    return { ok: false, code: "body_digest_mismatch" };
  }

  const canonical = buildLucyInternalCanonicalString({
    timestamp: timestampHeader,
    nonce,
    contentSha256,
    path: expectedPath,
  });
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(canonical, "utf8")
    .digest();
  if (!timingSafeEqual(signatureBytes, expectedSignature)) {
    return { ok: false, code: "signature_mismatch" };
  }

  try {
    const replayResult = await input.replayStore.consume({
      nonce,
      // Add one second because the +/- 60-second acceptance boundary is inclusive.
      expiresAtUnixSeconds: timestamp + INTERNAL_REQUEST_CLOCK_SKEW_SECONDS + 1,
      nowUnixSeconds,
    });
    if (!replayResult.consumed) {
      return {
        ok: false,
        code:
          replayResult.reason === "replay"
            ? "replayed_nonce"
            : "replay_store_unavailable",
      };
    }
  } catch {
    return { ok: false, code: "replay_store_unavailable" };
  }

  return { ok: true, timestampUnixSeconds: timestamp, nonce };
}
