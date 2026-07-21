import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ARTIFACT = "PW7404-1117";
const CONTROLLER_ROLE = "spacebot_identity_controller";
const OWNER_ROLE = "spacebot_identity_owner";
const CONTROLLER_ROLE_PROVENANCE =
  "PW7404-1117:spacebot-space:identity-controller:v1";
const OWNER_ROLE_PROVENANCE = "PW7404-1117:spacebot-space:identity-owner:v1";
const CONFIRMATION = "PW7404-1117";
const MIGRATION =
  "drizzle/migrations/PW7404-1117-01-resident-identity-session-facades-20260713.sql";
const EXPECTED_MIGRATION_SHA256 =
  "6C53945CD98474C07B259409DF8C9889D423275D35F890E76EE96A22E898635E";
const FUNCTION_SIGNATURES = [
  "public.spacebot_register_resident_v1(character varying,text,text)",
  "public.spacebot_open_resident_session_v1(text,text,text)",
  "public.spacebot_touch_resident_session_v1(text)",
  "public.spacebot_rotate_resident_session_v1(text,text)",
  "public.spacebot_revoke_resident_session_v1(text,character varying)",
];

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function readPrivateValueFile(name, { minBytes = 1, maxBytes = 4096 } = {}) {
  const filePath = process.env[name];
  if (!filePath || !path.isAbsolute(filePath)) {
    throw new Error(`${name} must name an absolute private file`);
  }
  let descriptor;
  try {
    const before = fs.lstatSync(filePath);
    if (
      before.isSymbolicLink() ||
      !before.isFile() ||
      before.size < minBytes ||
      before.size > maxBytes ||
      (process.platform !== "win32" && (before.mode & 0o077) !== 0)
    ) {
      throw new Error(`${name} private file guard failed`);
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
      throw new Error(`${name} private file changed during validation`);
    }
    return fs.readFileSync(descriptor, "utf8").trim();
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

const supported = new Set(["--apply", "--check"]);
const unexpected = process.argv
  .slice(2)
  .filter((value) => !supported.has(value));
if (unexpected.length > 0) {
  throw new Error(`Unsupported argument: ${unexpected.join(", ")}`);
}
const apply = process.argv.includes("--apply");
if (apply && process.argv.includes("--check")) {
  throw new Error("Choose either --apply or --check");
}

const migrationBytes = fs.readFileSync(path.join(repoRoot, MIGRATION));
const migrationSha256 = crypto
  .createHash("sha256")
  .update(migrationBytes)
  .digest("hex")
  .toUpperCase();
if (migrationSha256 !== EXPECTED_MIGRATION_SHA256) {
  throw new Error(`${ARTIFACT} migration digest guard failed`);
}

const connectionString = readPrivateValueFile(
  "SPACEBOT_ADMIN_DATABASE_URL_FILE",
  { minBytes: 16 },
);
if (apply && process.env.SPACEBOT_APPLY_IDENTITY_CONTROLLER !== CONFIRMATION) {
  throw new Error(
    `Set SPACEBOT_APPLY_IDENTITY_CONTROLLER=${CONFIRMATION} before --apply`,
  );
}
const controllerPassword = apply
  ? readPrivateValueFile(
      "SPACEBOT_IDENTITY_CONTROLLER_DATABASE_PASSWORD_FILE",
      {
        minBytes: 32,
        maxBytes: 128,
      },
    )
  : null;
if (
  apply &&
  (!controllerPassword ||
    controllerPassword.length < 32 ||
    controllerPassword.length > 128 ||
    /\s/.test(controllerPassword))
) {
  throw new Error(
    "Identity controller database password must contain 32-128 non-space characters",
  );
}

const caPath = process.env.SPACEBOT_DATABASE_CA_PATH;
if (!caPath) throw new Error("SPACEBOT_DATABASE_CA_PATH is required");
const ca = fs.readFileSync(caPath, "utf8");
const expectedCaSha256 =
  process.env.SPACEBOT_EXPECTED_DATABASE_CA_SHA256?.toUpperCase();
const actualCaSha256 = crypto
  .createHash("sha256")
  .update(ca)
  .digest("hex")
  .toUpperCase();
if (!expectedCaSha256 || actualCaSha256 !== expectedCaSha256) {
  throw new Error("Pinned database CA fingerprint guard failed");
}

const guards = {
  database: process.env.SPACEBOT_EXPECTED_DATABASE,
  user: process.env.SPACEBOT_EXPECTED_DATABASE_USER,
  address: process.env.SPACEBOT_EXPECTED_SERVER_ADDRESS,
  port: process.env.SPACEBOT_EXPECTED_SERVER_PORT,
  hostname: process.env.SPACEBOT_EXPECTED_DATABASE_HOSTNAME,
  sentinel: process.env.SPACEBOT_EXPECTED_SENTINEL_AGENT_ID,
};
for (const [name, value] of Object.entries(guards)) {
  if (!value || /\s/.test(value))
    throw new Error(`Missing database ${name} guard`);
}

const databaseUrl = new URL(connectionString);
if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
  throw new Error("Identity provisioning database URL must use PostgreSQL");
}
if (databaseUrl.hostname !== guards.hostname) {
  throw new Error("Database hostname guard failed");
}
const verifiedUrl = new URL(databaseUrl);
verifiedUrl.searchParams.delete("sslmode");
const sql = postgres(verifiedUrl.toString(), {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  ssl: { rejectUnauthorized: true, ca, servername: databaseUrl.hostname },
});

async function assertTarget(client = sql) {
  const [target] = await client`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           EXISTS (
             SELECT 1 FROM public.agents WHERE id = ${guards.sentinel}::uuid
           ) AS sentinel
  `;
  for (const field of ["database", "user", "address", "port"]) {
    if (target?.[field] !== guards[field]) {
      throw new Error(`Database ${field} guard failed`);
    }
  }
  if (!target?.sentinel) throw new Error("Database sentinel guard failed");
}

async function assertProvisioningAuthority() {
  const [admin] = await sql`
    SELECT rolsuper
    FROM pg_catalog.pg_roles WHERE rolname = current_user
  `;
  if (!admin?.rolsuper) {
    throw new Error(
      `${ARTIFACT} requires the reviewed superuser provisioning lane`,
    );
  }
}

async function assertRoleAndFunctionProvenance(client = sql) {
  const roles = await client`
    SELECT role.rolname,
           pg_catalog.shobj_description(role.oid, 'pg_authid') AS provenance
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname IN (${CONTROLLER_ROLE}, ${OWNER_ROLE})
  `;
  for (const role of roles) {
    const expected =
      role.rolname === CONTROLLER_ROLE
        ? CONTROLLER_ROLE_PROVENANCE
        : OWNER_ROLE_PROVENANCE;
    if (role.provenance !== expected) {
      throw new Error(`${ARTIFACT} refused a foreign-provenance database role`);
    }
  }
  if (roles.length > 0) {
    const [membership] = await client`
      SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members AS relation
        JOIN pg_catalog.pg_roles AS granted ON granted.oid = relation.roleid
        JOIN pg_catalog.pg_roles AS member ON member.oid = relation.member
        WHERE granted.rolname IN (${CONTROLLER_ROLE}, ${OWNER_ROLE})
           OR member.rolname IN (${CONTROLLER_ROLE}, ${OWNER_ROLE})
      ) AS present
    `;
    if (membership?.present) {
      throw new Error(`${ARTIFACT} refused a role with unexpected memberships`);
    }
  }
  const unexpectedPublicFunctions = await client`
    SELECT procedure.oid::regprocedure::text AS signature
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.oid <> ALL(${FUNCTION_SIGNATURES}::regprocedure[])
      AND pg_catalog.has_function_privilege(
        'public', procedure.oid, 'EXECUTE'
      )
    ORDER BY signature
  `;
  if (unexpectedPublicFunctions.length > 0) {
    throw new Error(
      `${ARTIFACT} public schema exposes unexpected executable functions`,
    );
  }
}

async function formattedDdl(client, format, value) {
  const [row] = await client`
    SELECT pg_catalog.format(${format}::text, ${value}::text) AS statement
  `;
  return row.statement;
}

async function provision(client) {
  await client.unsafe(`
    DO $pw7404_roles$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'spacebot_identity_controller'
      ) THEN
        CREATE ROLE spacebot_identity_controller;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'spacebot_identity_owner'
      ) THEN
        CREATE ROLE spacebot_identity_owner;
      END IF;
      COMMENT ON ROLE spacebot_identity_controller IS
        'PW7404-1117:spacebot-space:identity-controller:v1';
      COMMENT ON ROLE spacebot_identity_owner IS
        'PW7404-1117:spacebot-space:identity-owner:v1';
    END
    $pw7404_roles$;
  `);

  const alterController = await formattedDdl(
    client,
    "ALTER ROLE spacebot_identity_controller LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
    controllerPassword,
  );
  const grantConnect = await formattedDdl(
    client,
    "GRANT CONNECT ON DATABASE %I TO spacebot_identity_controller",
    guards.database,
  );
  const grantOwnerToAdmin = await formattedDdl(
    client,
    "GRANT spacebot_identity_owner TO %I",
    guards.user,
  );
  const revokeOwnerFromAdmin = await formattedDdl(
    client,
    "REVOKE spacebot_identity_owner FROM %I",
    guards.user,
  );
  await client.unsafe(alterController);
  await client.unsafe(`
    ALTER ROLE spacebot_identity_owner NOLOGIN PASSWORD NULL
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  `);
  await client.unsafe(grantConnect);

  await client.unsafe(grantOwnerToAdmin);

  await client.unsafe(`
    REVOKE ALL PRIVILEGES ON SCHEMA public
      FROM spacebot_identity_controller, spacebot_identity_owner;
    GRANT USAGE ON SCHEMA public
      TO spacebot_identity_controller, spacebot_identity_owner;
    GRANT CREATE ON SCHEMA public TO spacebot_identity_owner;

    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
      FROM spacebot_identity_controller, spacebot_identity_owner;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
      FROM spacebot_identity_controller, spacebot_identity_owner;
    REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public
      FROM spacebot_identity_controller, spacebot_identity_owner;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL ON TABLES
      FROM spacebot_identity_controller, spacebot_identity_owner;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL ON SEQUENCES
      FROM spacebot_identity_controller, spacebot_identity_owner;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL ON FUNCTIONS
      FROM spacebot_identity_controller, spacebot_identity_owner;

    GRANT SELECT, INSERT ON public.agents TO spacebot_identity_owner;
    GRANT UPDATE (last_active) ON public.agents TO spacebot_identity_owner;
    GRANT SELECT, INSERT ON public.agent_credentials TO spacebot_identity_owner;
    GRANT UPDATE (last_used_at) ON public.agent_credentials
      TO spacebot_identity_owner;
    GRANT SELECT ON public.credential_security_denylist
      TO spacebot_identity_owner;
    GRANT SELECT, INSERT ON public.bot_profiles, public.bot_configs
      TO spacebot_identity_owner;
    GRANT SELECT, INSERT ON public.agent_browser_sessions
      TO spacebot_identity_owner;
    GRANT UPDATE (last_seen_at, expires_at, revoked_at, revocation_reason)
      ON public.agent_browser_sessions TO spacebot_identity_owner;
    GRANT INSERT ON public.resident_identity_session_receipts
      TO spacebot_identity_owner;
    GRANT EXECUTE ON FUNCTION public.crypt(text, text),
      public.gen_salt(text, integer) TO spacebot_identity_owner;

    ALTER FUNCTION public.spacebot_register_resident_v1(varchar, text, text)
      OWNER TO spacebot_identity_owner;
    ALTER FUNCTION public.spacebot_open_resident_session_v1(text, text, text)
      OWNER TO spacebot_identity_owner;
    ALTER FUNCTION public.spacebot_touch_resident_session_v1(text)
      OWNER TO spacebot_identity_owner;
    ALTER FUNCTION public.spacebot_rotate_resident_session_v1(text, text)
      OWNER TO spacebot_identity_owner;
    ALTER FUNCTION public.spacebot_revoke_resident_session_v1(text, varchar)
      OWNER TO spacebot_identity_owner;

    REVOKE ALL ON FUNCTION public.spacebot_register_resident_v1(
      varchar, text, text
    ) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.spacebot_open_resident_session_v1(
      text, text, text
    ) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.spacebot_touch_resident_session_v1(text)
      FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.spacebot_rotate_resident_session_v1(
      text, text
    ) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.spacebot_revoke_resident_session_v1(
      text, varchar
    ) FROM PUBLIC;

    GRANT EXECUTE ON FUNCTION public.spacebot_register_resident_v1(
      varchar, text, text
    ) TO spacebot_identity_controller;
    GRANT EXECUTE ON FUNCTION public.spacebot_open_resident_session_v1(
      text, text, text
    ) TO spacebot_identity_controller;
    GRANT EXECUTE ON FUNCTION public.spacebot_touch_resident_session_v1(text)
      TO spacebot_identity_controller;
    GRANT EXECUTE ON FUNCTION public.spacebot_rotate_resident_session_v1(
      text, text
    ) TO spacebot_identity_controller;
    GRANT EXECUTE ON FUNCTION public.spacebot_revoke_resident_session_v1(
      text, varchar
    ) TO spacebot_identity_controller;

    REVOKE ALL ON public.agent_browser_sessions
      FROM PUBLIC, spacebot_identity_controller;
    REVOKE ALL ON public.resident_identity_session_receipts
      FROM PUBLIC, spacebot_identity_controller;

    REVOKE CREATE ON SCHEMA public FROM spacebot_identity_owner;
  `);
  await client.unsafe(revokeOwnerFromAdmin);
}

async function inspect(client = sql) {
  const roles = await client`
    SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
           rolinherit, rolreplication, rolbypassrls,
           rolpassword IS NOT NULL AS password_set
    FROM pg_catalog.pg_authid
    WHERE rolname IN (${CONTROLLER_ROLE}, ${OWNER_ROLE})
  `;
  const controller = roles.find((role) => role.rolname === CONTROLLER_ROLE);
  const owner = roles.find((role) => role.rolname === OWNER_ROLE);
  const [proof] = await client`
    SELECT
      ${Boolean(controller)}::boolean AS controller_exists,
      ${Boolean(owner)}::boolean AS owner_exists,
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
        JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
        WHERE granted.rolname IN (${CONTROLLER_ROLE}, ${OWNER_ROLE})
           OR member.rolname IN (${CONTROLLER_ROLE}, ${OWNER_ROLE})
      ) AS roles_isolated,
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
          AND pg_catalog.has_table_privilege(
            ${CONTROLLER_ROLE}, relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
      ) AS controller_zero_relation_access
  `;
  const functions = await client`
    SELECT procedure.oid::regprocedure::text AS signature,
           procedure.prosecdef,
           owner.rolname AS owner,
           procedure.proconfig,
           pg_catalog.has_function_privilege(
             ${CONTROLLER_ROLE}, procedure.oid, 'EXECUTE'
           ) AS controller_execute,
           pg_catalog.has_function_privilege(
             'spacebot_runtime', procedure.oid, 'EXECUTE'
           ) AS runtime_execute,
           pg_catalog.has_function_privilege(
             'public', procedure.oid, 'EXECUTE'
           ) AS public_execute
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
    WHERE procedure.oid = ANY(${FUNCTION_SIGNATURES}::regprocedure[])
    ORDER BY signature
  `;
  const unexpectedFunctions = await client`
    SELECT procedure.oid::regprocedure::text AS signature
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.oid <> ALL(${FUNCTION_SIGNATURES}::regprocedure[])
      AND pg_catalog.has_function_privilege(
        ${CONTROLLER_ROLE}, procedure.oid, 'EXECUTE'
      )
  `;
  return {
    ...proof,
    controller_flags_exact:
      controller?.rolcanlogin === true &&
      controller?.rolsuper === false &&
      controller?.rolcreatedb === false &&
      controller?.rolcreaterole === false &&
      controller?.rolinherit === false &&
      controller?.rolreplication === false &&
      controller?.rolbypassrls === false &&
      controller?.password_set === true,
    owner_flags_exact:
      owner?.rolcanlogin === false &&
      owner?.rolsuper === false &&
      owner?.rolcreatedb === false &&
      owner?.rolcreaterole === false &&
      owner?.rolinherit === false &&
      owner?.rolreplication === false &&
      owner?.rolbypassrls === false &&
      owner?.password_set === false,
    function_count_exact: functions.length === FUNCTION_SIGNATURES.length,
    controller_function_allowlist_exact: unexpectedFunctions.length === 0,
    functions_exact: functions.every(
      (fn) =>
        fn.prosecdef === true &&
        fn.owner === OWNER_ROLE &&
        fn.controller_execute === true &&
        fn.runtime_execute === false &&
        fn.public_execute === false &&
        Array.isArray(fn.proconfig) &&
        fn.proconfig.includes("search_path=pg_catalog, pg_temp"),
    ),
  };
}

try {
  await assertTarget();
  if (apply) {
    await assertProvisioningAuthority();
    await assertRoleAndFunctionProvenance();
    await sql.begin(async (transaction) => {
      await transaction.unsafe("SET LOCAL lock_timeout = '10s'");
      await transaction.unsafe("SET LOCAL statement_timeout = '120s'");
      await provision(transaction);
      const state = await inspect(transaction);
      if (Object.values(state).some((value) => value !== true)) {
        throw new Error(`${ARTIFACT} post-provision proof failed`);
      }
    });
  }
  const state = await inspect();
  if (Object.values(state).some((value) => value !== true)) {
    throw new Error(`${ARTIFACT} identity controller role proof failed`);
  }
  console.log(
    JSON.stringify({
      artifact: ARTIFACT,
      verdict: "PASS",
      mode: apply ? "apply" : "check",
      migrationSha256,
      ...state,
    }),
  );
} finally {
  await sql.end({ timeout: 5 });
}
