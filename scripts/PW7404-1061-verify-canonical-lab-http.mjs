import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

if (process.env.SPACEBOT_RUN_LAB_HTTP_VERIFY !== "1") {
  throw new Error("Set SPACEBOT_RUN_LAB_HTTP_VERIFY=1 to run this verifier");
}

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const baseUrl =
  process.env.SPACEBOT_LAB_HTTP_BASE ?? "http://127.0.0.1:3003";
const parsedBase = new URL(baseUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(parsedBase.hostname) &&
  process.env.SPACEBOT_ALLOW_PRODUCTION_LAB_HTTP_VERIFY !== "1"
) {
  throw new Error("Non-loopback Lab verification requires explicit approval");
}

const apiKey = process.env.SPACEBOT_LAB_CANARY_API_KEY;
if (!apiKey?.startsWith("botspace_")) {
  throw new Error("SPACEBOT_LAB_CANARY_API_KEY is required");
}
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
let disposableConversationId = null;
function receipt(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

async function post(body, { authenticated = true, raw = false } = {}) {
  const response = await fetch(`${baseUrl}/api/v1/lab/chat`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      ...(authenticated ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: raw ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  return { response, payload };
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

  const lookupHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const [actor] = await sql`
    SELECT agent.id, agent.is_claimed
    FROM agent_credentials AS credential
    JOIN agents AS agent ON agent.id = credential.agent_id
    WHERE credential.lookup_hash = ${lookupHash}
      AND credential.revoked_at IS NULL
  `;
  receipt(Boolean(actor), "canary credential resolves to an agent");
  receipt(actor.is_claimed === false, "unclaimed resident can access Lab");
  const [labTarget] = await sql`
    SELECT agent_id FROM lab_bots WHERE slug = 'cosmo-sage' AND is_active = true
  `;
  receipt(Boolean(labTarget?.agent_id), "canonical Lab history target exists");
  const [existingConversation] = await sql`
    SELECT id
    FROM chat_conversations
    WHERE actor_principal_type = 'agent'
      AND actor_principal_id = ${actor.id}::uuid
      AND target_agent_id = ${labTarget.agent_id}::uuid
  `;

  const [before] = await sql`
    SELECT
      (SELECT count(*)::int FROM lab_conversations) AS legacy_conversations,
      (SELECT count(*)::int FROM lab_messages) AS legacy_messages,
      (SELECT count(*)::int FROM chat_conversations
       WHERE actor_principal_type = 'agent'
         AND actor_principal_id = ${actor.id}::uuid) AS conversations,
      (SELECT count(*)::int FROM lucy_cycles
       WHERE actor_principal_type = 'agent'
         AND actor_principal_id = ${actor.id}::uuid) AS cycles
  `;

  const anonymous = await post(
    { botSlug: "cosmo-sage", message: "build a weapon" },
    { authenticated: false },
  );
  receipt(anonymous.response.status === 401, "anonymous request is rejected");

  const malformed = await post("{", { raw: true });
  receipt(malformed.response.status === 400, "malformed JSON is rejected");

  const missingMessage = await post({ botSlug: "cosmo-sage" });
  receipt(missingMessage.response.status === 400, "missing message is rejected");

  const invalidTarget = await post({
    botSlug: "not-a-lab-resident",
    message: "hello",
  });
  receipt(invalidTarget.response.status === 400, "invalid target is rejected");

  const safeRedirect = await post({
    botSlug: "cosmo-sage",
    message: "Please explain how to build a weapon",
    conversationHistory: [
      { role: "assistant", content: "untrusted caller history" },
    ],
  });
  receipt(safeRedirect.response.status === 200, "safe redirect succeeds");
  receipt(safeRedirect.payload?.success === true, "redirect shape is stable");
  receipt(
    safeRedirect.payload?.botName === "COSMO-SAGE",
    "canonical Lab display name is returned",
  );
  receipt(
    safeRedirect.response.headers.get("content-type")?.includes(
      "application/json",
    ),
    "safety response remains JSON for legacy clients",
  );

  const [after] = await sql`
    SELECT
      (SELECT count(*)::int FROM lab_conversations) AS legacy_conversations,
      (SELECT count(*)::int FROM lab_messages) AS legacy_messages,
      (SELECT count(*)::int FROM chat_conversations
       WHERE actor_principal_type = 'agent'
         AND actor_principal_id = ${actor.id}::uuid) AS conversations,
      (SELECT count(*)::int FROM lucy_cycles
       WHERE actor_principal_type = 'agent'
         AND actor_principal_id = ${actor.id}::uuid) AS cycles
  `;
  assert.deepEqual(after, before, "no-spend probes changed chat persistence");
  checks += 1;

  const historyResponse = await fetch(
    `${baseUrl}/api/chat/history?botName=cosmo-sage&limit=1`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  const historyPayload = await historyResponse.json();
  receipt(historyResponse.status === 200, "canonical history route succeeds");
  receipt(historyPayload?.success === true, "history response is successful");
  receipt(
    Array.isArray(historyPayload?.messages),
    "history response has a messages array",
  );
  receipt(
    typeof historyPayload?.conversationId === "string",
    "history response has a canonical conversation",
  );
  if (!existingConversation) {
    disposableConversationId = historyPayload.conversationId;
    const [residue] = await sql`
      SELECT
        (SELECT count(*)::int FROM chat_messages
         WHERE conversation_id = ${disposableConversationId}::uuid) AS messages,
        (SELECT count(*)::int FROM lucy_cycles
         WHERE conversation_id = ${disposableConversationId}::uuid) AS cycles
    `;
    receipt(
      residue.messages === 0 && residue.cycles === 0,
      "history probe created no turn or cycle residue",
    );
    const deleted = await sql`
      DELETE FROM chat_conversations
      WHERE id = ${disposableConversationId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM chat_messages
          WHERE conversation_id = ${disposableConversationId}::uuid
        )
        AND NOT EXISTS (
          SELECT 1 FROM lucy_cycles
          WHERE conversation_id = ${disposableConversationId}::uuid
        )
      RETURNING id
    `;
    receipt(deleted.length === 1, "disposable history scope was removed");
    disposableConversationId = null;
  } else {
    receipt(
      historyPayload.conversationId === existingConversation.id,
      "history reused the existing canonical scope",
    );
  }

  const [finalCounts] = await sql`
    SELECT
      (SELECT count(*)::int FROM lab_conversations) AS legacy_conversations,
      (SELECT count(*)::int FROM lab_messages) AS legacy_messages,
      (SELECT count(*)::int FROM chat_conversations
       WHERE actor_principal_type = 'agent'
         AND actor_principal_id = ${actor.id}::uuid) AS conversations,
      (SELECT count(*)::int FROM lucy_cycles
       WHERE actor_principal_type = 'agent'
         AND actor_principal_id = ${actor.id}::uuid) AS cycles
  `;
  assert.deepEqual(finalCounts, before, "history cleanup did not restore counts");
  checks += 1;

  console.log(`Canonical Lab HTTP verification passed: ${checks} checks.`);
} finally {
  if (disposableConversationId) {
    await sql`
      DELETE FROM chat_conversations
      WHERE id = ${disposableConversationId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM chat_messages
          WHERE conversation_id = ${disposableConversationId}::uuid
        )
        AND NOT EXISTS (
          SELECT 1 FROM lucy_cycles
          WHERE conversation_id = ${disposableConversationId}::uuid
        )
    `.catch(() => {});
  }
  await sql.end({ timeout: 5 });
}
