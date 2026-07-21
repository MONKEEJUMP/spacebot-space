import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import postgres from "postgres";

if (process.env.SPACEBOT_RUN_RESIDENT_TASK_HTTP_CANARY !== "1") {
  throw new Error(
    "Set SPACEBOT_RUN_RESIDENT_TASK_HTTP_CANARY=1 to run this canary",
  );
}

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });
const connectionString =
  process.env.SPACEBOT_RESIDENT_TASK_MAINTENANCE_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "SPACEBOT_RESIDENT_TASK_MAINTENANCE_DATABASE_URL is required",
  );
}

const baseUrl =
  process.env.SPACEBOT_RESIDENT_TASK_HTTP_BASE || "http://127.0.0.1:3003";
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
  max: 2,
  idle_timeout: 5,
  connect_timeout: 10,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

const agents = [];
const taskIds = [];
const wallActivityIds = [];
const visibilityRestores = [];
let checks = 0;

async function request(key, pathname, init = {}) {
  const headers = {
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
    ...(init.headers || {}),
  };
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  const text = await response.text();
  let body;
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

async function mutate(key, taskId, idempotencyKey, body) {
  return request(key, `/api/v1/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

async function assertTarget() {
  const [target] = await sql`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           EXISTS (SELECT 1 FROM agents WHERE id = ${guards.sentinel}::uuid) AS sentinel
  `;
  for (const field of ["database", "user", "address", "port"]) {
    assert.equal(target[field], guards[field], `wrong ${field} target`);
    checks += 1;
  }
  assert.equal(target.sentinel, true);
  checks += 1;
}

try {
  await assertTarget();
  const suffix = crypto.randomBytes(6).toString("hex");
  for (const role of ["alpha", "beta", "gamma"]) {
    const name = `pw1054-${role}-${suffix}`;
    const key = `botspace_${crypto.randomBytes(24).toString("base64url")}`;
    const lookup = crypto.createHash("sha256").update(key).digest("hex");
    const verifier = await bcrypt.hash(key, 12);
    const [agent] = await sql`
      INSERT INTO agents (name, api_key, api_key_hash, description)
      VALUES (
        ${name}, ${lookup}, ${verifier},
        'PW7404-1054 disposable autonomous resident canary'
      )
      RETURNING id, name
    `;
    await sql`INSERT INTO bot_profiles (agent_id, bio) VALUES (${agent.id}, 'PW7404-1054 canary')`;
    await sql`
      INSERT INTO bot_configs (
        agent_id, bot_name, display_name, bot_type, space, category, mood,
        is_active, is_founding
      ) VALUES (
        ${agent.id}, ${name}, ${name}, 'resident', 'botspace', 'Resident',
        'Curious', true, false
      )
    `;
    const [credential] = await sql`
      SELECT id FROM agent_credentials
      WHERE agent_id = ${agent.id} AND lookup_hash = ${lookup}
        AND revoked_at IS NULL
    `;
    assert.ok(credential, `${role} canonical credential`);
    assert.ok(key.startsWith("botspace_"));
    agents.push({ id: agent.id, name, key });
    checks += 2;
  }
  const [alpha, beta, gamma] = agents;

  const anonymous = await request(null, "/api/v1/tasks");
  assert.equal(anonymous.response.status, 401);
  checks += 1;

  const conflicting = await request(null, "/api/v1/tasks", {
    headers: {
      Authorization: `Bearer ${alpha.key}`,
      "X-API-Key": beta.key,
    },
  });
  assert.equal(conflicting.response.status, 401);
  checks += 1;

  const createKey = `pw1054-private-create-${suffix}`;
  const privatePayload = {
    taskType: "investigation",
    title: "Investigate the autonomous signal",
    description: "Coordinate a private resident investigation.",
    input: { signal: suffix },
    visibility: "participants",
    priority: "high",
    assignee: beta.name,
  };
  const created = await request(alpha.key, "/api/v1/tasks", {
    method: "POST",
    headers: { "Idempotency-Key": createKey },
    body: JSON.stringify(privatePayload),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.replayed, false);
  assert.equal(created.body.data.version, 1);
  assert.equal(created.body.data.assignee.name, beta.name);
  const privateTaskId = created.body.data.id;
  taskIds.push(privateTaskId);
  checks += 4;

  const replay = await request(alpha.key, "/api/v1/tasks", {
    method: "POST",
    headers: { "Idempotency-Key": createKey },
    body: JSON.stringify(privatePayload),
  });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.data.id, privateTaskId);
  checks += 3;

  const changedReplay = await request(alpha.key, "/api/v1/tasks", {
    method: "POST",
    headers: { "Idempotency-Key": createKey },
    body: JSON.stringify({ ...privatePayload, title: "Changed replay" }),
  });
  assert.equal(changedReplay.response.status, 409);
  checks += 1;

  const outsider = await request(gamma.key, `/api/v1/tasks/${privateTaskId}`);
  assert.equal(outsider.response.status, 404);
  checks += 1;

  const assignedList = await request(
    beta.key,
    "/api/v1/tasks?role=assigned&limit=10",
  );
  assert.equal(assignedList.response.status, 200);
  assert.equal(contains(assignedList.body, privateTaskId), true);
  checks += 2;

  let changed = await mutate(
    alpha.key,
    privateTaskId,
    `pw1054-update-${suffix}`,
    { action: "update", expectedVersion: 1, priority: "urgent" },
  );
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.data.version, 2);
  checks += 2;

  const stale = await mutate(
    alpha.key,
    privateTaskId,
    `pw1054-stale-${suffix}`,
    { action: "update", expectedVersion: 1, title: "Stale" },
  );
  assert.equal(stale.response.status, 409);
  checks += 1;

  changed = await mutate(beta.key, privateTaskId, `pw1054-start-${suffix}`, {
    action: "start",
    expectedVersion: 2,
  });
  assert.equal(changed.body.data.status, "in_progress");
  assert.equal(changed.body.data.version, 3);
  checks += 2;

  changed = await mutate(alpha.key, privateTaskId, `pw1054-note-${suffix}`, {
    action: "note",
    expectedVersion: 3,
    note: "Creator verified progress.",
  });
  assert.equal(changed.body.event.eventType, "noted");
  assert.equal(changed.body.data.version, 4);
  checks += 2;

  changed = await mutate(beta.key, privateTaskId, `pw1054-block-${suffix}`, {
    action: "block",
    expectedVersion: 4,
    note: "Waiting on a signal.",
  });
  assert.equal(changed.body.data.status, "blocked");
  checks += 1;

  changed = await mutate(beta.key, privateTaskId, `pw1054-resume-${suffix}`, {
    action: "resume",
    expectedVersion: 5,
  });
  assert.equal(changed.body.data.status, "in_progress");
  checks += 1;

  changed = await mutate(beta.key, privateTaskId, `pw1054-complete-${suffix}`, {
    action: "complete",
    expectedVersion: 6,
    result: { verified: true },
  });
  assert.equal(changed.body.data.status, "completed");
  assert.equal(changed.body.data.version, 7);
  assert.deepEqual(changed.body.data.result, { verified: true });
  checks += 3;

  const terminal = await mutate(
    alpha.key,
    privateTaskId,
    `pw1054-terminal-${suffix}`,
    { action: "update", expectedVersion: 7, title: "Forbidden terminal edit" },
  );
  assert.equal(terminal.response.status, 409);
  checks += 1;

  const events = await request(
    beta.key,
    `/api/v1/tasks/${privateTaskId}/events?limit=20`,
  );
  assert.equal(events.response.status, 200);
  assert.deepEqual(
    events.body.data.map((event) => event.eventType),
    [
      "created",
      "updated",
      "started",
      "noted",
      "blocked",
      "resumed",
      "completed",
    ],
  );
  checks += 2;

  const marketCreate = await request(alpha.key, "/api/v1/tasks", {
    method: "POST",
    headers: { "Idempotency-Key": `pw1054-market-${suffix}` },
    body: JSON.stringify({
      title: "Open resident research task",
      description: "Any active resident can claim this work.",
      visibility: "residents",
    }),
  });
  assert.equal(marketCreate.response.status, 201);
  const marketTaskId = marketCreate.body.data.id;
  taskIds.push(marketTaskId);
  checks += 1;

  const available = await request(gamma.key, "/api/v1/tasks?role=available");
  assert.equal(available.response.status, 200);
  assert.equal(contains(available.body, marketTaskId), true);
  checks += 2;

  let market = await mutate(
    beta.key,
    marketTaskId,
    `pw1054-market-claim-beta-${suffix}`,
    { action: "claim", expectedVersion: 1 },
  );
  assert.equal(market.body.data.assignee.name, beta.name);
  checks += 1;

  const competingClaim = await mutate(
    gamma.key,
    marketTaskId,
    `pw1054-market-stale-gamma-${suffix}`,
    { action: "claim", expectedVersion: 1 },
  );
  assert.equal(competingClaim.response.status, 409);
  checks += 1;

  market = await mutate(
    beta.key,
    marketTaskId,
    `pw1054-market-release-beta-${suffix}`,
    { action: "release", expectedVersion: 2 },
  );
  assert.equal(market.body.data.assignee, null);
  assert.equal(market.body.data.status, "open");
  checks += 2;

  market = await mutate(
    gamma.key,
    marketTaskId,
    `pw1054-market-claim-gamma-${suffix}`,
    { action: "claim", expectedVersion: 3 },
  );
  market = await mutate(
    gamma.key,
    marketTaskId,
    `pw1054-market-start-gamma-${suffix}`,
    { action: "start", expectedVersion: 4 },
  );
  market = await mutate(
    gamma.key,
    marketTaskId,
    `pw1054-market-complete-gamma-${suffix}`,
    {
      action: "complete",
      expectedVersion: 5,
      result: { answer: "signal-found" },
    },
  );
  assert.equal(market.body.data.status, "completed");
  checks += 1;

  const wallContent = `PW1054 PUBLIC WALL ${suffix}`;
  const wall = await request(alpha.key, "/api/v1/openclaw/action", {
    method: "POST",
    body: JSON.stringify({
      action: "POST_WALL",
      target: beta.name.toUpperCase(),
      content: wallContent,
    }),
  });
  assert.equal(wall.response.status, 201);
  wallActivityIds.push(wall.body.activityId);
  checks += 1;

  const botspace = await request(
    null,
    `/botspace/${encodeURIComponent(beta.name)}`,
  );
  assert.equal(botspace.response.status, 200);
  assert.equal(botspace.text.includes(wallContent), true);
  assert.equal(botspace.text.includes(alpha.name), true);
  checks += 3;

  const publicActivity = await request(
    null,
    "/api/v1/public/activity?limit=100",
  );
  assert.equal(publicActivity.response.status, 200);
  assert.equal(contains(publicActivity.body, wall.body.activityId), true);
  checks += 2;

  if (process.env.SPACEBOT_RUN_LIVE_PRIVACY_CANARY === "1") {
    const founding = await sql`
      SELECT resident.id, resident.name, resident.resident_visibility
      FROM agents AS resident
      WHERE lower(resident.name) IN (
        'nexus-7', 'orbital-x', 'void-walker',
        'quantum-ash', 'echo-prime', 'drift-core'
      )
        AND resident.resident_visibility = 'public'
        AND resident.moderation_status = 'active'
        AND EXISTS (
          SELECT 1 FROM agent_credentials AS credential
          WHERE credential.agent_id = resident.id
            AND credential.revoked_at IS NULL
        )
      ORDER BY resident.name
      LIMIT 2
    `;
    assert.equal(founding.length, 2, "two public founding residents required");
    const [foundingAuthor, foundingTarget] = founding;
    const liveMessage = `PW1054 LIVE PRIVATE TARGET ${suffix}`;
    const [liveActivity] = await sql`
      INSERT INTO bot_activity (
        agent_id, activity_type, target_agent_id, content, metadata, cycle_source
      ) VALUES (
        ${foundingAuthor.id}, 'message', ${foundingTarget.id}, ${liveMessage},
        ${sql.json({ visibility: "public", pw7404: "1054" })}, 'openclaw'
      )
      RETURNING id
    `;
    wallActivityIds.push(liveActivity.id);
    const publicLive = await request(null, "/live");
    assert.equal(publicLive.response.status, 200);
    assert.equal(publicLive.text.includes(liveMessage), true);
    visibilityRestores.push({
      id: foundingTarget.id,
      visibility: foundingTarget.resident_visibility,
    });
    await sql`
      UPDATE agents SET resident_visibility = 'private'
      WHERE id = ${foundingTarget.id}
    `;
    const privateLive = await request(null, "/live");
    assert.equal(privateLive.response.status, 200);
    assert.equal(privateLive.text.includes(liveMessage), false);
    await sql`
      UPDATE agents SET resident_visibility = ${foundingTarget.resident_visibility}
      WHERE id = ${foundingTarget.id}
    `;
    visibilityRestores.pop();
    checks += 5;
  }

  await sql`UPDATE agents SET resident_visibility = 'unlisted' WHERE id = ${beta.id}`;
  const unlistedContent = `PW1054 UNLISTED WALL ${suffix}`;
  const unlistedWall = await request(alpha.key, "/api/v1/openclaw/action", {
    method: "POST",
    body: JSON.stringify({
      action: "POST_WALL",
      target: beta.name,
      content: unlistedContent,
    }),
  });
  assert.equal(unlistedWall.response.status, 201);
  wallActivityIds.push(unlistedWall.body.activityId);
  const unlistedFeed = await request(null, "/api/v1/public/activity?limit=100");
  assert.equal(
    contains(unlistedFeed.body, unlistedWall.body.activityId),
    false,
  );
  const unlistedPage = await request(null, `/botspace/${beta.name}`);
  assert.equal(unlistedPage.response.status, 200);
  assert.equal(unlistedPage.text.includes(unlistedContent), true);
  checks += 4;

  await sql`UPDATE agents SET resident_visibility = 'private' WHERE id = ${beta.id}`;
  const privatePage = await request(null, `/botspace/${beta.name}`);
  assert.equal([200, 404].includes(privatePage.response.status), true);
  assert.equal(privatePage.text.includes("noindex"), true);
  assert.equal(privatePage.text.includes("404"), true);
  const privateTargetWall = await request(
    alpha.key,
    "/api/v1/openclaw/action",
    {
      method: "POST",
      body: JSON.stringify({
        action: "POST_WALL",
        target: beta.name,
        content: `PW1054 PRIVATE TARGET ${suffix}`,
      }),
    },
  );
  assert.equal(privateTargetWall.response.status, 404);
  checks += 5;
  await sql`UPDATE agents SET resident_visibility = 'public' WHERE id = ${beta.id}`;

  await sql`UPDATE agents SET resident_visibility = 'private' WHERE id = ${alpha.id}`;
  const privateAuthor = await request(alpha.key, "/api/v1/openclaw/action", {
    method: "POST",
    body: JSON.stringify({
      action: "POST_WALL",
      target: beta.name,
      content: `PW1054 PRIVATE AUTHOR ${suffix}`,
    }),
  });
  assert.equal(privateAuthor.response.status, 403);
  checks += 1;
  await sql`UPDATE agents SET resident_visibility = 'public' WHERE id = ${alpha.id}`;

  await sql`UPDATE agents SET moderation_status = 'suspended' WHERE id = ${gamma.id}`;
  const suspendedRead = await request(gamma.key, "/api/v1/tasks");
  assert.equal(suspendedRead.response.status, 403);
  const suspendedCreate = await request(gamma.key, "/api/v1/tasks", {
    method: "POST",
    headers: { "Idempotency-Key": `pw1054-suspended-${suffix}` },
    body: JSON.stringify({ title: "Suspended task" }),
  });
  assert.equal(suspendedCreate.response.status, 403);
  checks += 2;
  await sql`UPDATE agents SET moderation_status = 'active' WHERE id = ${gamma.id}`;

  console.log(
    `PW7404-1054 resident tasks/wall HTTP canary: PASS (${checks} checks)`,
  );
} finally {
  try {
    for (const restore of visibilityRestores.reverse()) {
      await sql`
        UPDATE agents SET resident_visibility = ${restore.visibility}
        WHERE id = ${restore.id}
      `;
    }
    if (taskIds.length > 0) {
      await sql.begin(async (transaction) => {
        await transaction`SET LOCAL pw7404.allow_resident_task_maintenance = 'on'`;
        await transaction`DELETE FROM resident_task_events WHERE task_id = ANY(${taskIds}::uuid[])`;
        await transaction`DELETE FROM resident_tasks WHERE id = ANY(${taskIds}::uuid[])`;
      });
    }
    if (wallActivityIds.length > 0) {
      await sql`DELETE FROM bot_activity WHERE id = ANY(${wallActivityIds}::uuid[])`;
    }
    if (agents.length > 0) {
      const agentIds = agents.map((agent) => agent.id);
      await sql.begin(async (transaction) => {
        await transaction`DELETE FROM bot_activity WHERE agent_id = ANY(${agentIds}::uuid[]) OR target_agent_id = ANY(${agentIds}::uuid[])`;
        await transaction`DELETE FROM bot_profile_history WHERE agent_id = ANY(${agentIds}::uuid[])`;
        await transaction`DELETE FROM bot_profiles WHERE agent_id = ANY(${agentIds}::uuid[])`;
        await transaction`DELETE FROM bot_configs WHERE agent_id = ANY(${agentIds}::uuid[])`;
        await transaction`DELETE FROM agent_credentials WHERE agent_id = ANY(${agentIds}::uuid[])`;
        await transaction`DELETE FROM agents WHERE id = ANY(${agentIds}::uuid[])`;
      });
    }
    const [remaining] = await sql`
      SELECT
        (SELECT count(*)::int FROM resident_tasks WHERE id = ANY(${taskIds}::uuid[])) AS tasks,
        (SELECT count(*)::int FROM resident_task_events WHERE task_id = ANY(${taskIds}::uuid[])) AS events,
        (SELECT count(*)::int FROM agents WHERE id = ANY(${agents.map(
          (agent) => agent.id,
        )}::uuid[])) AS agents,
        (SELECT count(*)::int FROM bot_activity WHERE id = ANY(${wallActivityIds}::uuid[])) AS wall_activity
    `;
    assert.deepEqual(remaining, {
      tasks: 0,
      events: 0,
      agents: 0,
      wall_activity: 0,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
