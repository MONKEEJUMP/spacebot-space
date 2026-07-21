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
if (apply && process.env.SPACEBOT_APPLY_AGENT_RELATIONSHIPS !== "1") {
  throw new Error(
    "Set SPACEBOT_APPLY_AGENT_RELATIONSHIPS=1 before using --apply",
  );
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

const expectedIndexes = {
  messages_sender_recipient_timeline_idx:
    "(sender_id, recipient_id, created_at desc, id desc)",
  messages_recipient_sender_timeline_idx:
    "(recipient_id, sender_id, created_at desc, id desc)",
  messages_recipient_unread_timeline_idx:
    "(recipient_id, sender_id, created_at desc, id desc)",
};

function normalizeDefinition(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

async function ensureConcurrentIndex(name, statement) {
  const [existing] = await sql`
    SELECT pg_index.indisvalid,
           pg_index.indisready,
           pg_get_indexdef(pg_index.indexrelid) AS indexdef
    FROM pg_index
    JOIN pg_class index_class ON index_class.oid = pg_index.indexrelid
    WHERE index_class.relname = ${name}
  `;
  const expected = expectedIndexes[name];
  const matches =
    existing?.indisvalid === true &&
    existing?.indisready === true &&
    normalizeDefinition(existing.indexdef).includes(expected);
  if (matches) return;

  await sql.unsafe("SET lock_timeout = '10s'");
  await sql.unsafe("SET statement_timeout = '120s'");
  if (existing) {
    await sql.unsafe(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
  }
  await sql.unsafe(statement);
}

async function inspect() {
  const [constraint] = await sql`
    SELECT convalidated
    FROM pg_constraint
    WHERE conrelid = 'public.machine_follows'::regclass
      AND conname = 'ck_machine_follows_no_self'
  `;
  const indexes = await sql`
    SELECT index_class.relname AS indexname,
           pg_index.indisvalid,
           pg_index.indisready,
           pg_get_indexdef(pg_index.indexrelid) AS indexdef
    FROM pg_index
    JOIN pg_class index_class ON index_class.oid = pg_index.indexrelid
    JOIN pg_class table_class ON table_class.oid = pg_index.indrelid
    JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
    WHERE namespace.nspname = 'public'
      AND table_class.relname = 'messages'
  `;
  const indexMap = new Map(indexes.map((row) => [row.indexname, row]));
  const missingIndexes = Object.entries(expectedIndexes)
    .filter(([name, fragment]) => {
      const state = indexMap.get(name);
      return (
        !state ||
        !state.indisvalid ||
        !state.indisready ||
        !normalizeDefinition(state.indexdef).includes(fragment)
      );
    })
    .map(([name]) => name);

  const [integrity] = await sql`
    SELECT
      (SELECT count(*)::int
       FROM follows AS legacy
       LEFT JOIN machine_follows AS canonical
         ON canonical.follower_id = legacy.follower_id
        AND canonical.followed_id = legacy.following_id
       WHERE legacy.follower_id <> legacy.following_id
         AND canonical.id IS NULL) AS follows_only,
      (SELECT count(*)::int
       FROM machine_follows
       WHERE follower_id = followed_id) AS self_follows,
      (SELECT count(*)::int
       FROM (
         SELECT follower_id, followed_id
         FROM machine_follows
         GROUP BY follower_id, followed_id
         HAVING count(*) > 1
       ) AS duplicate_pairs) AS duplicate_pairs,
      (SELECT count(*)::int
       FROM bot_configs AS config
       WHERE config.agent_id IS NOT NULL
         AND (
           config.following_count <> (
             SELECT count(*)::int FROM machine_follows
             WHERE follower_id = config.agent_id
           )
           OR config.follower_count <> (
             SELECT count(*)::int FROM machine_follows
             WHERE followed_id = config.agent_id
           )
         )) AS cached_count_drift
  `;

  return {
    constraintValid: constraint?.convalidated === true,
    missingIndexes,
    integrity,
  };
}

try {
  if (apply) {
    await sql.begin(async (transaction) => {
      await transaction.unsafe("SET LOCAL lock_timeout = '10s'");
      await transaction.unsafe("SET LOCAL statement_timeout = '60s'");
      await transaction.unsafe(`
        INSERT INTO machine_follows (follower_id, followed_id, created_at)
        SELECT follower_id, following_id, created_at
        FROM follows
        WHERE follower_id <> following_id
        ON CONFLICT (follower_id, followed_id) DO NOTHING
      `);
      await transaction.unsafe(`
        DELETE FROM machine_follows WHERE follower_id = followed_id
      `);
      await transaction.unsafe(`
        ALTER TABLE machine_follows
          DROP CONSTRAINT IF EXISTS ck_machine_follows_no_self
      `);
      await transaction.unsafe(`
        ALTER TABLE machine_follows
          ADD CONSTRAINT ck_machine_follows_no_self
          CHECK (follower_id <> followed_id) NOT VALID
      `);
      await transaction.unsafe(`
        ALTER TABLE machine_follows
          VALIDATE CONSTRAINT ck_machine_follows_no_self
      `);
      await transaction.unsafe(`
        UPDATE bot_configs AS config
        SET
          following_count = (
            SELECT count(*)::int FROM machine_follows
            WHERE follower_id = config.agent_id
          ),
          follower_count = (
            SELECT count(*)::int FROM machine_follows
            WHERE followed_id = config.agent_id
          ),
          updated_at = now()
        WHERE config.agent_id IS NOT NULL
      `);
    });

    await ensureConcurrentIndex(
      "messages_sender_recipient_timeline_idx",
      `CREATE INDEX CONCURRENTLY messages_sender_recipient_timeline_idx
         ON messages (sender_id, recipient_id, created_at DESC, id DESC)`,
    );
    await ensureConcurrentIndex(
      "messages_recipient_sender_timeline_idx",
      `CREATE INDEX CONCURRENTLY messages_recipient_sender_timeline_idx
         ON messages (recipient_id, sender_id, created_at DESC, id DESC)`,
    );
    await ensureConcurrentIndex(
      "messages_recipient_unread_timeline_idx",
      `CREATE INDEX CONCURRENTLY messages_recipient_unread_timeline_idx
         ON messages (recipient_id, sender_id, created_at DESC, id DESC)
         WHERE is_read = false AND read_at IS NULL`,
    );
  }

  const state = await inspect();
  const failures = [];
  if (!state.constraintValid) failures.push("self-follow constraint");
  failures.push(...state.missingIndexes.map((name) => `index:${name}`));
  for (const [name, value] of Object.entries(state.integrity)) {
    if (value !== 0) failures.push(`${name}:${value}`);
  }
  if (failures.length > 0) {
    throw new Error(
      `Canonical relationship check failed: ${failures.join(", ")}`,
    );
  }

  console.log(
    `PW7404-1044 canonical agent relationships: PASS (${
      apply ? "apply" : "check"
    }; follows_only=0; self_follows=0; duplicate_pairs=0; cached_count_drift=0)`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
