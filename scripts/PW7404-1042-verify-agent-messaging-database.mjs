import assert from "node:assert/strict";
import crypto from "node:crypto";
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

const runCanary =
  process.argv.includes("--database-canary") &&
  process.env.SPACEBOT_RUN_AGENT_MESSAGE_CANARY === "1";
if (
  process.argv.includes("--database-canary") &&
  process.env.SPACEBOT_RUN_AGENT_MESSAGE_CANARY !== "1"
) {
  throw new Error(
    "Set SPACEBOT_RUN_AGENT_MESSAGE_CANARY=1 to run the write canary",
  );
}

const sql = postgres(connectionString, {
  max: 2,
  idle_timeout: 5,
  connect_timeout: 10,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

let checks = 0;
let canaryMessageId = null;
let canaryActivityId = null;
let canarySenderId = null;
let canaryIdempotencyKey = null;

try {
  const columns = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
  `;
  const columnSet = new Set(columns.map((row) => row.column_name));
  for (const column of [
    "metadata",
    "client_request_id",
    "request_fingerprint",
    "read_at",
  ]) {
    assert.ok(columnSet.has(column), `missing messages.${column}`);
    checks += 1;
  }

  const constraints = await sql`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
  `;
  const constraintSet = new Set(constraints.map((row) => row.conname));
  for (const constraint of [
    "messages_request_pair_check",
    "messages_request_key_check",
    "messages_request_fingerprint_check",
    "messages_read_state_check",
  ]) {
    assert.ok(constraintSet.has(constraint), `missing ${constraint}`);
    checks += 1;
  }

  const indexes = await sql`
    SELECT index_class.relname AS indexname,
           pg_index.indisvalid,
           pg_index.indisready,
           pg_index.indisunique,
           pg_get_indexdef(pg_index.indexrelid) AS indexdef
    FROM pg_index
    JOIN pg_class index_class ON index_class.oid = pg_index.indexrelid
    JOIN pg_class table_class ON table_class.oid = pg_index.indrelid
    JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
    WHERE namespace.nspname = 'public'
      AND table_class.relname = 'messages'
  `;
  const indexMap = new Map(indexes.map((row) => [row.indexname, row]));
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
  for (const [index, fragments] of Object.entries(expectedIndexes)) {
    const state = indexMap.get(index);
    assert.ok(state, `missing ${index}`);
    assert.equal(state.indisvalid, true, `invalid ${index}`);
    assert.equal(state.indisready, true, `unready ${index}`);
    const definition = state.indexdef.toLowerCase().replace(/\s+/g, " ");
    for (const fragment of fragments) {
      assert.ok(
        definition.includes(fragment),
        `${index} missing definition fragment ${fragment}`,
      );
      checks += 1;
    }
    checks += 3;
  }
  assert.equal(
    indexMap.get("messages_sender_request_unique_idx").indisunique,
    true,
  );
  checks += 1;

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
  assert.equal(integrity.partial_request_pairs, 0);
  assert.equal(integrity.unread_with_read_at, 0);
  assert.equal(integrity.read_without_read_at, 0);
  checks += 3;

  const [privacy] = await sql`
    SELECT count(*)::int AS public_private_message_copies
    FROM bot_activity
    WHERE activity_type = 'message'
  `;
  assert.equal(privacy.public_private_message_copies, 0);
  checks += 1;

  if (runCanary) {
    const residents = await sql`
      SELECT id, name
      FROM agents
      ORDER BY created_at, id
      LIMIT 3
    `;
    assert.ok(residents.length >= 3, "three residents are required for canary");
    checks += 1;
    const [sender, recipient, outsider] = residents;
    const idempotencyKey = `pw7404-1042-${crypto.randomUUID()}`;
    const content = `PW7404-1042 canary ${crypto.randomUUID()}`;
    const fingerprint = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          content,
          metadata: {},
          target: recipient.name.trim().toLowerCase(),
        }),
      )
      .digest("hex");
    canarySenderId = sender.id;
    canaryIdempotencyKey = idempotencyKey;

    const inserted = await sql.begin(async (transaction) => {
      await transaction`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`agent-message:${sender.id}:${idempotencyKey}`}, 0)
        )
      `;
      const messageRows = await transaction`
        INSERT INTO messages (
          sender_id,
          recipient_id,
          content,
          client_request_id,
          request_fingerprint
        ) VALUES (
          ${sender.id},
          ${recipient.id},
          ${content},
          ${idempotencyKey},
          ${fingerprint}
        )
        RETURNING id, is_read, read_at
      `;
      const activityRows = await transaction`
        INSERT INTO bot_activity (
          agent_id,
          activity_type,
          target_agent_id,
          content,
          metadata
        ) VALUES (
          ${sender.id},
          'private_message',
          NULL,
          'Private message sent',
          ${sql.json({
            messageId: messageRows[0].id,
            privacy: "private",
            transport: "agent-direct-message-v1-canary",
          })}
        )
        RETURNING id, activity_type, target_agent_id, content
      `;
      return { message: messageRows[0], activity: activityRows[0] };
    });
    canaryMessageId = inserted.message.id;
    canaryActivityId = inserted.activity.id;
    assert.equal(inserted.message.is_read, false);
    assert.equal(inserted.message.read_at, null);
    assert.equal(inserted.activity.activity_type, "private_message");
    assert.equal(inserted.activity.target_agent_id, null);
    assert.equal(inserted.activity.content, "Private message sent");
    checks += 5;

    const replay = await sql`
      SELECT id, request_fingerprint
      FROM messages
      WHERE sender_id = ${sender.id}
        AND client_request_id = ${idempotencyKey}
    `;
    assert.equal(replay.length, 1);
    assert.equal(replay[0].id, canaryMessageId);
    assert.equal(replay[0].request_fingerprint, fingerprint);
    checks += 3;

    await assert.rejects(
      sql`
        INSERT INTO messages (
          sender_id,
          recipient_id,
          content,
          client_request_id,
          request_fingerprint
        ) VALUES (
          ${sender.id},
          ${outsider.id},
          'different payload',
          ${idempotencyKey},
          ${"f".repeat(64)}
        )
      `,
      /messages_sender_request_unique_idx|duplicate key/,
    );
    checks += 1;

    const visibleToSender = await sql`
      SELECT id FROM messages
      WHERE id = ${canaryMessageId}
        AND (sender_id = ${sender.id} OR recipient_id = ${sender.id})
    `;
    const visibleToRecipient = await sql`
      SELECT id FROM messages
      WHERE id = ${canaryMessageId}
        AND (sender_id = ${recipient.id} OR recipient_id = ${recipient.id})
    `;
    const visibleToOutsider = await sql`
      SELECT id FROM messages
      WHERE id = ${canaryMessageId}
        AND (sender_id = ${outsider.id} OR recipient_id = ${outsider.id})
    `;
    assert.equal(visibleToSender.length, 1);
    assert.equal(visibleToRecipient.length, 1);
    assert.equal(visibleToOutsider.length, 0);
    checks += 3;

    const senderAck = await sql`
      UPDATE messages
      SET is_read = true, read_at = now()
      WHERE id = ${canaryMessageId}
        AND recipient_id = ${sender.id}
      RETURNING id
    `;
    assert.equal(senderAck.length, 0);
    checks += 1;

    const recipientAck = await sql`
      UPDATE messages
      SET is_read = true, read_at = now()
      WHERE id = ${canaryMessageId}
        AND recipient_id = ${recipient.id}
        AND is_read = false
      RETURNING id, is_read, read_at
    `;
    assert.equal(recipientAck.length, 1);
    assert.equal(recipientAck[0].is_read, true);
    assert.ok(recipientAck[0].read_at instanceof Date);
    checks += 3;
  }

  console.log(
    `PW7404-1042 canonical agent messaging database: PASS (${checks} checks; canary=${runCanary})`,
  );
} finally {
  if (canaryActivityId) {
    await sql`DELETE FROM bot_activity WHERE id = ${canaryActivityId}`;
  }
  if (canarySenderId && canaryIdempotencyKey) {
    await sql`
      DELETE FROM messages
      WHERE sender_id = ${canarySenderId}
        AND client_request_id = ${canaryIdempotencyKey}
    `;
  } else if (canaryMessageId) {
    await sql`DELETE FROM messages WHERE id = ${canaryMessageId}`;
  }
  await sql.end({ timeout: 5 });
}
