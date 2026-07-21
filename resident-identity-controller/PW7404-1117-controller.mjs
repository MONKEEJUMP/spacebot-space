import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import postgres from "postgres";
import {
  IPC_MAX_CLOCK_SKEW_MS,
  IPC_SOCKET_PATH,
  createSignedControllerResponseHeaders,
  readPrivateSigningSecretFile,
  verifySignedControllerRequest,
} from "./PW7404-1125-ipc-auth.mjs";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_REPLAY_NONCES = 10_000;
const BOTSPACE_CREDENTIAL = /^botspace_[A-Za-z0-9_-]{32}$/;
const RESIDENT_CREDENTIAL = /^(?:botspace_[A-Za-z0-9_-]{32}|sb_[a-f0-9]{64})$/;
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const RESIDENT_NAME = /^[A-Za-z][A-Za-z0-9_-]{2,49}$/;
const replayNonces = new Map();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readGuardedFile(
  name,
  { privateFile = false, trim = true, maxBytes = 1024 * 1024 } = {},
) {
  const filePath = required(name);
  if (!path.isAbsolute(filePath)) {
    throw new Error(`${name} must name an absolute file`);
  }
  let descriptor;
  try {
    const before = fs.lstatSync(filePath);
    if (before.isSymbolicLink() || !before.isFile() || before.size > maxBytes) {
      throw new Error(`${name} must name a bounded regular non-symlink file`);
    }
    if (
      privateFile &&
      process.platform !== "win32" &&
      (before.mode & 0o077) !== 0
    ) {
      throw new Error(`${name} must not be accessible by group or others`);
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
      throw new Error(`${name} changed during validation`);
    }
    const value = fs.readFileSync(descriptor, "utf8");
    return trim ? value.trim() : value;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function consumeReplayNonce(nonce, expiresAt, now) {
  for (const [seenNonce, expiry] of replayNonces) {
    if (expiry < now) replayNonces.delete(seenNonce);
  }
  if (replayNonces.has(nonce) || replayNonces.size >= MAX_REPLAY_NONCES) {
    return false;
  }
  replayNonces.set(nonce, Math.max(expiresAt, now + IPC_MAX_CLOCK_SKEW_MS));
  return true;
}

const signingSecret = readPrivateSigningSecretFile(
  required("SPACEBOT_IDENTITY_CONTROLLER_SIGNING_SECRET_FILE"),
  "controller_identity_ipc_secret",
);

const connectionString = readGuardedFile(
  "SPACEBOT_IDENTITY_CONTROLLER_DATABASE_URL_FILE",
  { privateFile: true, maxBytes: 4096 },
);
const ca = readGuardedFile("SPACEBOT_IDENTITY_CONTROLLER_DATABASE_CA_PATH", {
  trim: false,
});
const expectedCaSha256 = required(
  "SPACEBOT_IDENTITY_CONTROLLER_EXPECTED_CA_SHA256",
).toUpperCase();
const actualCaSha256 = createHash("sha256")
  .update(ca)
  .digest("hex")
  .toUpperCase();
if (actualCaSha256 !== expectedCaSha256) {
  throw new Error("Identity controller database CA guard failed");
}

const databaseUrl = new URL(connectionString);
const expectedHostname = required(
  "SPACEBOT_IDENTITY_CONTROLLER_EXPECTED_HOSTNAME",
);
const expectedDatabase = required(
  "SPACEBOT_IDENTITY_CONTROLLER_EXPECTED_DATABASE",
);
const expectedUser = required("SPACEBOT_IDENTITY_CONTROLLER_EXPECTED_USER");
if (expectedUser !== "spacebot_identity_controller") {
  throw new Error("Identity controller canonical database role guard failed");
}
const expectedDatabaseOid = Number.parseInt(
  required("SPACEBOT_IDENTITY_CONTROLLER_EXPECTED_DATABASE_OID"),
  10,
);
if (!Number.isSafeInteger(expectedDatabaseOid) || expectedDatabaseOid <= 0) {
  throw new Error("Identity controller database OID guard failed");
}
const expectedAddress = required(
  "SPACEBOT_IDENTITY_CONTROLLER_EXPECTED_ADDRESS",
);
const expectedPort = required("SPACEBOT_IDENTITY_CONTROLLER_EXPECTED_PORT");
if (
  databaseUrl.hostname !== expectedHostname ||
  decodeURIComponent(databaseUrl.pathname.slice(1)) !== expectedDatabase ||
  decodeURIComponent(databaseUrl.username) !== expectedUser
) {
  throw new Error("Identity controller database URL guard failed");
}
const verifiedUrl = new URL(databaseUrl);
verifiedUrl.searchParams.delete("sslmode");

const sql = postgres(verifiedUrl.toString(), {
  max: 2,
  idle_timeout: 10,
  connect_timeout: 10,
  ssl: { rejectUnauthorized: true, ca, servername: expectedHostname },
  connection: {
    application_name: "spacebot-resident-identity-controller",
    statement_timeout: "10s",
    idle_in_transaction_session_timeout: "10s",
  },
});

async function verifyDatabaseIdentity() {
  const [identity] = await sql`
    WITH target_relations AS (
      SELECT relation.oid, relation.relowner, relation.relkind,
        relation.relname
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN (
          'agents', 'agent_credentials', 'agent_browser_sessions',
          'human_agent_links', 'agent_identity_aliases',
          'bot_profiles', 'bot_configs', 'credential_security_denylist',
          'resident_identity_session_receipts'
        )
    ), target_functions AS (
      SELECT unnest(ARRAY[
        to_regprocedure(
          'public.spacebot_register_resident_v1(character varying,text,text)'
        ),
        to_regprocedure(
          'public.spacebot_open_resident_session_v1(text,text,text)'
        ),
        to_regprocedure('public.spacebot_touch_resident_session_v1(text)'),
        to_regprocedure('public.spacebot_rotate_resident_session_v1(text,text)'),
        to_regprocedure(
          'public.spacebot_revoke_resident_session_v1(text,character varying)'
        )
      ]::oid[]) AS oid
    )
    SELECT session_user AS session_user,
      current_user AS user,
      current_database() AS database,
      (
        SELECT database.oid::integer
        FROM pg_catalog.pg_database AS database
        WHERE database.datname = current_database()
      ) AS database_oid,
      coalesce(inet_server_addr()::text, 'local') AS address,
      coalesce(inet_server_port()::text, 'local') AS port,
      current_setting('server_version_num')::integer AS version,
      role.rolcanlogin AS can_login,
      role.rolsuper AS superuser,
      role.rolcreatedb AS create_database,
      role.rolcreaterole AS create_role,
      role.rolinherit AS inherit,
      role.rolreplication AS replication,
      role.rolbypassrls AS bypass_rls,
      pg_catalog.shobj_description(role.oid, 'pg_authid') AS role_provenance,
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = role.oid OR membership.roleid = role.oid
      ) AS no_memberships,
      (
        SELECT NOT owner_role.rolcanlogin
          AND NOT owner_role.rolsuper
          AND NOT owner_role.rolcreatedb
          AND NOT owner_role.rolcreaterole
          AND NOT owner_role.rolinherit
          AND NOT owner_role.rolreplication
          AND NOT owner_role.rolbypassrls
          AND NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_auth_members AS owner_membership
            WHERE owner_membership.member = owner_role.oid
               OR owner_membership.roleid = owner_role.oid
          )
        FROM pg_catalog.pg_roles AS owner_role
        WHERE owner_role.rolname = 'spacebot_identity_owner'
      ) AS identity_owner_isolated,
      (
        SELECT count(*) = 5 AND bool_and(
          target_functions.oid IS NOT NULL
          AND owner_role.rolname = 'spacebot_identity_owner'
          AND procedure.prosecdef
          AND procedure.proconfig =
            ARRAY['search_path=pg_catalog, pg_temp']::text[]
          AND has_function_privilege(
            current_user, target_functions.oid, 'EXECUTE'
          )
        )
        FROM target_functions
        LEFT JOIN pg_catalog.pg_proc AS procedure
          ON procedure.oid = target_functions.oid
        LEFT JOIN pg_catalog.pg_roles AS owner_role
          ON owner_role.oid = procedure.proowner
      ) AS facade_execute_exact,
      NOT EXISTS (
        SELECT 1
        FROM target_functions
        JOIN pg_catalog.pg_proc AS procedure
          ON procedure.oid = target_functions.oid
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          coalesce(
            procedure.proacl,
            pg_catalog.acldefault('f', procedure.proowner)
          )
        ) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE privilege.privilege_type = 'EXECUTE'
          AND privilege.grantee <> procedure.proowner
          AND coalesce(grantee_role.rolname, 'PUBLIC') <> current_user
      ) AS facade_grantees_exact,
      (
        SELECT count(*) = 9 AND bool_and(
          target_relations.relkind = 'r'
        )
        FROM target_relations
      ) AS protected_relations_exact,
      NOT EXISTS (
        SELECT 1
        FROM target_relations
        JOIN pg_catalog.pg_roles AS relation_owner
          ON relation_owner.oid = target_relations.relowner
        WHERE NOT (
          relation_owner.rolsuper OR (
            relation_owner.rolname <> 'spacebot_identity_owner'
            AND NOT relation_owner.rolcanlogin
            AND NOT relation_owner.rolcreatedb
            AND NOT relation_owner.rolcreaterole
            AND NOT relation_owner.rolinherit
            AND NOT relation_owner.rolreplication
            AND NOT relation_owner.rolbypassrls
            AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_auth_members AS owner_membership
              WHERE owner_membership.member = relation_owner.oid
                 OR owner_membership.roleid = relation_owner.oid
            )
          )
        )
      ) AS protected_relation_owners_safe,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS candidate_role
        CROSS JOIN target_relations
        WHERE candidate_role.rolcanlogin
          AND NOT candidate_role.rolsuper
          AND (
            has_table_privilege(
              candidate_role.oid, target_relations.oid, 'INSERT'
            )
            OR has_table_privilege(
              candidate_role.oid, target_relations.oid, 'UPDATE'
            )
            OR has_table_privilege(
              candidate_role.oid, target_relations.oid, 'DELETE'
            )
            OR has_table_privilege(
              candidate_role.oid, target_relations.oid, 'TRUNCATE'
            )
            OR has_table_privilege(
              candidate_role.oid, target_relations.oid, 'REFERENCES'
            )
            OR has_table_privilege(
              candidate_role.oid, target_relations.oid, 'TRIGGER'
            )
            OR has_table_privilege(
              candidate_role.oid, target_relations.oid, 'MAINTAIN'
            )
            OR EXISTS (
              SELECT 1
              FROM pg_catalog.pg_attribute AS candidate_attribute
              WHERE candidate_attribute.attrelid = target_relations.oid
                AND candidate_attribute.attnum > 0
                AND NOT candidate_attribute.attisdropped
                AND (
                  has_column_privilege(
                    candidate_role.oid, target_relations.oid,
                    candidate_attribute.attnum, 'INSERT'
                  )
                  OR has_column_privilege(
                    candidate_role.oid, target_relations.oid,
                    candidate_attribute.attnum, 'UPDATE'
                  )
                  OR has_column_privilege(
                    candidate_role.oid, target_relations.oid,
                    candidate_attribute.attnum, 'REFERENCES'
                  )
                )
            )
          )
      ) AS no_login_role_effective_writers,
      NOT EXISTS (
        SELECT 1
        FROM target_relations
        CROSS JOIN (VALUES
          ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
          ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
        ) AS candidate(privilege)
        WHERE has_table_privilege(
          current_user, target_relations.oid, candidate.privilege
        )
      ) AND NOT EXISTS (
        SELECT 1
        FROM target_relations
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = target_relations.oid
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
        CROSS JOIN (VALUES
          ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')
        ) AS candidate(privilege)
        WHERE has_column_privilege(
          current_user, target_relations.oid,
          attribute.attnum, candidate.privilege
        )
      ) AS relation_access_denied
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = current_user
  `;
  if (
    identity?.session_user !== expectedUser ||
    identity?.user !== expectedUser ||
    identity?.database !== expectedDatabase ||
    identity?.database_oid !== expectedDatabaseOid ||
    identity?.address !== expectedAddress ||
    identity?.port !== expectedPort ||
    identity?.version < 170000 ||
    identity?.version >= 180000 ||
    identity?.can_login !== true ||
    identity?.superuser !== false ||
    identity?.create_database !== false ||
    identity?.create_role !== false ||
    identity?.inherit !== false ||
    identity?.replication !== false ||
    identity?.bypass_rls !== false ||
    identity?.role_provenance !==
      "PW7404-1117:spacebot-space:identity-controller:v1" ||
    identity?.no_memberships !== true ||
    identity?.identity_owner_isolated !== true ||
    identity?.facade_execute_exact !== true ||
    identity?.facade_grantees_exact !== true ||
    identity?.protected_relations_exact !== true ||
    identity?.protected_relation_owners_safe !== true ||
    identity?.no_login_role_effective_writers !== true ||
    identity?.relation_access_denied !== true
  ) {
    throw new Error("Identity controller live database authority guard failed");
  }
  return Object.freeze({
    database: identity.database,
    databaseOid: identity.database_oid,
    user: identity.user,
    postgresMajor: 17,
    facadeCount: 5,
  });
}

function json(response, status, body, responseAuth = null) {
  const encoded = Buffer.from(JSON.stringify(body));
  const signedHeaders = responseAuth
    ? createSignedControllerResponseHeaders({
        secret: signingSecret,
        pathname: responseAuth.pathname,
        requestNonce: responseAuth.requestNonce,
        statusCode: status,
        body: encoded,
      })
    : {};
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": encoded.byteLength,
    "X-Content-Type-Options": "nosniff",
    ...signedHeaders,
  });
  response.end(encoded);
}

