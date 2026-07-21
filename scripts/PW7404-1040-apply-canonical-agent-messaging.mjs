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
const checkOnly = process.argv.includes("--check") || !apply;
if (apply && process.env.SPACEBOT_APPLY_AGENT_MESSAGING !== "1") {
  throw new Error(
    "Set SPACEBOT_APPLY_AGENT_MESSAGING=1 before using --apply",
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
  messages_sender_request_unique_idx: [
    "unique index",
    "(sender_id, client_request_id)",
    "where (client_request_id is not null)",
  ],
  messages_created_idx: ["(created_at desc, id desc)"],
  messages_recipient_unread_idx: [
    "(recipient_id, is_read, created_at desc, id desc)",
  ],
  messages_sender_timeline_idx: [
    "(sender_id, created_at desc, id desc)",
  ],
  messages_recipient_timeline_idx: [
    "(recipient_id, created_at desc, id desc)",
  ],
};

function normalizeDefinition(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function indexMatches(state, fragments) {
  if (!state || !state.indisvalid || !state.indisready) return false;
  const definition = normalizeDefinition(state.indexdef);
  return fragments.every((fragment) => definition.includes(fragment));
}

async function inspectSchema() {
  const columns = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
  `;
  const columnSet = new Set(columns.map((row) => row.column_name));

  const constraints = await sql`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
  `;
  const constraintSet = new Set(constraints.map((row) => row.conname));

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

  const requiredColumns = [
    "metadata",
    "client_request_id",
    "request_fingerprint",
    "read_at",
  ];
  const requiredConstraints = [
    "messages_request_pair_check",
    "messages_request_key_check",
    "messages_request_fingerprint_check",
    "messages_read_state_check",
  ];

  const missing = [
    ...requiredColumns
      .filter((name) => !columnSet.has(name))
      .map((name) => `column:${name}`),
    ...Object.entries(expectedIndexes)
      .filter(([name, fragments]) => !indexMatches(indexMap.get(name), fragments))
      .map(([name]) => name)
      .map((name) => `index:${name}`),
    ...requiredConstraints
      .filter((name) => !constraintSet.has(name))
      .map((name) => `constraint:${name}`),
  ];

  return { missing, columns: columnSet, indexes: indexMap };
}

try {
  if (apply) {
    await sql.begin(async (transaction) => {
      await transaction.unsafe("SET LOCAL lock_timeout = '10s'");
      await transaction.unsafe("SET LOCAL statement_timeout = '60s'");
      await transaction.unsafe(`
        ALTER TABLE messages
          ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS client_request_id varchar(128),
          ADD COLUMN IF NOT EXISTS request_fingerprint varchar(64),
          ADD COLUMN IF NOT EXISTS read_at timestamptz
      `);
      await transaction.unsafe(`
        UPDATE messages
        SET read_at = created_at AT TIME ZONE 'UTC'
        WHERE is_read = true
          AND read_at IS NULL
      `);
      await transaction.unsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'messages_request_pair_check'
              AND conrelid = 'public.messages'::regclass
          ) THEN
            ALTER TABLE messages
              ADD CONSTRAINT messages_request_pair_check CHECK (
                (client_request_id IS NULL AND request_fingerprint IS NULL)
                OR (client_request_id IS NOT NULL AND request_fingerprint IS NOT NULL)
              );
          END IF;
        END $$
      `);
      await transaction.unsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'messages_request_key_check'
              AND conrelid = 'public.messages'::regclass
          ) THEN
            ALTER TABLE messages
              ADD CONSTRAINT messages_request_key_check CHECK (
                client_request_id IS NULL
                OR client_request_id ~ '^[A-Za-z0-9._:-]{1,128}$'
              );
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'messages_request_fingerprint_check'
              AND conrelid = 'public.messages'::regclass
          ) THEN
            ALTER TABLE messages
              ADD CONSTRAINT messages_request_fingerprint_check CHECK (
                request_fingerprint IS NULL
                OR request_fingerprint ~ '^[0-9a-f]{64}$'
              );
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'messages_read_state_check'
              AND conrelid = 'public.messages'::regclass
          ) THEN
            ALTER TABLE messages
              ADD CONSTRAINT messages_read_state_check CHECK (
                (is_read = false AND read_at IS NULL)
                OR (is_read = true AND read_at IS NOT NULL)
              );
          END IF;
        END $$
      `);
    });

    const beforeIndexes = await inspectSchema();
    for (const [name, fragments] of Object.entries(expectedIndexes)) {
      const state = beforeIndexes.indexes.get(name);
      if (state && !indexMatches(state, fragments)) {
        await sql.unsafe(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
      }
    }

    await sql.unsafe(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS messages_sender_request_unique_idx
        ON messages(sender_id, client_request_id)
        WHERE client_request_id IS NOT NULL
    `);
    await sql.unsafe(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_created_idx
        ON messages(created_at DESC, id DESC)
    `);
    await sql.unsafe(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_recipient_unread_idx
        ON messages(recipient_id, is_read, created_at DESC, id DESC)
    `);
    await sql.unsafe(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_sender_timeline_idx
        ON messages(sender_id, created_at DESC, id DESC)
    `);
    await sql.unsafe(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_recipient_timeline_idx
        ON messages(recipient_id, created_at DESC, id DESC)
    `);

    await sql`
      DELETE FROM bot_activity
      WHERE activity_type = 'message'
    `;
  }

  const inspection = await inspectSchema();
  if (inspection.missing.length > 0) {
    throw new Error(
      `Canonical messaging schema is incomplete: ${inspection.missing.join(", ")}`,
    );
  }

  const [integrity] = await sql`
    SELECT
      count(*) FILTER (
        WHERE (client_request_id IS NULL) <> (request_fingerprint IS NULL)
      )::int AS partial_request_pairs,
      count(*) FILTER (
        WHERE is_read = false AND read_at IS NOT NULL
      )::int AS unread_with_read_at,
      count(*) FILTER (
        WHERE is_read = true AND read_at IS NULL
      )::int AS read_without_read_at
    FROM messages
  `;
  if (integrity.partial_request_pairs !== 0) {
    throw new Error("messages contains partial idempotency request pairs");
  }
  if (integrity.unread_with_read_at !== 0) {
    throw new Error("messages contains unread rows with read_at timestamps");
  }
  if (integrity.read_without_read_at !== 0) {
    throw new Error("messages contains read rows without read_at timestamps");
  }

  const [privacy] = await sql`
    SELECT count(*)::int AS public_private_message_copies
    FROM bot_activity
    WHERE activity_type = 'message'
  `;
  if (privacy.public_private_message_copies !== 0) {
    throw new Error(
      `bot_activity still contains ${privacy.public_private_message_copies} private message copies`,
    );
  }

  console.log(
    `PW7404-1040 canonical agent messaging schema: PASS (${checkOnly ? "check" : "apply"}; public_private_message_copies=0)`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
