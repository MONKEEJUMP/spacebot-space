import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const RECEIPT = "PW7404-1063 agent browser sessions";
const AUTHORIZATION_ENV = "SPACEBOT_APPLY_AGENT_BROWSER_SESSIONS";
const TABLE = "agent_browser_sessions";
const CREDENTIAL_INDEX = "agent_credentials_id_agent_unique_idx";

const EXPECTED_COLUMNS = Object.freeze([
  ["id", "uuid", true, "gen_random_uuid()"],
  ["agent_id", "uuid", true, null],
  ["credential_id", "uuid", true, null],
  ["token_hash", "character varying(64)", true, null],
  ["expires_at", "timestamp with time zone", true, null],
  ["last_seen_at", "timestamp with time zone", true, "now()"],
  ["revoked_at", "timestamp with time zone", false, null],
  ["revocation_reason", "character varying(40)", false, null],
  ["created_at", "timestamp with time zone", true, "now()"],
]);

const EXPECTED_CONSTRAINTS = Object.freeze([
  "agent_browser_sessions_pkey",
  "agent_browser_sessions_agent_id_agents_id_fk",
  "agent_browser_sessions_credential_agent_fk",
  "agent_browser_sessions_token_hash_check",
  "agent_browser_sessions_expiry_check",
  "agent_browser_sessions_chronology_check",
  "agent_browser_sessions_revocation_pair_check",
]);

const EXPECTED_INDEXES = Object.freeze([
  "agent_browser_sessions_pkey",
  "agent_browser_sessions_token_hash_unique_idx",
  "agent_browser_sessions_one_active_agent_idx",
  "agent_browser_sessions_credential_active_idx",
  "agent_browser_sessions_expires_idx",
]);

const SESSION_ARTIFACTS = Object.freeze([
  ...new Set([...EXPECTED_CONSTRAINTS, ...EXPECTED_INDEXES]),
]);

class SafeMigrationError extends Error {}

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const argumentsList = process.argv.slice(2);
const apply = argumentsList.includes("--apply");
const explicitCheck = argumentsList.includes("--check");
const connectionString =
  process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL;
const targetGuards = {
  database: process.env.SPACEBOT_EXPECTED_DATABASE,
  user: process.env.SPACEBOT_EXPECTED_DATABASE_USER,
  address: process.env.SPACEBOT_EXPECTED_SERVER_ADDRESS,
  port: process.env.SPACEBOT_EXPECTED_SERVER_PORT,
  sentinel: process.env.SPACEBOT_EXPECTED_SENTINEL_AGENT_ID,
};

function validateStartupConfiguration() {
  if (
    argumentsList.some(
      (argument) => argument !== "--apply" && argument !== "--check",
    ) ||
    new Set(argumentsList).size !== argumentsList.length ||
    (apply && explicitCheck)
  ) {
    throw new SafeMigrationError("Use exactly one of --check or --apply");
  }
  if (apply && process.env[AUTHORIZATION_ENV] !== "1") {
    throw new SafeMigrationError(
      `Set ${AUTHORIZATION_ENV}=1 before using --apply`,
    );
  }
  if (!connectionString) {
    throw new SafeMigrationError(
      "SPACEBOT_DATABASE_URL or DATABASE_URL is required",
    );
  }
  for (const [name, value] of Object.entries(targetGuards)) {
    if (!value || /\s/.test(value)) {
      throw new SafeMigrationError(
        `Set a whitespace-free SPACEBOT expected ${name} guard`,
      );
    }
  }
  if (targetGuards.port !== "local" && !/^\d+$/.test(targetGuards.port)) {
    throw new SafeMigrationError(
      "SPACEBOT_EXPECTED_SERVER_PORT must be numeric or local",
    );
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      targetGuards.sentinel,
    )
  ) {
    throw new SafeMigrationError(
      "SPACEBOT_EXPECTED_SENTINEL_AGENT_ID must be a UUID",
    );
  }
}

function createSqlClient() {
  return postgres(connectionString, {
    ...(process.env.SPACEBOT_DATABASE_HOST
      ? { host: process.env.SPACEBOT_DATABASE_HOST }
      : {}),
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
  });
}

