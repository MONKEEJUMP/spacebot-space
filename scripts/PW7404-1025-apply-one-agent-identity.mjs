import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = {
  prepare: join(
    repoRoot,
    "drizzle",
    "migrations",
    "PW7404-1025-01-prepare-agent-credentials-20260710.sql",
  ),
  merge: join(
    repoRoot,
    "drizzle",
    "migrations",
    "PW7404-1025-02-merge-founding-agent-identities-20260710.sql",
  ),
};

for (const migration of Object.values(migrations)) {
  if (!existsSync(migration)) {
    throw new Error(`Required migration is missing: ${migration}`);
  }
}

if (process.argv.includes("--check")) {
  console.log("PW7404-1025 phased migration order verified:");
  console.log(`- prepare: ${migrations.prepare}`);
  console.log(`- deploy credential-aware runtime`);
  console.log(`- merge: ${migrations.merge}`);
  process.exit(0);
}

const phaseArg = process.argv.find((arg) => arg.startsWith("--phase="));
const phase = phaseArg?.split("=", 2)[1];
const dryRun = process.argv.includes("--dry-run");
if (phase !== "prepare" && phase !== "merge") {
  throw new Error("Use --phase=prepare or --phase=merge");
}
if (dryRun && phase !== "merge") {
  throw new Error("--dry-run is supported only with --phase=merge");
}

const expectedAuthorization = dryRun
  ? "MERGE_DRY_RUN"
  : phase === "prepare"
  ? "PREPARE"
  : "MERGE";
if (process.env.SPACEBOT_APPLY_ONE_AGENT_IDENTITY !== expectedAuthorization) {
  throw new Error(
    `Set SPACEBOT_APPLY_ONE_AGENT_IDENTITY=${expectedAuthorization} to authorize ${phase}`,
  );
}

const psql = process.env.SPACEBOT_PSQL_BIN || "psql";
const databaseUrl =
  process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL;
const expectedDatabase = process.env.SPACEBOT_EXPECTED_DATABASE;
if (!expectedDatabase || !databaseUrl) {
  throw new Error("Set the expected database and canonical database URL");
}

const targetGuards = {
  database: expectedDatabase,
  user: process.env.SPACEBOT_EXPECTED_DATABASE_USER,
  address: process.env.SPACEBOT_EXPECTED_SERVER_ADDRESS,
  port: process.env.SPACEBOT_EXPECTED_SERVER_PORT,
  sentinel: process.env.SPACEBOT_EXPECTED_SENTINEL_AGENT_ID,
};
for (const [name, value] of Object.entries(targetGuards)) {
  if (!value || /\s/.test(value)) {
    throw new Error(`Set a whitespace-free SPACEBOT expected ${name} guard`);
  }
}
if (!/^\d+$/.test(targetGuards.port)) {
  throw new Error("SPACEBOT_EXPECTED_SERVER_PORT must be numeric");
}
if (!/^[0-9a-f-]{36}$/i.test(targetGuards.sentinel)) {
  throw new Error("SPACEBOT_EXPECTED_SENTINEL_AGENT_ID must be a UUID");
}

const quoteSqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
const quoteSqlIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const buildGuardSql = (guards) => `SELECT
  set_config('pw7404.expected_database', ${quoteSqlLiteral(
    guards.database,
  )}, false),
  set_config('pw7404.expected_user', ${quoteSqlLiteral(guards.user)}, false),
  set_config('pw7404.expected_server_address', ${quoteSqlLiteral(
    guards.address,
  )}, false),
  set_config('pw7404.expected_server_port', ${quoteSqlLiteral(
    guards.port,
  )}, false),
  set_config('pw7404.expected_sentinel_agent_id', ${quoteSqlLiteral(
    guards.sentinel,
  )}, false);`;
const guardSql = buildGuardSql(targetGuards);

