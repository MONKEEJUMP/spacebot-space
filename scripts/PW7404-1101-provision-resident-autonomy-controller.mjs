import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const ARTIFACT = "PW7404-1101";
const ROLE = "spacebot_autonomy_controller";
const OWNER_ROLE = "spacebot_autonomy_owner";
const CONFIRMATION = "PW7404-1101";
const FACADE_SIGNATURE =
  "public.spacebot_mutate_resident_autonomy(text,character varying,bigint,character varying,jsonb)";
const PROHIBITED_ROLE_MEMBERSHIPS = [
  "service_role",
  "spacebot_runtime",
  "pw7404_task_maintenance",
];
const PROHIBITED_AUTONOMY_FUNCTIONS = [
  "spacebot_set_resident_autonomy_delegation",
  "spacebot_set_resident_autonomy_status",
  "spacebot_set_lucy_autonomy_mode",
  "spacebot_emergency_disable_lucy_autonomy",
];

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });

const supportedArguments = new Set(["--apply", "--check"]);
const unexpectedArguments = process.argv
  .slice(2)
  .filter((argument) => !supportedArguments.has(argument));
if (unexpectedArguments.length > 0) {
  throw new Error(`Unsupported argument: ${unexpectedArguments.join(", ")}`);
}

const apply = process.argv.includes("--apply");
if (apply && process.argv.includes("--check")) {
  throw new Error("Choose either --apply or --check");
}

const connectionString = process.env.SPACEBOT_ADMIN_DATABASE_URL;
if (!connectionString) {
  throw new Error("SPACEBOT_ADMIN_DATABASE_URL is required");
}
if (apply && process.env.SPACEBOT_APPLY_AUTONOMY_CONTROLLER !== CONFIRMATION) {
  throw new Error(
    `Set SPACEBOT_APPLY_AUTONOMY_CONTROLLER=${CONFIRMATION} before --apply`,
  );
}

const controllerPassword =
  process.env.SPACEBOT_AUTONOMY_CONTROLLER_DATABASE_PASSWORD;
if (
  apply &&
  (!controllerPassword ||
    controllerPassword.length < 32 ||
    controllerPassword.length > 128 ||
    /\s/.test(controllerPassword))
) {
  throw new Error(
    "Controller database password must contain 32-128 non-space characters",
  );
}

const caPath = process.env.SPACEBOT_DATABASE_CA_PATH;
if (!caPath) throw new Error("SPACEBOT_DATABASE_CA_PATH is required");
const ca = fs.readFileSync(caPath, "utf8");
const expectedCaSha256 = process.env.SPACEBOT_EXPECTED_DATABASE_CA_SHA256;
if (!expectedCaSha256 || !/^[0-9a-f]{64}$/i.test(expectedCaSha256)) {
  throw new Error(
    "SPACEBOT_EXPECTED_DATABASE_CA_SHA256 must be a SHA-256 hex digest",
  );
}
const caSha256 = crypto
  .createHash("sha256")
  .update(ca)
  .digest("hex")
  .toUpperCase();
if (caSha256 !== expectedCaSha256.toUpperCase()) {
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
  if (!value || /\s/.test(value)) {
    throw new Error(`Missing database ${name} guard`);
  }
}

