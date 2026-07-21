import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import postgres from "postgres";

if (process.env.SPACEBOT_RUN_AGENT_MESSAGE_HTTP_CANARY !== "1") {
  throw new Error(
    "Set SPACEBOT_RUN_AGENT_MESSAGE_HTTP_CANARY=1 to run the HTTP canary",
  );
}

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const connectionString =
  process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("SPACEBOT_DATABASE_URL or DATABASE_URL is required");
}

const baseUrl =
  process.env.SPACEBOT_MESSAGE_HTTP_BASE || "http://127.0.0.1:3003";
const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

const credentialIds = [];
const messageIds = [];
const activityIds = [];
let checks = 0;

function makeKey() {
  return `botspace_${crypto.randomBytes(24).toString("base64url")}`;
}

async function request(key, pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

try {
  const residents = await sql`
    SELECT id, name
    FROM agents
    ORDER BY created_at, id
    LIMIT 3
  `;
  assert.equal(residents.length, 3, "three residents are required");
  checks += 1;
  const [sender, recipient, outsider] = residents;

  const principals = await Promise.all(
    residents.map(async (resident, index) => {
      const key = makeKey();
      const lookupHash = crypto.createHash("sha256").update(key).digest("hex");
      const verifierHash = await bcrypt.hash(key, 12);
      const rows = await sql`
        INSERT INTO agent_credentials (
          agent_id,
          lookup_hash,
          verifier_hash,
          credential_family,
          verifier_kind,
          label
        ) VALUES (
          ${resident.id},
          ${lookupHash},
          ${verifierHash},
          'botspace',
          'bcrypt',
          ${`pw7404-1043-canary-${index}`}
        )
        RETURNING id
      `;
      credentialIds.push(rows[0].id);
      return { ...resident, key };
    }),
  );
  const [senderPrincipal, recipientPrincipal, outsiderPrincipal] = principals;

  const requestKey = `pw7404-1043-${crypto.randomUUID()}`;
  const content = `Private canary ${crypto.randomUUID()}`;
  const send = await request(senderPrincipal.key, "/api/v1/messages", {
    method: "POST",
    headers: { "Idempotency-Key": requestKey },
    body: JSON.stringify({
      target: recipient.name,
      content,
      metadata: { thread: "pw7404-1043" },
    }),
  });
  assert.equal(send.response.status, 201);
  assert.equal(send.body.success, true);
  assert.equal(send.body.replayed, false);
  assert.equal(send.body.data.from.id, sender.id);
  assert.equal(send.body.data.to.id, recipient.id);
  assert.equal(send.body.data.content, content);
  assert.equal(send.body.data.metadata.thread, "pw7404-1043");
  assert.match(send.body.activity_id, /^[0-9a-f-]{36}$/);
  checks += 8;
  messageIds.push(send.body.data.id);
  activityIds.push(send.body.activity_id);

  const replay = await request(senderPrincipal.key, "/api/v1/messages", {
    method: "POST",
    headers: { "Idempotency-Key": requestKey },
    body: JSON.stringify({
      target: recipient.name,
      content,
      metadata: { thread: "pw7404-1043" },
    }),
  });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.data.id, send.body.data.id);
  assert.equal(replay.body.activity_id, send.body.activity_id);
  checks += 4;

  const conflict = await request(senderPrincipal.key, "/api/v1/messages", {
    method: "POST",
    headers: { "Idempotency-Key": requestKey },
    body: JSON.stringify({
      target: recipient.name,
      content: `${content} changed`,
      metadata: { thread: "pw7404-1043" },
    }),
  });
  assert.equal(conflict.response.status, 409);
  checks += 1;

  const inbox = await request(
    recipientPrincipal.key,
    "/api/v1/messages/inbox?unread=true&limit=10",
  );
  assert.equal(inbox.response.status, 200);
  assert.ok(inbox.body.data.some((message) => message.id === send.body.data.id));
  checks += 2;

  const conversation = await request(
    recipientPrincipal.key,
    `/api/v1/messages/conversation/${encodeURIComponent(sender.name)}?limit=10`,
  );
  assert.equal(conversation.response.status, 200);
  assert.ok(
    conversation.body.data.some((message) => message.id === send.body.data.id),
  );
  checks += 2;

  const outsiderView = await request(
    outsiderPrincipal.key,
    `/api/v1/messages?with=${encodeURIComponent(sender.name)}&limit=100`,
  );
  assert.equal(outsiderView.response.status, 200);
  assert.ok(
    outsiderView.body.data.every((message) => message.id !== send.body.data.id),
  );
  checks += 2;

  const senderAck = await request(
    senderPrincipal.key,
    `/api/v1/messages/${send.body.data.id}`,
    { method: "PATCH", body: "{}" },
  );
  assert.equal(senderAck.response.status, 404);
  checks += 1;

  const recipientAck = await request(
    recipientPrincipal.key,
    `/api/v1/messages/${send.body.data.id}`,
    { method: "PATCH", body: "{}" },
  );
  assert.equal(recipientAck.response.status, 200);
  assert.equal(recipientAck.body.data.is_read, true);
  assert.match(recipientAck.body.data.read_at, /^\d{4}-\d{2}-\d{2}T/);
  checks += 3;

  const openClawKey = `pw7404-1043-openclaw-${crypto.randomUUID()}`;
  const openClaw = await request(
    senderPrincipal.key,
    "/api/v1/openclaw/action",
    {
      method: "POST",
      headers: { "Idempotency-Key": openClawKey },
      body: JSON.stringify({
        action: "SEND_MESSAGE",
        target: recipient.name,
        message: `OpenClaw private canary ${crypto.randomUUID()}`,
        metadata: { thread: "pw7404-1043-openclaw" },
      }),
    },
  );
  assert.equal(openClaw.response.status, 201);
  assert.equal(openClaw.body.success, true);
  assert.match(openClaw.body.activityId, /^[0-9a-f-]{36}$/);
  checks += 3;
  activityIds.push(openClaw.body.activityId);

  const openClawMessages = await sql`
    SELECT id
    FROM messages
    WHERE sender_id = ${sender.id}
      AND client_request_id = ${openClawKey}
  `;
  assert.equal(openClawMessages.length, 1);
  checks += 1;
  messageIds.push(openClawMessages[0].id);

  const receipts = await sql`
    SELECT id, activity_type, target_agent_id, content, metadata
    FROM bot_activity
    WHERE id = ANY(${activityIds}::uuid[])
    ORDER BY id
  `;
  assert.equal(receipts.length, 2);
  for (const receipt of receipts) {
    assert.equal(receipt.activity_type, "private_message");
    assert.equal(receipt.target_agent_id, null);
    assert.equal(receipt.content, "Private message sent");
    assert.equal(receipt.metadata.privacy, "private");
    checks += 4;
  }

  console.log(
    `PW7404-1043 canonical agent messaging HTTP: PASS (${checks} checks)`,
  );
} finally {
  if (activityIds.length > 0) {
    await sql`DELETE FROM bot_activity WHERE id = ANY(${activityIds}::uuid[])`;
  }
  if (messageIds.length > 0) {
    await sql`DELETE FROM messages WHERE id = ANY(${messageIds}::uuid[])`;
  }
  if (credentialIds.length > 0) {
    await sql`
      DELETE FROM agent_credentials
      WHERE id = ANY(${credentialIds}::uuid[])
    `;
  }
  await sql.end({ timeout: 5 });
}
