import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import postgres from "postgres";

const HOST = "127.0.0.1";
const PORT = 8110;
const MAX_BODY_BYTES = 16 * 1024;
const MUTATION_PATH = "/v1/resident-autonomy/mutations";
const CREDENTIAL_PATTERN = /^(?:botspace_[A-Za-z0-9_-]{32}|sb_[a-f0-9]{64})$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readGuardedFile(name, { privateFile = false, trim = true } = {}) {
  const filePath = required(name);
  const stat = fs.statSync(filePath);
  if (
    privateFile &&
    process.platform !== "win32" &&
    (stat.mode & 0o077) !== 0
  ) {
    throw new Error(`${name} must not be accessible by group or others`);
  }
  const value = fs.readFileSync(filePath, "utf8");
  return trim ? value.trim() : value;
}

const connectionString = readGuardedFile(
  "SPACEBOT_AUTONOMY_CONTROLLER_DATABASE_URL_FILE",
  { privateFile: true },
);
const ca = readGuardedFile("SPACEBOT_AUTONOMY_CONTROLLER_DATABASE_CA_PATH", {
  trim: false,
});
const expectedCaSha256 = required(
  "SPACEBOT_AUTONOMY_CONTROLLER_EXPECTED_CA_SHA256",
).toUpperCase();
const actualCaSha256 = createHash("sha256")
  .update(ca)
  .digest("hex")
  .toUpperCase();
if (actualCaSha256 !== expectedCaSha256) {
  throw new Error("Controller database CA guard failed");
}

const databaseUrl = new URL(connectionString);
const expectedHostname = required(
  "SPACEBOT_AUTONOMY_CONTROLLER_EXPECTED_HOSTNAME",
);
const expectedDatabase = required(
  "SPACEBOT_AUTONOMY_CONTROLLER_EXPECTED_DATABASE",
);
const expectedUser = required("SPACEBOT_AUTONOMY_CONTROLLER_EXPECTED_USER");
if (
  databaseUrl.hostname !== expectedHostname ||
  decodeURIComponent(databaseUrl.pathname.slice(1)) !== expectedDatabase ||
  decodeURIComponent(databaseUrl.username) !== expectedUser
) {
  throw new Error("Controller database URL guard failed");
}
const verifiedUrl = new URL(databaseUrl);
verifiedUrl.searchParams.delete("sslmode");

const sql = postgres(verifiedUrl.toString(), {
  max: 2,
  idle_timeout: 10,
  connect_timeout: 10,
  ssl: { rejectUnauthorized: true, ca, servername: expectedHostname },
  connection: {
    application_name: "spacebot-resident-autonomy-controller",
    statement_timeout: "10s",
    idle_in_transaction_session_timeout: "10s",
  },
});

function json(response, status, body) {
  const encoded = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": encoded.byteLength,
    "X-Content-Type-Options": "nosniff",
  });
  response.end(encoded);
}

async function readBody(request) {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_BODY_BYTES) {
    throw new RangeError("body_too_large");
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new RangeError("body_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validMutation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "credential",
          "operation",
          "expected_revision",
          "idempotency_key",
          "payload",
        ].includes(key),
    ) ||
    !CREDENTIAL_PATTERN.test(value.credential ?? "") ||
    !["set", "status"].includes(value.operation) ||
    !Number.isSafeInteger(value.expected_revision) ||
    value.expected_revision < 0 ||
    !IDEMPOTENCY_PATTERN.test(value.idempotency_key ?? "") ||
    !value.payload ||
    typeof value.payload !== "object" ||
    Array.isArray(value.payload)
  ) {
    return false;
  }
  return true;
}

function databaseFailure(error, response) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("idempotency conflict")) {
    return json(response, 409, { success: false, code: "idempotency_conflict" });
  }
  if (message.includes("revision conflict")) {
    return json(response, 409, { success: false, code: "revision_conflict" });
  }
  if (message.includes("credential proof rejected")) {
    return json(response, 401, { success: false, code: "invalid_credential" });
  }
  if (message.includes("delegation not found")) {
    return json(response, 404, { success: false, code: "delegation_not_found" });
  }
  if (message.includes("rate limit exceeded")) {
    return json(response, 429, { success: false, code: "rate_limited" });
  }
  if (message.includes("Invalid resident autonomy") || message.includes("requires a new")) {
    return json(response, 400, { success: false, code: "invalid_request" });
  }
  console.error("Resident autonomy controller database request failed", {
    code: error?.code ?? "unknown",
  });
  return json(response, 503, { success: false, code: "controller_unavailable" });
}

const server = http.createServer(async (request, response) => {
  try {
    if (!request.socket.remoteAddress?.includes("127.0.0.1")) {
      return json(response, 403, { success: false, code: "loopback_only" });
    }
    if (request.method === "GET" && request.url === "/health") {
      await sql`SELECT 1`;
      return json(response, 200, { success: true });
    }
    if (request.method !== "POST" || request.url !== MUTATION_PATH) {
      return json(response, 404, { success: false, code: "not_found" });
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      return json(response, 415, { success: false, code: "content_type" });
    }
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      const code = error instanceof RangeError ? "body_too_large" : "invalid_json";
      return json(response, code === "body_too_large" ? 413 : 400, {
        success: false,
        code,
      });
    }
    if (!validMutation(body)) {
      return json(response, 400, { success: false, code: "invalid_request" });
    }

    try {
      const [row] = await sql`SELECT spacebot_mutate_resident_autonomy(
        ${body.credential}::text,
        ${body.operation}::varchar,
        ${body.expected_revision}::bigint,
        ${body.idempotency_key}::varchar,
        ${sql.json(body.payload)}::jsonb
      ) AS result`;
      return json(response, 200, { success: true, result: row.result });
    } catch (error) {
      return databaseFailure(error, response);
    }
  } catch (error) {
    console.error("Resident autonomy controller request failed", {
      code: error?.code ?? "unknown",
    });
    return json(response, 500, { success: false, code: "internal_error" });
  }
});

const [identity] = await sql`
  SELECT current_user AS user,
         current_database() AS database,
         coalesce(inet_server_addr()::text, 'local') AS address,
         coalesce(inet_server_port()::text, 'local') AS port
`;
if (
  identity.user !== expectedUser ||
  identity.database !== expectedDatabase ||
  identity.address !== required("SPACEBOT_AUTONOMY_CONTROLLER_EXPECTED_ADDRESS") ||
  identity.port !== required("SPACEBOT_AUTONOMY_CONTROLLER_EXPECTED_PORT")
) {
  throw new Error("Controller live database identity guard failed");
}

server.requestTimeout = 12_000;
server.headersTimeout = 5_000;
server.listen(PORT, HOST, () => {
  console.log(`PW7404-1101 resident autonomy controller listening on ${HOST}:${PORT}`);
});

async function shutdown(signal) {
  console.log(`PW7404-1101 controller stopping after ${signal}`);
  server.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
