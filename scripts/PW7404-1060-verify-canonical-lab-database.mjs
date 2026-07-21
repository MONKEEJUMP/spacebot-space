import assert from "node:assert/strict";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

if (process.env.SPACEBOT_RUN_LAB_DB_VERIFY !== "1") {
  throw new Error("Set SPACEBOT_RUN_LAB_DB_VERIFY=1 to run this verifier");
}

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const connectionString =
  process.env.SPACEBOT_LAB_MAINTENANCE_DATABASE_URL ??
  process.env.SPACEBOT_RESIDENT_TASK_MAINTENANCE_DATABASE_URL ??
  process.env.SPACEBOT_DATABASE_URL ??
  process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("SPACEBOT_LAB_MAINTENANCE_DATABASE_URL is required");
}

const guards = {
  database: process.env.SPACEBOT_EXPECTED_DATABASE,
  user: process.env.SPACEBOT_EXPECTED_DATABASE_USER,
  address: process.env.SPACEBOT_EXPECTED_SERVER_ADDRESS,
  port: process.env.SPACEBOT_EXPECTED_SERVER_PORT,
  sentinel: process.env.SPACEBOT_EXPECTED_SENTINEL_AGENT_ID,
};
for (const [name, value] of Object.entries(guards)) {
  if (!value || /\s/.test(value)) {
    throw new Error(`Set a whitespace-free SPACEBOT expected ${name} guard`);
  }
}

const expectedSlugs = [
  "atom-spark",
  "axiom-prime",
  "cipher-mind",
  "cosmo-sage",
  "deep-current",
  "fauna-link",
  "flora-root",
  "medi-core",
  "paleo-rex",
  "storm-watch",
  "terra-forge",
  "volt-rush",
];
const sql = postgres(connectionString, {
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

let checks = 0;
function receipt(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

try {
  const [target] = await sql`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           EXISTS (
             SELECT 1 FROM agents WHERE id = ${guards.sentinel}::uuid
           ) AS sentinel
  `;
  for (const field of ["database", "user", "address", "port"]) {
    receipt(target[field] === guards[field], `wrong ${field} target`);
  }
  receipt(target.sentinel === true, "database sentinel is missing");

  const [column] = await sql`
    SELECT is_nullable, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lab_bots'
      AND column_name = 'agent_id'
  `;
  receipt(Boolean(column), "lab_bots.agent_id exists");
  receipt(column.is_nullable === "NO", "lab_bots.agent_id is NOT NULL");
  receipt(column.data_type === "uuid", "lab_bots.agent_id is UUID");

  const [constraints] = await sql`
    SELECT count(*) FILTER (WHERE contype = 'f')::int AS foreign_keys
    FROM pg_constraint
    WHERE conrelid = 'public.lab_bots'::regclass
      AND conname = 'lab_bots_agent_id_agents_id_fk'
  `;
  receipt(constraints.foreign_keys === 1, "canonical agent FK exists");
  const [uniqueIndex] = await sql`
    SELECT count(*)::int AS count
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'lab_bots'
      AND indexname = 'lab_bots_agent_id_unique_idx'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%(agent_id)%'
  `;
  receipt(
    uniqueIndex.count === 1,
    "canonical agent link is unique",
  );

  const rows = await sql`
    SELECT lab.slug, lab.name, lab.agent_id, agent.name AS agent_name,
           agent.is_claimed, agent.moderation_status,
           agent.owner_platform, agent.owner_handle,
           config.bot_name, config.display_name, config.bot_type,
           config.space, config.is_active,
           profile.agent_id AS profile_agent_id,
           count(credential.id)::int AS active_credentials,
           count(credential.id) FILTER (
             WHERE credential.credential_family = 'botspace'
               AND credential.verifier_kind = 'bcrypt'
               AND credential.label = 'canonical-lab-primary'
           )::int AS canonical_credentials,
           (SELECT count(*)::int FROM human_agent_links AS human_link
            WHERE human_link.agent_id = agent.id) AS human_links
    FROM lab_bots AS lab
    JOIN agents AS agent ON agent.id = lab.agent_id
    JOIN bot_configs AS config ON config.agent_id = agent.id
    JOIN bot_profiles AS profile ON profile.agent_id = agent.id
    LEFT JOIN agent_credentials AS credential
      ON credential.agent_id = agent.id AND credential.revoked_at IS NULL
    WHERE lab.is_active = true
    GROUP BY lab.id, agent.id, config.id, profile.id
    ORDER BY lab.slug
  `;
  receipt(rows.length === 12, "exactly 12 active Lab residents resolve");
  assert.deepEqual(
    rows.map((row) => row.slug),
    expectedSlugs,
    "active Lab resident slug set differs",
  );
  checks += 1;
  for (const row of rows) {
    receipt(row.agent_name === row.slug, `${row.slug} agent name matches`);
    receipt(row.bot_name === row.slug, `${row.slug} config name matches`);
    receipt(row.display_name === row.name, `${row.slug} display name matches`);
    receipt(row.bot_type === "lab-resident", `${row.slug} config type matches`);
    receipt(row.space === "lab", `${row.slug} config space matches`);
    receipt(row.is_active === true, `${row.slug} config is active`);
    receipt(row.is_claimed === false, `${row.slug} needs no human claim`);
    receipt(
      row.owner_platform === null && row.owner_handle === null,
      `${row.slug} has no owner metadata`,
    );
    receipt(row.human_links === 0, `${row.slug} has no human ownership link`);
    receipt(
      row.moderation_status === "active",
      `${row.slug} resident is active`,
    );
    receipt(
      row.profile_agent_id === row.agent_id,
      `${row.slug} profile is canonical`,
    );
    receipt(
      row.active_credentials === 1,
      `${row.slug} has one active credential`,
    );
    receipt(
      row.canonical_credentials === 1,
      `${row.slug} has one canonical bcrypt credential`,
    );
  }

  const [legacy] = await sql`
    SELECT
      (SELECT count(*)::int FROM lab_conversations) AS conversations,
      (SELECT count(*)::int FROM lab_messages) AS messages
  `;
  receipt(
    legacy.conversations === 0 && legacy.messages === 0,
    "legacy Lab persistence remains empty",
  );

  const [orphans] = await sql`
    SELECT
      count(*) FILTER (
        WHERE conversation.actor_principal_type = 'human'
          AND human.id IS NULL
      )::int AS human_orphans,
      count(*) FILTER (
        WHERE conversation.actor_principal_type = 'agent'
          AND actor_agent.id IS NULL
      )::int AS agent_orphans,
      count(*) FILTER (
        WHERE conversation.target_agent_id IS NOT NULL
          AND target_agent.id IS NULL
      )::int AS target_orphans
    FROM chat_conversations AS conversation
    LEFT JOIN humans AS human
      ON conversation.actor_principal_type = 'human'
     AND human.id = conversation.actor_principal_id
    LEFT JOIN agents AS actor_agent
      ON conversation.actor_principal_type = 'agent'
     AND actor_agent.id = conversation.actor_principal_id
    LEFT JOIN agents AS target_agent
      ON target_agent.id = conversation.target_agent_id
  `;
  receipt(orphans.human_orphans === 0, "no human principal orphans");
  receipt(orphans.agent_orphans === 0, "no agent principal orphans");
  receipt(orphans.target_orphans === 0, "no target agent orphans");

  console.log(`Canonical Lab database verification passed: ${checks} checks.`);
} finally {
  await sql.end({ timeout: 5 });
}
