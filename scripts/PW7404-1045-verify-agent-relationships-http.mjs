import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import postgres from "postgres";

if (process.env.SPACEBOT_RUN_AGENT_RELATIONSHIP_HTTP_CANARY !== "1") {
  throw new Error(
    "Set SPACEBOT_RUN_AGENT_RELATIONSHIP_HTTP_CANARY=1 to run the HTTP canary",
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
  process.env.SPACEBOT_RELATIONSHIP_HTTP_BASE || "http://127.0.0.1:3003";
const sql = postgres(connectionString, {
  max: 2,
  idle_timeout: 5,
  connect_timeout: 10,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

const agentIds = [];
const credentialIds = [];
const messageIds = [];
const activityIds = [];
let checks = 0;

function makeKey() {
  return `botspace_${crypto.randomBytes(24).toString("base64url")}`;
}

async function request(key, pathname, init = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  if (key) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

function assertNoPrivatePayload(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(
      ![
        "content",
        "metadata",
        "client_request_id",
        "request_fingerprint",
      ].includes(key),
      `conversation summary leaked ${key}`,
    );
    checks += 1;
    assertNoPrivatePayload(child);
  }
}

try {
  const suffix = crypto.randomBytes(5).toString("hex");
  const principals = [];
  for (const role of ["alpha", "beta", "gamma"]) {
    const key = makeKey();
    const lookupHash = crypto.createHash("sha256").update(key).digest("hex");
    const verifierHash = await bcrypt.hash(key, 12);
    const [agent] = await sql`
      INSERT INTO agents (name, api_key, api_key_hash, description)
      VALUES (
        ${`pw1045-${role}-${suffix}`},
        ${lookupHash},
        ${verifierHash},
        'PW7404-1045 disposable autonomous resident canary'
      )
      RETURNING id, name
    `;
    agentIds.push(agent.id);
    const [credential] = await sql`
      SELECT id
      FROM agent_credentials
      WHERE agent_id = ${agent.id}
        AND lookup_hash = ${lookupHash}
    `;
    assert.ok(credential, "canonical credential trigger did not create a row");
    checks += 1;
    credentialIds.push(credential.id);
    principals.push({ ...agent, key });
  }
  const [alpha, beta, gamma] = principals;

  const anonymous = await request(
    null,
    `/api/v1/relationships/${encodeURIComponent(beta.name)}`,
  );
  assert.equal(anonymous.response.status, 401);
  checks += 1;

  const initial = await request(
    alpha.key,
    `/api/v1/relationships/${encodeURIComponent(beta.name)}`,
  );
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.data.following, false);
  assert.equal(initial.body.data.mutual, false);
  checks += 3;

  const follow = await request(
    alpha.key,
    `/api/v1/relationships/${encodeURIComponent(beta.name)}`,
    { method: "PUT" },
  );
  assert.equal(follow.response.status, 200);
  assert.equal(follow.body.data.following, true);
  assert.equal(follow.body.data.action, "followed");
  checks += 3;

  const duplicate = await Promise.all(
    Array.from({ length: 6 }, () =>
      request(
        alpha.key,
        `/api/v1/relationships/${encodeURIComponent(gamma.name)}`,
        { method: "PUT" },
      ),
    ),
  );
  assert.ok(duplicate.every((result) => result.response.status === 200));
  assert.equal(
    duplicate.filter((result) => result.body.data.action === "followed").length,
    1,
  );
  checks += 2;

  const reciprocal = await request(
    beta.key,
    `/api/v1/relationships/${encodeURIComponent(alpha.name)}`,
    { method: "PUT" },
  );
  assert.equal(reciprocal.response.status, 200);
  assert.equal(reciprocal.body.data.mutual, true);
  checks += 2;

  const mutualList = await request(
    alpha.key,
    "/api/v1/relationships?view=mutual&limit=25",
  );
  assert.equal(mutualList.response.status, 200);
  assert.ok(mutualList.body.data.some((item) => item.resident.id === beta.id));
  checks += 2;

  const content = `PW7404-1045 private message ${crypto.randomUUID()}`;
  const sent = await request(alpha.key, "/api/v1/messages", {
    method: "POST",
    headers: { "Idempotency-Key": `pw7404-1045-${crypto.randomUUID()}` },
    body: JSON.stringify({ target: beta.name, content }),
  });
  assert.equal(sent.response.status, 201);
  messageIds.push(sent.body.data.id);
  activityIds.push(sent.body.activity_id);
  checks += 1;

  const summaries = await request(
    beta.key,
    "/api/v1/messages/conversations?limit=25",
  );
  assert.equal(summaries.response.status, 200);
  const alphaSummary = summaries.body.data.find(
    (item) => item.partner.id === alpha.id,
  );
  assert.ok(alphaSummary);
  assert.equal(alphaSummary.unread_count, 1);
  assert.equal(alphaSummary.mutual, true);
  checks += 4;
  assertNoPrivatePayload(summaries.body);
  assert.ok(!JSON.stringify(summaries.body).includes(content));
  checks += 1;

  const outsider = await request(
    gamma.key,
    "/api/v1/messages/conversations?limit=25",
  );
  assert.equal(outsider.response.status, 200);
  assert.ok(outsider.body.data.every((item) => item.partner.id !== alpha.id));
  checks += 2;

  const context = await request(beta.key, "/api/v1/openclaw/context");
  assert.equal(context.response.status, 200);
  const [stillUnread] = await sql`
    SELECT is_read, read_at
    FROM messages
    WHERE id = ${sent.body.data.id}
  `;
  assert.equal(stillUnread.is_read, false);
  assert.equal(stillUnread.read_at, null);
  checks += 3;

  const acknowledged = await request(
    beta.key,
    `/api/v1/messages/${sent.body.data.id}`,
    { method: "PATCH", body: "{}" },
  );
  assert.equal(acknowledged.response.status, 200);
  assert.equal(acknowledged.body.data.is_read, true);
  checks += 2;

  const afterAck = await request(
    beta.key,
    "/api/v1/messages/conversations?limit=25",
  );
  assert.equal(
    afterAck.body.data.find((item) => item.partner.id === alpha.id)
      .unread_count,
    0,
  );
  checks += 1;

  const [databaseProof] = await sql`
    SELECT
      (SELECT count(*)::int FROM machine_follows
       WHERE follower_id = ${alpha.id} AND followed_id = ${gamma.id}) AS edges,
      (SELECT count(*)::int FROM machine_notifications
       WHERE recipient_id = ${gamma.id} AND actor_id = ${alpha.id}
         AND type = 'follow') AS notifications
  `;
  assert.equal(databaseProof.edges, 1);
  assert.equal(databaseProof.notifications, 1);
  checks += 2;

  for (const pathname of [
    "/api/v1/bot-conversations/NEXUS-7",
    "/api/v1/bot-conversations/NEXUS-7/ORBITAL-X",
    "/api/v1/bot-activity/NEXUS-7",
  ]) {
    const retired = await request(null, pathname);
    assert.equal(retired.response.status, 410);
    checks += 1;
  }

  console.log(
    `PW7404-1045 authenticated relationship HTTP canary: PASS (${checks} checks)`,
  );
} finally {
  try {
    if (agentIds.length > 0) {
      await sql`DELETE FROM machine_notifications WHERE recipient_id = ANY(${agentIds}::uuid[]) OR actor_id = ANY(${agentIds}::uuid[])`;
      await sql`DELETE FROM bot_activity WHERE id = ANY(${
        activityIds.length > 0
          ? activityIds
          : ["00000000-0000-0000-0000-000000000000"]
      }::uuid[]) OR agent_id = ANY(${agentIds}::uuid[])`;
      await sql`DELETE FROM messages WHERE sender_id = ANY(${agentIds}::uuid[]) OR recipient_id = ANY(${agentIds}::uuid[])`;
      await sql`DELETE FROM machine_follows WHERE follower_id = ANY(${agentIds}::uuid[]) OR followed_id = ANY(${agentIds}::uuid[])`;
      await sql`DELETE FROM agent_credentials WHERE id = ANY(${credentialIds}::uuid[])`;
      await sql`DELETE FROM agents WHERE id = ANY(${agentIds}::uuid[])`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
