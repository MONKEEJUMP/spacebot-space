import type { LucyCycleInput } from "./cycle-contract";
import {
  INTERNAL_REQUEST_HEADER_NAMES,
  LUCY_INTERNAL_CYCLE_METHOD,
  LUCY_INTERNAL_CYCLE_PATH,
  signLucyInternalRequest,
} from "../security/internal-request-signing";

export interface LucyInternalCycleClientOptions {
  baseUrl: string | URL;
  trustedOrigin?: string | URL;
  fetchImplementation?: typeof fetch;
  signal?: AbortSignal;
  signingSecret?: string;
  timestampUnixSeconds?: number;
  nonce?: string;
}

function buildInternalCycleUrl(
  baseUrl: string | URL,
  trustedOrigin?: string | URL,
): URL {
  const base = new URL(baseUrl.toString());
  if (!["http:", "https:"].includes(base.protocol)) {
    throw new TypeError("LUCY internal base URL must use HTTP or HTTPS");
  }
  if (base.username || base.password) {
    throw new TypeError("LUCY internal base URL must not contain credentials");
  }
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    base.hostname,
  );
  if (base.protocol === "http:" && !isLoopback) {
    throw new TypeError("LUCY internal HTTP is permitted only on loopback");
  }
  const configuredOrigin = trustedOrigin ?? process.env.LUCY_INTERNAL_BASE_URL;
  if (!isLoopback && !configuredOrigin) {
    throw new TypeError("A trusted LUCY internal origin is required");
  }
  if (configuredOrigin) {
    const trusted = new URL(configuredOrigin.toString());
    if (base.origin !== trusted.origin) {
      throw new TypeError(
        "LUCY internal base URL does not match the trusted origin",
      );
    }
  }
  return new URL(LUCY_INTERNAL_CYCLE_PATH, base.origin);
}

/** Sends only content-negotiation and dedicated internal-signing headers. */
export async function requestLucyInternalCycle(
  input: LucyCycleInput,
  options: LucyInternalCycleClientOptions,
): Promise<Response> {
  const body = JSON.stringify(input);
  const signedHeaders = signLucyInternalRequest(body, {
    secret: options.signingSecret,
    timestampUnixSeconds: options.timestampUnixSeconds,
    nonce: options.nonce,
  });

  // Construct a fresh allowlisted set. Never inherit cookies, Authorization,
  // proxy credentials, or arbitrary caller headers across this trust boundary.
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set(
    INTERNAL_REQUEST_HEADER_NAMES.timestamp,
    signedHeaders[INTERNAL_REQUEST_HEADER_NAMES.timestamp],
  );
  headers.set(
    INTERNAL_REQUEST_HEADER_NAMES.nonce,
    signedHeaders[INTERNAL_REQUEST_HEADER_NAMES.nonce],
  );
  headers.set(
    INTERNAL_REQUEST_HEADER_NAMES.contentSha256,
    signedHeaders[INTERNAL_REQUEST_HEADER_NAMES.contentSha256],
  );
  headers.set(
    INTERNAL_REQUEST_HEADER_NAMES.signature,
    signedHeaders[INTERNAL_REQUEST_HEADER_NAMES.signature],
  );

  const fetchImplementation = options.fetchImplementation ?? fetch;
  return fetchImplementation(
    buildInternalCycleUrl(options.baseUrl, options.trustedOrigin),
    {
      method: LUCY_INTERNAL_CYCLE_METHOD,
      headers,
      body,
      signal: options.signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    },
  );
}