const publicStateSql = `
CREATE TEMP TABLE pw7404_public_table_state (
  table_name text PRIMARY KEY,
  row_count bigint NOT NULL
);
CREATE TEMP TABLE pw7404_public_sequence_state (
  sequence_name text PRIMARY KEY,
  last_value text NOT NULL,
  is_called boolean NOT NULL
);
DO $$
DECLARE
  item record;
  rows bigint;
  sequence_value text;
  sequence_called boolean;
BEGIN
  FOR item IN
    SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', item.tablename) INTO rows;
    INSERT INTO pw7404_public_table_state VALUES (item.tablename, rows);
  END LOOP;

  FOR item IN
    SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename
  LOOP
    EXECUTE format(
      'SELECT last_value::text, is_called FROM public.%I',
      item.sequencename
    ) INTO sequence_value, sequence_called;
    INSERT INTO pw7404_public_sequence_state
    VALUES (item.sequencename, sequence_value, sequence_called);
  END LOOP;
END
$$;
SELECT jsonb_build_object(
  'schemaOwner', (
    SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='public'
  ),
  'schemaAcl', (
    SELECT COALESCE(nspacl::text, 'NULL') FROM pg_namespace WHERE nspname='public'
  ),
  'objectOwnerMismatches', (
    SELECT count(*) FROM (
      SELECT c.oid
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid=c.relnamespace
      WHERE n.nspname='public'
        AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
        AND pg_get_userbyid(c.relowner)<>current_user
      UNION ALL
      SELECT p.oid
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND pg_get_userbyid(p.proowner)<>current_user
    ) owner_mismatches
  ),
  'relationAcls', COALESCE((
    SELECT jsonb_object_agg(
      c.relkind::text || ':' || c.relname,
      COALESCE(c.relacl::text, 'NULL')
      ORDER BY c.relkind::text, c.relname
    )
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
  ), '{}'::jsonb),
  'functionAcls', COALESCE((
    SELECT jsonb_object_agg(
      p.oid::regprocedure::text,
      COALESCE(p.proacl::text, 'NULL')
      ORDER BY p.oid::regprocedure::text
    )
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
  ), '{}'::jsonb),
  'sentinel', EXISTS (
    SELECT 1 FROM agents
    WHERE id=${quoteSqlLiteral(targetGuards.sentinel)}::uuid
      AND lower(name)='nexus-7'
  ),
  'duplicateGroups', (
    SELECT count(*) FROM (
      SELECT lower(name) FROM agents GROUP BY lower(name) HAVING count(*) > 1
    ) duplicates
  ),
  'tables', COALESCE((
    SELECT jsonb_object_agg(
      table_name,
      jsonb_build_object('rows', row_count)
      ORDER BY table_name
    )
    FROM pw7404_public_table_state
  ), '{}'::jsonb),
  'sequences', COALESCE((
    SELECT jsonb_object_agg(
      sequence_name,
      jsonb_build_object('lastValue', last_value, 'isCalled', is_called)
      ORDER BY sequence_name
    )
    FROM pw7404_public_sequence_state
  ), '{}'::jsonb)
)::text;`;

const normalizeSchemaDump = (value) =>
  value
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.trim() &&
        !line.startsWith("--") &&
        !line.startsWith("\\restrict ") &&
        !line.startsWith("\\unrestrict "),
    )
    .join("\n");

const hashNormalizedCommandOutput = (command, args, label) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let carry = "";
    let stderr = "";
    const hashLine = (line) => {
      if (line.startsWith("\\restrict ") || line.startsWith("\\unrestrict ")) {
        return;
      }
      hash.update(line);
      hash.update("\n");
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const lines = (carry + chunk).split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) hashLine(line.replace(/\r$/, ""));
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(label + " failed (" + code + "): " + stderr.trim()));
        return;
      }
      if (carry) hashLine(carry.replace(/\r$/, ""));
      resolve(hash.digest("hex"));
    });
  });

const databaseProbe = spawnSync(
  psql,
  [
    databaseUrl,
    "-X",
    "-A",
    "-t",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "select current_database();",
  ],
  { encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "inherit"] },
);
if (databaseProbe.error) throw databaseProbe.error;
if (databaseProbe.status !== 0)
  throw new Error("Database connectivity probe failed");