async function readBody(request) {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (
    !Number.isSafeInteger(declaredLength) ||
    declaredLength > MAX_BODY_BYTES
  ) {
    throw new RangeError("body_too_large");
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new RangeError("body_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function validRegistration(value) {
  return (
    exactKeys(value, ["name", "description", "credential"]) &&
    RESIDENT_NAME.test(value.name ?? "") &&
    (value.description === null ||
      (typeof value.description === "string" &&
        value.description.length <= 500)) &&
    BOTSPACE_CREDENTIAL.test(value.credential ?? "")
  );
}

function validOpen(value) {
  return (
    exactKeys(value, [
      "credential",
      "new_session_token",
      "prior_session_token",
    ]) &&
    RESIDENT_CREDENTIAL.test(value.credential ?? "") &&
    SESSION_TOKEN.test(value.new_session_token ?? "") &&
    (value.prior_session_token === null ||
      SESSION_TOKEN.test(value.prior_session_token ?? ""))
  );
}

function validTouch(value) {
  return (
    exactKeys(value, ["session_token"]) &&
    SESSION_TOKEN.test(value.session_token ?? "")
  );
}

function validRotate(value) {
  return (
    exactKeys(value, ["current_session_token", "new_session_token"]) &&
    SESSION_TOKEN.test(value.current_session_token ?? "") &&
    SESSION_TOKEN.test(value.new_session_token ?? "") &&
    value.current_session_token !== value.new_session_token
  );
}

function validRevoke(value) {
  return (
    exactKeys(value, ["session_token", "scope"]) &&
    SESSION_TOKEN.test(value.session_token ?? "") &&
    ["current", "all"].includes(value.scope)
  );
}

function databaseFailure(error, response, responseAuth) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("spacebot_registration_conflict")) {
    return json(
      response,
      409,
      { success: false, code: "registration_conflict" },
      responseAuth,
    );
  }
  if (message.includes("spacebot_resident_credential_rejected")) {
    return json(
      response,
      401,
      { success: false, code: "invalid_credential" },
      responseAuth,
    );
  }
  if (message.includes("spacebot_session_rotation_conflict")) {
    return json(
      response,
      409,
      { success: false, code: "rotation_conflict" },
      responseAuth,
    );
  }
  if (message.includes("spacebot_session_limit_reached")) {
    return json(
      response,
      409,
      { success: false, code: "session_limit" },
      responseAuth,
    );
  }
  if (message.includes("_request_invalid")) {
    return json(
      response,
      400,
      { success: false, code: "invalid_request" },
      responseAuth,
    );
  }
  console.error("Resident identity controller database request failed", {
    code: error?.code ?? "unknown",
  });
  return json(
    response,
    503,
    { success: false, code: "controller_unavailable" },
    responseAuth,
  );
}