function canonicalDefault(value) {
  return String(value ?? "")
    .replace(/::[a-z ]+(\[\])?/gi, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function canonicalExpression(value) {
  return String(value ?? "")
    .replace(/interval\s*'30 minutes'/gi, "'00:30:00'")
    .replace(/'00:30:00'::interval/gi, "'00:30:00'")
    .replace(/::(?:text|character varying|timestamp with time zone)/gi, "")
    .replace(/[()"\s]/g, "")
    .toLowerCase();
}

function canonicalPredicate(value) {
  return canonicalExpression(value);
}

function sameArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

async function assertExpectedTarget(connection) {
  const [target] = await connection`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port
  `;
  const mismatches = [];
  for (const field of ["database", "user", "address", "port"]) {
    if (target?.[field] !== targetGuards[field]) mismatches.push(field);
  }
  if (mismatches.length > 0) {
    throw new SafeMigrationError(
      `Refusing wrong database target; mismatched guards: ${mismatches.join(
        ", ",
      )}`,
    );
  }

  const [prerequisites] = await connection`
    SELECT to_regclass('public.agents') IS NOT NULL AS agents,
           to_regclass('public.agent_credentials') IS NOT NULL AS credentials,
           EXISTS (
             SELECT 1 FROM pg_roles WHERE rolname = 'spacebot_runtime'
           ) AS runtime_role,
           EXISTS (
             SELECT 1 FROM pg_roles WHERE rolname = 'pw7404_task_maintenance'
           ) AS maintenance_role
  `;
  if (
    prerequisites?.agents !== true ||
    prerequisites?.credentials !== true ||
    prerequisites?.runtime_role !== true ||
    prerequisites?.maintenance_role !== true
  ) {
    throw new SafeMigrationError(
      "Required identity tables or database roles are missing",
    );
  }
  const [sentinel] = await connection`
    SELECT EXISTS (
      SELECT 1 FROM public.agents
      WHERE id = ${targetGuards.sentinel}::uuid
    ) AS present
  `;
  if (sentinel?.present !== true) {
    throw new SafeMigrationError(
      "Refusing wrong database target; mismatched guards: sentinel",
    );
  }
}

async function inspectCredentialIndex(connection) {
  const indexes = await connection`
    SELECT namespace.nspname AS schema_name,
           table_class.relname AS table_name,
           index_class.relname AS name,
           access_method.amname AS method,
           index_row.indisvalid,
           index_row.indisready,
           index_row.indisunique,
           index_row.indisprimary,
           index_row.indnkeyatts,
           index_row.indnatts,
           pg_get_expr(index_row.indpred, index_row.indrelid, true) AS predicate,
           ARRAY(
             SELECT pg_get_indexdef(index_row.indexrelid, key_number, true)
             FROM generate_series(1, index_row.indnkeyatts) AS key_number
             ORDER BY key_number
           ) AS keys
    FROM pg_class AS index_class
    JOIN pg_namespace AS namespace ON namespace.oid = index_class.relnamespace
    LEFT JOIN pg_index AS index_row ON index_row.indexrelid = index_class.oid
    LEFT JOIN pg_class AS table_class ON table_class.oid = index_row.indrelid
    LEFT JOIN pg_am AS access_method ON access_method.oid = index_class.relam
    WHERE namespace.nspname = 'public'
      AND index_class.relname = ${CREDENTIAL_INDEX}
  `;
  if (indexes.length === 0) return { kind: "missing" };
  if (indexes.length !== 1) return { kind: "partial" };
  const index = indexes[0];
  const exact =
    index.table_name === "agent_credentials" &&
    index.method === "btree" &&
    index.indisvalid === true &&
    index.indisready === true &&
    index.indisunique === true &&
    index.indisprimary === false &&
    index.indnkeyatts === 2 &&
    index.indnatts === 2 &&
    index.predicate === null &&
    sameArray(index.keys, ["id", "agent_id"]);
  return { kind: exact ? "complete" : "partial" };
}

async function inspectTableShape(connection) {
  const [table] = await connection`
    SELECT table_class.relkind,
           table_class.relpersistence,
           table_class.relrowsecurity,
           table_class.relforcerowsecurity,
           owner_role.rolname AS owner
    FROM pg_class AS table_class
    JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
    JOIN pg_roles AS owner_role ON owner_role.oid = table_class.relowner
    WHERE namespace.nspname = 'public'
      AND table_class.relname = ${TABLE}
  `;
  if (!table) return { present: false, exact: false, owner: null };
  return {
    present: true,
    owner: table.owner,
    relkind: table.relkind,
    persistence: table.relpersistence,
    rowSecurity: table.relrowsecurity,
    forceRowSecurity: table.relforcerowsecurity,
    exact:
      table.relkind === "r" &&
      table.relpersistence === "p" &&
      table.relrowsecurity === false &&
      table.relforcerowsecurity === false &&
      table.owner === targetGuards.user,
  };
}

async function findCollidingArtifacts(connection) {
  const [collisions] = await connection`
    SELECT
      (SELECT count(*)::int
       FROM pg_class AS artifact
       JOIN pg_namespace AS namespace ON namespace.oid = artifact.relnamespace
       WHERE namespace.nspname = 'public'
         AND artifact.relname = ANY(${SESSION_ARTIFACTS}::text[])) AS relations,
      (SELECT count(*)::int
       FROM pg_constraint AS constraint_row
       JOIN pg_namespace AS namespace
         ON namespace.oid = constraint_row.connamespace
       WHERE namespace.nspname = 'public'
         AND constraint_row.conname = ANY(${EXPECTED_CONSTRAINTS}::text[]))
        AS constraints
  `;
  return collisions.relations + collisions.constraints;
}

async function duplicateCredentialPairCount(connection) {
  const [row] = await connection`
    SELECT count(*)::int AS count
    FROM (
      SELECT id, agent_id
      FROM public.agent_credentials
      GROUP BY id, agent_id
      HAVING count(*) > 1
    ) AS duplicates
  `;
  return row.count;
}

async function inspectColumns(connection) {
  const columns = await connection`
    SELECT attribute.attnum,
           attribute.attname,
           format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
           attribute.attnotnull,
           attribute.attidentity,
           attribute.attgenerated,
           pg_get_expr(default_row.adbin, default_row.adrelid) AS column_default
    FROM pg_attribute AS attribute
    LEFT JOIN pg_attrdef AS default_row
      ON default_row.adrelid = attribute.attrelid
     AND default_row.adnum = attribute.attnum
    WHERE attribute.attrelid = 'public.agent_browser_sessions'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    ORDER BY attribute.attnum
  `;
  const failures = [];
  if (columns.length !== EXPECTED_COLUMNS.length) failures.push("column-count");
  EXPECTED_COLUMNS.forEach((expected, index) => {
    const [name, dataType, notNull, columnDefault] = expected;
    const column = columns[index];
    if (!column || column.attnum !== index + 1 || column.attname !== name) {
      failures.push(`column-order:${name}`);
      return;
    }
    if (column.data_type !== dataType) failures.push(`column-type:${name}`);
    if (column.attnotnull !== notNull)
      failures.push(`column-nullability:${name}`);
    if (column.attidentity !== "" || column.attgenerated !== "") {
      failures.push(`column-generation:${name}`);
    }
    if (
      canonicalDefault(column.column_default) !==
      canonicalDefault(columnDefault)
    ) {
      failures.push(`column-default:${name}`);
    }
  });
  return failures;
}

async function inspectConstraints(connection) {
  const constraints = await connection`
    SELECT constraint_row.conname,
           constraint_row.contype,
           constraint_row.convalidated,
           constraint_row.condeferrable,
           constraint_row.condeferred,
           constraint_row.confupdtype,
           constraint_row.confdeltype,
           referenced_namespace.nspname AS referenced_schema,
           referenced_table.relname AS referenced_table,
           ARRAY(
             SELECT attribute.attname
             FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, position)
             JOIN pg_attribute AS attribute
               ON attribute.attrelid = constraint_row.conrelid
              AND attribute.attnum = key.attnum
             ORDER BY key.position
           ) AS local_columns,
           ARRAY(
             SELECT attribute.attname
             FROM unnest(constraint_row.confkey) WITH ORDINALITY AS key(attnum, position)
             JOIN pg_attribute AS attribute
               ON attribute.attrelid = constraint_row.confrelid
              AND attribute.attnum = key.attnum
             ORDER BY key.position
           ) AS referenced_columns,
           pg_get_expr(
             constraint_row.conbin,
             constraint_row.conrelid,
             true
           ) AS check_expression
    FROM pg_constraint AS constraint_row
    LEFT JOIN pg_class AS referenced_table
      ON referenced_table.oid = constraint_row.confrelid
    LEFT JOIN pg_namespace AS referenced_namespace
      ON referenced_namespace.oid = referenced_table.relnamespace
    WHERE constraint_row.conrelid = 'public.agent_browser_sessions'::regclass
    ORDER BY constraint_row.conname
  `;
  const failures = [];
  const names = constraints.map((row) => row.conname).sort();
  if (!sameArray(names, [...EXPECTED_CONSTRAINTS].sort())) {
    failures.push("constraint-set");
  }
  const byName = new Map(constraints.map((row) => [row.conname, row]));
  const exactBase = (name, type, localColumns) => {
    const row = byName.get(name);
    return (
      row?.contype === type &&
      row.convalidated === true &&
      row.condeferrable === false &&
      row.condeferred === false &&
      sameArray(row.local_columns, localColumns)
    );
  };
  if (!exactBase("agent_browser_sessions_pkey", "p", ["id"])) {
    failures.push("constraint:pkey");
  }
  for (const [name, localColumns, referencedTable, referencedColumns] of [
    [
      "agent_browser_sessions_agent_id_agents_id_fk",
      ["agent_id"],
      "agents",
      ["id"],
    ],
    [
      "agent_browser_sessions_credential_agent_fk",
      ["credential_id", "agent_id"],
      "agent_credentials",
      ["id", "agent_id"],
    ],
  ]) {
    const row = byName.get(name);
    if (
      !exactBase(name, "f", localColumns) ||
      row?.referenced_schema !== "public" ||
      row?.referenced_table !== referencedTable ||
      !sameArray(row?.referenced_columns, referencedColumns) ||
      row?.confupdtype !== "a" ||
      row?.confdeltype !== "c"
    ) {
      failures.push(`constraint:${name}`);
    }
  }
  const expectedChecks = new Map([
    [
      "agent_browser_sessions_token_hash_check",
      "token_hash ~ '^[0-9a-f]{64}$'",
    ],
    [
      "agent_browser_sessions_expiry_check",
      "expires_at > created_at AND expires_at <= created_at + interval '30 minutes'",
    ],
    [
      "agent_browser_sessions_chronology_check",
      "last_seen_at >= created_at AND last_seen_at <= expires_at AND (revoked_at IS NULL OR revoked_at >= created_at)",
    ],
    [
      "agent_browser_sessions_revocation_pair_check",
      "(revoked_at IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)",
    ],
  ]);
  for (const [name, expression] of expectedChecks) {
    const row = byName.get(name);
    if (
      !exactBase(name, "c", row?.local_columns ?? []) ||
      canonicalExpression(row?.check_expression) !==
        canonicalExpression(expression)
    ) {
      failures.push(`constraint:${name}`);
    }
  }
  return failures;
}

async function inspectIndexes(connection) {
  const indexes = await connection`
    SELECT index_class.relname AS name,
           access_method.amname AS method,
           index_row.indisvalid,
           index_row.indisready,
           index_row.indisunique,
           index_row.indisprimary,
           index_row.indnkeyatts,
           index_row.indnatts,
           pg_get_expr(index_row.indpred, index_row.indrelid, true) AS predicate,
           ARRAY(
             SELECT pg_get_indexdef(index_row.indexrelid, key_number, true)
             FROM generate_series(1, index_row.indnkeyatts) AS key_number
             ORDER BY key_number
           ) AS keys
    FROM pg_index AS index_row
    JOIN pg_class AS index_class ON index_class.oid = index_row.indexrelid
    JOIN pg_am AS access_method ON access_method.oid = index_class.relam
    WHERE index_row.indrelid = 'public.agent_browser_sessions'::regclass
    ORDER BY index_class.relname
  `;
  const failures = [];
  const names = indexes.map((row) => row.name).sort();
  if (!sameArray(names, [...EXPECTED_INDEXES].sort())) {
    failures.push("index-set");
  }
  const byName = new Map(indexes.map((row) => [row.name, row]));
  const expected = [
    ["agent_browser_sessions_pkey", ["id"], true, true, null],
    [
      "agent_browser_sessions_token_hash_unique_idx",
      ["token_hash"],
      true,
      false,
      null,
    ],
    [
      "agent_browser_sessions_one_active_agent_idx",
      ["agent_id"],
      true,
      false,
      "revoked_at IS NULL",
    ],
    [
      "agent_browser_sessions_credential_active_idx",
      ["credential_id"],
      false,
      false,
      "revoked_at IS NULL",
    ],
    [
      "agent_browser_sessions_expires_idx",
      ["expires_at"],
      false,
      false,
      "revoked_at IS NULL",
    ],
  ];
  for (const [name, keys, unique, primary, predicate] of expected) {
    const row = byName.get(name);
    if (
      row?.method !== "btree" ||
      row.indisvalid !== true ||
      row.indisready !== true ||
      row.indisunique !== unique ||
      row.indisprimary !== primary ||
      row.indnkeyatts !== keys.length ||
      row.indnatts !== keys.length ||
      !sameArray(row.keys, keys) ||
      canonicalPredicate(row.predicate) !== canonicalPredicate(predicate)
    ) {
      failures.push(`index:${name}`);
    }
  }
  return failures;
}

async function inspectPrivileges(connection, tableOwner) {
  const [roles] = await connection`
    SELECT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = 'service_role'
    ) AS service_role,
    EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = 'pw7404_task_maintenance'
    ) AS maintenance_role
  `;
  const runtimeGrantees = [
    "spacebot_runtime",
    ...(roles.service_role ? ["service_role"] : []),
  ];
  const maintenanceGrantees = roles.maintenance_role
    ? ["pw7404_task_maintenance"]
    : [];
  const expectedGrantees = [...runtimeGrantees, ...maintenanceGrantees];
  const acl = await connection`
    SELECT CASE WHEN exploded.grantee = 0
                  THEN 'PUBLIC'
                ELSE grantee_role.rolname
           END AS grantee,
           exploded.privilege_type,
           exploded.is_grantable
    FROM pg_class AS table_class
    CROSS JOIN LATERAL aclexplode(coalesce(
      table_class.relacl,
      acldefault('r', table_class.relowner)
    )) AS exploded
    LEFT JOIN pg_roles AS grantee_role ON grantee_role.oid = exploded.grantee
    WHERE table_class.oid = 'public.agent_browser_sessions'::regclass
  `;
  const columnAcl = await connection`
    SELECT attribute.attname AS column_name,
           CASE WHEN exploded.grantee = 0
                  THEN 'PUBLIC'
                ELSE grantee_role.rolname
           END AS grantee,
           exploded.privilege_type,
           exploded.is_grantable
    FROM pg_class AS table_class
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = table_class.oid
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    CROSS JOIN LATERAL aclexplode(attribute.attacl) AS exploded
    LEFT JOIN pg_roles AS grantee_role ON grantee_role.oid = exploded.grantee
    WHERE table_class.oid = 'public.agent_browser_sessions'::regclass
  `;
  const failures = [];
  const allowed = new Set([tableOwner, ...expectedGrantees]);
  for (const row of acl) {
    if (!allowed.has(row.grantee)) {
      failures.push(`privilege:unexpected-grantee:${row.grantee ?? "unknown"}`);
    }
    if (row.grantee !== tableOwner && row.is_grantable === true) {
      failures.push(`privilege:grant-option:${row.grantee}`);
    }
  }
  const expectedPrivileges = ["INSERT", "SELECT"];
  const expectedColumnPrivileges = [
    "last_seen_at:UPDATE",
    "revocation_reason:UPDATE",
    "revoked_at:UPDATE",
  ];
  for (const grantee of expectedGrantees) {
    if (grantee === tableOwner) continue;
    const actual = acl
      .filter((row) => row.grantee === grantee)
      .map((row) => row.privilege_type)
      .sort();
    const expectedTablePrivileges = maintenanceGrantees.includes(grantee)
      ? ["DELETE", "SELECT"]
      : expectedPrivileges;
    if (!sameArray(actual, expectedTablePrivileges)) {
      failures.push(`privilege:${grantee}`);
    }
    const actualColumns = columnAcl
      .filter((row) => row.grantee === grantee)
      .map((row) => `${row.column_name}:${row.privilege_type}`)
      .sort();
    const expectedColumns = maintenanceGrantees.includes(grantee)
      ? []
      : expectedColumnPrivileges;
    if (!sameArray(actualColumns, expectedColumns)) {
      failures.push(`column-privilege:${grantee}`);
    }
  }
  for (const row of columnAcl) {
    if (!allowed.has(row.grantee)) {
      failures.push(
        `column-privilege:unexpected-grantee:${row.grantee ?? "unknown"}`,
      );
    }
    if (row.grantee !== tableOwner && row.is_grantable === true) {
      failures.push(`column-privilege:grant-option:${row.grantee}`);
    }
  }
  const effective = await connection`
    SELECT role_row.rolname,
           has_table_privilege(role_row.oid, 'public.agent_browser_sessions', 'SELECT') AS can_select,
           has_table_privilege(role_row.oid, 'public.agent_browser_sessions', 'INSERT') AS can_insert,
           has_table_privilege(role_row.oid, 'public.agent_browser_sessions', 'UPDATE') AS can_update,
           has_table_privilege(role_row.oid, 'public.agent_browser_sessions', 'DELETE') AS can_delete,
           has_column_privilege(role_row.oid, 'public.agent_browser_sessions', 'last_seen_at', 'UPDATE') AS can_touch,
           has_column_privilege(role_row.oid, 'public.agent_browser_sessions', 'revoked_at', 'UPDATE') AS can_revoke,
           has_column_privilege(role_row.oid, 'public.agent_browser_sessions', 'revocation_reason', 'UPDATE') AS can_reason,
           has_column_privilege(role_row.oid, 'public.agent_browser_sessions', 'token_hash', 'UPDATE') AS can_rewrite_token,
           has_column_privilege(role_row.oid, 'public.agent_browser_sessions', 'credential_id', 'UPDATE') AS can_rebind_credential,
           has_column_privilege(role_row.oid, 'public.agent_browser_sessions', 'agent_id', 'UPDATE') AS can_rebind_agent,
           has_column_privilege(role_row.oid, 'public.agent_browser_sessions', 'expires_at', 'UPDATE') AS can_extend
    FROM pg_roles AS role_row
    WHERE role_row.rolname = ANY(${runtimeGrantees}::text[])
  `;
  if (
    effective.length !== runtimeGrantees.length ||
    effective.some(
      (row) =>
        !row.can_select ||
        !row.can_insert ||
        row.can_update ||
        row.can_delete ||
        !row.can_touch ||
        !row.can_revoke ||
        !row.can_reason ||
        row.can_rewrite_token ||
        row.can_rebind_credential ||
        row.can_rebind_agent ||
        row.can_extend,
    )
  ) {
    failures.push("privilege:effective-runtime-access");
  }
  const maintenance = await connection`
    SELECT role_row.rolname,
           has_table_privilege(role_row.oid, 'public.agent_browser_sessions', 'SELECT') AS can_select,
           has_table_privilege(role_row.oid, 'public.agent_browser_sessions', 'INSERT') AS can_insert,
           has_table_privilege(role_row.oid, 'public.agent_browser_sessions', 'UPDATE') AS can_update,
           has_table_privilege(role_row.oid, 'public.agent_browser_sessions', 'DELETE') AS can_delete,
           has_any_column_privilege(role_row.oid, 'public.agent_browser_sessions', 'UPDATE') AS can_update_any_column
    FROM pg_roles AS role_row
    WHERE role_row.rolname = ANY(${maintenanceGrantees}::text[])
  `;
  if (
    maintenance.length !== maintenanceGrantees.length ||
    maintenance.some(
      (row) =>
        !row.can_select ||
        row.can_insert ||
        row.can_update ||
        !row.can_delete ||
        row.can_update_any_column,
    )
  ) {
    failures.push("privilege:effective-maintenance-access");
  }
  return failures;
}

async function inspectIntegrity(connection) {
  const [integrity] = await connection`
    SELECT
      count(*)::int AS rows,
      count(*) FILTER (
        WHERE token_hash !~ '^[0-9a-f]{64}$'
           OR expires_at <= created_at
           OR expires_at > created_at + interval '30 minutes'
           OR last_seen_at < created_at
           OR last_seen_at > expires_at
           OR (revoked_at IS NOT NULL AND revoked_at < created_at)
           OR ((revoked_at IS NULL) <> (revocation_reason IS NULL))
           OR NOT EXISTS (
             SELECT 1 FROM public.agents AS agent
             WHERE agent.id = agent_browser_sessions.agent_id
           )
           OR NOT EXISTS (
             SELECT 1 FROM public.agent_credentials AS credential
             WHERE credential.id = agent_browser_sessions.credential_id
               AND credential.agent_id = agent_browser_sessions.agent_id
           )
      )::int AS invalid_rows,
      (SELECT count(*)::int
       FROM (
         SELECT token_hash
         FROM public.agent_browser_sessions
         GROUP BY token_hash HAVING count(*) > 1
       ) AS duplicates) AS duplicate_tokens,
      (SELECT count(*)::int
       FROM (
         SELECT agent_id
         FROM public.agent_browser_sessions
         WHERE revoked_at IS NULL
         GROUP BY agent_id HAVING count(*) > 1
       ) AS duplicates) AS duplicate_active_agents
    FROM public.agent_browser_sessions
  `;
  return integrity;
}

async function inspectCompleteTable(connection, tableShape) {
  const failures = [];
  if (tableShape.relkind !== "r")
    failures.push(`table-kind:${tableShape.relkind}`);
  if (tableShape.persistence !== "p") {
    failures.push(`table-persistence:${tableShape.persistence}`);
  }
  if (tableShape.rowSecurity !== false) failures.push("table-row-security");
  if (tableShape.forceRowSecurity !== false) {
    failures.push("table-force-row-security");
  }
  if (tableShape.owner !== targetGuards.user) {
    failures.push(`table-owner:${tableShape.owner}`);
  }
  failures.push(...(await inspectColumns(connection)));
  failures.push(...(await inspectConstraints(connection)));
  failures.push(...(await inspectIndexes(connection)));
  failures.push(...(await inspectPrivileges(connection, tableShape.owner)));
  const [metadata] = await connection`
    SELECT
      (SELECT count(*)::int FROM pg_trigger
       WHERE tgrelid = 'public.agent_browser_sessions'::regclass
         AND NOT tgisinternal) AS user_triggers,
      (SELECT count(*)::int FROM pg_policy
       WHERE polrelid = 'public.agent_browser_sessions'::regclass) AS policies
  `;
  if (metadata.user_triggers !== 0) failures.push("unexpected-triggers");
  if (metadata.policies !== 0) failures.push("unexpected-policies");
  const integrity = await inspectIntegrity(connection);
  for (const field of [
    "invalid_rows",
    "duplicate_tokens",
    "duplicate_active_agents",
  ]) {
    if (integrity[field] !== 0) failures.push(`${field}:${integrity[field]}`);
  }
  return { failures, integrity };
}

async function inspectState(connection) {
  const credentialIndex = await inspectCredentialIndex(connection);
  if (credentialIndex.kind === "partial") {
    return { kind: "partial", failures: ["credential-index"] };
  }
  const tableShape = await inspectTableShape(connection);
  if (!tableShape.present) {
    const [collisions, duplicatePairs] = await Promise.all([
      findCollidingArtifacts(connection),
      duplicateCredentialPairCount(connection),
    ]);
    if (collisions !== 0 || duplicatePairs !== 0) {
      return {
        kind: "partial",
        failures: [
          ...(collisions ? ["colliding-artifacts"] : []),
          ...(duplicatePairs ? ["duplicate-credential-pairs"] : []),
        ],
      };
    }
    return {
      kind: "creatable",
      createCredentialIndex: credentialIndex.kind === "missing",
    };
  }
  if (credentialIndex.kind !== "complete") {
    return { kind: "partial", failures: ["credential-index"] };
  }
  const proof = await inspectCompleteTable(connection, tableShape);
  return proof.failures.length === 0
    ? { kind: "complete", integrity: proof.integrity }
    : { kind: "partial", failures: proof.failures };
}

async function restrictTableAcl(connection) {
  await connection.unsafe(`
    REVOKE ALL PRIVILEGES ON TABLE public.agent_browser_sessions FROM PUBLIC;
    DO $pw7404_acl$
    DECLARE
      granted_role record;
    BEGIN
      FOR granted_role IN
        SELECT DISTINCT grantee_role.rolname
        FROM pg_class AS table_class
        CROSS JOIN LATERAL aclexplode(coalesce(
          table_class.relacl,
          acldefault('r', table_class.relowner)
        )) AS exploded
        JOIN pg_roles AS grantee_role ON grantee_role.oid = exploded.grantee
        WHERE table_class.oid = 'public.agent_browser_sessions'::regclass
          AND grantee_role.rolname NOT IN (
             current_user,
             'spacebot_runtime',
             'service_role',
             'pw7404_task_maintenance'
          )
      LOOP
        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON TABLE public.agent_browser_sessions FROM %I',
          granted_role.rolname
        );
      END LOOP;
    END
    $pw7404_acl$;
    REVOKE ALL PRIVILEGES
      ON TABLE public.agent_browser_sessions FROM spacebot_runtime;
    GRANT SELECT, INSERT
      ON TABLE public.agent_browser_sessions TO spacebot_runtime;
    GRANT UPDATE (last_seen_at, revoked_at, revocation_reason)
      ON TABLE public.agent_browser_sessions TO spacebot_runtime;
    REVOKE ALL PRIVILEGES
      ON TABLE public.agent_browser_sessions FROM pw7404_task_maintenance;
    GRANT SELECT, DELETE
      ON TABLE public.agent_browser_sessions TO pw7404_task_maintenance;
    DO $pw7404_service_role$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE ALL PRIVILEGES
          ON TABLE public.agent_browser_sessions FROM service_role;
        GRANT SELECT, INSERT
          ON TABLE public.agent_browser_sessions TO service_role;
        GRANT UPDATE (last_seen_at, revoked_at, revocation_reason)
          ON TABLE public.agent_browser_sessions TO service_role;
      END IF;
    END
    $pw7404_service_role$;
  `);
}

async function applyMigration(connection, createCredentialIndex) {
  if (createCredentialIndex) {
    await connection.unsafe(`
      CREATE UNIQUE INDEX agent_credentials_id_agent_unique_idx
      ON public.agent_credentials USING btree (id, agent_id)
    `);
  }
  await connection.unsafe(`
    CREATE TABLE public.agent_browser_sessions (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      agent_id uuid NOT NULL,
      credential_id uuid NOT NULL,
      token_hash varchar(64) NOT NULL,
      expires_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz,
      revocation_reason varchar(40),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT agent_browser_sessions_pkey PRIMARY KEY (id),
      CONSTRAINT agent_browser_sessions_agent_id_agents_id_fk
        FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE,
      CONSTRAINT agent_browser_sessions_credential_agent_fk
        FOREIGN KEY (credential_id, agent_id)
        REFERENCES public.agent_credentials(id, agent_id) ON DELETE CASCADE,
      CONSTRAINT agent_browser_sessions_token_hash_check
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT agent_browser_sessions_expiry_check
        CHECK (
          expires_at > created_at
          AND expires_at <= created_at + interval '30 minutes'
        ),
      CONSTRAINT agent_browser_sessions_chronology_check
        CHECK (
          last_seen_at >= created_at
          AND last_seen_at <= expires_at
          AND (revoked_at IS NULL OR revoked_at >= created_at)
        ),
      CONSTRAINT agent_browser_sessions_revocation_pair_check
        CHECK (
          (revoked_at IS NULL AND revocation_reason IS NULL)
          OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)
        )
    );
    CREATE UNIQUE INDEX agent_browser_sessions_token_hash_unique_idx
      ON public.agent_browser_sessions USING btree (token_hash);
    CREATE UNIQUE INDEX agent_browser_sessions_one_active_agent_idx
      ON public.agent_browser_sessions USING btree (agent_id)
      WHERE revoked_at IS NULL;
    CREATE INDEX agent_browser_sessions_credential_active_idx
      ON public.agent_browser_sessions USING btree (credential_id)
      WHERE revoked_at IS NULL;
    CREATE INDEX agent_browser_sessions_expires_idx
      ON public.agent_browser_sessions USING btree (expires_at)
      WHERE revoked_at IS NULL;
    ALTER TABLE public.agent_browser_sessions DISABLE ROW LEVEL SECURITY;
    ALTER TABLE public.agent_browser_sessions NO FORCE ROW LEVEL SECURITY;
  `);
  await restrictTableAcl(connection);
}

let sql;
try {
  validateStartupConfiguration();
  sql = createSqlClient();
  if (!apply) {
    const state = await sql.begin("read only", async (transaction) => {
      await transaction.unsafe("SET LOCAL statement_timeout = '30s'");
      await assertExpectedTarget(transaction);
      return inspectState(transaction);
    });
    if (state.kind !== "complete") {
      throw new SafeMigrationError(
        state.kind === "creatable"
          ? "migration is required"
          : `state is partial or ambiguous: ${state.failures.join(", ")}`,
      );
    }
    console.log(`${RECEIPT}: PASS (check; rows=${state.integrity.rows})`);
  } else {
    const result = await sql.begin(async (transaction) => {
      await transaction.unsafe("SET LOCAL lock_timeout = '10s'");
      await transaction.unsafe("SET LOCAL statement_timeout = '120s'");
      await transaction`
        SELECT pg_advisory_xact_lock(
          hashtextextended('pw7404-1063-agent-browser-sessions', 0)
        )
      `;
      await assertExpectedTarget(transaction);
      await transaction.unsafe(
        "LOCK TABLE public.agents, public.agent_credentials IN SHARE ROW EXCLUSIVE MODE",
      );
      const before = await inspectState(transaction);
      if (before.kind === "complete") {
        return { created: false, repaired: false, integrity: before.integrity };
      }
      const repairableAcl =
        before.kind === "partial" &&
        before.failures.length > 0 &&
        before.failures.every(
          (failure) =>
            failure.startsWith("privilege:") ||
            failure.startsWith("column-privilege:"),
        );
      if (before.kind !== "creatable" && !repairableAcl) {
        throw new SafeMigrationError(
          `State is partial or ambiguous; refusing apply: ${before.failures.join(
            ", ",
          )}`,
        );
      }
      if (repairableAcl) {
        await restrictTableAcl(transaction);
      } else {
        await applyMigration(transaction, before.createCredentialIndex);
      }
      const after = await inspectState(transaction);
      if (after.kind !== "complete") {
        throw new SafeMigrationError(
          `Post-migration exact-state verification failed: ${after.failures.join(
            ", ",
          )}`,
        );
      }
      return {
        created: before.kind === "creatable",
        repaired: repairableAcl,
        integrity: after.integrity,
      };
    });
    console.log(
      `${RECEIPT}: PASS (apply; ${
        result.created
          ? "created"
          : result.repaired
          ? "repaired ACL"
          : "already complete"
      }; rows=${result.integrity.rows})`,
    );
  }
} catch (error) {
  const message =
    error instanceof SafeMigrationError
      ? error.message
      : "database operation failed; no secrets were printed";
  console.error(`${RECEIPT}: FAIL (${message})`);
  process.exitCode = 1;
} finally {
  await sql?.end({ timeout: 5 }).catch(() => {});
}