const actualDatabase = databaseProbe.stdout.trim();
if (actualDatabase !== expectedDatabase) {
  throw new Error(
    `Wrong database target: expected ${expectedDatabase}, received ${actualDatabase}`,
  );
}
console.log(`PW7404-1025 ${phase} database target verified: ${actualDatabase}`);

if (phase === "merge") {
  if (process.env.SPACEBOT_FULL_WRITE_MAINTENANCE !== "YES") {
    throw new Error("Merge requires a frozen full-write maintenance window");
  }
  if (!dryRun && process.env.SPACEBOT_CREATE_PREMERGE_BACKUP !== "YES") {
    throw new Error(
      "Set SPACEBOT_CREATE_PREMERGE_BACKUP=YES for the forward-only merge",
    );
  }

  const backupPath = process.env.SPACEBOT_PREMERGE_BACKUP_PATH;
  const pgDump = process.env.SPACEBOT_PG_DUMP_BIN || "pg_dump";
  const pgRestore = process.env.SPACEBOT_PG_RESTORE_BIN || "pg_restore";
  const directPsql = psql;
  const restoreListPath = backupPath ? `${backupPath}.restore.list` : null;
  const backupReceiptPath = backupPath
    ? `${backupPath}.restore-test.json`
    : null;
  if (
    !dryRun &&
    (!backupPath ||
      existsSync(backupPath) ||
      existsSync(restoreListPath) ||
      existsSync(backupReceiptPath))
  ) {
    throw new Error("Merge requires a new backup path and a database URL");
  }

  if (dryRun) {
    console.log(
      "PW7404-1025 merge dry run: backup creation deferred to commit run",
    );
  } else {
    const capturePublicState = (url, label) => {
      const result = spawnSync(
        directPsql,
        [
          url,
          "-X",
          "-q",
          "-A",
          "-t",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          publicStateSql,
        ],
        {
          encoding: "utf8",
          env: process.env,
          stdio: ["ignore", "pipe", "inherit"],
        },
      );
      if (result.error) throw result.error;
      if (result.status !== 0 || !result.stdout.trim().startsWith("{")) {
        throw new Error(`${label} public data fingerprint failed`);
      }
      return result.stdout.trim();
    };
    const capturePublicSchema = (url, label) => {
      const result = spawnSync(
        pgDump,
        [
          url,
          "--schema=public",
          "--schema-only",
          "--no-owner",
          "--no-privileges",
        ],
        {
          encoding: "utf8",
          env: process.env,
          stdio: ["ignore", "pipe", "inherit"],
        },
      );
      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(`${label} public schema fingerprint failed`);
      }
      return normalizeSchemaDump(result.stdout);
    };
    const capturePublicDataHashes = async (url, label, tableNames) => {
      const hashes = {};
      for (const tableName of tableNames) {
        const table = quoteSqlIdentifier(tableName);
        const columnsResult = spawnSync(
          directPsql,
          [
            url,
            "-X",
            "-A",
            "-t",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            `SELECT COALESCE(jsonb_agg(attribute.attname ORDER BY attribute.attnum), '[]'::jsonb)::text
             FROM pg_attribute AS attribute
             JOIN pg_class AS relation ON relation.oid=attribute.attrelid
             JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
             WHERE namespace.nspname='public'
               AND relation.relname=${quoteSqlLiteral(tableName)}
               AND attribute.attnum>0
               AND NOT attribute.attisdropped;`,
          ],
          {
            encoding: "utf8",
            env: process.env,
            stdio: ["ignore", "pipe", "inherit"],
          },
        );
        if (columnsResult.error) throw columnsResult.error;
        if (columnsResult.status !== 0) {
          throw new Error(`${label} ${tableName} catalog read failed`);
        }
        const columnNames = JSON.parse(columnsResult.stdout.trim());
        if (!Array.isArray(columnNames) || columnNames.length === 0) {
          throw new Error(`${label} ${tableName} has no fingerprint columns`);
        }
        const serializedRow = columnNames
          .map((columnName) => {
            const column = `row_value.${quoteSqlIdentifier(columnName)}`;
            return `CASE WHEN ${column} IS NULL THEN 'N' ELSE 'V' || octet_length(${column}::text)::text || ':' || ${column}::text END`;
          })
          .join(" || ");
        const copySql = `
        SET client_encoding='UTF8';
        SET timezone='UTC';
        SET datestyle='ISO, YMD';
        SET intervalstyle='postgres';
        SET extra_float_digits=3;
        SET bytea_output='hex';
        COPY (
          SELECT (${serializedRow}) COLLATE "C" AS row_text
          FROM public.${table} AS row_value
          ORDER BY (${serializedRow}) COLLATE "C"
        ) TO STDOUT;`;
        hashes[tableName] = await hashNormalizedCommandOutput(
          directPsql,
          [url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", copySql],
          `${label} ${tableName} data stream`,
        );
      }
      return JSON.stringify(hashes);
    };
    const capturePublicPublicationMemberships = (url, label) => {
      const publicationSql = [
        "SELECT COALESCE(jsonb_agg(",
        "jsonb_build_object('publication', publication.pubname,",
        "'relation', namespace.nspname || '.' || relation.relname)",
        "ORDER BY publication.pubname, relation.relname",
        "), '[]'::jsonb)::text",
        "FROM pg_publication_rel AS membership",
        "JOIN pg_publication AS publication ON publication.oid=membership.prpubid",
        "JOIN pg_class AS relation ON relation.oid=membership.prrelid",
        "JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace",
        "WHERE namespace.nspname='public';",
      ].join(" ");
      const result = spawnSync(
        directPsql,
        [url, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", publicationSql],
        {
          encoding: "utf8",
          env: process.env,
          stdio: ["ignore", "pipe", "inherit"],
        },
      );
      if (result.error) throw result.error;
      if (result.status !== 0 || !result.stdout.trim().startsWith("[")) {
        throw new Error(label + " public publication fingerprint failed");
      }
      return result.stdout.trim();
    };

    const externalDependentsSql = `WITH dependencies AS (
      SELECT
        pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent_object,
        pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid) AS referenced_object
      FROM pg_depend AS d
    )
    SELECT count(*)
    FROM dependencies
    WHERE referenced_object LIKE '%public.%'
      AND dependent_object NOT LIKE '%public.%'
      AND dependent_object NOT LIKE 'toast table%';`;
    const externalDependents = spawnSync(
      directPsql,
      [
        databaseUrl,
        "-X",
        "-A",
        "-t",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        externalDependentsSql,
      ],
      {
        encoding: "utf8",
        env: process.env,
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    if (externalDependents.error) throw externalDependents.error;
    if (
      externalDependents.status !== 0 ||
      externalDependents.stdout.trim() !== "0"
    ) {
      throw new Error("Public rollback has cross-schema dependent objects");
    }

    const sourceState = capturePublicState(databaseUrl, "Source");
    const sourceStateObject = JSON.parse(sourceState);
    if (
      sourceStateObject.schemaOwner !== "pg_database_owner" ||
      sourceStateObject.objectOwnerMismatches !== 0 ||
      sourceStateObject.sentinel !== true ||
      sourceStateObject.duplicateGroups !== 18 ||
      sourceStateObject.tables?.agents?.rows !== 304 ||
      sourceStateObject.tables?.agent_credentials?.rows !== 304 ||
      sourceStateObject.tables?.agent_identity_aliases?.rows !== 0
    ) {
      throw new Error("Source database backup preflight failed");
    }
    const sourceSchema = capturePublicSchema(databaseUrl, "Source");
    const publicTableNames = Object.keys(sourceStateObject.tables).sort();
    const sourceDataHashes = await capturePublicDataHashes(
      databaseUrl,
      "Source",
      publicTableNames,
    );
    const sourcePublications = capturePublicPublicationMemberships(
      databaseUrl,
      "Source",
    );
    if (sourcePublications !== "[]") {
      throw new Error(
        "Public rollback requires explicit publication membership preservation",
      );
    }

    writeFileSync(backupPath, "", { flag: "wx", mode: 0o600 });
    const dump = spawnSync(
      pgDump,
      [databaseUrl, "--schema=public", "--format=custom", "--file", backupPath],
      { env: process.env, stdio: "inherit" },
    );
    if (dump.error) throw dump.error;
    if (
      dump.status !== 0 ||
      !existsSync(backupPath) ||
      statSync(backupPath).size === 0 ||
      (statSync(backupPath).mode & 0o777) !== 0o600
    ) {
      throw new Error(
        "Immediate pre-merge database backup or permissions failed",
      );
    }

    const dumpList = spawnSync(pgRestore, ["--list", backupPath], {
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "inherit"],
    });
    if (dumpList.error) throw dumpList.error;
    const requiredRollbackTables = [
      "agent_credentials",
      "agent_identity_aliases",
      "agents",
      "bot_activity",
      "bot_configs",
      "bot_profile_history",
      "bot_profiles",
      "channels",
      "comments",
      "follows",
      "heartbeats",
      "human_audit_logs",
      "machine_comments",
      "machine_follows",
      "machine_notifications",
      "machine_posts",
      "machine_votes",
      "messages",
      "posts",
      "subscriptions",
      "votes",
    ];
    if (
      dumpList.status !== 0 ||
      requiredRollbackTables.some(
        (table) => !dumpList.stdout.includes(`TABLE DATA public ${table} `),
      )
    ) {
      throw new Error("Backup catalog validation failed");
    }
    const restoreList = `${dumpList.stdout
      .split(/\r?\n/)
      .filter(
        (line) =>
          !line.includes(" SCHEMA - public ") &&
          !line.includes(" DEFAULT ACL public "),
      )
      .join("\n")}\n`;
    if (
      restoreList.includes(" SCHEMA - public ") ||
      restoreList.includes(" DEFAULT ACL public ") ||
      !restoreList.includes("TABLE DATA public agents ")
    ) {
      throw new Error("Supabase-safe rollback list validation failed");
    }
    writeFileSync(restoreListPath, restoreList, {
      encoding: "utf8",
      mode: 0o600,
    });

    const restoreDatabase = `pw7404_restore_${Date.now()}_${process.pid}`;
    const restoreUrl = new URL(databaseUrl);
    restoreUrl.pathname = `/${restoreDatabase}`;
    let restoreCreated = false;
    try {
      const create = spawnSync(
        directPsql,
        [
          databaseUrl,
          "-X",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          `CREATE DATABASE "${restoreDatabase}"`,
        ],
        { env: process.env, stdio: "inherit" },
      );
      if (create.error) throw create.error;
      if (create.status !== 0)
        throw new Error("Restore-test database creation failed");
      restoreCreated = true;

      const seedManagedFunctions = spawnSync(
        directPsql,
        [
          restoreUrl.toString(),
          "-X",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          "CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS 'SELECT current_user::text'; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';",
        ],
        { env: process.env, stdio: "inherit" },
      );
      if (seedManagedFunctions.error) throw seedManagedFunctions.error;
      if (seedManagedFunctions.status !== 0) {
        throw new Error("Restore-test managed function seeding failed");
      }

      const restore = spawnSync(
        pgRestore,
        [
          "--dbname",
          restoreUrl.toString(),
          "--use-list",
          restoreListPath,
          "--no-owner",
          backupPath,
        ],
        { env: process.env, stdio: "inherit" },
      );
      if (restore.error) throw restore.error;
      if (restore.status !== 0) throw new Error("Backup restore test failed");

      const restoredState = capturePublicState(
        restoreUrl.toString(),
        "Initial restore",
      );
      const restoredSchema = capturePublicSchema(
        restoreUrl.toString(),
        "Initial restore",
      );
      const restoredDataHashes = await capturePublicDataHashes(
        restoreUrl.toString(),
        "Initial restore",
        publicTableNames,
      );
      const restoredPublications = capturePublicPublicationMemberships(
        restoreUrl.toString(),
        "Initial restore",
      );
      if (
        restoredState !== sourceState ||
        restoredSchema !== sourceSchema ||
        restoredDataHashes !== sourceDataHashes ||
        restoredPublications !== sourcePublications
      ) {
        throw new Error(
          "Initial restore data or schema fingerprint does not match source",
        );
      }

      const restoreGuards = buildGuardSql({
        ...targetGuards,
        database: restoreDatabase,
      });
      const simulatedMerge = spawnSync(
        directPsql,
        [
          restoreUrl.toString(),
          "-X",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          restoreGuards,
          "-f",
          migrations.merge,
        ],
        { env: process.env, stdio: "inherit" },
      );
      if (simulatedMerge.error) throw simulatedMerge.error;
      if (simulatedMerge.status !== 0) {
        throw new Error("Restore-test merge simulation failed");
      }

      const mergedState = JSON.parse(
        capturePublicState(restoreUrl.toString(), "Merged clone"),
      );
      if (
        mergedState.duplicateGroups !== 0 ||
        mergedState.tables?.agents?.rows !== 286 ||
        mergedState.tables?.agent_credentials?.rows !== 304 ||
        mergedState.tables?.agent_identity_aliases?.rows !== 18
      ) {
        throw new Error("Restore-test merge simulation receipt failed");
      }

      const rollback = spawnSync(
        pgRestore,
        [
          "--dbname",
          restoreUrl.toString(),
          "--use-list",
          restoreListPath,
          "--schema=public",
          "--clean",
          "--if-exists",
          "--no-owner",
          "--single-transaction",
          "--exit-on-error",
          backupPath,
        ],
        { env: process.env, stdio: "inherit" },
      );
      if (rollback.error) throw rollback.error;
      if (rollback.status !== 0) {
        throw new Error("Backup rollback simulation failed");
      }

      const rolledBackState = capturePublicState(
        restoreUrl.toString(),
        "Rolled-back clone",
      );
      const rolledBackSchema = capturePublicSchema(
        restoreUrl.toString(),
        "Rolled-back clone",
      );
      const rolledBackDataHashes = await capturePublicDataHashes(
        restoreUrl.toString(),
        "Rolled-back clone",
        publicTableNames,
      );
      const rolledBackPublications = capturePublicPublicationMemberships(
        restoreUrl.toString(),
        "Rolled-back clone",
      );
      if (
        rolledBackState !== sourceState ||
        rolledBackSchema !== sourceSchema ||
        rolledBackDataHashes !== sourceDataHashes ||
        rolledBackPublications !== sourcePublications
      ) {
        throw new Error(
          "Rollback data or schema fingerprint does not match source",
        );
      }
    } finally {
      if (restoreCreated) {
        const drop = spawnSync(
          directPsql,
          [
            databaseUrl,
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            `DROP DATABASE "${restoreDatabase}" WITH (FORCE)`,
          ],
          { env: process.env, stdio: "inherit" },
        );
        if (drop.status !== 0) {
          throw new Error("Restore-test database cleanup failed");
        }
      }
    }

    const backupHash = createHash("sha256")
      .update(readFileSync(backupPath))
      .digest("hex");
    const receiptPath = backupReceiptPath;
    writeFileSync(
      receiptPath,
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          database: targetGuards.database,
          user: targetGuards.user,
          address: targetGuards.address,
          port: targetGuards.port,
          schema: "public",
          crossSchemaDependents: 0,
          publicPublicationMemberships: 0,
          sentinelAgentId: targetGuards.sentinel,
          publicTableCount: Object.keys(sourceStateObject.tables).length,
          publicSequenceCount: Object.keys(sourceStateObject.sequences).length,
          sourceStateSha256: createHash("sha256")
            .update(sourceState)
            .digest("hex"),
          sourceSchemaSha256: createHash("sha256")
            .update(sourceSchema)
            .digest("hex"),
          sourceDataSha256: createHash("sha256")
            .update(sourceDataHashes)
            .digest("hex"),
          restoreListSha256: createHash("sha256")
            .update(readFileSync(restoreListPath))
            .digest("hex"),
          restoreListBytes: statSync(restoreListPath).size,
          bytes: statSync(backupPath).size,
          sha256: backupHash,
          restoreTest: "passed",
          mergeSimulation: "passed",
          rollbackTest: "passed",
          rollbackCommand:
            "pg_restore --use-list <RESTORE_LIST_PATH> --schema=public --clean --if-exists --no-owner --single-transaction --exit-on-error --dbname <DATABASE_URL> <BACKUP_PATH>",
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    console.log(
      `PW7404-1025 backup, merge simulation, and rollback test verified: ${receiptPath}`,
    );
  }
}

const prepareReceipt = `DO $$
BEGIN
  IF to_regclass('public.agent_credentials') IS NULL
     OR to_regclass('public.agent_identity_aliases') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='agent_credentials_lookup_unique_idx')
     OR EXISTS (
       SELECT 1 FROM agents AS agent
       LEFT JOIN agent_credentials AS credential
         ON credential.agent_id=agent.id AND credential.lookup_hash=agent.api_key
       WHERE credential.id IS NULL
     )
  THEN
    RAISE EXCEPTION 'PW7404-1025 prepare receipt failed';
  END IF;
END
$$;
SELECT
  (SELECT count(*) FROM agents) AS agents,
  (SELECT count(*) FROM agent_credentials) AS credentials;`;

const mergeReceipt = `DO $$
BEGIN
  IF EXISTS (SELECT lower(name) FROM agents GROUP BY lower(name) HAVING count(*) > 1)
     OR EXISTS (SELECT lower(bot_name) FROM bot_configs GROUP BY lower(bot_name) HAVING count(*) > 1)
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='agents_name_casefold_unique_idx')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='bot_configs_name_casefold_unique_idx')
     OR (SELECT count(*) FROM agent_identity_aliases WHERE reason='PW7404-1025 founding identity merge') <> 18
     OR EXISTS (
       SELECT 1 FROM bot_configs AS config
       JOIN agents AS agent ON agent.id=config.agent_id
       WHERE lower(config.bot_name)<>lower(agent.name)
     )
  THEN
    RAISE EXCEPTION 'PW7404-1025 merge receipt failed';
  END IF;
END
$$;
SELECT
  (SELECT count(*) FROM agents) AS agents,
  (SELECT count(*) FROM agent_credentials) AS credentials,
  (SELECT count(*) FROM agent_identity_aliases) AS identity_aliases,
  (SELECT count(*) FROM bot_configs WHERE agent_id IS NOT NULL) AS residents,
  (SELECT count(*) FROM bot_profiles) AS profiles;`;

const dryRunReceipt = `DO $$
BEGIN
  IF (SELECT count(*) FROM agents) <> 304
     OR (SELECT count(*) FROM agent_credentials) <> 304
     OR (SELECT count(*) FROM agent_identity_aliases) <> 0
     OR (SELECT count(*) FROM (
       SELECT lower(name) FROM agents GROUP BY lower(name) HAVING count(*) > 1
     ) duplicate_groups) <> 18
  THEN
    RAISE EXCEPTION 'PW7404-1025 merge dry-run rollback receipt failed';
  END IF;
END
$$;
SELECT
  (SELECT count(*) FROM agents) AS agents,
  (SELECT count(*) FROM agent_credentials) AS credentials,
  (SELECT count(*) FROM agent_identity_aliases) AS identity_aliases,
  (SELECT count(*) FROM (
    SELECT lower(name) FROM agents GROUP BY lower(name) HAVING count(*) > 1
  ) duplicate_groups) AS duplicate_groups;`;

const migrationArgs = [
  databaseUrl,
  "-X",
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  guardSql,
];
if (dryRun) migrationArgs.push("-v", "PW7404_DRY_RUN=1");
migrationArgs.push(
  "-f",
  migrations[phase],
  "-c",
  dryRun ? dryRunReceipt : phase === "prepare" ? prepareReceipt : mergeReceipt,
);

const result = spawnSync(psql, migrationArgs, {
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(
    `PW7404-1025 ${phase}${
      dryRun ? " dry-run" : ""
    } migration and receipt failed (${result.status})`,
  );
}
