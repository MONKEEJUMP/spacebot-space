import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import postgres from "postgres";

const AUTHORIZATION_ENV = "SPACEBOT_RUN_RESIDENT_TASKSPACE_HTTP_CANARY";
const LIVE_AUTHORIZATION_ENV =
  "SPACEBOT_ALLOW_LIVE_RESIDENT_TASKSPACE_HTTP_CANARY";
const candidateAuthorized = process.env[AUTHORIZATION_ENV] === "1";
const liveAuthorized = process.env[LIVE_AUTHORIZATION_ENV] === "1";

if (!candidateAuthorized) {
  throw new Error(`Set ${AUTHORIZATION_ENV}=1 to run this candidate canary`);
}

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const rawBaseUrl = process.env.BASE_URL?.trim();
if (!rawBaseUrl) throw new Error("BASE_URL is required");

const parsedBaseUrl = new URL(rawBaseUrl);
if (!["http:", "https:"].includes(parsedBaseUrl.protocol)) {
  throw new Error("BASE_URL must use http or https");
}
if (
  parsedBaseUrl.username ||
  parsedBaseUrl.password ||
  parsedBaseUrl.search ||
  parsedBaseUrl.hash ||
  !["", "/"].includes(parsedBaseUrl.pathname)
) {
  throw new Error("BASE_URL must be an origin without credentials or a path");
}
const liveHostname = parsedBaseUrl.hostname.toLowerCase();
if (
  (liveHostname === "spacebot.space" ||
    liveHostname.endsWith(".spacebot.space")) &&
  !liveAuthorized
) {
  throw new Error(
    `Live spacebot.space requires ${LIVE_AUTHORIZATION_ENV}=1 in addition to ${AUTHORIZATION_ENV}=1`,
  );
}
const baseUrl = parsedBaseUrl.origin;

const maintenanceConnectionString =
  process.env.SPACEBOT_RESIDENT_TASK_MAINTENANCE_DATABASE_URL;
if (!maintenanceConnectionString) {
  throw new Error(
    "SPACEBOT_RESIDENT_TASK_MAINTENANCE_DATABASE_URL is required",
  );
}
const adminConnectionString =
  process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL;
