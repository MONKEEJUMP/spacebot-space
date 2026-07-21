import assert from "node:assert/strict";
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

const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

let checks = 0;
try {
  const columns = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('chat_conversations', 'lucy_cycles')
  `;
  const columnSet = new Set(
    columns.map((row) => `${row.table_name}.${row.column_name}`),
  );
  for (const column of [
    "chat_conversations.actor_principal_type",
    "chat_conversations.actor_principal_id",
    "chat_conversations.target_agent_id",
    "chat_conversations.canonicalized_at",
    "lucy_cycles.request_id",
    "lucy_cycles.turn_id",
    "lucy_cycles.input_hash",
    "lucy_cycles.lease_owner",
    "lucy_cycles.lease_expires_at",
    "lucy_cycles.attempt_count",
    "lucy_cycles.output",
  ]) {
    assert.ok(columnSet.has(column), `missing required column ${column}`);
    checks += 1;
  }

  const constraints = await sql`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid IN (
      'public.chat_conversations'::regclass,
      'public.lucy_cycles'::regclass
    )
  `;
  const constraintSet = new Set(constraints.map((row) => row.conname));
  for (const constraint of [
    "chat_conversations_cycle_scope_unique",
    "chat_conversations_canonical_scope_check",
    "lucy_cycles_status_check",
    "lucy_cycles_actor_type_check",
    "lucy_cycles_conversation_scope_fk",
  ]) {
    assert.ok(
      constraintSet.has(constraint),
      `missing constraint ${constraint}`,
    );
    checks += 1;
  }

  const indexes = await sql`
    SELECT index_class.relname AS indexname,
           pg_index.indisvalid,
           pg_index.indisready
    FROM pg_index
    JOIN pg_class index_class ON index_class.oid = pg_index.indexrelid
    JOIN pg_class table_class ON table_class.oid = pg_index.indrelid
    JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
    WHERE namespace.nspname = 'public'
      AND table_class.relname IN ('chat_conversations', 'lucy_cycles')
  `;
  const indexMap = new Map(indexes.map((row) => [row.indexname, row]));
  for (const index of [
    "chat_conversations_canonical_actor_target_unique_idx",
    "lucy_cycles_request_unique_idx",
    "lucy_cycles_turn_unique_idx",
    "lucy_cycles_lease_idx",
  ]) {
    const state = indexMap.get(index);
    assert.ok(state, `missing index ${index}`);
    assert.equal(state.indisvalid, true, `invalid index ${index}`);
    assert.equal(state.indisready, true, `unready index ${index}`);
    checks += 3;
  }

  const [integrity] = await sql`
    SELECT
      (SELECT count(*)::int FROM chat_conversations
       WHERE (actor_principal_type IS NULL)::int
           + (actor_principal_id IS NULL)::int
           + (target_agent_id IS NULL)::int
           + (canonicalized_at IS NULL)::int NOT IN (0, 4)) AS partial_scopes,
      (SELECT count(*)::int FROM (
        SELECT actor_principal_type, actor_principal_id, target_agent_id
        FROM chat_conversations
        WHERE actor_principal_type IS NOT NULL
        GROUP BY actor_principal_type, actor_principal_id, target_agent_id
        HAVING count(*) > 1
      ) duplicates) AS duplicate_scopes,
      (SELECT count(*)::int
       FROM lucy_cycles cycle
       LEFT JOIN chat_conversations conversation
         ON conversation.id = cycle.conversation_id
        AND conversation.actor_principal_type = cycle.actor_principal_type
        AND conversation.actor_principal_id = cycle.actor_principal_id
        AND conversation.target_agent_id = cycle.target_agent_id
       WHERE conversation.id IS NULL) AS cycle_scope_mismatches
  `;
  assert.equal(
    integrity.partial_scopes,
    0,
    "partial canonical conversation scopes",
  );
  assert.equal(
    integrity.duplicate_scopes,
    0,
    "duplicate canonical conversation scopes",
  );
  assert.equal(
    integrity.cycle_scope_mismatches,
    0,
    "cycle/conversation scope mismatches",
  );
  checks += 3;

  console.log(
    `PW7404-1035 LUCY cycle database: PASS (${checks} checks; read-only)`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
