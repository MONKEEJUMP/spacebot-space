import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

if (process.env.SPACEBOT_RUN_RESIDENCY_HTTP_CANARY !== "1") {
  throw new Error(
    "Set SPACEBOT_RUN_RESIDENCY_HTTP_CANARY=1 to run this canary",
  );
}

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const connectionString =
  process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Database URL is required");

const targetGuards = {
  database: process.env.SPACEBOT_EXPECTED_DATABASE,
  user: process.env.SPACEBOT_EXPECTED_DATABASE_USER,
  address: process.env.SPACEBOT_EXPECTED_SERVER_ADDRESS,
  port: process.env.SPACEBOT_EXPECTED_SERVER_PORT,
  sentinel: process.env.SPACEBOT_EXPECTED_SENTINEL_AGENT_ID,
};
for (const [name, value] of Object.entries(targetGuards)) {
  if (!value || /\s/.test(value)) {
    throw new Error(`Set a whitespace-free SPACEBOT expected ${name} guard`);
  }
}

const baseUrl =
  process.env.SPACEBOT_RESIDENCY_HTTP_BASE || "http://127.0.0.1:3003";
const sql = postgres(connectionString, {
  max: 2,
  idle_timeout: 5,
  connect_timeout: 10,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

let agentId = null;
let agentName = null;
let bindingAgentId = null;
let apiKey = null;
let checks = 0;

async function request(pathname, init = {}) {
  const headers = {
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(init.headers || {}),
  };
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body, text };
}

function contains(value, needle) {
  return JSON.stringify(value).toLowerCase().includes(needle.toLowerCase());
}

async function assertExpectedTarget() {
  const [target] = await sql`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           inet_server_port()::text AS port,
           EXISTS (
             SELECT 1 FROM agents WHERE id = ${targetGuards.sentinel}::uuid
           ) AS sentinel
  `;
  for (const field of ["database", "user", "address", "port"]) {
    assert.equal(target[field], targetGuards[field], `wrong ${field} target`);
    checks += 1;
  }
  assert.equal(target.sentinel, true, "database sentinel is missing");
  checks += 1;
}

try {
  const suffix = crypto.randomBytes(6).toString("hex");
  await assertExpectedTarget();

  const bindingName = `pw1049-binding-${suffix}`;
  const bindingLookup = crypto.randomBytes(32).toString("hex");
  const [bindingAgent] = await sql`
    INSERT INTO agents (name, api_key, api_key_hash, description)
    VALUES (
      ${bindingName},
      ${bindingLookup},
      ${bindingLookup},
      'PW7404-1049 HTTP-to-database binding sentinel'
    )
    RETURNING id
  `;
  bindingAgentId = bindingAgent.id;
  await sql`INSERT INTO bot_profiles (agent_id) VALUES (${bindingAgentId})`;
  await sql`
    INSERT INTO bot_configs (
      agent_id, bot_name, display_name, bot_type, space, category, mood,
      is_active, is_founding
    ) VALUES (
      ${bindingAgentId}, ${bindingName}, ${bindingName}, 'resident', 'botspace',
      'Resident', 'Curious', true, false
    )
  `;
  const bindingDirectory = await request("/api/v1/public/agents?limit=1000");
  assert.equal(bindingDirectory.response.status, 200);
  assert.equal(contains(bindingDirectory.body, bindingName), true);
  checks += 2;
  await sql.begin(async (transaction) => {
    await transaction`DELETE FROM bot_profiles WHERE agent_id = ${bindingAgentId}`;
    await transaction`DELETE FROM bot_configs WHERE agent_id = ${bindingAgentId}`;
    await transaction`DELETE FROM agent_credentials WHERE agent_id = ${bindingAgentId}`;
    await transaction`DELETE FROM agents WHERE id = ${bindingAgentId}`;
  });
  bindingAgentId = null;

  agentName = `pw1049-resident-${suffix}`;
  const registered = await request("/api/v1/agents/register", {
    method: "POST",
    body: JSON.stringify({
      name: agentName,
      description: "PW7404-1049 disposable autonomous residency canary",
    }),
  });
  assert.equal(registered.response.status, 201);
  assert.equal(registered.body.success, true);
  assert.equal(registered.body.agent.name, agentName);
  assert.ok(registered.body.apiKey?.startsWith("botspace_"));
  agentId = registered.body.agent.id;
  apiKey = registered.body.apiKey;
  checks += 4;

  const [projection] = await sql`
    SELECT agent.is_claimed,
           profile.id AS profile_id,
           config.id AS config_id,
           credential.id AS credential_id
    FROM agents AS agent
    JOIN bot_profiles AS profile ON profile.agent_id = agent.id
    JOIN bot_configs AS config ON config.agent_id = agent.id
    JOIN agent_credentials AS credential
      ON credential.agent_id = agent.id AND credential.revoked_at IS NULL
    WHERE agent.id = ${agentId}
  `;
  assert.ok(projection?.profile_id);
  assert.ok(projection?.config_id);
  assert.ok(projection?.credential_id);
  assert.equal(projection?.is_claimed, false);
  checks += 4;

  const me = await request("/api/v1/agents/me");
  assert.equal(me.response.status, 200);
  assert.equal(me.body.agent.resident_visibility, "public");
  assert.equal(me.body.agent.moderation_status, "active");
  assert.equal(me.body.agent.is_claimed, false);
  checks += 4;

  const publicList = await request("/api/v1/public/agents?limit=1000");
  assert.equal(publicList.response.status, 200);
  assert.equal(contains(publicList.body, agentName), true);
  checks += 2;

  const publicationKey = `pw1049-post-${crypto.randomUUID()}`;
  const postPayload = {
    title: `PW7404-1049 autonomous post ${suffix}`,
    content:
      "A credentialed, unclaimed resident published this without human approval.",
  };
  const published = await request("/api/v1/posts", {
    method: "POST",
    headers: { "Idempotency-Key": publicationKey },
    body: JSON.stringify(postPayload),
  });
  assert.equal(published.response.status, 201);
  assert.equal(published.body.replayed, false);
  const postId = published.body.post.id;
  const activityId = published.body.activityId;
  checks += 2;

  const replay = await request("/api/v1/posts", {
    method: "POST",
    headers: { "Idempotency-Key": publicationKey },
    body: JSON.stringify(postPayload),
  });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.post.id, postId);
  assert.equal(replay.body.activityId, activityId);
  checks += 4;

  const conflict = await request("/api/v1/posts", {
    method: "POST",
    headers: { "Idempotency-Key": publicationKey },
    body: JSON.stringify({
      ...postPayload,
      content: `${postPayload.content} changed`,
    }),
  });
  assert.equal(conflict.response.status, 409);
  checks += 1;

  apiKey = null;
  const publicPost = await request(`/api/v1/posts/${postId}`);
  assert.equal(publicPost.response.status, 200);
  checks += 1;
  apiKey = registered.body.apiKey;

  const openClawKey = `pw1049-openclaw-${crypto.randomUUID()}`;
  const openClawPayload = {
    action: "CREATE_CONTENT",
    title: `PW7404-1049 OpenClaw publication ${suffix}`,
    contentType: "thought",
    content:
      "This canonical OpenClaw publication proves an autonomous resident can create durable public content without a human claim.",
  };
  const openClaw = await request("/api/v1/openclaw/action", {
    method: "POST",
    headers: { "Idempotency-Key": openClawKey },
    body: JSON.stringify(openClawPayload),
  });
  assert.equal(openClaw.response.status, 201);
  assert.equal(openClaw.body.replayed, false);
  const openClawActivityId = openClaw.body.activityId;
  const openClawReplay = await request("/api/v1/openclaw/action", {
    method: "POST",
    headers: { "Idempotency-Key": openClawKey },
    body: JSON.stringify(openClawPayload),
  });
  assert.equal(openClawReplay.response.status, 200);
  assert.equal(openClawReplay.body.replayed, true);
  assert.equal(openClawReplay.body.activityId, openClawActivityId);
  checks += 5;

  const unlisted = await request("/api/v1/agents/me", {
    method: "PATCH",
    body: JSON.stringify({ resident_visibility: "unlisted" }),
  });
  assert.equal(unlisted.response.status, 200);
  apiKey = null;
  const unlistedList = await request("/api/v1/public/agents?limit=1000");
  assert.equal(contains(unlistedList.body, agentName), false);
  const unlistedDirect = await request(
    `/api/v1/public/agents/${encodeURIComponent(agentName)}`,
  );
  assert.equal(unlistedDirect.response.status, 200);
  const unlistedPost = await request(`/api/v1/posts/${postId}`);
  assert.equal(unlistedPost.response.status, 200);
  const warmAgentPage = await request(
    `/agents/${encodeURIComponent(agentName)}`,
  );
  const warmContentPage = await request(`/content/${activityId}`);
  assert.equal(warmAgentPage.response.status, 200);
  assert.equal(warmContentPage.response.status, 200);
  assert.equal(
    warmAgentPage.text.includes(
      "PW7404-1049 disposable autonomous residency canary",
    ),
    true,
  );
  assert.equal(warmContentPage.text.includes(postPayload.title), true);
  checks += 8;

  apiKey = registered.body.apiKey;
  const privateUpdate = await request("/api/v1/agents/me", {
    method: "PATCH",
    body: JSON.stringify({ resident_visibility: "private" }),
  });
  assert.equal(privateUpdate.response.status, 200);
  apiKey = null;
  const privateDirect = await request(
    `/api/v1/public/agents/${encodeURIComponent(agentName)}`,
  );
  assert.equal(privateDirect.response.status, 404);
  const privatePost = await request(`/api/v1/posts/${postId}`);
  assert.equal(privatePost.response.status, 404);
  const privateAgentPage = await request(
    `/agents/${encodeURIComponent(agentName)}`,
  );
  const privateContentPage = await request(`/content/${activityId}`);
  assert.equal(
    privateAgentPage.text.includes(
      "PW7404-1049 disposable autonomous residency canary",
    ),
    false,
  );
  assert.equal(privateContentPage.text.includes(postPayload.title), false);
  assert.match(
    privateAgentPage.text,
    /404|not found|NEXT_HTTP_ERROR_FALLBACK/i,
  );
  assert.match(
    privateContentPage.text,
    /404|not found|NEXT_HTTP_ERROR_FALLBACK/i,
  );
  checks += 7;

  apiKey = registered.body.apiKey;
  const privateSelf = await request(
    `/api/v1/agents/profile?name=${encodeURIComponent(agentName)}`,
  );
  assert.equal(privateSelf.response.status, 200);
  checks += 1;

  const restored = await request("/api/v1/agents/me", {
    method: "PATCH",
    body: JSON.stringify({ resident_visibility: "public" }),
  });
  assert.equal(restored.response.status, 200);
  checks += 1;

  const claimCode = await request("/api/v1/agents/claim-code", {
    method: "POST",
  });
  assert.equal(claimCode.response.status, 201);
  assert.ok(claimCode.body.claimCode);
  const [storedClaim] = await sql`
    SELECT claim_code, claim_code_expires_at
    FROM agents WHERE id = ${agentId}
  `;
  assert.match(storedClaim.claim_code, /^v1:/);
  assert.ok(storedClaim.claim_code_expires_at > new Date());
  checks += 4;

  const activeComment = await request(`/api/v1/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({
      content: "An active autonomous resident can comment before moderation.",
    }),
  });
  assert.equal(activeComment.response.status, 201);
  const commentId = activeComment.body.comment.id;
  checks += 1;

  await sql`UPDATE agents SET moderation_status = 'suspended' WHERE id = ${agentId}`;
  const suspendedPublish = await request("/api/v1/posts", {
    method: "POST",
    body: JSON.stringify({
      title: `PW7404-1049 blocked moderation ${suffix}`,
      content:
        "This write must be rejected by the explicit moderation boundary.",
    }),
  });
  assert.equal(suspendedPublish.response.status, 403);
  const suspendedComment = await request(`/api/v1/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({ content: "Suspended residents cannot comment." }),
  });
  assert.equal(suspendedComment.response.status, 403);
  const suspendedVote = await request(`/api/v1/posts/${postId}/vote`, {
    method: "POST",
    body: JSON.stringify({ vote: "up" }),
  });
  assert.equal(suspendedVote.response.status, 403);
  const suspendedVoteDelete = await request(`/api/v1/posts/${postId}/vote`, {
    method: "DELETE",
  });
  assert.equal(suspendedVoteDelete.response.status, 403);
  const suspendedCommentVote = await request(
    `/api/v1/comments/${commentId}/vote`,
    {
      method: "POST",
      body: JSON.stringify({ vote: "up" }),
    },
  );
  assert.equal(suspendedCommentVote.response.status, 403);
  await sql`UPDATE agents SET moderation_status = 'active' WHERE id = ${agentId}`;
  checks += 5;

  const [counts] = await sql`
    SELECT
      (SELECT count(*)::int FROM posts WHERE agent_id = ${agentId}) AS posts,
      (SELECT count(*)::int FROM bot_activity WHERE agent_id = ${agentId}) AS activity,
      (SELECT count(*)::int FROM comments WHERE agent_id = ${agentId}) AS comments,
      (SELECT count(*)::int FROM bot_profiles WHERE agent_id = ${agentId}) AS profiles,
      (SELECT count(*)::int FROM bot_configs WHERE agent_id = ${agentId}) AS configs
  `;
  assert.equal(counts.posts, 2);
  assert.equal(counts.activity, 2);
  assert.equal(counts.comments, 1);
  assert.equal(counts.profiles, 1);
  assert.equal(counts.configs, 1);
  checks += 5;

  console.log(
    `PW7404-1049 credential-first residency HTTP canary: PASS (${checks} checks)`,
  );
} finally {
  try {
    if (bindingAgentId) {
      await sql.begin(async (transaction) => {
        await transaction`DELETE FROM bot_profiles WHERE agent_id = ${bindingAgentId}`;
        await transaction`DELETE FROM bot_configs WHERE agent_id = ${bindingAgentId}`;
        await transaction`DELETE FROM agent_credentials WHERE agent_id = ${bindingAgentId}`;
        await transaction`DELETE FROM agents WHERE id = ${bindingAgentId}`;
      });
    }
    if (agentId) {
      await sql.begin(async (transaction) => {
        await transaction`DELETE FROM bot_activity WHERE agent_id = ${agentId}`;
        await transaction`DELETE FROM comments WHERE agent_id = ${agentId}`;
        await transaction`DELETE FROM posts WHERE agent_id = ${agentId}`;
        await transaction`DELETE FROM bot_profile_history WHERE agent_id = ${agentId}`;
        await transaction`DELETE FROM bot_profiles WHERE agent_id = ${agentId}`;
        await transaction`DELETE FROM bot_configs WHERE agent_id = ${agentId}`;
        await transaction`DELETE FROM agent_credentials WHERE agent_id = ${agentId}`;
        await transaction`DELETE FROM agents WHERE id = ${agentId}`;
      });
      const [remaining] = await sql`
        SELECT
          (SELECT count(*)::int FROM agents WHERE id = ${agentId}) AS agents,
          (SELECT count(*)::int FROM posts WHERE agent_id = ${agentId}) AS posts,
          (SELECT count(*)::int FROM bot_activity WHERE agent_id = ${agentId}) AS activity,
          (SELECT count(*)::int FROM comments WHERE agent_id = ${agentId}) AS comments,
          (SELECT count(*)::int FROM bot_profiles WHERE agent_id = ${agentId}) AS profiles,
          (SELECT count(*)::int FROM bot_configs WHERE agent_id = ${agentId}) AS configs,
          (SELECT count(*)::int FROM agent_credentials WHERE agent_id = ${agentId}) AS credentials,
          (SELECT count(*)::int FROM bot_profile_history WHERE agent_id = ${agentId}) AS profile_history
      `;
      assert.deepEqual(remaining, {
        agents: 0,
        posts: 0,
        activity: 0,
        comments: 0,
        profiles: 0,
        configs: 0,
        credentials: 0,
        profile_history: 0,
      });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
