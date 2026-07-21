import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const RUNTIME_CRUD_TABLES = [
  "channels",
  "posts",
  "comments",
  "votes",
  "follows",
  "human_comments",
  "subscriptions",
  "messages",
  "heartbeats",
  "humans",
  "human_audit_logs",
  "lab_bots",
  "lab_conversations",
  "lab_messages",
  "chat_conversations",
  "chat_messages",
  "lucy_cycles",
  "bot_activity",
  "bot_profile_history",
  "human_profiles",
  "zeus_conversations",
  "profile_transmissions",
  "top_eight",
  "blocked_users",
  "machine_posts",
  "machine_comments",
  "machine_votes",
  "machine_follows",
  "machine_notifications",
  "hermes_tasks",
  "hermes_runs",
  "hermes_actions",
  "hermes_artifacts",
  "hermes_approvals",
  "hermes_capability_grants",
  "hermes_audit_log",
  "bot_scores",
  "dorylus_queries",
  "dorylus_wingman_responses",
  "dorylus_errors",
  "dorylus_daily_stats",
  "ticker_headlines",
  "ticker_source_health",
];
const RUNTIME_READ_TABLES = [
  "agents",
  "agent_credentials",
  "agent_identity_aliases",
  "human_agent_links",
  "bot_profiles",
  "bot_configs",
  "agent_browser_sessions",
  ...RUNTIME_CRUD_TABLES,
];

const connectionString = process.env.SPACEBOT_ADMIN_DATABASE_URL;
if (!connectionString)
  throw new Error("SPACEBOT_ADMIN_DATABASE_URL is required");
const caPath = process.env.SPACEBOT_DATABASE_CA_PATH;
if (!caPath) throw new Error("SPACEBOT_DATABASE_CA_PATH is required");
const ca = fs.readFileSync(caPath, "utf8");
const actualCaSha256 = crypto
  .createHash("sha256")
  .update(ca)
  .digest("hex")
  .toUpperCase();
if (
  actualCaSha256 !==
  process.env.SPACEBOT_EXPECTED_DATABASE_CA_SHA256?.toUpperCase()
) {
  throw new Error("Pinned database CA fingerprint guard failed");
}

const apply = process.argv.includes("--apply");
if (apply && process.env.SPACEBOT_APPLY_DATABASE_ROLES !== "1") {
  throw new Error("Set SPACEBOT_APPLY_DATABASE_ROLES=1 before using --apply");
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
    throw new Error(`Set a whitespace-free SPACEBOT expected ${name} guard`);
  }
}

const runtimePassword = process.env.SPACEBOT_RUNTIME_DATABASE_PASSWORD;
const maintenancePassword =
  process.env.SPACEBOT_RESIDENT_TASK_MAINTENANCE_DATABASE_PASSWORD;
if (apply) {
  for (const [name, value] of [
    ["runtime", runtimePassword],
    ["maintenance", maintenancePassword],
  ]) {
    if (!value || value.length < 32 || value.length > 128 || /\s/.test(value)) {
      throw new Error(
        `${name} database password must contain 32-128 non-space characters`,
      );
    }
  }
}

const databaseUrl = new URL(connectionString);
if (databaseUrl.hostname !== guards.hostname) {
  throw new Error("Database hostname guard failed");
}
const verifiedUrl = new URL(databaseUrl);
verifiedUrl.searchParams.delete("sslmode");
const sql = postgres(verifiedUrl.toString(), {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  ssl: { rejectUnauthorized: true, ca, servername: guards.hostname },
});
let database = sql;

async function assertTarget() {
  const [target] = await database`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           EXISTS (SELECT 1 FROM agents WHERE id = ${guards.sentinel}::uuid) AS sentinel
  `;
  const mismatches = [];
  for (const field of ["database", "user", "address", "port"]) {
    if (target[field] !== guards[field]) mismatches.push(field);
  }
  if (!target.sentinel) mismatches.push("sentinel");
  if (mismatches.length > 0) {
    throw new Error(`Refusing wrong database target: ${mismatches.join(", ")}`);
  }
}

async function formattedDdl(format, value) {
  const [row] =
    await database`SELECT format(${format}::text, ${value}::text) AS statement`;
  return row.statement;
}