const databaseUrl = new URL(connectionString);
if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
  throw new Error("SPACEBOT_ADMIN_DATABASE_URL must use PostgreSQL");
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
             SELECT 1 FROM public.agents
             WHERE id = ${guards.sentinel}::uuid
           ) AS sentinel
  `;
  for (const field of ["database", "user", "address", "port"]) {
    if (target?.[field] !== guards[field]) {
      throw new Error(`Database ${field} guard failed`);
    }
  }
  if (!target?.sentinel) throw new Error("Database sentinel guard failed");
}

async function assertAdminCanCreateRole() {
  const [admin] = await sql`
    SELECT rolsuper OR rolcreaterole AS can_create_role
    FROM pg_catalog.pg_roles
    WHERE rolname = current_user
  `;
  if (!admin?.can_create_role) {
    throw new Error(
      `${ARTIFACT} apply requires the expected admin user to have CREATEROLE; refusing service_role fallback`,
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
        WHERE rolname = 'spacebot_autonomy_controller'
      ) THEN
        CREATE ROLE spacebot_autonomy_controller;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'spacebot_autonomy_owner'
      ) THEN
        CREATE ROLE spacebot_autonomy_owner;
      END IF;
    END
    $pw7404_roles$;
  `);

  const alterController = await formattedDdl(
    client,
    "ALTER ROLE spacebot_autonomy_controller LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
    controllerPassword,
  );
  const resetDatabaseAcl = await formattedDdl(
    client,
    "REVOKE ALL PRIVILEGES ON DATABASE %I FROM spacebot_autonomy_controller",
    guards.database,
  );
  const grantConnect = await formattedDdl(
    client,
    "GRANT CONNECT ON DATABASE %I TO spacebot_autonomy_controller",
    guards.database,
  );
  const resetOwnerDatabaseAcl = await formattedDdl(
    client,
    "REVOKE ALL PRIVILEGES ON DATABASE %I FROM spacebot_autonomy_owner",
    guards.database,
  );
  const grantOwnerToAdmin = await formattedDdl(
    client,
    "GRANT spacebot_autonomy_owner TO %I",
    guards.user,
  );
  const revokeOwnerFromAdmin = await formattedDdl(
    client,
    "REVOKE spacebot_autonomy_owner FROM %I",
    guards.user,
  );

  await client.unsafe(alterController);
  await client.unsafe(`
    ALTER ROLE spacebot_autonomy_owner NOLOGIN PASSWORD NULL
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  `);
  await client.unsafe(resetDatabaseAcl);
  await client.unsafe(grantConnect);
  await client.unsafe(resetOwnerDatabaseAcl);

  await client.unsafe(`
    DO $pw7404_memberships$
    DECLARE
      managed_role text;
      granted_role record;
      member_role record;
    BEGIN
      FOREACH managed_role IN ARRAY ARRAY[
        'spacebot_autonomy_controller', 'spacebot_autonomy_owner'
      ]
      LOOP
        FOR granted_role IN
          SELECT role.rolname
          FROM pg_catalog.pg_auth_members AS membership
          JOIN pg_catalog.pg_roles AS role ON role.oid = membership.roleid
          JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
          WHERE member.rolname = managed_role
        LOOP
          EXECUTE pg_catalog.format(
            'REVOKE %I FROM %I', granted_role.rolname, managed_role
          );
        END LOOP;
        FOR member_role IN
          SELECT member.rolname
          FROM pg_catalog.pg_auth_members AS membership
          JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
          JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
          WHERE granted.rolname = managed_role
        LOOP
          EXECUTE pg_catalog.format(
            'REVOKE %I FROM %I', managed_role, member_role.rolname
          );
        END LOOP;
      END LOOP;
    END
    $pw7404_memberships$;
  `);
  await client.unsafe(grantOwnerToAdmin);

  await client.unsafe(`
    REVOKE ALL PRIVILEGES ON SCHEMA public
      FROM spacebot_autonomy_controller, spacebot_autonomy_owner;
    GRANT USAGE ON SCHEMA public
      TO spacebot_autonomy_controller, spacebot_autonomy_owner;
    GRANT CREATE ON SCHEMA public TO spacebot_autonomy_owner;

    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
      FROM spacebot_autonomy_controller, spacebot_autonomy_owner;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
      FROM spacebot_autonomy_controller, spacebot_autonomy_owner;
    REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public
      FROM spacebot_autonomy_controller, spacebot_autonomy_owner;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL PRIVILEGES ON TABLES
      FROM spacebot_autonomy_controller, spacebot_autonomy_owner;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL PRIVILEGES ON SEQUENCES
      FROM spacebot_autonomy_controller, spacebot_autonomy_owner;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL PRIVILEGES ON FUNCTIONS
      FROM spacebot_autonomy_controller, spacebot_autonomy_owner;

    DO $pw7404_owner_column_acl$
    DECLARE
      column_acl record;
    BEGIN
      FOR column_acl IN
        SELECT namespace.nspname, relation.relname, attribute.attname
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE namespace.nspname = 'public'
          AND grantee.rolname = 'spacebot_autonomy_owner'
      LOOP
        EXECUTE pg_catalog.format(
          'REVOKE ALL PRIVILEGES (%I) ON TABLE %I.%I FROM spacebot_autonomy_owner',
          column_acl.attname, column_acl.nspname, column_acl.relname
        );
      END LOOP;
    END
    $pw7404_owner_column_acl$;

    GRANT SELECT ON public.agents, public.agent_credentials,
      public.resident_autonomy_delegations,
      public.resident_autonomy_mutation_receipts
      TO spacebot_autonomy_owner;
    GRANT INSERT, UPDATE ON public.resident_autonomy_delegations
      TO spacebot_autonomy_owner;
    GRANT INSERT ON public.resident_autonomy_delegation_events,
      public.resident_autonomy_mutation_receipts
      TO spacebot_autonomy_owner;
    GRANT UPDATE (last_active) ON public.agents TO spacebot_autonomy_owner;
    GRANT UPDATE (last_used_at) ON public.agent_credentials
      TO spacebot_autonomy_owner;

    REVOKE ALL ON FUNCTION public.spacebot_mutate_resident_autonomy(
      text, varchar, bigint, varchar, jsonb
    ) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.spacebot_mutate_resident_autonomy(
      text, varchar, bigint, varchar, jsonb
    ) TO spacebot_autonomy_controller;

    ALTER FUNCTION public.spacebot_mutate_resident_autonomy(
      text, varchar, bigint, varchar, jsonb
    ) OWNER TO spacebot_autonomy_owner;
    REVOKE CREATE ON SCHEMA public FROM spacebot_autonomy_owner;
  `);
  await client.unsafe(revokeOwnerFromAdmin);
}