async function execute(pathname, body) {
  if (pathname === "/v1/system/preflight" && exactKeys(body, [])) {
    const database = await verifyDatabaseIdentity();
    return Object.freeze({ ready: true, database });
  }
  if (pathname === "/v1/residents/register" && validRegistration(body)) {
    const [row] = await sql`SELECT public.spacebot_register_resident_v1(
      ${body.name}::varchar,
      ${body.description}::text,
      ${body.credential}::text
    ) AS result`;
    return row.result;
  }
  if (pathname === "/v1/sessions/open" && validOpen(body)) {
    const [row] = await sql`SELECT public.spacebot_open_resident_session_v1(
      ${body.credential}::text,
      ${body.new_session_token}::text,
      ${body.prior_session_token}::text
    ) AS result`;
    return row.result;
  }
  if (pathname === "/v1/sessions/touch" && validTouch(body)) {
    const [row] = await sql`SELECT public.spacebot_touch_resident_session_v1(
      ${body.session_token}::text
    ) AS result`;
    return row.result;
  }
  if (pathname === "/v1/sessions/rotate" && validRotate(body)) {
    const [row] = await sql`SELECT public.spacebot_rotate_resident_session_v1(
      ${body.current_session_token}::text,
      ${body.new_session_token}::text
    ) AS result`;
    return row.result;
  }
  if (pathname === "/v1/sessions/revoke" && validRevoke(body)) {
    const [row] = await sql`SELECT public.spacebot_revoke_resident_session_v1(
      ${body.session_token}::text,
      ${body.scope}::varchar
    ) AS result`;
    return row.result;
  }
  throw new TypeError("invalid_request");
}

