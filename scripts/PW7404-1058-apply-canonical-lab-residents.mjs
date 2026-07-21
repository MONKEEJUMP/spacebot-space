import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import postgres from "postgres";

const RECEIPT = "PW7404-1058 canonical Lab residents";
const AUTHORIZATION_ENV = "SPACEBOT_APPLY_CANONICAL_LAB_RESIDENTS";
const OUTPUT_ENV = "SPACEBOT_CANONICAL_LAB_RESIDENTS_CREDENTIAL_OUTPUT";
const BCRYPT_ROUNDS = 12;
const LAB_SLUGS = Object.freeze([
  "cosmo-sage",
  "paleo-rex",
  "deep-current",
  "atom-spark",
  "medi-core",
  "storm-watch",
  "terra-forge",
  "fauna-link",
  "volt-rush",
  "flora-root",
  "cipher-mind",
  "axiom-prime",
]);

class SafeMigrationError extends Error {}

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const apply = process.argv.includes("--apply");
const explicitCheck = process.argv.includes("--check");
const outputArguments = process.argv.filter((argument) =>
  argument.startsWith("--credential-output="),
);
const supportedArguments = process.argv
  .slice(2)
  .filter(
    (argument) =>
      argument === "--apply" ||
      argument === "--check" ||
      argument.startsWith("--credential-output="),
  );
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
  if (supportedArguments.length !== process.argv.length - 2) {
    throw new SafeMigrationError(
      "Use only --check, --apply, and --credential-output=/absolute/path",
    );
  }
  if ((apply && explicitCheck) || outputArguments.length > 1) {
    throw new SafeMigrationError(
      "Choose exactly one migration mode and output path",
    );
  }
  if (!apply && outputArguments.length > 0) {
    throw new SafeMigrationError(
      "Credential output is accepted only with --apply",
    );
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

let sql;

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function requestedOutputPath() {
  const fromArgument = outputArguments[0]?.slice("--credential-output=".length);
  const fromEnvironment = process.env[OUTPUT_ENV];
  if (fromArgument && fromEnvironment) {
    if (path.resolve(fromArgument) !== path.resolve(fromEnvironment)) {
      throw new SafeMigrationError(
        `--credential-output and ${OUTPUT_ENV} must identify the same file`,
      );
    }
  }
  return fromArgument || fromEnvironment;
}

async function openCredentialOutput() {
  const outputPath = requestedOutputPath();
  if (!outputPath || !path.isAbsolute(outputPath)) {
    throw new SafeMigrationError(
      `Set ${OUTPUT_ENV} or --credential-output to an absolute path`,
    );
  }
  const resolvedOutput = path.resolve(outputPath);
  if (isInside(repoRoot, resolvedOutput)) {
    throw new SafeMigrationError(
      "Credential output must be outside the repository",
    );
  }
  if (process.platform === "win32") {
    throw new SafeMigrationError(
      "Apply requires a POSIX host so root ownership and mode 0600 can be verified",
    );
  }

  let pathState;
  try {
    pathState = await lstat(resolvedOutput);
  } catch {
    throw new SafeMigrationError(
      "Credential output must be a pre-created regular file",
    );
  }
  if (!pathState.isFile() || pathState.isSymbolicLink()) {
    throw new SafeMigrationError(
      "Credential output must be a pre-created regular file, not a link",
    );
  }
  if ((pathState.mode & 0o777) !== 0o600 || pathState.uid !== 0) {
    throw new SafeMigrationError(
      "Credential output must be root-owned with exact mode 0600",
    );
  }
  if (typeof process.geteuid !== "function" || process.geteuid() !== 0) {
    throw new SafeMigrationError(
      "Apply must run as root to write credential output",
    );
  }

  let handle;
  try {
    handle = await open(
      resolvedOutput,
      fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const openedState = await handle.stat();
    if (
      !openedState.isFile() ||
      openedState.dev !== pathState.dev ||
      openedState.ino !== pathState.ino ||
      (openedState.mode & 0o777) !== 0o600 ||
      openedState.uid !== 0
    ) {
      throw new SafeMigrationError(
        "Credential output changed during validation",
      );
    }
    return {
      handle,
      outputPath: resolvedOutput,
      initialSize: openedState.size,
    };
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error instanceof SafeMigrationError) throw error;
    throw new SafeMigrationError(
      "Credential output could not be opened safely",
    );
  }
}

async function assertExpectedTarget(connection = sql) {
  const [target] = await connection`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
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
    if (target?.[field] !== targetGuards[field]) mismatches.push(field);
  }
  if (target?.sentinel !== true) mismatches.push("sentinel");
  if (target?.credential_trigger !== true)
    mismatches.push("credential_trigger");
  if (mismatches.length > 0) {
    throw new SafeMigrationError(
      `Refusing wrong database target; mismatched guards: ${mismatches.join(
        ", ",
      )}`,
    );
  }
}

async function inspectCatalog(connection = sql) {
  const [tables] = await connection`
    SELECT to_regclass('public.lab_bots') IS NOT NULL AS lab_bots,
           to_regclass('public.agents') IS NOT NULL AS agents,
           to_regclass('public.agent_credentials') IS NOT NULL AS credentials,
           to_regclass('public.agent_identity_aliases') IS NOT NULL AS aliases,
           to_regclass('public.human_agent_links') IS NOT NULL AS human_links,
           to_regclass('public.bot_profiles') IS NOT NULL AS profiles,
           to_regclass('public.bot_configs') IS NOT NULL AS configs
  `;
  if (!tables || Object.values(tables).some((present) => present !== true)) {
    throw new SafeMigrationError(
      "Canonical residency prerequisite tables are missing",
    );
  }

  const [column] = await connection`
    SELECT attribute.attnotnull,
           format_type(attribute.atttypid, attribute.atttypmod) AS data_type
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.lab_bots'::regclass
      AND attribute.attname = 'agent_id'
      AND NOT attribute.attisdropped
  `;
  if (column && column.data_type !== "uuid") {
    throw new SafeMigrationError(
      "lab_bots.agent_id exists with the wrong type",
    );
  }

  let foreignKeys = [];
  let uniqueIndexes = [];
  if (column) {
    foreignKeys = await connection`
      SELECT constraint_row.conname,
             constraint_row.convalidated,
             constraint_row.confdeltype,
             constraint_row.confrelid = 'public.agents'::regclass
               AS references_agents,
             constraint_row.confkey = ARRAY[
               (SELECT attnum FROM pg_attribute
                WHERE attrelid = 'public.agents'::regclass
                  AND attname = 'id' AND NOT attisdropped)
             ]::smallint[] AS references_agent_id,
             pg_get_constraintdef(constraint_row.oid, true) AS definition
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = 'public.lab_bots'::regclass
        AND constraint_row.contype = 'f'
        AND constraint_row.conkey = ARRAY[
          (SELECT attnum FROM pg_attribute
           WHERE attrelid = 'public.lab_bots'::regclass
             AND attname = 'agent_id' AND NOT attisdropped)
        ]::smallint[]
    `;
    uniqueIndexes = await connection`
      SELECT index_class.relname AS name,
             index_row.indisvalid,
             index_row.indisready,
             index_row.indisunique,
             index_row.indpred IS NULL AS unqualified,
             index_row.indkey::text AS keys
      FROM pg_index AS index_row
      JOIN pg_class AS index_class ON index_class.oid = index_row.indexrelid
      WHERE index_row.indrelid = 'public.lab_bots'::regclass
        AND index_row.indisunique
        AND index_row.indnkeyatts = 1
        AND index_row.indkey[0] = (
          SELECT attnum FROM pg_attribute
          WHERE attrelid = 'public.lab_bots'::regclass
            AND attname = 'agent_id' AND NOT attisdropped
        )
    `;
  }
  const expectedForeignKey = foreignKeys.filter(
    (row) =>
      row.conname === "lab_bots_agent_id_agents_id_fk" &&
      row.convalidated === true &&
      row.confdeltype === "r" &&
      row.references_agents === true &&
      row.references_agent_id === true &&
      String(row.definition).toLowerCase().includes("references agents(id)"),
  );
  const expectedUnique = uniqueIndexes.filter(
    (row) =>
      row.name === "lab_bots_agent_id_unique_idx" &&
      row.indisvalid === true &&
      row.indisready === true &&
      row.indisunique === true &&
      row.unqualified === true,
  );
  return {
    hasAgentId: Boolean(column),
    agentIdNotNull: column?.attnotnull === true,
    finalForeignKey:
      foreignKeys.length === 1 && expectedForeignKey.length === 1,
    finalUniqueIndex: uniqueIndexes.length === 1 && expectedUnique.length === 1,
    hasAnyForeignKey: foreignKeys.length > 0,
    hasAnyUniqueIndex: uniqueIndexes.length > 0,
  };
}

async function loadLabBots(connection, hasAgentId) {
  return hasAgentId
    ? connection`
        SELECT id, agent_id, slug, name, subject, accent_color, tagline,
               personality, avatar_config, mega_prompt, is_active
        FROM lab_bots
        ORDER BY slug
      `
    : connection`
        SELECT id, NULL::uuid AS agent_id, slug, name, subject, accent_color,
               tagline, personality, avatar_config, mega_prompt, is_active
        FROM lab_bots
        ORDER BY slug
      `;
}

function assertCanonicalLabRoster(rows) {
  const expected = [...LAB_SLUGS].sort();
  const actual = rows.map((row) => row.slug).sort();
  if (
    rows.length !== LAB_SLUGS.length ||
    actual.some((slug, index) => slug !== expected[index]) ||
    rows.some(
      (row) =>
        row.is_active !== true ||
        row.slug !== row.slug?.toLowerCase() ||
        !row.name?.trim() ||
        !row.subject?.trim() ||
        !row.tagline?.trim() ||
        !row.personality?.trim() ||
        !row.mega_prompt?.trim(),
    )
  ) {
    throw new SafeMigrationError(
      "Lab roster must contain exactly the 12 expected active residents",
    );
  }
}

async function conflictingIdentityCount(connection, linkedAgentIds = []) {
  const [conflicts] = await connection`
    SELECT
      (SELECT count(*)::int FROM agents
       WHERE lower(name) = ANY(${LAB_SLUGS}::text[])) AS named_agents,
      (SELECT count(*)::int FROM bot_configs
       WHERE lower(bot_name) = ANY(${LAB_SLUGS}::text[])) AS named_configs,
      (SELECT count(*)::int FROM agent_identity_aliases
       WHERE normalized_name = ANY(${LAB_SLUGS}::text[])) AS named_aliases,
      (SELECT count(*)::int FROM bot_profiles
       WHERE agent_id = ANY(${linkedAgentIds}::uuid[])) AS linked_profiles,
      (SELECT count(*)::int FROM agent_credentials
       WHERE agent_id = ANY(${linkedAgentIds}::uuid[])) AS linked_credentials
  `;
  return conflicts;
}

async function completeProof(connection = sql, includeVerifier = false) {
  const rows = await connection`
    SELECT lab.id AS lab_bot_id,
           lab.slug,
           lab.agent_id,
           agent.name AS agent_name,
           agent.api_key AS primary_lookup,
           agent.api_key_hash AS primary_verifier,
           agent.is_claimed,
           agent.owner_platform,
           agent.owner_handle,
           config.bot_name,
           config.bot_type,
           config.space,
           config.is_active AS config_active,
           credential.lookup_hash,
           credential.verifier_hash,
           credential.credential_family,
           credential.verifier_kind,
           (SELECT count(*)::int FROM agents AS named_agent
            WHERE lower(named_agent.name) = lab.slug) AS identity_count,
           (SELECT count(*)::int FROM bot_profiles AS profile
            WHERE profile.agent_id = lab.agent_id) AS profile_count,
           (SELECT count(*)::int FROM bot_configs AS resident_config
            WHERE resident_config.agent_id = lab.agent_id) AS config_count,
           (SELECT count(*)::int FROM bot_configs AS named_config
            WHERE lower(named_config.bot_name) = lab.slug) AS config_name_count,
           (SELECT count(*)::int FROM agent_credentials AS active_credential
            WHERE active_credential.agent_id = lab.agent_id
              AND active_credential.revoked_at IS NULL) AS active_credential_count,
           (SELECT count(*)::int FROM agent_credentials AS botspace_credential
            WHERE botspace_credential.agent_id = lab.agent_id
              AND botspace_credential.revoked_at IS NULL
              AND botspace_credential.credential_family = 'botspace'
              AND botspace_credential.verifier_kind = 'bcrypt'
              AND botspace_credential.verifier_hash IS NOT NULL) AS botspace_credential_count,
           (SELECT count(*)::int FROM agent_identity_aliases AS alias
            WHERE alias.normalized_name = lab.slug
              AND alias.canonical_agent_id <> lab.agent_id) AS alias_conflicts,
           (SELECT count(*)::int FROM human_agent_links AS human_link
             WHERE human_link.agent_id = lab.agent_id) AS human_link_count
    FROM lab_bots AS lab
    LEFT JOIN agents AS agent ON agent.id = lab.agent_id
    LEFT JOIN bot_configs AS config ON config.agent_id = lab.agent_id
    LEFT JOIN agent_credentials AS credential
      ON credential.agent_id = lab.agent_id
     AND credential.revoked_at IS NULL
    WHERE lab.slug = ANY(${LAB_SLUGS}::text[])
    ORDER BY lab.slug
  `;
  const distinctAgentIds = new Set(rows.map((row) => row.agent_id));
  const valid =
    rows.length === LAB_SLUGS.length &&
    distinctAgentIds.size === LAB_SLUGS.length &&
    !distinctAgentIds.has(null) &&
    rows.every(
      (row) =>
        row.agent_name === row.slug &&
        row.is_claimed === false &&
        row.owner_platform === null &&
        row.owner_handle === null &&
        row.bot_name === row.slug &&
        row.bot_type === "lab-resident" &&
        row.space === "lab" &&
        row.config_active === true &&
        row.identity_count === 1 &&
        row.profile_count === 1 &&
        row.config_count === 1 &&
        row.config_name_count === 1 &&
        row.active_credential_count === 1 &&
        row.botspace_credential_count === 1 &&
        row.credential_family === "botspace" &&
        row.verifier_kind === "bcrypt" &&
        row.lookup_hash === row.primary_lookup &&
        row.verifier_hash === row.primary_verifier &&
        /^\$2[aby]\$12\$/.test(row.verifier_hash ?? "") &&
        row.alias_conflicts === 0 &&
        row.human_link_count === 0,
    );
  if (!includeVerifier) {
    for (const row of rows) {
      delete row.verifier_hash;
      delete row.primary_verifier;
    }
  }
  return { valid, rows };
}

async function inspectState(connection = sql) {
  const catalog = await inspectCatalog(connection);
  const labBots = await loadLabBots(connection, catalog.hasAgentId);
  assertCanonicalLabRoster(labBots);
  const linkedAgentIds = labBots
    .map((row) => row.agent_id)
    .filter((agentId) => agentId !== null);
  const conflicts = await conflictingIdentityCount(connection, linkedAgentIds);
  const allLinksNull = linkedAgentIds.length === 0;
  const noIdentityArtifacts =
    conflicts.named_agents === 0 &&
    conflicts.named_configs === 0 &&
    conflicts.named_aliases === 0 &&
    conflicts.linked_profiles === 0 &&
    conflicts.linked_credentials === 0;
  const pristineCatalog =
    !catalog.agentIdNotNull &&
    !catalog.hasAnyForeignKey &&
    !catalog.hasAnyUniqueIndex;

  if (allLinksNull && noIdentityArtifacts && pristineCatalog) {
    return { kind: "pristine", catalog, labBots };
  }

  const proof = await completeProof(connection);
  const finalCatalog =
    catalog.hasAgentId &&
    catalog.agentIdNotNull &&
    catalog.finalForeignKey &&
    catalog.finalUniqueIndex;
  if (finalCatalog && proof.valid) {
    return { kind: "complete", catalog, labBots };
  }
  return { kind: "partial", catalog, labBots };
}

async function generateCredentials() {
  return Promise.all(
    LAB_SLUGS.map(async (slug) => {
      const key = `botspace_${crypto.randomBytes(24).toString("base64url")}`;
      const lookupHash = crypto.createHash("sha256").update(key).digest("hex");
      const verifierHash = await bcrypt.hash(key, BCRYPT_ROUNDS);
      if (!(await bcrypt.compare(key, verifierHash))) {
        throw new SafeMigrationError(
          "Credential generation verification failed",
        );
      }
      return { slug, key, lookupHash, verifierHash };
    }),
  );
}

async function provision(credentials) {
  const credentialBySlug = new Map(
    credentials.map((credential) => [credential.slug, credential]),
  );
  return sql.begin(async (transaction) => {
    await transaction.unsafe("SET LOCAL lock_timeout = '10s'");
    await transaction.unsafe("SET LOCAL statement_timeout = '120s'");
    await transaction`
      SELECT pg_advisory_xact_lock(
        hashtextextended('pw7404-1058-canonical-lab-residents', 0)
      )
    `;
    await transaction.unsafe("LOCK TABLE lab_bots IN ACCESS EXCLUSIVE MODE");
    await transaction.unsafe(
      "LOCK TABLE agents, agent_credentials, bot_profiles, bot_configs IN SHARE ROW EXCLUSIVE MODE",
    );
    await assertExpectedTarget(transaction);

    const lockedState = await inspectState(transaction);
    if (lockedState.kind === "complete") return { created: false };
    if (lockedState.kind !== "pristine") {
      throw new SafeMigrationError(
        "Canonical Lab resident state is partial or ambiguous; refusing apply",
      );
    }

    if (!lockedState.catalog.hasAgentId) {
      await transaction.unsafe(
        "ALTER TABLE lab_bots ADD COLUMN agent_id uuid NULL",
      );
    }
    const createdAgents = new Map();
    for (const labBot of lockedState.labBots) {
      const credential = credentialBySlug.get(labBot.slug);
      if (!credential) {
        throw new SafeMigrationError("A generated Lab credential is missing");
      }
      const [agent] = await transaction`
        INSERT INTO agents (
          name, api_key, api_key_hash, description, metadata, karma,
          is_verified, is_claimed, resident_visibility, moderation_status,
          owner_platform, created_at, updated_at
        ) VALUES (
          ${labBot.slug},
          ${credential.lookupHash},
          ${credential.verifierHash},
          ${labBot.tagline},
          ${transaction.json({
            identity: "canonical-lab-resident",
            labBotId: labBot.id,
            labSlug: labBot.slug,
          })},
          0, true, false, 'public', 'active', NULL, now(), now()
        )
        RETURNING id
      `;
      const updatedCredentials = await transaction`
        UPDATE agent_credentials
        SET credential_family = 'botspace',
            verifier_kind = 'bcrypt',
            verifier_hash = ${credential.verifierHash},
            label = 'canonical-lab-primary'
        WHERE agent_id = ${agent.id}
          AND lookup_hash = ${credential.lookupHash}
          AND revoked_at IS NULL
        RETURNING id
      `;
      if (updatedCredentials.length !== 1) {
        throw new SafeMigrationError(
          "The canonical credential trigger did not create exactly one primary row",
        );
      }
      await transaction`
        INSERT INTO bot_profiles (
          agent_id, mood, bio, status_message, accent_color, updated_at
        ) VALUES (
          ${agent.id}, 'Curious', ${labBot.personality}, ${labBot.tagline},
          ${labBot.accent_color}, now()
        )
      `;
      await transaction`
        INSERT INTO bot_configs (
          agent_id, bot_name, display_name, bot_type, space, tagline,
          specialty, category, mood, accent_color, personality, system_prompt,
          avatar_seed, model_preference, temperature, is_active, is_founding,
          total_queries, karma, follower_count, following_count,
          created_at, updated_at
        ) VALUES (
          ${agent.id}, ${labBot.slug}, ${labBot.name}, 'lab-resident', 'lab',
          ${labBot.tagline}, ${labBot.subject}, 'Lab', 'Curious',
          ${labBot.accent_color}, ${labBot.personality}, ${labBot.mega_prompt},
          ${labBot.slug}, 'qwen-3-235b-a22b-instruct-2507', 0.3, true, false,
          0, 0, 0, 0, now(), now()
        )
      `;
      const updated = await transaction`
        UPDATE lab_bots
        SET agent_id = ${agent.id}, updated_at = now()
        WHERE id = ${labBot.id} AND agent_id IS NULL
        RETURNING id
      `;
      if (updated.length !== 1) {
        throw new SafeMigrationError(
          "A Lab resident link changed concurrently",
        );
      }
      createdAgents.set(labBot.slug, agent.id);
    }

    await transaction.unsafe(
      "ALTER TABLE lab_bots ALTER COLUMN agent_id SET NOT NULL",
    );
    await transaction.unsafe(`
      ALTER TABLE lab_bots
      ADD CONSTRAINT lab_bots_agent_id_agents_id_fk
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
    `);
    await transaction.unsafe(`
      CREATE UNIQUE INDEX lab_bots_agent_id_unique_idx
      ON lab_bots (agent_id)
    `);

    const finalState = await inspectState(transaction);
    if (
      finalState.kind !== "complete" ||
      createdAgents.size !== LAB_SLUGS.length
    ) {
      throw new SafeMigrationError(
        "Canonical Lab resident post-provision invariants failed",
      );
    }
    return { created: true, agentIds: createdAgents };
  });
}

async function verifyGeneratedCredentials(credentials) {
  const proof = await completeProof(sql, true);
  if (!proof.valid) {
    throw new SafeMigrationError("Committed Lab resident verification failed");
  }
  const proofBySlug = new Map(proof.rows.map((row) => [row.slug, row]));
  for (const credential of credentials) {
    const row = proofBySlug.get(credential.slug);
    if (
      !row ||
      row.lookup_hash !== credential.lookupHash ||
      !(await bcrypt.compare(credential.key, row.verifier_hash))
    ) {
      throw new SafeMigrationError("Committed credential verification failed");
    }
  }
}

async function writeCredentials(output, credentials, agentIds) {
  if (output.initialSize !== 0) {
    throw new SafeMigrationError(
      "Credential output must be empty before first-time provisioning",
    );
  }
  const pathState = await lstat(output.outputPath).catch(() => null);
  const openedState = await output.handle.stat();
  if (
    !pathState ||
    pathState.dev !== openedState.dev ||
    pathState.ino !== openedState.ino ||
    (openedState.mode & 0o777) !== 0o600 ||
    openedState.uid !== 0 ||
    openedState.size !== 0
  ) {
    throw new SafeMigrationError("Credential output changed before write");
  }
  const payload = `${JSON.stringify(
    {
      version: "PW7404-1058",
      generatedAt: new Date().toISOString(),
      credentials: credentials.map((credential) => ({
        slug: credential.slug,
        agentId: agentIds.get(credential.slug),
        credential: credential.key,
      })),
    },
    null,
    2,
  )}\n`;
  try {
    await output.handle.writeFile(payload, { encoding: "utf8" });
    await output.handle.sync();
    const writtenState = await output.handle.stat();
    if (writtenState.size !== Buffer.byteLength(payload)) {
      throw new Error("short write");
    }
  } catch {
    await output.handle.truncate(0).catch(() => {});
    await output.handle.sync().catch(() => {});
    throw new SafeMigrationError(
      "Credential output write failed after database commit",
    );
  }
}

function clearCredentials(credentials) {
  for (const credential of credentials ?? []) {
    credential.key = "";
    credential.lookupHash = "";
    credential.verifierHash = "";
  }
}

let output;
let generatedCredentials;
try {
  validateStartupConfiguration();
  sql = createSqlClient();
  await assertExpectedTarget();
  const state = await inspectState();
  if (!apply) {
    if (state.kind !== "complete") {
      throw new SafeMigrationError(
        state.kind === "pristine"
          ? "migration is required"
          : "state is partial or ambiguous",
      );
    }
    console.log(`${RECEIPT}: PASS (check; residents=${LAB_SLUGS.length})`);
  } else {
    output = await openCredentialOutput();
    if (state.kind === "partial") {
      throw new SafeMigrationError(
        "Canonical Lab resident state is partial or ambiguous; refusing apply",
      );
    }
    if (state.kind === "complete") {
      console.log(`${RECEIPT}: PASS (apply; already complete)`);
    } else {
      if (output.initialSize !== 0) {
        throw new SafeMigrationError(
          "Credential output must be empty before first-time provisioning",
        );
      }
      generatedCredentials = await generateCredentials();
      let result;
      try {
        result = await provision(generatedCredentials);
      } catch (error) {
        if (error instanceof SafeMigrationError) throw error;
        throw new SafeMigrationError(
          "Provisioning transaction failed and was rolled back",
        );
      }
      if (!result.created) {
        console.log(`${RECEIPT}: PASS (apply; already complete)`);
      } else {
        await verifyGeneratedCredentials(generatedCredentials);
        await writeCredentials(output, generatedCredentials, result.agentIds);
        console.log(`${RECEIPT}: PASS (apply; residents=${LAB_SLUGS.length})`);
      }
    }
  }
} catch (error) {
  const message =
    error instanceof SafeMigrationError
      ? error.message
      : "database operation failed; no credential material was printed";
  console.error(`${RECEIPT}: FAIL (${message})`);
  process.exitCode = 1;
} finally {
  clearCredentials(generatedCredentials);
  await output?.handle.close().catch(() => {});
  await sql?.end({ timeout: 5 }).catch(() => {});
}
