import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const connectionString =
  process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("SPACEBOT_DATABASE_URL or DATABASE_URL is required");
}

const apply = process.argv.includes("--apply");
if (apply && process.env.SPACEBOT_APPLY_CREDENTIAL_FIRST_RESIDENCY !== "1") {
  throw new Error(
    "Set SPACEBOT_APPLY_CREDENTIAL_FIRST_RESIDENCY=1 before using --apply",
  );
}

const targetGuards = apply
  ? {
      database: process.env.SPACEBOT_EXPECTED_DATABASE,
      user: process.env.SPACEBOT_EXPECTED_DATABASE_USER,
      address: process.env.SPACEBOT_EXPECTED_SERVER_ADDRESS,
      port: process.env.SPACEBOT_EXPECTED_SERVER_PORT,
      sentinel: process.env.SPACEBOT_EXPECTED_SENTINEL_AGENT_ID,
    }
  : null;
if (targetGuards) {
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
}

const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

const migrationPath = path.join(
  repoRoot,
  "drizzle/migrations/PW7404-1047-01-credential-first-residency-20260711.sql",
);
const psqlBin = process.env.SPACEBOT_PSQL_BIN || "psql";
const expectedVisibilityIndex =
  "(resident_visibility, moderation_status, name)";
const expectedPublicationExpression =
  "metadata#>>'{publication,clientrequestid}'::text[]";
const expectedPublicationPredicate =
  "activity_type='creation'andmetadata#>>'{publication,clientrequestid}'::text[]isnotnull";