const server = http.createServer(async (request, response) => {
  let responseAuth = null;
  try {
    if (request.socket.remoteAddress) {
      return json(response, 403, { success: false, code: "socket_only" });
    }
    const requestUrl =
      request.url?.startsWith("/") && !request.url.startsWith("//")
        ? new URL(request.url, "http://localhost")
        : null;
    const exactPath =
      requestUrl?.origin === "http://localhost" &&
      !requestUrl.search &&
      !requestUrl.hash
        ? requestUrl.pathname
        : null;
    if (request.method === "GET" && exactPath === "/health") {
      await sql`SELECT 1`;
      return json(response, 200, { success: true });
    }
    if (request.method !== "POST" || !exactPath?.startsWith("/v1/")) {
      return json(response, 404, { success: false, code: "not_found" });
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      return json(response, 415, { success: false, code: "content_type" });
    }
    let rawBody;
    try {
      rawBody = await readBody(request);
    } catch (error) {
      const code =
        error instanceof RangeError ? "body_too_large" : "invalid_json";
      return json(response, code === "body_too_large" ? 413 : 400, {
        success: false,
        code,
      });
    }
    try {
      const authReceipt = verifySignedControllerRequest({
        secret: signingSecret,
        method: request.method,
        pathname: exactPath,
        body: rawBody,
        rawHeaders: request.rawHeaders,
        consumeNonce: consumeReplayNonce,
      });
      responseAuth = { pathname: exactPath, requestNonce: authReceipt.nonce };
    } catch {
      return json(response, 401, {
        success: false,
        code: "invalid_controller_auth",
      });
    }
    let body;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return json(
        response,
        400,
        { success: false, code: "invalid_json" },
        responseAuth,
      );
    }
    try {
      const result = await execute(exactPath, body);
      if (exactPath === "/v1/sessions/touch" && !result) {
        return json(
          response,
          401,
          { success: false, code: "invalid_session" },
          responseAuth,
        );
      }
      return json(response, 200, { success: true, result }, responseAuth);
    } catch (error) {
      if (error instanceof TypeError && error.message === "invalid_request") {
        return json(
          response,
          400,
          { success: false, code: "invalid_request" },
          responseAuth,
        );
      }
      return databaseFailure(error, response, responseAuth);
    }
  } catch (error) {
    console.error("Resident identity controller request failed", {
      code: error?.code ?? "unknown",
    });
    return json(
      response,
      500,
      { success: false, code: "internal_error" },
      responseAuth,
    );
  }
});

await verifyDatabaseIdentity();

server.requestTimeout = 12_000;
server.headersTimeout = 5_000;
const socketDirectory = fs.lstatSync(path.dirname(IPC_SOCKET_PATH));
if (socketDirectory.isSymbolicLink() || !socketDirectory.isDirectory()) {
  throw new Error("Identity controller runtime directory guard failed");
}
if (fs.existsSync(IPC_SOCKET_PATH)) {
  throw new Error("Identity controller socket path must be absent at startup");
}
server.listen(IPC_SOCKET_PATH, () => {
  fs.chmodSync(IPC_SOCKET_PATH, 0o660);
  console.log(
    `PW7404-1125 resident identity controller listening on ${IPC_SOCKET_PATH}`,
  );
});

let shutdownStarted = false;
async function shutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`PW7404-1117 identity controller stopping after ${signal}`);
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections?.();
  });
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