async function grantExistingTables(role, privileges, tables) {
  for (const table of tables) {
    const [{ present }] =
      await database`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS present`;
    if (!present) continue;
    const statement = await formattedDdl(
      `GRANT ${privileges} ON TABLE public.%I TO ${role}`,
      table,
    );
    await database.unsafe(statement);
  }
}

async function provision(managedRlsMode) {
  const [protectedBoundary] = await database`
    SELECT to_regclass('public.resident_autonomy_delegations') IS NOT NULL
             OR to_regclass('public.resident_autonomy_delegation_events') IS NOT NULL
             OR to_regclass('public.lucy_autonomy_runs') IS NOT NULL AS present
  `;
  if (protectedBoundary?.present) {
    throw new Error(
      "PW7404-1055 predates the LUCY least-privilege boundary and cannot be rerun after PW7404-1086",
    );
  }
  if (managedRlsMode) {
    throw new Error(
      "Refusing service_role delegation; managed RLS requires explicit runtime policies before role provisioning",
    );
  }

  await database.unsafe(`
    DO $pw7404_roles$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spacebot_runtime') THEN
        CREATE ROLE spacebot_runtime;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pw7404_task_maintenance') THEN
        CREATE ROLE pw7404_task_maintenance;
      END IF;
    END
    $pw7404_roles$;
  `);

  const runtimeAlter = await formattedDdl(
    "ALTER ROLE spacebot_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
    runtimePassword,
  );
  const maintenanceAlter = await formattedDdl(
    "ALTER ROLE pw7404_task_maintenance LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
    maintenancePassword,
  );
  const connectGrant = await formattedDdl(
    "GRANT CONNECT ON DATABASE %I TO spacebot_runtime, pw7404_task_maintenance",
    guards.database,
  );
  await database.unsafe(runtimeAlter);
  await database.unsafe(maintenanceAlter);
  await database.unsafe(connectGrant);

  const [serviceRole] = await database`
    SELECT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = 'service_role'
    ) AS present
  `;
  if (serviceRole?.present) {
    await database.unsafe(
      "REVOKE service_role FROM spacebot_runtime, pw7404_task_maintenance",
    );
  }

  await database.unsafe(`
    REVOKE pw7404_task_maintenance FROM spacebot_runtime;
    GRANT USAGE ON SCHEMA public TO spacebot_runtime, pw7404_task_maintenance;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM spacebot_runtime;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM spacebot_runtime;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM spacebot_runtime;
    DO $pw7404_runtime_column_acl$
    DECLARE column_acl record;
    BEGIN
      FOR column_acl IN
        SELECT namespace.nspname, relation.relname, attribute.attname
        FROM pg_attribute AS attribute
        JOIN pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege
        JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE namespace.nspname = 'public'
          AND grantee.rolname = 'spacebot_runtime'
      LOOP
        EXECUTE format(
          'REVOKE ALL PRIVILEGES (%I) ON TABLE %I.%I FROM spacebot_runtime',
          column_acl.attname, column_acl.nspname, column_acl.relname
        );
      END LOOP;
    END
    $pw7404_runtime_column_acl$;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL ON TABLES FROM spacebot_runtime;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL ON SEQUENCES FROM spacebot_runtime;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL ON FUNCTIONS FROM spacebot_runtime;

    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM pw7404_task_maintenance;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM pw7404_task_maintenance;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM pw7404_task_maintenance;
  `);

  await grantExistingTables("spacebot_runtime", "SELECT", RUNTIME_READ_TABLES);
  await grantExistingTables(
    "spacebot_runtime",
    "SELECT, INSERT, UPDATE, DELETE",
    RUNTIME_CRUD_TABLES,
  );
  await database.unsafe(`
    GRANT INSERT (name, api_key, api_key_hash, description, avatar_url, metadata)
      ON public.agents TO spacebot_runtime;
    GRANT UPDATE (last_heartbeat, last_active)
      ON public.agents TO spacebot_runtime;
    GRANT UPDATE (last_used_at)
      ON public.agent_credentials TO spacebot_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      agents, agent_credentials, bot_profiles, bot_configs, bot_activity,
      bot_profile_history
      TO pw7404_task_maintenance;
  `);

  const [tasks] = await database`
    SELECT to_regclass('public.resident_tasks') IS NOT NULL AS tasks,
           to_regclass('public.resident_task_events') IS NOT NULL AS events
  `;
  if (tasks.tasks || tasks.events) {
    if (!tasks.tasks || !tasks.events) {
      throw new Error("Resident task schema is partially present");
    }
    await database.unsafe(`
      GRANT SELECT, INSERT, UPDATE ON resident_tasks TO spacebot_runtime;
      REVOKE DELETE ON resident_tasks FROM spacebot_runtime;
      GRANT SELECT, INSERT ON resident_task_events TO spacebot_runtime;
      REVOKE UPDATE, DELETE ON resident_task_events FROM spacebot_runtime;
      GRANT SELECT, INSERT, UPDATE, DELETE ON resident_tasks, resident_task_events
        TO pw7404_task_maintenance;
    `);
  }

  if (managedRlsMode) {
    const maintenanceTables = [
      "agents",
      "agent_credentials",
      "bot_profiles",
      "bot_configs",
      "bot_activity",
      "bot_profile_history",
      ...(tasks.tasks ? ["resident_tasks", "resident_task_events"] : []),
    ];
    for (const table of maintenanceTables) {
      const [policyDdl] = await database`
        SELECT format('DROP POLICY IF EXISTS pw7404_task_maintenance_all ON %I', ${table}::text) AS drop_statement,
               format(
                 'CREATE POLICY pw7404_task_maintenance_all ON %I FOR ALL TO pw7404_task_maintenance USING (true) WITH CHECK (true)',
                 ${table}::text
               ) AS create_statement
      `;
      await database.unsafe(policyDdl.drop_statement);
      await database.unsafe(policyDdl.create_statement);
    }
  }
}

