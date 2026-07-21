import "server-only";

import http from "node:http";
// This protocol module is shared verbatim with the separately deployed controller.
/* eslint-disable import/extensions, import/no-relative-packages */
import {
  IPC_HEADERS,
  IPC_SOCKET_PATH,
  createSignedControllerHeaders,
  readPrivateSigningSecretFile,
  verifySignedControllerResponse,
} from "../../../resident-identity-controller/PW7404-1125-ipc-auth.mjs";
/* eslint-enable import/extensions, import/no-relative-packages */

const MAX_RESPONSE_BYTES = 64 * 1024;

let signingSecret: Buffer | undefined;

export class ResidentIdentityControllerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Resident identity controller rejected the request: ${code}`);
  }
}

export interface ResidentIdentityView {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  residentVisibility: string;
  moderationStatus: "active" | "suspended" | "removed";
}

export interface ResidentSessionControllerResult {
  sessionId: string;
  expiresAt: string;
  activeSessionCount: number;
  accessMode: "active" | "restricted";
  resident: ResidentIdentityView;
}

export interface ResidentRegistrationControllerResult {
  residentId: string;
  name: string;
  description: string | null;
  createdAt: string;
  residentVisibility: string;
  replayed: boolean;
}

export interface ResidentSessionRevocationResult {
  terminal: true;
  outcome:
    | "revoked"
    | "revoked_all"
    | "already_revoked"
    | "already_invalid"
    | "absent";
  revokedCount: number;
}

function controllerSocketPath(): string {
  const configured =
    process.env.SPACEBOT_RESIDENT_IDENTITY_CONTROLLER_SOCKET_PATH;
  if (configured !== IPC_SOCKET_PATH) {
    throw new Error("Resident identity controller socket guard failed");
  }
  return configured;
}

function controllerSigningSecret(): Buffer {
  if (!signingSecret) {
    signingSecret = readPrivateSigningSecretFile(
      process.env.SPACEBOT_RESIDENT_IDENTITY_CONTROLLER_SIGNING_SECRET_FILE,
      "app_identity_ipc_secret",
    );
  }
  return signingSecret;
}

async function requestController<T>(
  pathname: string,
  payload: Record<string, unknown>,
): Promise<T> {
  try {
    const requestBody = JSON.stringify(payload);
    const secret = controllerSigningSecret();
    const signedHeaders = createSignedControllerHeaders({
      secret,
      pathname,
      body: requestBody,
    });
    const requestNonce = signedHeaders[IPC_HEADERS.nonce];

    return await new Promise<T>((resolve, reject) => {
      const request = http.request(
        {
          socketPath: controllerSocketPath(),
          path: pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(requestBody),
            ...signedHeaders,
          },
        },
        (response) => {
          const status = response.statusCode ?? 503;
          const declaredLength = Number(
            response.headers["content-length"] ?? 0,
          );
          if (
            !Number.isSafeInteger(declaredLength) ||
            declaredLength < 0 ||
            declaredLength > MAX_RESPONSE_BYTES
          ) {
            response.resume();
            reject(
              new ResidentIdentityControllerError(
                503,
                "controller_unavailable",
              ),
            );
            return;
          }

          const chunks: Buffer[] = [];
          let receivedLength = 0;
          response.on("data", (chunk: Buffer) => {
            receivedLength += chunk.byteLength;
            if (receivedLength > MAX_RESPONSE_BYTES) {
              response.destroy(new Error("controller_response_too_large"));
              return;
            }
            chunks.push(chunk);
          });
          response.once("error", () => {
            reject(
              new ResidentIdentityControllerError(
                503,
                "controller_unavailable",
              ),
            );
          });
          response.once("end", () => {
            const rawResponseBody = Buffer.concat(chunks);
            try {
              verifySignedControllerResponse({
                secret,
                pathname,
                requestNonce,
                statusCode: status,
                body: rawResponseBody,
                rawHeaders: response.rawHeaders,
              });
            } catch {
              reject(
                new ResidentIdentityControllerError(
                  503,
                  "controller_auth_failed",
                ),
              );
              return;
            }

            let responseBody: {
              success?: boolean;
              result?: T;
              code?: string;
            } | null = null;
            try {
              responseBody = JSON.parse(rawResponseBody.toString("utf8"));
            } catch {
              reject(
                new ResidentIdentityControllerError(
                  503,
                  "controller_unavailable",
                ),
              );
              return;
            }
            if (
              status < 200 ||
              status > 299 ||
              !responseBody?.success ||
              responseBody.result === undefined
            ) {
              reject(
                new ResidentIdentityControllerError(
                  status,
                  responseBody?.code ?? "controller_unavailable",
                ),
              );
              return;
            }
            resolve(responseBody.result);
          });
        },
      );
      request.setTimeout(10_000, () => {
        request.destroy(new Error("controller_timeout"));
      });
      request.once("error", () => {
        reject(
          new ResidentIdentityControllerError(503, "controller_unavailable"),
        );
      });
      request.end(requestBody);
    });
  } catch (error) {
    if (error instanceof ResidentIdentityControllerError) throw error;
    throw new ResidentIdentityControllerError(503, "controller_unavailable");
  }
}

export function registerResidentIdentity(input: {
  name: string;
  description: string | null;
  credential: string;
}): Promise<ResidentRegistrationControllerResult> {
  return requestController("/v1/residents/register", input);
}

export function openResidentSession(input: {
  credential: string;
  newSessionToken: string;
  priorSessionToken: string | null;
}): Promise<ResidentSessionControllerResult> {
  return requestController("/v1/sessions/open", {
    credential: input.credential,
    new_session_token: input.newSessionToken,
    prior_session_token: input.priorSessionToken,
  });
}

export function touchResidentSession(
  sessionToken: string,
): Promise<ResidentSessionControllerResult> {
  return requestController("/v1/sessions/touch", {
    session_token: sessionToken,
  });
}

export function rotateResidentSession(input: {
  currentSessionToken: string;
  newSessionToken: string;
}): Promise<ResidentSessionControllerResult> {
  return requestController("/v1/sessions/rotate", {
    current_session_token: input.currentSessionToken,
    new_session_token: input.newSessionToken,
  });
}

export function revokeResidentSession(input: {
  sessionToken: string;
  scope: "current" | "all";
}): Promise<ResidentSessionRevocationResult> {
  return requestController("/v1/sessions/revoke", {
    session_token: input.sessionToken,
    scope: input.scope,
  });
}
