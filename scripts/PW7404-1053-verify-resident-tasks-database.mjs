import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

if (process.env.SPACEBOT_RUN_RESIDENT_TASK_DB_CANARY !== "1") {
  throw new Error(
    "Set SPACEBOT_RUN_RESIDENT_TASK_DB_CANARY=1 to run this canary",
  );
}

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });
const connectionString =
  process.env.SPACEBOT_RESIDENT_TASK_MAINTENANCE_DATABASE_URL;
const runtimeConnectionString = process.env.SPACEBOT_RUNTIME_DATABASE_URL;
const expectedRuntimeEffectiveUser =
  process.env.SPACEBOT_EXPECTED_RUNTIME_EFFECTIVE_USER;
if (!connectionString) {
  throw new Error(
    "SPACEBOT_RESIDENT_TASK_MAINTENANCE_DATABASE_URL is required",
  );
}
if (!runtimeConnectionString) {
  throw new Error("SPACEBOT_RUNTIME_DATABASE_URL is required");
}
if (!expectedRuntimeEffectiveUser || /\s/.test(expectedRuntimeEffectiveUser)) {
  throw new Error("SPACEBOT_EXPECTED_RUNTIME_EFFECTIVE_USER is required");
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
  max: 2,
  idle_timeout: 5,
  connect_timeout: 10,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});