async function inspect(client = sql) {
  const roles = await client`
    SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
           rolinherit, rolreplication, rolbypassrls,
           rolpassword IS NOT NULL AS password_set
    FROM pg_catalog.pg_authid
    WHERE rolname IN (${ROLE}, ${OWNER_ROLE})
  `;
  const controller = roles.find((role) => role.rolname === ROLE);
  const owner = roles.find((role) => role.rolname === OWNER_ROLE);
  if (!controller || !owner) {
    return {
      controller_role_exists: Boolean(controller),
      controller_role_flags_exact: false,
      controller_password_set: false,
      owner_role_exists: Boolean(owner),
      owner_role_flags_exact: false,
      roles_isolated: false,
      controller_prohibited_memberships_denied: false,
      controller_connect_acl_exact: false,
      controller_schema_acl_exact: false,
      controller_zero_table_access: false,
      controller_zero_sequence_access: false,
      controller_default_acl_empty: false,
      owner_database_acl_empty: false,
      owner_schema_acl_exact: false,
      owner_table_acl_exact: false,
      owner_zero_sequence_access: false,
      owner_default_acl_empty: false,
      facade_secure: false,
      facade_owner_exact: false,
      controller_function_acl_exact: false,
      owner_function_scope_exact: false,
      prohibited_autonomy_execute_denied: false,
    };
  }

  const controllerRoleFlagsExact =
    controller.rolcanlogin === true &&
    controller.rolsuper === false &&
    controller.rolcreatedb === false &&
    controller.rolcreaterole === false &&
    controller.rolinherit === false &&
    controller.rolreplication === false &&
    controller.rolbypassrls === false;
  const ownerRoleFlagsExact =
    owner.rolcanlogin === false &&
    owner.rolsuper === false &&
    owner.rolcreatedb === false &&
    owner.rolcreaterole === false &&
    owner.rolinherit === false &&
    owner.rolreplication === false &&
    owner.rolbypassrls === false &&
    owner.password_set === false;

  const [membershipState] = await client`
    WITH RECURSIVE inherited_roles(roleid) AS (
      SELECT membership.roleid
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
      WHERE member.rolname = ${ROLE}
      UNION
      SELECT membership.roleid
      FROM pg_catalog.pg_auth_members AS membership
      JOIN inherited_roles ON inherited_roles.roleid = membership.member
    )
    SELECT
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
        JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
        WHERE member.rolname IN (${ROLE}, ${OWNER_ROLE})
           OR granted.rolname IN (${ROLE}, ${OWNER_ROLE})
      ) AS roles_isolated,
      NOT EXISTS (
        SELECT 1
        FROM inherited_roles
        JOIN pg_catalog.pg_roles AS inherited
          ON inherited.oid = inherited_roles.roleid
        WHERE inherited.rolname = ANY(${PROHIBITED_ROLE_MEMBERSHIPS}::text[])
      ) AS controller_prohibited_memberships_denied
  `;

  const [controllerAcl] = await client`
    SELECT
      pg_catalog.has_database_privilege(
        ${ROLE}, current_database(), 'CONNECT'
      ) AND (
        SELECT count(*) = 1
          AND bool_and(privilege.privilege_type = 'CONNECT')
          AND bool_and(NOT privilege.is_grantable)
        FROM pg_catalog.pg_database AS database
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
          database.datacl,
          pg_catalog.acldefault('d', database.datdba)
        )) AS privilege
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE database.datname = current_database()
          AND grantee.rolname = ${ROLE}
      ) AS controller_connect_acl_exact,
      pg_catalog.has_schema_privilege(${ROLE}, 'public', 'USAGE')
        AND NOT pg_catalog.has_schema_privilege(${ROLE}, 'public', 'CREATE')
        AND (
          SELECT count(*) = 1
            AND bool_and(privilege.privilege_type = 'USAGE')
            AND bool_and(NOT privilege.is_grantable)
          FROM pg_catalog.pg_namespace AS namespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
            namespace.nspacl,
            pg_catalog.acldefault('n', namespace.nspowner)
          )) AS privilege
          JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
          WHERE namespace.nspname = 'public'
            AND grantee.rolname = ${ROLE}
        ) AS controller_schema_acl_exact,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND (
            pg_catalog.has_table_privilege(${ROLE}, relation.oid, 'SELECT')
            OR pg_catalog.has_table_privilege(${ROLE}, relation.oid, 'INSERT')
            OR pg_catalog.has_table_privilege(${ROLE}, relation.oid, 'UPDATE')
            OR pg_catalog.has_table_privilege(${ROLE}, relation.oid, 'DELETE')
            OR pg_catalog.has_table_privilege(${ROLE}, relation.oid, 'TRUNCATE')
            OR pg_catalog.has_table_privilege(${ROLE}, relation.oid, 'REFERENCES')
            OR pg_catalog.has_table_privilege(${ROLE}, relation.oid, 'TRIGGER')
            OR pg_catalog.has_any_column_privilege(
              ${ROLE}, relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES'
            )
          )
      ) AS controller_zero_table_access,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS sequence
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = sequence.relnamespace
        WHERE namespace.nspname = 'public'
          AND sequence.relkind = 'S'
          AND (
            pg_catalog.has_sequence_privilege(${ROLE}, sequence.oid, 'USAGE')
            OR pg_catalog.has_sequence_privilege(${ROLE}, sequence.oid, 'SELECT')
            OR pg_catalog.has_sequence_privilege(${ROLE}, sequence.oid, 'UPDATE')
          )
      ) AS controller_zero_sequence_access,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_default_acl AS defaults
        CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS privilege
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE grantee.rolname = ${ROLE}
      ) AS controller_default_acl_empty
  `;

  const [ownerAcl] = await client`
    WITH expected(table_name, privilege_type) AS (
      VALUES
        ('agents', 'SELECT'),
        ('agent_credentials', 'SELECT'),
        ('resident_autonomy_delegations', 'SELECT'),
        ('resident_autonomy_delegations', 'INSERT'),
        ('resident_autonomy_delegations', 'UPDATE'),
        ('resident_autonomy_delegation_events', 'INSERT'),
        ('resident_autonomy_mutation_receipts', 'SELECT'),
        ('resident_autonomy_mutation_receipts', 'INSERT')
    ),
    expected_column_acl(table_name, column_name, privilege_type) AS (
      VALUES
        ('agents', 'last_active', 'UPDATE'),
        ('agent_credentials', 'last_used_at', 'UPDATE')
    ),
    direct_acl AS (
      SELECT relation.relname::text AS table_name,
             privilege.privilege_type,
             privilege.is_grantable
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )) AS privilege
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND grantee.rolname = ${OWNER_ROLE}
    ),
    direct_column_acl AS (
      SELECT relation.relname::text AS table_name,
             attribute.attname::text AS column_name,
             privilege.privilege_type,
             privilege.is_grantable
      FROM pg_catalog.pg_attribute AS attribute
      JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND grantee.rolname = ${OWNER_ROLE}
    ),
    effective_acl AS (
      SELECT relation.relname::text AS table_name,
             candidate.privilege_type
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL (
        VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
               ('REFERENCES'), ('TRIGGER')
      ) AS candidate(privilege_type)
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND pg_catalog.has_table_privilege(
          ${OWNER_ROLE}, relation.oid, candidate.privilege_type
        )
    )
    SELECT
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_database AS database
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
          database.datacl,
          pg_catalog.acldefault('d', database.datdba)
        )) AS privilege
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE database.datname = current_database()
          AND grantee.rolname = ${OWNER_ROLE}
      ) AS owner_database_acl_empty,
      pg_catalog.has_schema_privilege(${OWNER_ROLE}, 'public', 'USAGE')
        AND NOT pg_catalog.has_schema_privilege(${OWNER_ROLE}, 'public', 'CREATE')
        AND (
          SELECT count(*) = 1
            AND bool_and(privilege.privilege_type = 'USAGE')
            AND bool_and(NOT privilege.is_grantable)
          FROM pg_catalog.pg_namespace AS namespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
            namespace.nspacl,
            pg_catalog.acldefault('n', namespace.nspowner)
          )) AS privilege
          JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
          WHERE namespace.nspname = 'public'
            AND grantee.rolname = ${OWNER_ROLE}
        ) AS owner_schema_acl_exact,
      (SELECT count(*) = 8 FROM expected)
        AND NOT EXISTS (
          (SELECT table_name, privilege_type FROM direct_acl)
          EXCEPT
          (SELECT table_name, privilege_type FROM expected)
        )
        AND NOT EXISTS (
          (SELECT table_name, privilege_type FROM expected)
          EXCEPT
          (SELECT table_name, privilege_type FROM direct_acl)
        )
        AND NOT EXISTS (SELECT 1 FROM direct_acl WHERE is_grantable)
        AND NOT EXISTS (
          (SELECT table_name, privilege_type FROM effective_acl)
          EXCEPT
          (SELECT table_name, privilege_type FROM expected)
        )
        AND NOT EXISTS (
          (SELECT table_name, privilege_type FROM expected)
          EXCEPT
          (SELECT table_name, privilege_type FROM effective_acl)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_class AS relation
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          JOIN pg_catalog.pg_roles AS relation_owner
            ON relation_owner.oid = relation.relowner
          WHERE namespace.nspname = 'public'
            AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND relation_owner.rolname = ${OWNER_ROLE}
        )
        AND NOT EXISTS (
          (SELECT table_name, column_name, privilege_type FROM direct_column_acl)
          EXCEPT
          (SELECT table_name, column_name, privilege_type FROM expected_column_acl)
        )
        AND NOT EXISTS (
          (SELECT table_name, column_name, privilege_type FROM expected_column_acl)
          EXCEPT
          (SELECT table_name, column_name, privilege_type FROM direct_column_acl)
        )
        AND NOT EXISTS (
          SELECT 1 FROM direct_column_acl WHERE is_grantable
        ) AS owner_table_acl_exact,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS sequence
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = sequence.relnamespace
        WHERE namespace.nspname = 'public'
          AND sequence.relkind = 'S'
          AND (
            pg_catalog.has_sequence_privilege(${OWNER_ROLE}, sequence.oid, 'USAGE')
            OR pg_catalog.has_sequence_privilege(${OWNER_ROLE}, sequence.oid, 'SELECT')
            OR pg_catalog.has_sequence_privilege(${OWNER_ROLE}, sequence.oid, 'UPDATE')
          )
      ) AS owner_zero_sequence_access,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_default_acl AS defaults
        CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS privilege
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE grantee.rolname = ${OWNER_ROLE}
      ) AS owner_default_acl_empty
  `;

  const [functionState] = await client`
    WITH facade AS (
      SELECT pg_catalog.to_regprocedure(${FACADE_SIGNATURE}) AS oid
    )
    SELECT
      coalesce((
        SELECT procedure.prosecdef
          AND procedure.proconfig @> ARRAY[
            'search_path=pg_catalog, public'
          ]::text[]
          AND pg_catalog.pg_get_userbyid(procedure.proowner) = ${OWNER_ROLE}
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.aclexplode(coalesce(
              procedure.proacl,
              pg_catalog.acldefault('f', procedure.proowner)
            )) AS privilege
            WHERE privilege.grantee = 0
              AND privilege.privilege_type = 'EXECUTE'
          )
          AND pg_catalog.has_function_privilege(
            ${ROLE}, procedure.oid, 'EXECUTE'
          )
        FROM facade
        JOIN pg_catalog.pg_proc AS procedure ON procedure.oid = facade.oid
      ), false) AS facade_secure,
      (
        SELECT count(*) = 1 AND bool_and(procedure.oid = facade.oid)
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure.proowner
        CROSS JOIN facade
        WHERE owner_role.rolname = ${OWNER_ROLE}
      ) AS facade_owner_exact,
      (
        SELECT count(*) = 1
          AND bool_and(procedure.oid = facade.oid)
          AND bool_and(privilege.privilege_type = 'EXECUTE')
          AND bool_and(NOT privilege.is_grantable)
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN facade
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )) AS privilege
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE grantee.rolname = ${ROLE}
      ) AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
        WHERE owner.rolname = ${ROLE}
      ) AS controller_function_acl_exact,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN facade
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )) AS privilege
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE grantee.rolname = ${OWNER_ROLE}
          AND procedure.oid <> facade.oid
          AND privilege.privilege_type = 'EXECUTE'
      ) AS owner_function_scope_exact,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = procedure.pronamespace
        CROSS JOIN facade
        WHERE namespace.nspname = 'public'
          AND (
            procedure.proname = ANY(${PROHIBITED_AUTONOMY_FUNCTIONS}::text[])
            OR (
              procedure.proname = 'spacebot_mutate_resident_autonomy'
              AND procedure.oid <> facade.oid
            )
          )
          AND (
            pg_catalog.has_function_privilege(
              ${ROLE}, procedure.oid, 'EXECUTE'
            ) OR pg_catalog.has_function_privilege(
              ${OWNER_ROLE}, procedure.oid, 'EXECUTE'
            )
          )
      ) AS prohibited_autonomy_execute_denied
  `;

  return {
    controller_role_exists: true,
    controller_role_flags_exact: controllerRoleFlagsExact,
    controller_password_set: controller.password_set === true,
    owner_role_exists: true,
    owner_role_flags_exact: ownerRoleFlagsExact,
    ...membershipState,
    ...controllerAcl,
    ...ownerAcl,
    ...functionState,
  };
}

function isVerified(state) {
  return Object.values(state).every((value) => value === true);
}

try {
  await assertTarget();
  let state;
  if (apply) {
    await assertAdminCanCreateRole();
    await sql.begin(async (transaction) => {
      await transaction.unsafe("SET LOCAL lock_timeout = '5s'");
      await transaction.unsafe("SET LOCAL statement_timeout = '60s'");
      await transaction.unsafe("SET LOCAL search_path = pg_catalog, public");
      await provision(transaction);
      state = await inspect(transaction);
      if (!isVerified(state)) {
        const failedChecks = Object.entries(state)
          .filter(([, value]) => value !== true)
          .map(([name]) => name)
          .join(", ");
        throw new Error(
          `${ARTIFACT} post-apply ACL inspection failed (${failedChecks}); role changes rolled back`,
        );
      }
    });
  } else {
    state = await inspect();
  }

  const verified = isVerified(state);
  console.log(
    JSON.stringify({
      artifact: ARTIFACT,
      role: ROLE,
      mode: apply ? "apply" : "check",
      facade: FACADE_SIGNATURE,
      verified,
      state,
    }),
  );
  if (!verified) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