if (!adminConnectionString) {
  throw new Error("SPACEBOT_DATABASE_URL or DATABASE_URL is required");
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

const sql = postgres(adminConnectionString, {
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
const maintenanceSql = postgres(maintenanceConnectionString, {
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

const canonicalHeaders = Object.freeze({
  Origin: "https://spacebot.space",
  Host: "spacebot.space",
  "X-Forwarded-Host": "spacebot.space",
  "X-Forwarded-Proto": "https",
  "X-Real-IP": `198.51.100.${10 + (process.pid % 200)}`,
});
const cookieName = "__Host-spacebot-resident";
const agentIds = [];
const credentialIds = [];
const sessionIds = [];
const taskIds = [];
const eventIds = [];
let checks = 0;
let apiKey = null;

function receipt(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function remember(target, value) {
  if (typeof value === "string" && value && !target.includes(value)) {
    target.push(value);
  }
}

function contains(value, needle) {
  return JSON.stringify(value).toLowerCase().includes(needle.toLowerCase());
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function cookieHeader(token) {
  return `${cookieName}=${token}`;
}

function sessionCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  receipt(Boolean(setCookie), "resident handshake returns Set-Cookie");
  const parts = setCookie.split(";").map((part) => part.trim());
  const [pair, ...attributes] = parts;
  const separator = pair.indexOf("=");
  receipt(
    pair.slice(0, separator) === cookieName,
    "resident cookie uses the __Host name",
  );
  const token = pair.slice(separator + 1);
  receipt(/^[A-Za-z0-9_-]{43}$/.test(token), "resident token is opaque");
  const normalized = new Set(attributes.map((value) => value.toLowerCase()));
  receipt(normalized.has("secure"), "resident cookie is Secure");
  receipt(normalized.has("httponly"), "resident cookie is HttpOnly");
  receipt(
    normalized.has("samesite=strict"),
    "resident cookie is SameSite=Strict",
  );
  receipt(normalized.has("path=/"), "resident cookie is scoped to Path=/");
  receipt(normalized.has("max-age=1800"), "resident cookie has Max-Age=1800");
  return token;
}

async function request(
  pathname,
  { credential = null, cookie = null, origin = "canonical", ...init } = {},
) {
  const headers = {
    Host: canonicalHeaders.Host,
    "X-Forwarded-Host": canonicalHeaders["X-Forwarded-Host"],
    "X-Forwarded-Proto": canonicalHeaders["X-Forwarded-Proto"],
    "X-Real-IP": canonicalHeaders["X-Real-IP"],
    ...(origin === "canonical" ? { Origin: canonicalHeaders.Origin } : {}),
    ...(typeof origin === "string" && origin !== "canonical"
      ? { Origin: origin }
      : {}),
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
    ...(cookie ? { Cookie: cookieHeader(cookie) } : {}),
    ...(init.headers || {}),
  };
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "manual",
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body, text };
}

async function assertExpectedTarget() {
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
}

async function assertMaintenanceTarget() {
  const [target] = await maintenanceSql`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           EXISTS (
             SELECT 1 FROM agents WHERE id = ${guards.sentinel}::uuid
           ) AS sentinel
  `;
  receipt(target.database === guards.database, "wrong maintenance database");
  receipt(target.user === "pw7404_task_maintenance", "wrong maintenance role");
  receipt(target.address === guards.address, "wrong maintenance address");
  receipt(target.port === guards.port, "wrong maintenance port");
  receipt(target.sentinel === true, "maintenance database sentinel is missing");
}

async function assertNoHumanClaim(agentId) {
  const [claim] = await sql`
    SELECT agent.is_claimed,
           agent.claim_code,
           agent.owner_platform,
           agent.owner_handle,
           count(link.agent_id)::int AS human_links
    FROM agents AS agent
    LEFT JOIN human_agent_links AS link
      ON link.agent_id = agent.id AND link.status = 'active'
    WHERE agent.id = ${agentId}
    GROUP BY agent.id
  `;
  receipt(claim?.is_claimed === false, "resident remains unclaimed");
  receipt(claim?.human_links === 0, "resident has no human ownership link");
  receipt(
    claim?.claim_code === null &&
      claim?.owner_platform === null &&
      claim?.owner_handle === null,
    "resident session does not require human claim material",
  );
}

async function assertRawSecretsAbsent(agentId, credentialId, ...tokens) {
  for (const token of tokens) {
    const [stored] = await sql`
      SELECT
        NOT EXISTS (
          SELECT 1 FROM agents AS agent
          WHERE agent.id = ${agentId}
            AND position(${token} in row_to_json(agent)::text) > 0
        ) AS agent_absent,
        NOT EXISTS (
          SELECT 1 FROM agent_credentials AS credential
          WHERE credential.id = ${credentialId}
            AND position(${token} in row_to_json(credential)::text) > 0
        ) AS credential_absent,
        NOT EXISTS (
          SELECT 1 FROM agent_browser_sessions AS session
          WHERE session.agent_id = ${agentId}
            AND position(${token} in row_to_json(session)::text) > 0
        ) AS session_absent
    `;
    receipt(
      stored.agent_absent && stored.credential_absent && stored.session_absent,
      "raw credential and session tokens are absent from database rows",
    );
  }
}

async function findSession(agentId, credentialId, token) {
  const [session] = await sql`
    SELECT id, revoked_at, revocation_reason
    FROM agent_browser_sessions
    WHERE agent_id = ${agentId}
      AND credential_id = ${credentialId}
      AND token_hash = ${hashToken(token)}
  `;
  receipt(Boolean(session?.id), "hashed resident session is persisted");
  remember(sessionIds, session?.id);
  return session;
}

async function discoverCleanupIds(agentId) {
  if (!agentId) return;
  const discoveredTasks = await sql`
    SELECT id FROM resident_tasks
    WHERE creator_agent_id = ${agentId} OR assignee_agent_id = ${agentId}
  `;
  for (const row of discoveredTasks) remember(taskIds, row.id);

  if (taskIds.length > 0) {
    const discoveredEvents = await sql`
      SELECT id FROM resident_task_events
      WHERE task_id = ANY(${taskIds}::uuid[]) OR actor_agent_id = ${agentId}
    `;
    for (const row of discoveredEvents) remember(eventIds, row.id);
  }
  const discoveredSessions = await sql`
    SELECT id FROM agent_browser_sessions WHERE agent_id = ${agentId}
  `;
  for (const row of discoveredSessions) remember(sessionIds, row.id);
  const discoveredCredentials = await sql`
    SELECT id FROM agent_credentials WHERE agent_id = ${agentId}
  `;
  for (const row of discoveredCredentials) remember(credentialIds, row.id);
}

try {
  await assertExpectedTarget();
  await assertMaintenanceTarget();
  const suffix = crypto.randomBytes(6).toString("hex");
  const agentName = `pw1066-resident-${suffix}`;
  apiKey = `botspace_${crypto.randomBytes(24).toString("base64url")}`;
  const lookupHash = hashToken(apiKey);
  const verifierHash = await bcrypt.hash(apiKey, 12);

  const [agent] = await sql`
    INSERT INTO agents (name, api_key, api_key_hash, description)
    VALUES (
      ${agentName}, ${lookupHash}, ${verifierHash},
      'PW7404-1066 disposable unclaimed resident TaskSpace HTTP canary'
    )
    RETURNING id, name, is_claimed
  `;
  remember(agentIds, agent.id);
  await sql`
    INSERT INTO bot_profiles (agent_id, bio)
    VALUES (${agent.id}, 'PW7404-1066 disposable TaskSpace canary')
  `;
  await sql`
    INSERT INTO bot_configs (
      agent_id, bot_name, display_name, bot_type, space, category, mood,
      is_active, is_founding
    ) VALUES (
      ${agent.id}, ${agent.name}, ${agent.name}, 'resident', 'botspace',
      'Resident', 'Curious', true, false
    )
  `;
  const [credential] = await sql`
    SELECT id, lookup_hash, verifier_hash, revoked_at
    FROM agent_credentials
    WHERE agent_id = ${agent.id} AND lookup_hash = ${lookupHash}
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `;
  receipt(Boolean(credential?.id), "canonical resident credential exists");
  remember(credentialIds, credential?.id);
  receipt(credential.revoked_at === null, "resident credential is active");
  receipt(
    credential.lookup_hash === lookupHash,
    "credential uses one-way lookup",
  );
  receipt(
    credential.verifier_hash !== apiKey &&
      (await bcrypt.compare(apiKey, credential.verifier_hash)),
    "credential uses an independent bcrypt verifier",
  );
  await assertNoHumanClaim(agent.id);
  await assertRawSecretsAbsent(agent.id, credential.id, apiKey);

  for (const origin of [null, "https://not-spacebot.invalid"]) {
    const blocked = await request("/api/v1/resident-session", {
      method: "POST",
      credential: apiKey,
      origin,
    });
    receipt(
      blocked.response.status === 403,
      `${origin === null ? "missing" : "wrong"} handshake Origin is rejected`,
    );
  }

  const handshake = await request("/api/v1/resident-session", {
    method: "POST",
    credential: apiKey,
  });
  receipt(
    handshake.response.status === 201,
    `resident handshake returns 201 (status=${
      handshake.response.status
    }, error=${handshake.body?.error ?? "none"})`,
  );
  receipt(handshake.body?.authenticated === true, "resident is authenticated");
  receipt(
    handshake.body?.source === "session",
    "handshake returns session source",
  );
  receipt(
    handshake.body?.resident?.id === agent.id &&
      handshake.body?.resident?.name === agent.name,
    "handshake returns the disposable resident",
  );
  receipt(
    !handshake.text.includes(apiKey),
    "raw credential is absent from JSON",
  );
  const firstToken = sessionCookie(handshake.response);
  receipt(
    !handshake.text.includes(firstToken),
    "raw session token is absent from JSON",
  );
  const firstSession = await findSession(agent.id, credential.id, firstToken);
  receipt(firstSession.revoked_at === null, "first session starts active");
  await assertRawSecretsAbsent(agent.id, credential.id, apiKey, firstToken);

  const status = await request("/api/v1/resident-session", {
    cookie: firstToken,
  });
  receipt(status.response.status === 200, "cookie status returns 200");
  receipt(
    status.body?.authenticated === true && status.body?.source === "session",
    "cookie status proves the resident session",
  );
  receipt(
    status.body?.resident?.id === agent.id,
    "cookie status preserves resident identity",
  );

  const createKey = `pw1066-cookie-create-${suffix}`;
  const createPayload = {
    taskType: "verification",
    title: `PW7404-1066 TaskSpace canary ${suffix}`,
    description: "No-spend resident browser session verification.",
    input: { canary: "PW7404-1066", externalCalls: false },
    visibility: "participants",
    priority: "normal",
  };

  for (const [origin, label] of [
    [null, "missing"],
    ["https://not-spacebot.invalid", "wrong"],
  ]) {
    const blocked = await request("/api/v1/tasks", {
      method: "POST",
      cookie: firstToken,
      origin,
      headers: { "Idempotency-Key": `pw1066-${label}-origin-${suffix}` },
      body: JSON.stringify(createPayload),
    });
    receipt(
      blocked.response.status === 403,
      `${label} task mutation Origin is rejected`,
    );
  }

  const created = await request("/api/v1/tasks", {
    method: "POST",
    cookie: firstToken,
    headers: { "Idempotency-Key": createKey },
    body: JSON.stringify(createPayload),
  });
  remember(taskIds, created.body?.data?.id);
  remember(eventIds, created.body?.event?.id);
  receipt(created.response.status === 201, "cookie creates a task with 201");
  receipt(created.body?.replayed === false, "task create is not a replay");
  receipt(
    created.body?.data?.version === 1,
    "created task starts at version 1",
  );
  const taskId = created.body.data.id;

  const replayed = await request("/api/v1/tasks", {
    method: "POST",
    cookie: firstToken,
    headers: { "Idempotency-Key": createKey },
    body: JSON.stringify(createPayload),
  });
  receipt(
    replayed.response.status === 200,
    "create idempotency replay returns 200",
  );
  receipt(replayed.body?.replayed === true, "create idempotency is preserved");
  receipt(
    replayed.body?.data?.id === taskId,
    "create replay returns exact task",
  );

  const listed = await request("/api/v1/tasks?role=created&limit=10", {
    cookie: firstToken,
  });
  receipt(listed.response.status === 200, "cookie lists TaskSpace tasks");
  receipt(
    contains(listed.body, taskId),
    "TaskSpace list includes created task",
  );

  const detail = await request(`/api/v1/tasks/${taskId}`, {
    cookie: firstToken,
  });
  receipt(detail.response.status === 200, "cookie reads task detail");
  receipt(detail.body?.data?.id === taskId, "detail returns exact task");

  const initialEvents = await request(
    `/api/v1/tasks/${taskId}/events?limit=10`,
    {
      cookie: firstToken,
    },
  );
  receipt(initialEvents.response.status === 200, "cookie reads task events");
  receipt(
    initialEvents.body?.data?.length === 1 &&
      initialEvents.body.data[0].eventType === "created",
    "initial event stream contains only created",
  );

  const actionKey = `pw1066-cookie-action-${suffix}`;
  const action = await request(`/api/v1/tasks/${taskId}`, {
    method: "PATCH",
    cookie: firstToken,
    headers: { "Idempotency-Key": actionKey },
    body: JSON.stringify({
      action: "update",
      expectedVersion: 1,
      priority: "high",
    }),
  });
  remember(eventIds, action.body?.event?.id);
  receipt(action.response.status === 200, "cookie performs a task action");
  receipt(
    action.body?.data?.version === 2,
    "cookie action advances task version",
  );
  receipt(
    action.body?.event?.eventType === "updated",
    "cookie action appends event",
  );

  const actionReplay = await request(`/api/v1/tasks/${taskId}`, {
    method: "PATCH",
    cookie: firstToken,
    headers: { "Idempotency-Key": actionKey },
    body: JSON.stringify({
      action: "update",
      expectedVersion: 1,
      priority: "high",
    }),
  });
  receipt(actionReplay.response.status === 200, "action replay returns 200");
  receipt(
    actionReplay.body?.replayed === true,
    "action idempotency is preserved",
  );
  receipt(
    actionReplay.body?.data?.version === 2,
    "action replay is not duplicated",
  );

  const finalEvents = await request(`/api/v1/tasks/${taskId}/events?limit=10`, {
    cookie: firstToken,
  });
  for (const event of finalEvents.body?.data || [])
    remember(eventIds, event.id);
  receipt(
    finalEvents.response.status === 200,
    "updated event stream returns 200",
  );
  assert.deepEqual(
    finalEvents.body?.data?.map((event) => event.eventType),
    ["created", "updated"],
    "task event sequence is exact",
  );
  checks += 1;

  const apiCreate = await request("/api/v1/tasks", {
    method: "POST",
    credential: apiKey,
    origin: null,
    headers: { "Idempotency-Key": `pw1066-api-originless-${suffix}` },
    body: JSON.stringify({
      title: `PW7404-1066 originless compatibility ${suffix}`,
      description:
        "Server-to-server compatibility probe without external work.",
      visibility: "participants",
    }),
  });
  remember(taskIds, apiCreate.body?.data?.id);
  remember(eventIds, apiCreate.body?.event?.id);
  receipt(
    apiCreate.response.status === 201,
    "API-key originless task mutation remains compatible",
  );

  const rotated = await request("/api/v1/resident-session", {
    method: "POST",
    credential: apiKey,
  });
  receipt(rotated.response.status === 201, "session rotation returns 201");
  const secondToken = sessionCookie(rotated.response);
  receipt(secondToken !== firstToken, "rotation issues a new opaque token");
  receipt(
    !rotated.text.includes(secondToken),
    "rotated token is absent from JSON",
  );
  const secondSession = await findSession(agent.id, credential.id, secondToken);
  receipt(secondSession.revoked_at === null, "rotated session starts active");

  const [oldSession] = await sql`
    SELECT revoked_at, revocation_reason
    FROM agent_browser_sessions WHERE id = ${firstSession.id}
  `;
  receipt(
    Boolean(oldSession?.revoked_at),
    "rotation revokes the old session row",
  );
  receipt(
    oldSession?.revocation_reason === "rotated",
    "old session records rotated revocation reason",
  );
  const oldStatus = await request("/api/v1/resident-session", {
    cookie: firstToken,
  });
  receipt(
    oldStatus.response.status === 401,
    "old cookie is invalid after rotation",
  );
  receipt(
    oldStatus.body?.authenticated === false,
    "old cookie reports unauthenticated",
  );
  const currentStatus = await request("/api/v1/resident-session", {
    cookie: secondToken,
  });
  receipt(currentStatus.response.status === 200, "rotated cookie is active");
  await assertRawSecretsAbsent(
    agent.id,
    credential.id,
    apiKey,
    firstToken,
    secondToken,
  );

  const revokedCredentials = await sql`
    UPDATE agent_credentials
    SET revoked_at = now()
    WHERE id = ${credential.id} AND agent_id = ${agent.id} AND revoked_at IS NULL
    RETURNING id
  `;
  receipt(
    revokedCredentials.length === 1 &&
      revokedCredentials[0].id === credential.id,
    "exact resident credential is revoked",
  );
  const revokedStatus = await request("/api/v1/resident-session", {
    cookie: secondToken,
  });
  receipt(
    revokedStatus.response.status === 401,
    "credential revocation invalidates current session",
  );
  receipt(
    revokedStatus.body?.authenticated === false,
    "revoked session reports unauthenticated",
  );
  await assertNoHumanClaim(agent.id);
} finally {
  try {
    const agentId = agentIds[0] ?? null;
    await discoverCleanupIds(agentId);

    if (taskIds.length > 0 || eventIds.length > 0) {
      await maintenanceSql.begin(async (transaction) => {
        await transaction`SET LOCAL pw7404.allow_resident_task_maintenance = 'on'`;
        if (eventIds.length > 0) {
          await transaction`
            DELETE FROM resident_task_events
            WHERE id = ANY(${eventIds}::uuid[])
               OR task_id = ANY(${taskIds}::uuid[])
          `;
        }
        if (taskIds.length > 0) {
          await transaction`
            DELETE FROM resident_tasks WHERE id = ANY(${taskIds}::uuid[])
          `;
        }
      });
    }
    if (sessionIds.length > 0) {
      await maintenanceSql`
        DELETE FROM agent_browser_sessions WHERE id = ANY(${sessionIds}::uuid[])
      `;
    }
    if (agentId) {
      await sql`DELETE FROM human_agent_links WHERE agent_id = ${agentId}`;
      await sql`DELETE FROM bot_profile_history WHERE agent_id = ${agentId}`;
      await sql`DELETE FROM bot_profiles WHERE agent_id = ${agentId}`;
      await sql`DELETE FROM bot_configs WHERE agent_id = ${agentId}`;
    }
    if (credentialIds.length > 0) {
      await sql`
        DELETE FROM agent_credentials WHERE id = ANY(${credentialIds}::uuid[])
      `;
    }
    if (agentId) await sql`DELETE FROM agents WHERE id = ${agentId}`;

    const [remaining] = await sql`
      SELECT
        (SELECT count(*)::int FROM resident_tasks
         WHERE id = ANY(${taskIds}::uuid[])) AS tasks,
        (SELECT count(*)::int FROM resident_task_events
         WHERE id = ANY(${eventIds}::uuid[])
            OR task_id = ANY(${taskIds}::uuid[])) AS events,
        (SELECT count(*)::int FROM agent_browser_sessions
         WHERE id = ANY(${sessionIds}::uuid[])) AS sessions,
        (SELECT count(*)::int FROM agent_credentials
         WHERE id = ANY(${credentialIds}::uuid[])) AS credentials,
        (SELECT count(*)::int FROM agents
         WHERE id = ANY(${agentIds}::uuid[])) AS agents,
        (SELECT count(*)::int FROM bot_profiles
         WHERE agent_id = ANY(${agentIds}::uuid[])) AS profiles,
        (SELECT count(*)::int FROM bot_configs
         WHERE agent_id = ANY(${agentIds}::uuid[])) AS configs,
        (SELECT count(*)::int FROM human_agent_links
         WHERE agent_id = ANY(${agentIds}::uuid[])) AS human_links
    `;
    assert.deepEqual(remaining, {
      tasks: 0,
      events: 0,
      sessions: 0,
      credentials: 0,
      agents: 0,
      profiles: 0,
      configs: 0,
      human_links: 0,
    });
    checks += 1;
  } finally {
    await Promise.all([
      sql.end({ timeout: 5 }),
      maintenanceSql.end({ timeout: 5 }),
    ]);
  }
}

console.log(
  `PW7404-1066 resident session + TaskSpace HTTP canary: PASS (${checks} checks)`,
);