async function inspect(managedRlsMode) {
  const roles = await database`
    SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit,
           rolreplication, rolbypassrls, rolcanlogin
    FROM pg_roles
    WHERE rolname IN ('spacebot_runtime', 'pw7404_task_maintenance')
    ORDER BY rolname
  `;
  const failures = [];
  for (const name of ["spacebot_runtime", "pw7404_task_maintenance"]) {
    const role = roles.find((candidate) => candidate.rolname === name);
    if (!role) {
      failures.push(`missing-role:${name}`);
      continue;
    }
    if (
      role.rolsuper ||
      role.rolcreatedb ||
      role.rolcreaterole ||
      role.rolinherit ||
      role.rolreplication ||
      role.rolbypassrls ||
      !role.rolcanlogin
    ) {
      failures.push(`unsafe-role-flags:${name}`);
    }
  }

  const [privileges] = await database`
    SELECT
      has_schema_privilege('spacebot_runtime', 'public', 'USAGE') AS runtime_schema,
      has_table_privilege('spacebot_runtime', 'agents', 'SELECT')
        AND NOT has_table_privilege('spacebot_runtime', 'agents', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'agents', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'agents', 'DELETE')
        AND has_column_privilege('spacebot_runtime', 'agents', 'name', 'INSERT')
        AND has_column_privilege('spacebot_runtime', 'agents', 'last_active', 'UPDATE')
        AND NOT has_column_privilege('spacebot_runtime', 'agents', 'moderation_status', 'UPDATE')
        AND NOT has_column_privilege('spacebot_runtime', 'agents', 'is_claimed', 'UPDATE')
        AS runtime_agents,
      has_schema_privilege('pw7404_task_maintenance', 'public', 'USAGE') AS maintenance_schema,
      has_table_privilege('pw7404_task_maintenance', 'agents', 'SELECT')
        AND has_table_privilege('pw7404_task_maintenance', 'agents', 'INSERT')
        AND has_table_privilege('pw7404_task_maintenance', 'agents', 'UPDATE')
        AND has_table_privilege('pw7404_task_maintenance', 'agents', 'DELETE') AS maintenance_agents,
      NOT EXISTS (
        SELECT 1
        FROM pg_auth_members AS membership
        JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
        JOIN pg_roles AS member_role ON member_role.oid = membership.member
        WHERE granted_role.rolname IN (
          'spacebot_runtime', 'pw7404_task_maintenance'
        ) OR member_role.rolname IN (
          'spacebot_runtime', 'pw7404_task_maintenance'
        )
      ) AS isolated_role_graph,
      CASE WHEN ${managedRlsMode} THEN (
        SELECT count(*) = CASE
          WHEN to_regclass('public.resident_tasks') IS NULL THEN 6 ELSE 8
        END
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname = 'pw7404_task_maintenance_all'
      ) ELSE true END AS maintenance_policies,
      NOT has_table_privilege('pw7404_task_maintenance', 'humans', 'UPDATE') AS maintenance_scope,
      NOT has_table_privilege('spacebot_runtime', 'agent_credentials', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'agent_credentials', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'agent_credentials', 'DELETE')
        AND has_column_privilege('spacebot_runtime', 'agent_credentials', 'last_used_at', 'UPDATE')
        AND NOT has_column_privilege('spacebot_runtime', 'agent_credentials', 'verifier_hash', 'UPDATE')
        AS runtime_credentials,
      NOT has_table_privilege('spacebot_runtime', 'human_agent_links', 'INSERT,UPDATE,DELETE')
        AND NOT has_table_privilege('spacebot_runtime', 'agent_identity_aliases', 'INSERT,UPDATE,DELETE')
        AND NOT has_table_privilege('spacebot_runtime', 'bot_profiles', 'INSERT,UPDATE,DELETE')
        AND NOT has_table_privilege('spacebot_runtime', 'bot_configs', 'INSERT,UPDATE,DELETE')
        AS runtime_identity_writes_denied,
      NOT EXISTS (
        SELECT 1 FROM pg_proc AS procedure
        CROSS JOIN LATERAL aclexplode(coalesce(
          procedure.proacl, acldefault('f', procedure.proowner)
        )) AS privilege
        JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE grantee.rolname = 'spacebot_runtime'
          AND privilege.privilege_type = 'EXECUTE'
      ) AS runtime_direct_function_acl_empty,
      CASE WHEN to_regclass('public.resident_tasks') IS NULL THEN true ELSE
        has_table_privilege('spacebot_runtime', 'resident_tasks', 'SELECT')
        AND has_table_privilege('spacebot_runtime', 'resident_tasks', 'INSERT')
        AND has_table_privilege('spacebot_runtime', 'resident_tasks', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'resident_tasks', 'DELETE')
      END AS runtime_tasks,
      CASE WHEN to_regclass('public.resident_task_events') IS NULL THEN true ELSE
        has_table_privilege('spacebot_runtime', 'resident_task_events', 'SELECT')
        AND has_table_privilege('spacebot_runtime', 'resident_task_events', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'resident_task_events', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'resident_task_events', 'DELETE')
      END AS runtime_events,
      CASE WHEN to_regclass('public.resident_tasks') IS NULL THEN true ELSE
        has_table_privilege('pw7404_task_maintenance', 'resident_tasks', 'SELECT')
        AND has_table_privilege('pw7404_task_maintenance', 'resident_tasks', 'INSERT')
        AND has_table_privilege('pw7404_task_maintenance', 'resident_tasks', 'UPDATE')
        AND has_table_privilege('pw7404_task_maintenance', 'resident_tasks', 'DELETE')
        AND has_table_privilege('pw7404_task_maintenance', 'resident_task_events', 'SELECT')
        AND has_table_privilege('pw7404_task_maintenance', 'resident_task_events', 'INSERT')
        AND has_table_privilege('pw7404_task_maintenance', 'resident_task_events', 'UPDATE')
        AND has_table_privilege('pw7404_task_maintenance', 'resident_task_events', 'DELETE')
      END AS maintenance_tasks
  `;
  for (const [name, value] of Object.entries(privileges)) {
    if (!value) failures.push(`privilege:${name}`);
  }
  if (failures.length > 0) {
    throw new Error(
      `PW7404-1055 database role check failed: ${failures.join(", ")}`,
    );
  }
  return roles;
}

try {
  await assertTarget();
  const [adminRole] = await sql`
    SELECT rolsuper FROM pg_roles WHERE rolname = current_user
  `;
  const managedRlsMode = !adminRole?.rolsuper;
  let roles;
  if (apply) {
    roles = await sql.begin(async (transaction) => {
      database = transaction;
      await transaction.unsafe("SET LOCAL lock_timeout = '5s'");
      await transaction.unsafe("SET LOCAL statement_timeout = '60s'");
      await provision(managedRlsMode);
      return inspect(managedRlsMode);
    });
    database = sql;
  } else {
    roles = await inspect(managedRlsMode);
  }
  console.log(
    `PW7404-1055 database roles: PASS (${apply ? "apply" : "check"}; mode=${
      managedRlsMode ? "managed-service-role" : "direct-bypassrls"
    }; roles=${roles.length})`,
  );
} finally {
  database = sql;
  await sql.end({ timeout: 5 });
}
