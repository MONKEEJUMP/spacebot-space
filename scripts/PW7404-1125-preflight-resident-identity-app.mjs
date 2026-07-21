import fs from "node:fs";
import http from "node:http";
import {
  IPC_HEADERS,
  IPC_SOCKET_PATH,
  createSignedControllerHeaders,
  readPrivateSigningSecretFile,
  verifySignedControllerResponse,
} from "../resident-identity-controller/PW7404-1125-ipc-auth.mjs";

const ARTIFACT = "PW7404-1125";
const PREFLIGHT_PATH = "/v1/system/preflight";
const MAX_RESPONSE_BYTES = 8 * 1024;
const configuredSocket =
  process.env.SPACEBOT_RESIDENT_IDENTITY_CONTROLLER_SOCKET_PATH;
if (configuredSocket !== IPC_SOCKET_PATH) {
  throw new Error("Resident identity controller socket guard failed");
}

const secret = readPrivateSigningSecretFile(
  process.env.SPACEBOT_RESIDENT_IDENTITY_CONTROLLER_SIGNING_SECRET_FILE,
  "app_identity_ipc_secret",
);

const socket = fs.lstatSync(IPC_SOCKET_PATH);
if (socket.isSymbolicLink() || !socket.isSocket()) {
  throw new Error("Resident identity controller socket type guard failed");
}
if (
  process.platform !== "win32" &&
  ((socket.mode & 0o007) !== 0 || (socket.mode & 0o060) !== 0o060)
) {
  throw new Error("Resident identity controller socket mode guard failed");
}
fs.accessSync(IPC_SOCKET_PATH, fs.constants.W_OK);

const requestBody = "{}";
const signedHeaders = createSignedControllerHeaders({
  secret,
  pathname: PREFLIGHT_PATH,
  body: requestBody,
});
const requestNonce = signedHeaders[IPC_HEADERS.nonce];

await new Promise((resolve, reject) => {
  const request = http.request(
    {
      socketPath: IPC_SOCKET_PATH,
      path: PREFLIGHT_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
        ...signedHeaders,
      },
    },
    (response) => {
      const chunks = [];
      let length = 0;
      response.on("data", (chunk) => {
        length += chunk.byteLength;
        if (length > MAX_RESPONSE_BYTES) {
          response.destroy(new Error("preflight_response_too_large"));
          return;
        }
        chunks.push(chunk);
      });
      response.once("error", reject);
      response.once("end", () => {
        try {
          const body = Buffer.concat(chunks);
          verifySignedControllerResponse({
            secret,
            pathname: PREFLIGHT_PATH,
            requestNonce,
            statusCode: response.statusCode ?? 503,
            body,
            rawHeaders: response.rawHeaders,
          });
          const parsed = JSON.parse(body.toString("utf8"));
          if (
            response.statusCode !== 200 ||
            parsed?.success !== true ||
            parsed?.result?.ready !== true
          ) {
            throw new Error("Resident identity controller preflight failed");
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    },
  );
  request.setTimeout(10_000, () => {
    request.destroy(new Error("preflight_timeout"));
  });
  request.once("error", reject);
  request.end(requestBody);
});

console.log(
  JSON.stringify({
    artifact: ARTIFACT,
    verdict: "PASS",
    check: "resident_identity_app_startup",
    mutualAuthentication: true,
    secretValueExposed: false,
  }),
);