const runtimeSql = postgres(runtimeConnectionString, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

const agentIds = [];
const taskIds = [];
let checks = 0;

function snapshot(task) {
  return {
    id: task.id,
    creatorAgentId: task.creator_agent_id,
    assigneeAgentId: task.assignee_agent_id,
    taskType: task.task_type,
    title: task.title,
    description: task.description,
    input: task.input,
    result: task.result,
    visibility: task.visibility,
    priority: task.priority,
    status: task.status,
    version: task.version,
    dueAt: task.due_at?.toISOString() ?? null,
    completedAt: task.completed_at?.toISOString() ?? null,
    cancelledAt: task.cancelled_at?.toISOString() ?? null,
    createdAt: task.created_at.toISOString(),
    updatedAt: task.updated_at.toISOString(),
  };
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function expectFailure(label, operation, pattern) {
  let error = null;
  try {
    await operation();
  } catch (candidate) {
    error = candidate;
  }
  assert.ok(error, `${label} unexpectedly succeeded`);
  assert.match(String(error.message), pattern, label);
  checks += 1;
}

async function createTask({
  creator,
  assignee = null,
  visibility,
  key,
  title,
}) {
  return sql.begin(async (transaction) => {
    const [task] = await transaction`
      INSERT INTO resident_tasks (
        creator_agent_id, assignee_agent_id, task_type, title, description,
        input, visibility, priority
      ) VALUES (
        ${creator}, ${assignee}, 'verification', ${title},
        'PW7404-1053 disposable task', ${transaction.json({ canary: true })},
        ${visibility}, 'high'
      )
      RETURNING *
    `;
    const taskSnapshot = snapshot(task);
    await transaction`
      INSERT INTO resident_task_events (
        task_id, actor_agent_id, task_version, event_type, from_status,
        to_status, client_request_id, request_fingerprint, changes
      ) VALUES (
        ${task.id}, ${creator}, 1, 'created', NULL, 'open', ${key},
        ${fingerprint(key)}, ${transaction.json({ snapshot: taskSnapshot })}
      )
    `;
    taskIds.push(task.id);
    return task;
  });
}

async function transition({ taskId, actor, key, eventType, update }) {
  return sql.begin(async (transaction) => {
    const [before] = await transaction`
      SELECT * FROM resident_tasks WHERE id = ${taskId} FOR UPDATE
    `;
    const after = await update(transaction, before);
    const taskSnapshot = snapshot(after);
    await transaction`
      INSERT INTO resident_task_events (
        task_id, actor_agent_id, task_version, event_type, from_status,
        to_status, client_request_id, request_fingerprint, changes
      ) VALUES (
        ${taskId}, ${actor}, ${after.version}, ${eventType}, ${before.status},
        ${after.status}, ${key}, ${fingerprint(key)},
        ${transaction.json({ snapshot: taskSnapshot })}
      )
    `;
    return after;
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
  assert.equal(target.sentinel, true, "database sentinel missing");
  checks += 1;
}

async function assertRuntimeTarget() {
  const [target] = await runtimeSql`
    SELECT current_database() AS database,
           current_user AS user,
           session_user AS session_user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           EXISTS (SELECT 1 FROM agents WHERE id = ${guards.sentinel}::uuid) AS sentinel
  `;
  assert.equal(target.database, guards.database, "wrong runtime database");
  assert.equal(
    target.session_user,
    "spacebot_runtime",
    "wrong runtime login role",
  );
  assert.equal(
    target.user,
    expectedRuntimeEffectiveUser,
    "wrong runtime effective role",
  );
  assert.equal(target.address, guards.address, "wrong runtime server address");
  assert.equal(target.port, guards.port, "wrong runtime server port");
  assert.equal(target.sentinel, true, "runtime database sentinel missing");
  checks += 6;
}

try {
  await assertTarget();
  await assertRuntimeTarget();
  const suffix = crypto.randomBytes(6).toString("hex");
  const actors = {};
  for (const role of ["alpha", "beta", "gamma"]) {
    const lookup = fingerprint(`pw1053-${role}-${suffix}`);
    const [agent] = await sql`
      INSERT INTO agents (name, api_key, api_key_hash, description)
      VALUES (
        ${`pw1053-${role}-${suffix}`}, ${lookup}, ${`canary-${lookup}`},
        'PW7404-1053 disposable resident task database canary'
      )
      RETURNING id, name
    `;
    agentIds.push(agent.id);
    actors[role] = agent;
    const [credential] = await sql`
      SELECT id FROM agent_credentials
      WHERE agent_id = ${agent.id} AND revoked_at IS NULL
    `;
    assert.ok(credential, `${role} credential missing`);
    checks += 1;
  }

  let marketplace = await createTask({
    creator: actors.alpha.id,
    visibility: "residents",
    key: `pw1053-create-market-${suffix}`,
    title: "Investigate the signal",
  });
  marketplace = await transition({
    taskId: marketplace.id,
    actor: actors.alpha.id,
    key: `pw1053-update-${suffix}`,
    eventType: "updated",
    update: async (transaction, before) =>
      (
        await transaction`
        UPDATE resident_tasks
        SET title = 'Investigate the verified signal',
            version = version + 1,
            updated_at = now()
        WHERE id = ${before.id}
        RETURNING *
      `
      )[0],
  });
  marketplace = await transition({
    taskId: marketplace.id,
    actor: actors.beta.id,
    key: `pw1053-claim-beta-${suffix}`,
    eventType: "assigned",
    update: async (transaction, before) =>
      (
        await transaction`
        UPDATE resident_tasks
        SET assignee_agent_id = ${actors.beta.id}, version = version + 1,
            updated_at = now()
        WHERE id = ${before.id}
        RETURNING *
      `
      )[0],
  });
  marketplace = await transition({
    taskId: marketplace.id,
    actor: actors.beta.id,
    key: `pw1053-start-beta-${suffix}`,
    eventType: "started",
    update: async (transaction, before) =>
      (
        await transaction`
        UPDATE resident_tasks
        SET status = 'in_progress', version = version + 1, updated_at = now()
        WHERE id = ${before.id}
        RETURNING *
      `
      )[0],
  });
  marketplace = await transition({
    taskId: marketplace.id,
    actor: actors.beta.id,
    key: `pw1053-note-beta-${suffix}`,
    eventType: "noted",
    update: async (transaction, before) =>
      (
        await transaction`
        UPDATE resident_tasks
        SET version = version + 1, updated_at = now()
        WHERE id = ${before.id}
        RETURNING *
      `
      )[0],
  });
  marketplace = await transition({
    taskId: marketplace.id,
    actor: actors.beta.id,
    key: `pw1053-block-beta-${suffix}`,
    eventType: "blocked",
    update: async (transaction, before) =>
      (
        await transaction`
        UPDATE resident_tasks
        SET status = 'blocked', version = version + 1, updated_at = now()
        WHERE id = ${before.id}
        RETURNING *
      `
      )[0],
  });
  marketplace = await transition({
    taskId: marketplace.id,
    actor: actors.beta.id,
    key: `pw1053-resume-beta-${suffix}`,
    eventType: "resumed",
    update: async (transaction, before) =>
      (
        await transaction`
        UPDATE resident_tasks
        SET status = 'in_progress', version = version + 1, updated_at = now()
        WHERE id = ${before.id}
        RETURNING *
      `
      )[0],
  });
  marketplace = await transition({
    taskId: marketplace.id,
    actor: actors.beta.id,
    key: `pw1053-release-beta-${suffix}`,
    eventType: "released",
    update: async (transaction, before) =>
      (
        await transaction`
        UPDATE resident_tasks
        SET status = 'open', assignee_agent_id = NULL,
            version = version + 1, updated_at = now()
        WHERE id = ${before.id}
        RETURNING *
      `
      )[0],
  });
  marketplace = await transition({
    taskId: marketplace.id,
    actor: actors.gamma.id,
    key: `pw1053-claim-gamma-${suffix}`,
    eventType: "assigned",
    update: async (transaction, before) =>
      (
        await transaction`
        UPDATE resident_tasks
        SET assignee_agent_id = ${actors.gamma.id}, version = version + 1,
            updated_at = now()
        WHERE id = ${before.id}
        RETURNING *
      `
      )[0],
  });
  marketplace = await transition({
    taskId: marketplace.id,
    actor: actors.gamma.id,
    key: `pw1053-start-gamma-${suffix}`,
    eventType: "started",
    update: async (transaction, before) =>
      (
        await transaction`
        UPDATE resident_tasks
        SET status = 'in_progress', version = version + 1, updated_at = now()
        WHERE id = ${before.id}
        RETURNING *
      `
      )[0],
  });
  marketplace = await transition({
    taskId: marketplace.id,
    actor: actors.gamma.id,
    key: `pw1053-complete-gamma-${suffix}`,
    eventType: "completed",
    update: async (transaction, before) =>
      (
        await transaction`
        UPDATE resident_tasks
        SET status = 'completed', result = ${transaction.json({
          verified: true,
        })},
            completed_at = now(), version = version + 1, updated_at = now()
        WHERE id = ${before.id}
        RETURNING *
      `
      )[0],
  });
  assert.equal(marketplace.status, "completed");
  assert.equal(marketplace.version, 11);
  checks += 2;

  let assigned = await createTask({
    creator: actors.alpha.id,
    assignee: actors.beta.id,
    visibility: "participants",
    key: `pw1053-create-assigned-${suffix}`,
    title: "Private collaboration task",
  });
  assigned = await transition({
    taskId: assigned.id,
    actor: actors.beta.id,
    key: `pw1053-start-assigned-${suffix}`,
    eventType: "started",
    update: async (transaction, before) =>
      (
        await transaction`
        UPDATE resident_tasks SET status = 'in_progress',
          version = version + 1, updated_at = now()
        WHERE id = ${before.id} RETURNING *
      `
      )[0],
  });
  assigned = await transition({
    taskId: assigned.id,
    actor: actors.alpha.id,
    key: `pw1053-cancel-assigned-${suffix}`,
    eventType: "cancelled",
    update: async (transaction, before) =>
      (
        await transaction`
        UPDATE resident_tasks SET status = 'cancelled', cancelled_at = now(),
          version = version + 1, updated_at = now()
        WHERE id = ${before.id} RETURNING *
      `
      )[0],
  });
  assert.equal(assigned.status, "cancelled");
  checks += 1;

  const guardTask = await createTask({
    creator: actors.alpha.id,
    visibility: "participants",
    key: `pw1053-create-guard-${suffix}`,
    title: "Guard verification task",
  });

  await expectFailure(
    "event update guard",
    () =>
      sql`UPDATE resident_task_events SET changes = changes WHERE task_id = ${guardTask.id}`,
    /append-only/,
  );
  await expectFailure(
    "event delete guard",
    () => sql`DELETE FROM resident_task_events WHERE task_id = ${guardTask.id}`,
    /append-only/,
  );
  await expectFailure(
    "task delete guard",
    () => sql`DELETE FROM resident_tasks WHERE id = ${guardTask.id}`,
    /cannot be physically deleted/,
  );
  await expectFailure(
    "version jump guard",
    () =>
      sql`UPDATE resident_tasks SET version = version + 2 WHERE id = ${guardTask.id}`,
    /increment by exactly one/,
  );
  await expectFailure(
    "initial version guard",
    () => sql`
      INSERT INTO resident_tasks (
        creator_agent_id, task_type, title, input, visibility, priority, version
      ) VALUES (
        ${actors.alpha.id}, 'verification', 'Invalid initial version',
        ${sql.json({ canary: true })}, 'participants', 'normal', 2
      )
    `,
    /created open at version one/,
  );
  await expectFailure(
    "missing event deferred guard",
    () =>
      sql.begin(async (transaction) => {
        await transaction`
          UPDATE resident_tasks SET title = 'Missing event',
            version = version + 1, updated_at = now()
          WHERE id = ${guardTask.id}
        `;
      }),
    /requires a matching event/,
  );
  await expectFailure(
    "future event guard",
    () =>
      sql`
        INSERT INTO resident_task_events (
          task_id, actor_agent_id, task_version, event_type, from_status,
          to_status, client_request_id, request_fingerprint, changes
        ) VALUES (
          ${guardTask.id}, ${actors.alpha.id}, 2, 'noted', 'open', 'open',
          ${`pw1053-future-${suffix}`}, ${fingerprint(
            `pw1053-future-${suffix}`,
          )},
          ${sql.json({ snapshot: { ...snapshot(guardTask), version: 2 } })}
        )
      `,
    /must match the current task snapshot/,
  );
  await expectFailure(
    "fabricated snapshot guard",
    () =>
      sql.begin(async (transaction) => {
        const [before] = await transaction`
          SELECT * FROM resident_tasks WHERE id = ${guardTask.id}
        `;
        const [updated] = await transaction`
          UPDATE resident_tasks SET title = 'Real title',
            version = version + 1, updated_at = now()
          WHERE id = ${guardTask.id} RETURNING *
        `;
        await transaction`
          INSERT INTO resident_task_events (
            task_id, actor_agent_id, task_version, event_type, from_status,
            to_status, client_request_id, request_fingerprint, changes
          ) VALUES (
            ${guardTask.id}, ${actors.alpha.id}, ${updated.version}, 'updated',
            ${before.status}, ${
              updated.status
            }, ${`pw1053-fake-snapshot-${suffix}`},
            ${fingerprint(`pw1053-fake-snapshot-${suffix}`)},
            ${transaction.json({
              snapshot: { ...snapshot(updated), title: "Fabricated" },
            })}
          )
        `;
      }),
    /snapshot must exactly match/,
  );
  await expectFailure(
    "broken ledger chain guard",
    () =>
      sql.begin(async (transaction) => {
        const [updated] = await transaction`
          UPDATE resident_tasks SET assignee_agent_id = ${actors.beta.id},
            status = 'in_progress', version = version + 1, updated_at = now()
          WHERE id = ${guardTask.id} RETURNING *
        `;
        await transaction`
          INSERT INTO resident_task_events (
            task_id, actor_agent_id, task_version, event_type, from_status,
            to_status, client_request_id, request_fingerprint, changes
          ) VALUES (
            ${guardTask.id}, ${actors.beta.id}, ${updated.version}, 'resumed',
            'blocked', 'in_progress', ${`pw1053-broken-chain-${suffix}`},
            ${fingerprint(`pw1053-broken-chain-${suffix}`)},
            ${transaction.json({ snapshot: snapshot(updated) })}
          )
        `;
      }),
    /continue the prior ledger state/,
  );
  await expectFailure(
    "fabricated actor guard",
    () =>
      sql.begin(async (transaction) => {
        const [before] = await transaction`
          SELECT * FROM resident_tasks WHERE id = ${guardTask.id}
        `;
        const [updated] = await transaction`
          UPDATE resident_tasks SET title = 'Actor guard',
            version = version + 1, updated_at = now()
          WHERE id = ${guardTask.id} RETURNING *
        `;
        await transaction`
          INSERT INTO resident_task_events (
            task_id, actor_agent_id, task_version, event_type, from_status,
            to_status, client_request_id, request_fingerprint, changes
          ) VALUES (
            ${guardTask.id}, ${actors.gamma.id}, ${updated.version}, 'noted',
            ${before.status}, ${
              updated.status
            }, ${`pw1053-fake-actor-${suffix}`},
            ${fingerprint(`pw1053-fake-actor-${suffix}`)},
            ${transaction.json({ snapshot: snapshot(updated) })}
          )
        `;
      }),
    /note actor is not a participant/,
  );
  await expectFailure(
    "runtime maintenance impersonation guard",
    () =>
      runtimeSql.begin(async (transaction) => {
        await transaction`SET LOCAL pw7404.allow_resident_task_maintenance = 'on'`;
        await transaction`
          DELETE FROM resident_task_events WHERE task_id = ${guardTask.id}
        `;
      }),
    /append-only|permission denied/,
  );
  await expectFailure(
    "terminal task guard",
    () =>
      sql`UPDATE resident_tasks SET version = version + 1 WHERE id = ${assigned.id}`,
    /terminal resident task cannot be changed/,
  );

  const [integrity] = await sql`
    SELECT
      (SELECT count(*)::int FROM resident_tasks WHERE creator_agent_id = ANY(${agentIds}::uuid[])) AS tasks,
      (SELECT count(*)::int FROM resident_task_events WHERE actor_agent_id = ANY(${agentIds}::uuid[])) AS events,
      (SELECT count(*)::int
       FROM resident_tasks AS task
       LEFT JOIN resident_task_events AS event
         ON event.task_id = task.id AND event.task_version = task.version
       WHERE task.creator_agent_id = ANY(${agentIds}::uuid[])
         AND event.id IS NULL) AS missing_events,
      (SELECT count(*)::int
       FROM resident_tasks AS task
       WHERE task.creator_agent_id = ANY(${agentIds}::uuid[])
         AND (SELECT count(*) FROM resident_task_events WHERE task_id = task.id) <> task.version) AS gaps
  `;
  assert.deepEqual(integrity, {
    tasks: 3,
    events: 15,
    missing_events: 0,
    gaps: 0,
  });
  checks += 4;

  console.log(
    `PW7404-1053 resident task database canary: PASS (${checks} checks)`,
  );
} finally {
  try {
    if (taskIds.length > 0) {
      await sql.begin(async (transaction) => {
        await transaction`SET LOCAL pw7404.allow_resident_task_maintenance = 'on'`;
        await transaction`
          DELETE FROM resident_task_events WHERE task_id = ANY(${taskIds}::uuid[])
        `;
        await transaction`
          DELETE FROM resident_tasks WHERE id = ANY(${taskIds}::uuid[])
        `;
      });
    }
    if (agentIds.length > 0) {
      await sql.begin(async (transaction) => {
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
        (SELECT count(*)::int FROM agents WHERE id = ANY(${agentIds}::uuid[])) AS agents,
        (SELECT count(*)::int FROM agent_credentials WHERE agent_id = ANY(${agentIds}::uuid[])) AS credentials
    `;
    assert.deepEqual(remaining, {
      tasks: 0,
      events: 0,
      agents: 0,
      credentials: 0,
    });
  } finally {
    await Promise.all([
      sql.end({ timeout: 5 }),
      runtimeSql.end({ timeout: 5 }),
    ]);
  }
}
