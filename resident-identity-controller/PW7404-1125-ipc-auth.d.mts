export const IPC_PROTOCOL: string;
export const IPC_MAX_CLOCK_SKEW_MS: number;
export const IPC_SOCKET_PATH: string;
export const IPC_HEADERS: Readonly<{
  protocol: string;
  timestamp: string;
  nonce: string;
  contentSha256: string;
  signature: string;
  responseContentSha256: string;
  responseSignature: string;
}>;
export const IPC_ALLOWED_PATHS: readonly string[];

export class ControllerIpcAuthError extends Error {
  readonly code: string;
}

export function readPrivateSigningSecretFile(
  filePath: string | undefined,
  label?: string,
): Buffer;

export function createSignedControllerHeaders(input: {
  secret: Buffer;
  method?: "POST";
  pathname: string;
  body: string | Buffer;
  now?: number;
  nonce?: string;
}): Record<string, string>;

export function verifySignedControllerRequest(input: {
  secret: Buffer;
  method: string;
  pathname: string;
  body: string | Buffer;
  rawHeaders: string[];
  now?: number;
  consumeNonce: (nonce: string, expiresAt: number, now: number) => boolean;
}): Readonly<{
  timestamp: number;
  nonce: string;
  contentSha256: string;
}>;

export function createSignedControllerResponseHeaders(input: {
  secret: Buffer;
  pathname: string;
  requestNonce: string;
  statusCode: number;
  body: string | Buffer;
}): Record<string, string>;

export function verifySignedControllerResponse(input: {
  secret: Buffer;
  pathname: string;
  requestNonce: string;
  statusCode: number;
  body: string | Buffer;
  rawHeaders: string[];
}): Readonly<{ contentSha256: string }>;