function normalizeDefinition(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeCatalogExpression(value) {
  return value
    .toLowerCase()
    .replace(/::text(?!\[\])/g, "")
    .replace(/[()\s]/g, "");
}

function publicationIndexMatches(index) {
  return (
    index?.indisvalid === true &&
    index?.indisready === true &&
    index?.indisunique === true &&
    index.firstcolumn === "agent_id" &&
    normalizeCatalogExpression(index.secondcolumn) ===
      expectedPublicationExpression &&
    normalizeCatalogExpression(index.predicate) === expectedPublicationPredicate
  );
}

async function assertExpectedTarget() {
  if (!targetGuards) return;
  const [target] = await sql`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           inet_server_port()::text AS port,
           EXISTS (
             SELECT 1 FROM agents WHERE id = ${targetGuards.sentinel}::uuid
           ) AS sentinel,
           EXISTS (
             SELECT 1
             FROM pg_trigger AS trigger
             JOIN pg_proc AS proc ON proc.oid = trigger.tgfoid
             WHERE trigger.tgrelid = 'public.agents'::regclass
               AND trigger.tgname =
                 'pw7404_sync_agent_primary_credential_trigger'
               AND NOT trigger.tgisinternal
               AND trigger.tgenabled IN ('O', 'A')
               AND proc.proname = 'pw7404_sync_agent_primary_credential'
           ) AS credential_trigger
  `;
  const mismatches = [];
  for (const field of ["database", "user", "address", "port"]) {
    if (target[field] !== targetGuards[field]) mismatches.push(field);
  }
  if (target.sentinel !== true) mismatches.push("sentinel");
  if (target.credential_trigger !== true) {
    mismatches.push("credential_trigger");
  }
  if (mismatches.length > 0) {
    throw new Error(
      `Refusing wrong database target; mismatched guards: ${mismatches.join(
        ", ",
      )}`,
    );
  }
}

function applyTransactionalMigration() {
  if (!targetGuards) {
    throw new Error(
      "Expected database guards are required for migration apply",
    );
  }
  const result = spawnSync(
    psqlBin,
    [
      connectionString,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `PW7404_EXPECTED_DATABASE=${targetGuards.database}`,
      "-v",
      `PW7404_EXPECTED_DATABASE_USER=${targetGuards.user}`,
      "-v",
      `PW7404_EXPECTED_SERVER_ADDRESS=${targetGuards.address}`,
      "-v",
      `PW7404_EXPECTED_SERVER_PORT=${targetGuards.port}`,
      "-v",
      `PW7404_EXPECTED_SENTINEL_AGENT_ID=${targetGuards.sentinel}`,
      "-f",
      migrationPath,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function ensureVisibilityIndex() {
  const [existing] = await sql`
    SELECT pg_index.indisvalid,
           pg_index.indisready,
           pg_get_indexdef(pg_index.indexrelid) AS indexdef
    FROM pg_index
    JOIN pg_class index_class ON index_class.oid = pg_index.indexrelid
    JOIN pg_class table_class ON table_class.oid = pg_index.indrelid
    JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
    WHERE namespace.nspname = 'public'
      AND table_class.relname = 'agents'
      AND index_class.relname = 'agents_visibility_name_idx'
  `;
  const matches =
    existing?.indisvalid === true &&
    existing?.indisready === true &&
    normalizeDefinition(existing.indexdef).includes(expectedVisibilityIndex);
  if (matches) return;

  await sql.unsafe("SET lock_timeout = '10s'");
  await sql.unsafe("SET statement_timeout = '120s'");
  if (existing) {
    await sql.unsafe(
      "DROP INDEX CONCURRENTLY IF EXISTS agents_visibility_name_idx",
    );
  }
  await sql.unsafe(`
    CREATE INDEX CONCURRENTLY agents_visibility_name_idx
      ON agents (resident_visibility, moderation_status, name)
  `);
}

async function ensurePublicationIndex() {
  const [existing] = await sql`
    SELECT pg_index.indisvalid,
           pg_index.indisready,
           pg_index.indisunique,
           pg_get_indexdef(pg_index.indexrelid, 1, true) AS firstcolumn,
           pg_get_indexdef(pg_index.indexrelid, 2, true) AS secondcolumn,
           pg_get_expr(pg_index.indpred, pg_index.indrelid, true) AS predicate
    FROM pg_index
    JOIN pg_class index_class ON index_class.oid = pg_index.indexrelid
    JOIN pg_class table_class ON table_class.oid = pg_index.indrelid
    JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
    WHERE namespace.nspname = 'public'
      AND table_class.relname = 'bot_activity'
      AND index_class.relname = 'bot_activity_agent_publication_request_unique_idx'
  `;
  if (publicationIndexMatches(existing)) return;

  await sql.unsafe("SET lock_timeout = '10s'");
  await sql.unsafe("SET statement_timeout = '120s'");
  if (existing) {
    await sql.unsafe(
      "DROP INDEX CONCURRENTLY IF EXISTS bot_activity_agent_publication_request_unique_idx",
    );
  }
  await sql.unsafe(`
    CREATE UNIQUE INDEX CONCURRENTLY bot_activity_agent_publication_request_unique_idx
      ON bot_activity (agent_id, (metadata #>> '{publication,clientRequestId}'))
      WHERE activity_type = 'creation'
        AND metadata #>> '{publication,clientRequestId}' IS NOT NULL
  `);
}

async function inspect() {
  const columns = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agents'
      AND column_name IN ('resident_visibility', 'moderation_status')
  `;
  const constraints = await sql`
    SELECT conname, convalidated
    FROM pg_constraint
    WHERE conrelid = 'public.agents'::regclass
      AND conname IN (
        'agents_resident_visibility_check',
        'agents_moderation_status_check'
      )
  `;
  const [visibilityIndex] = await sql`
    SELECT pg_index.indisvalid,
           pg_index.indisready,
           pg_get_indexdef(pg_index.indexrelid) AS indexdef
    FROM pg_index
    JOIN pg_class index_class ON index_class.oid = pg_index.indexrelid
    JOIN pg_class table_class ON table_class.oid = pg_index.indrelid
    JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
    WHERE namespace.nspname = 'public'
      AND table_class.relname = 'agents'
      AND index_class.relname = 'agents_visibility_name_idx'
  `;
  const [publicationIndex] = await sql`
    SELECT pg_index.indisvalid,
           pg_index.indisready,
           pg_index.indisunique,
           pg_get_indexdef(pg_index.indexrelid, 1, true) AS firstcolumn,
           pg_get_indexdef(pg_index.indexrelid, 2, true) AS secondcolumn,
           pg_get_expr(pg_index.indpred, pg_index.indrelid, true) AS predicate
    FROM pg_index
    JOIN pg_class index_class ON index_class.oid = pg_index.indexrelid
    JOIN pg_class table_class ON table_class.oid = pg_index.indrelid
    JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
    WHERE namespace.nspname = 'public'
      AND table_class.relname = 'bot_activity'
      AND index_class.relname = 'bot_activity_agent_publication_request_unique_idx'
  `;
  const [profileForeignKey] = await sql`
    SELECT confdeltype
    FROM pg_constraint
    WHERE conrelid = 'public.bot_profiles'::regclass
      AND contype = 'f'
      AND confrelid = 'public.agents'::regclass
  `;
  const [configAgentColumn] = await sql`
    SELECT attnotnull
    FROM pg_attribute
    WHERE attrelid = 'public.bot_configs'::regclass
      AND attname = 'agent_id'
      AND NOT attisdropped
  `;
  const [credentialTrigger] = await sql`
    SELECT trigger.tgenabled,
           proc.proname AS function_name,
           pg_get_triggerdef(trigger.oid, true) AS definition
    FROM pg_trigger AS trigger
    JOIN pg_proc AS proc ON proc.oid = trigger.tgfoid
    WHERE trigger.tgrelid = 'public.agents'::regclass
      AND trigger.tgname = 'pw7404_sync_agent_primary_credential_trigger'
      AND NOT trigger.tgisinternal
  `;
  const [integrity] = await sql`
    SELECT
      (SELECT count(*)::int FROM agents) AS agents,
      (SELECT count(DISTINCT agent_id)::int
       FROM agent_credentials WHERE revoked_at IS NULL) AS credentialed_agents,
      (SELECT count(*)::int FROM bot_profiles) AS profiles,
      (SELECT count(*)::int FROM bot_configs) AS configs,
      (SELECT count(*)::int
       FROM agents AS agent
       WHERE EXISTS (
         SELECT 1 FROM agent_credentials AS credential
         WHERE credential.agent_id = agent.id
           AND credential.revoked_at IS NULL
       )
         AND NOT EXISTS (
           SELECT 1 FROM bot_profiles AS profile
           WHERE profile.agent_id = agent.id
         )) AS missing_profiles,
      (SELECT count(*)::int
       FROM agents AS agent
       WHERE EXISTS (
         SELECT 1 FROM agent_credentials AS credential
         WHERE credential.agent_id = agent.id
           AND credential.revoked_at IS NULL
       )
         AND NOT EXISTS (
           SELECT 1 FROM bot_configs AS config
           WHERE config.agent_id = agent.id
         )) AS missing_configs,
      (SELECT count(*)::int FROM bot_configs WHERE agent_id IS NULL) AS null_configs,
      (SELECT count(*)::int
       FROM bot_configs AS config
       JOIN agents AS agent ON agent.id = config.agent_id
       WHERE lower(config.bot_name) <> lower(agent.name)) AS identity_mismatches,
      (SELECT count(*)::int
       FROM agents
       WHERE resident_visibility NOT IN ('public', 'unlisted', 'private')
          OR moderation_status NOT IN ('active', 'suspended', 'removed')) AS invalid_states,
      (SELECT count(*)::int
       FROM agents
       WHERE is_claimed = false
         AND claim_code IS NOT NULL
         AND (
           claim_code NOT LIKE 'v1:%'
           OR claim_code_expires_at IS NULL
           OR claim_code_expires_at <= now()
         )) AS unsafe_claim_codes
  `;

  const constraintMap = new Map(
    constraints.map((constraint) => [constraint.conname, constraint]),
  );
  const failures = [];
  if (columns.length !== 2) failures.push("agent visibility columns");
  for (const name of [
    "agents_resident_visibility_check",
    "agents_moderation_status_check",
  ]) {
    if (constraintMap.get(name)?.convalidated !== true) {
      failures.push(`constraint:${name}`);
    }
  }
  if (
    !visibilityIndex ||
    visibilityIndex.indisvalid !== true ||
    visibilityIndex.indisready !== true ||
    !normalizeDefinition(visibilityIndex.indexdef).includes(
      expectedVisibilityIndex,
    )
  ) {
    failures.push("index:agents_visibility_name_idx");
  }
  if (!publicationIndexMatches(publicationIndex)) {
    failures.push("index:bot_activity_agent_publication_request_unique_idx");
  }
  if (
    !credentialTrigger ||
    !["O", "A"].includes(credentialTrigger.tgenabled) ||
    credentialTrigger.function_name !==
      "pw7404_sync_agent_primary_credential" ||
    !normalizeDefinition(credentialTrigger.definition).includes(
      "after insert or update of api_key, api_key_hash on agents",
    )
  ) {
    failures.push("trigger:pw7404_sync_agent_primary_credential_trigger");
  }
  if (profileForeignKey?.confdeltype !== "c") {
    failures.push("bot_profiles cascade foreign key");
  }
  if (configAgentColumn?.attnotnull !== true) {
    failures.push("bot_configs.agent_id not-null");
  }
  for (const field of [
    "missing_profiles",
    "missing_configs",
    "null_configs",
    "identity_mismatches",
    "invalid_states",
    "unsafe_claim_codes",
  ]) {
    if (integrity[field] !== 0) failures.push(`${field}:${integrity[field]}`);
  }
  return { failures, integrity };
}

try {
  if (apply) {
    await assertExpectedTarget();
    applyTransactionalMigration();
    await ensureVisibilityIndex();
    await ensurePublicationIndex();
  }
  const result = await inspect();
  if (result.failures.length > 0) {
    throw new Error(
      `Credential-first residency check failed: ${result.failures.join(", ")}`,
    );
  }
  console.log(
    `PW7404-1047 credential-first residency: PASS (${
      apply ? "apply" : "check"
    }; agents=${result.integrity.agents}; credentialed=${
      result.integrity.credentialed_agents
    }; profiles=${result.integrity.profiles}; configs=${
      result.integrity.configs
    })`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
