import { spawnSync } from "node:child_process";
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
if (!connectionString) throw new Error("Database URL is required");

const apply = process.argv.includes("--apply");
if (apply && process.env.SPACEBOT_APPLY_RESIDENT_TASKS !== "1") {
  throw new Error("Set SPACEBOT_APPLY_RESIDENT_TASKS=1 before using --apply");
}

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
if (targetGuards.port !== "local" && !/^\d+$/.test(targetGuards.port)) {
  throw new Error("SPACEBOT_EXPECTED_SERVER_PORT must be numeric or local");
}
if (!/^[0-9a-f-]{36}$/i.test(targetGuards.sentinel)) {
  throw new Error("SPACEBOT_EXPECTED_SENTINEL_AGENT_ID must be a UUID");
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

const migrationPath = path.join(
  repoRoot,
  "drizzle/migrations/PW7404-1051-01-canonical-resident-tasks-20260712.sql",
);
const psqlBin = process.env.SPACEBOT_PSQL_BIN || "psql";
const psqlConnection = process.env.SPACEBOT_PSQL_CONNECTION || connectionString;

const expectedColumns = {
  resident_tasks: [
    "id",
    "creator_agent_id",
    "assignee_agent_id",
    "task_type",
    "title",
    "description",
    "input",
    "result",
    "visibility",
    "priority",
    "status",
    "version",
    "due_at",
    "completed_at",
    "cancelled_at",
    "created_at",
    "updated_at",
  ],
  resident_task_events: [
    "id",
    "task_id",
    "actor_agent_id",
    "task_version",
    "event_type",
    "from_status",
    "to_status",
    "client_request_id",
    "request_fingerprint",
    "changes",
    "created_at",
  ],
};
const expectedColumnSpecs = {
  resident_tasks: {
    id: ["uuid", false, "gen_random_uuid"],
    creator_agent_id: ["uuid", false, null],
    assignee_agent_id: ["uuid", true, null],
    task_type: ["varchar", false, "general"],
    title: ["varchar", false, null],
    description: ["text", false, "::text"],
    input: ["jsonb", false, "{}"],
    result: ["jsonb", true, null],
    visibility: ["varchar", false, "participants"],
    priority: ["varchar", false, "normal"],
    status: ["varchar", false, "open"],
    version: ["int4", false, "1"],
    due_at: ["timestamptz", true, null],
    completed_at: ["timestamptz", true, null],
    cancelled_at: ["timestamptz", true, null],
    created_at: ["timestamptz", false, "now()"],
    updated_at: ["timestamptz", false, "now()"],
  },
  resident_task_events: {
    id: ["uuid", false, "gen_random_uuid"],
    task_id: ["uuid", false, null],
    actor_agent_id: ["uuid", false, null],
    task_version: ["int4", false, null],
    event_type: ["varchar", false, null],
    from_status: ["varchar", true, null],
    to_status: ["varchar", false, null],
    client_request_id: ["varchar", false, null],
    request_fingerprint: ["varchar", false, null],
    changes: ["jsonb", false, "{}"],
    created_at: ["timestamptz", false, "now()"],
  },
};
const expectedConstraints = [
  "resident_tasks_pkey",
  "resident_tasks_creator_agent_id_agents_id_fk",
  "resident_tasks_assignee_agent_id_agents_id_fk",
  "resident_tasks_type_check",
  "resident_tasks_title_check",
  "resident_tasks_description_size_check",
  "resident_tasks_input_check",
  "resident_tasks_result_check",
  "resident_tasks_visibility_check",
  "resident_tasks_priority_check",
  "resident_tasks_status_check",
  "resident_tasks_version_check",
  "resident_tasks_terminal_state_check",
  "resident_tasks_chronology_check",
  "resident_task_events_version_check",
  "resident_task_events_type_check",
  "resident_task_events_request_key_check",
  "resident_task_events_request_fingerprint_check",
  "resident_task_events_status_check",
  "resident_task_events_changes_check",
  "resident_task_events_transition_check",
  "resident_task_events_pkey",
  "resident_task_events_task_id_tasks_id_fk",
  "resident_task_events_actor_agent_id_agents_id_fk",
];
const expectedIndexes = [
  "resident_tasks_creator_timeline_idx",
  "resident_tasks_assignee_timeline_idx",
  "resident_tasks_status_timeline_idx",
  "resident_tasks_available_idx",
  "resident_tasks_due_idx",
  "resident_task_events_version_unique_idx",
  "resident_task_events_actor_request_unique_idx",
  "resident_task_events_task_timeline_idx",
  "resident_task_events_actor_timeline_idx",
];
const expectedTriggers = [
  "pw7404_resident_task_event_immutable_trigger",
  "pw7404_resident_task_event_matches_snapshot_trigger",
  "pw7404_resident_task_guard_trigger",
  "pw7404_resident_task_requires_event_trigger",
];

const expectedConstraintTypes = new Map([
  ["resident_tasks_pkey", "p"],
  ["resident_tasks_creator_agent_id_agents_id_fk", "f"],
  ["resident_tasks_assignee_agent_id_agents_id_fk", "f"],
  ["resident_task_events_pkey", "p"],
  ["resident_task_events_task_id_tasks_id_fk", "f"],
  ["resident_task_events_actor_agent_id_agents_id_fk", "f"],
]);

const expectedConstraintFragments = new Map([
  ["resident_tasks_pkey", ["primary key", "id"]],
  [
    "resident_tasks_creator_agent_id_agents_id_fk",
    [
      "foreign key",
      "creator_agent_id",
      "references agents",
      "on delete restrict",
    ],
  ],
  [
    "resident_tasks_assignee_agent_id_agents_id_fk",
    [
      "foreign key",
      "assignee_agent_id",
      "references agents",
      "on delete restrict",
    ],
  ],
  [
    "resident_tasks_terminal_state_check",
    ["completed_at", "cancelled_at", "result", "assignee_agent_id"],
  ],
  ["resident_task_events_pkey", ["primary key", "id"]],
  [
    "resident_task_events_task_id_tasks_id_fk",
    [
      "foreign key",
      "task_id",
      "references resident_tasks",
      "on delete restrict",
    ],
  ],
  [
    "resident_task_events_actor_agent_id_agents_id_fk",
    [
      "foreign key",
      "actor_agent_id",
      "references agents",
      "on delete restrict",
    ],
  ],
  [
    "resident_task_events_changes_check",
    ["snapshot", "task_version", "to_status"],
  ],
  [
    "resident_task_events_transition_check",
    ["event_type", "created", "completed", "cancelled"],
  ],
]);

const expectedIndexFragments = new Map([
  [
    "resident_tasks_creator_timeline_idx",
    ["creator_agent_id", "updated_at desc", "id desc"],
  ],
  [
    "resident_tasks_assignee_timeline_idx",
    ["assignee_agent_id", "updated_at desc", "id desc"],
  ],
  [
    "resident_tasks_status_timeline_idx",
    ["status", "updated_at desc", "id desc"],
  ],
  [
    "resident_tasks_available_idx",
    ["priority", "created_at", "id", "visibility", "assignee_agent_id is null"],
  ],
  [
    "resident_tasks_due_idx",
    ["due_at", "id", "status", "in_progress", "blocked"],
  ],
  [
    "resident_task_events_version_unique_idx",
    ["unique", "task_id", "task_version"],
  ],
  [
    "resident_task_events_actor_request_unique_idx",
    ["unique", "actor_agent_id", "client_request_id"],
  ],
  ["resident_task_events_task_timeline_idx", ["task_id", "task_version", "id"]],
  [
    "resident_task_events_actor_timeline_idx",
    ["actor_agent_id", "created_at", "id"],
  ],
]);

const expectedTriggerFragments = new Map([
  [
    "pw7404_resident_task_event_immutable_trigger",
    [
      "before",
      "update",
      "delete",
      "resident_task_events",
      "pw7404_resident_task_event_immutable",
    ],
  ],
  [
    "pw7404_resident_task_event_matches_snapshot_trigger",
    [
      "before insert",
      "resident_task_events",
      "pw7404_resident_task_event_matches_snapshot",
    ],
  ],
  [
    "pw7404_resident_task_guard_trigger",
    [
      "before",
      "insert",
      "delete",
      "update",
      "resident_tasks",
      "pw7404_resident_task_guard",
    ],
  ],
  [
    "pw7404_resident_task_requires_event_trigger",
    [
      "after",
      "insert",
      "update",
      "resident_tasks",
      "deferrable initially deferred",
      "pw7404_resident_task_requires_event",
    ],
  ],
]);

const expectedFunctionFragments = new Map([
  [
    "pw7404_resident_task_event_immutable",
    ["pw7404_task_maintenance", "append-only"],
  ],
  [
    "pw7404_resident_task_event_matches_snapshot",
    [
      "snapshot ?& array",
      "date_trunc(milliseconds",
      "exactly match the task row",
      "continue the prior ledger state",
      "active credentialed resident",
    ],
  ],
  [
    "pw7404_resident_task_guard",
    [
      "created open at version one",
      "increment by exactly one",
      "pw7404_task_maintenance",
    ],
  ],
  [
    "pw7404_resident_task_requires_event",
    ["requires a matching event", "pw7404_task_maintenance"],
  ],
]);
const expectedFunctionBodyHashes = new Map([
  [
    "pw7404_resident_task_event_immutable",
    "c0873bf8743b57eb5fbc6affeb8796126f8ec484e157e50421f95c0310a4e975",
  ],
  [
    "pw7404_resident_task_event_matches_snapshot",
    "8dc9842ee7931340a51ceca5ecf499ab872a71490269c1bbfa32a55af20ae450",
  ],
  [
    "pw7404_resident_task_guard",
    "5d9c3ad4a309b124b6d6901dc26d73bf1e74dae565b2bde4f3e9c2b642ffaa7d",
  ],
  [
    "pw7404_resident_task_requires_event",
    "da2053649ed8fc6a18d37464a726223ffce96727e2119048453762fbdde3a378",
  ],
]);

function normalizeDefinition(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/["']/g, "")
    .toLowerCase()
    .trim();
}

function hashFunctionBody(value) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function assertExpectedTarget() {
  const [target] = await sql`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           EXISTS (
             SELECT 1 FROM agents WHERE id = ${targetGuards.sentinel}::uuid
           ) AS sentinel
  `;
  const mismatches = [];
  for (const field of ["database", "user", "address", "port"]) {
    if (target[field] !== targetGuards[field]) mismatches.push(field);
  }
  if (target.sentinel !== true) mismatches.push("sentinel");
  if (mismatches.length > 0) {
    throw new Error(
      `Refusing wrong database target; mismatched guards: ${mismatches.join(
        ", ",
      )}`,
    );
  }
}

async function tableState() {
  const [state] = await sql`
    SELECT to_regclass('public.resident_tasks') IS NOT NULL AS tasks,
           to_regclass('public.resident_task_events') IS NOT NULL AS events
  `;
  return state;
}

function applyMigration() {
  const result = spawnSync(
    psqlBin,
    [
      psqlConnection,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `PW7404_EXPECTED_DATABASE=${targetGuards.database}`,
      "-v",
      `PW7404_EXPECTED_DATABASE_USER=${targetGuards.user}`,
      "-v",
      `PW7404_EXPECTED_SERVER_ADDRESS=${targetGuards.address}`,
      "-v",
      `PW7404_EXPECTED_SERVER_PORT=${targetGuards.port}`,
      "-v",
      `PW7404_EXPECTED_SENTINEL_AGENT_ID=${targetGuards.sentinel}`,
      "-f",
      migrationPath,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        ...(process.env.SPACEBOT_DATABASE_HOST
          ? { PGHOST: process.env.SPACEBOT_DATABASE_HOST }
          : {}),
      },
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function inspect() {
  const state = await tableState();
  if (!state.tasks || !state.events) {
    return { ready: false, failures: ["resident task tables"] };
  }
  const columns = await sql`
    SELECT table_name, column_name, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('resident_tasks', 'resident_task_events')
  `;
  const columnMap = new Map();
  for (const row of columns) {
    const values = columnMap.get(row.table_name) ?? new Map();
    values.set(row.column_name, row);
    columnMap.set(row.table_name, values);
  }
  const constraints = await sql`
    SELECT conname, convalidated, contype, confdeltype,
           pg_get_constraintdef(oid, true) AS definition
    FROM pg_constraint
    WHERE conrelid IN (
      'public.resident_tasks'::regclass,
      'public.resident_task_events'::regclass
    )
  `;
  const constraintMap = new Map(constraints.map((row) => [row.conname, row]));
  const indexes = await sql`
    SELECT index_class.relname AS name,
           pg_index.indisvalid,
           pg_index.indisready,
           pg_index.indisunique,
           pg_get_indexdef(pg_index.indexrelid) AS definition
    FROM pg_index
    JOIN pg_class index_class ON index_class.oid = pg_index.indexrelid
    WHERE pg_index.indrelid IN (
      'public.resident_tasks'::regclass,
      'public.resident_task_events'::regclass
    )
  `;
  const indexMap = new Map(indexes.map((row) => [row.name, row]));
  const triggers = await sql`
    SELECT trigger.tgname, trigger.tgenabled,
           pg_get_triggerdef(trigger.oid, true) AS definition,
           function_proc.proname AS function_name
    FROM pg_trigger AS trigger
    JOIN pg_proc AS function_proc ON function_proc.oid = trigger.tgfoid
    WHERE trigger.tgrelid IN (
      'public.resident_tasks'::regclass,
      'public.resident_task_events'::regclass
    )
      AND NOT trigger.tgisinternal
  `;
  const triggerMap = new Map(triggers.map((row) => [row.tgname, row]));
  const functions = await sql`
    SELECT proname, prosrc, pg_get_functiondef(oid) AS definition
    FROM pg_proc
    WHERE proname IN (
      'pw7404_resident_task_event_immutable',
      'pw7404_resident_task_event_matches_snapshot',
      'pw7404_resident_task_guard',
      'pw7404_resident_task_requires_event'
    )
  `;
  const functionMap = new Map(functions.map((row) => [row.proname, row]));
  const [publicPrivileges] = await sql`
    SELECT
      EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(
          (SELECT relacl FROM pg_class WHERE oid = 'resident_tasks'::regclass),
          acldefault('r', (SELECT relowner FROM pg_class WHERE oid = 'resident_tasks'::regclass))
        ))
        WHERE grantee = 0 AND privilege_type = 'DELETE'
      ) AS public_task_delete,
      EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(
          (SELECT relacl FROM pg_class WHERE oid = 'resident_task_events'::regclass),
          acldefault('r', (SELECT relowner FROM pg_class WHERE oid = 'resident_task_events'::regclass))
        ))
        WHERE grantee = 0 AND privilege_type IN ('UPDATE', 'DELETE')
      ) AS public_event_mutation
  `;
  const [integrity] = await sql`
    SELECT
      (SELECT count(*)::int FROM resident_tasks) AS tasks,
      (SELECT count(*)::int FROM resident_task_events) AS events,
      (SELECT count(*)::int
       FROM resident_tasks AS task
       LEFT JOIN resident_task_events AS event
         ON event.task_id = task.id AND event.task_version = task.version
       WHERE event.id IS NULL) AS missing_current_events,
      (SELECT count(*)::int
       FROM (
         SELECT task.id
         FROM resident_tasks AS task
         LEFT JOIN resident_task_events AS event ON event.task_id = task.id
         GROUP BY task.id, task.version
         HAVING count(event.id) <> task.version
            OR min(event.task_version) <> 1
            OR max(event.task_version) <> task.version
       ) AS broken) AS ledger_gaps,
      (SELECT count(*)::int
       FROM resident_task_events AS event
       WHERE (event.changes -> 'snapshot' ->> 'version')::int <> event.task_version
          OR event.changes -> 'snapshot' ->> 'status' <> event.to_status) AS snapshot_mismatches,
      (SELECT count(*)::int
       FROM resident_tasks AS task
       JOIN resident_task_events AS event
         ON event.task_id = task.id AND event.task_version = task.version
       WHERE event.changes -> 'snapshot' ->> 'id' IS DISTINCT FROM task.id::text
          OR event.changes -> 'snapshot' ->> 'creatorAgentId' IS DISTINCT FROM task.creator_agent_id::text
          OR event.changes -> 'snapshot' ->> 'assigneeAgentId' IS DISTINCT FROM task.assignee_agent_id::text
          OR event.changes -> 'snapshot' ->> 'taskType' IS DISTINCT FROM task.task_type
          OR event.changes -> 'snapshot' ->> 'title' IS DISTINCT FROM task.title
          OR event.changes -> 'snapshot' ->> 'description' IS DISTINCT FROM task.description
          OR event.changes -> 'snapshot' -> 'input' IS DISTINCT FROM task.input
          OR event.changes -> 'snapshot' -> 'result' IS DISTINCT FROM coalesce(to_jsonb(task.result), 'null'::jsonb)
          OR event.changes -> 'snapshot' ->> 'visibility' IS DISTINCT FROM task.visibility
          OR event.changes -> 'snapshot' ->> 'priority' IS DISTINCT FROM task.priority
          OR event.changes -> 'snapshot' ->> 'status' IS DISTINCT FROM task.status
          OR (event.changes -> 'snapshot' ->> 'version')::integer IS DISTINCT FROM task.version
          OR (event.changes -> 'snapshot' ->> 'dueAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task.due_at)
          OR (event.changes -> 'snapshot' ->> 'completedAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task.completed_at)
          OR (event.changes -> 'snapshot' ->> 'cancelledAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task.cancelled_at)
          OR (event.changes -> 'snapshot' ->> 'createdAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task.created_at)
          OR (event.changes -> 'snapshot' ->> 'updatedAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task.updated_at)
      ) AS current_snapshot_mismatches,
      (SELECT count(*)::int
       FROM resident_task_events AS event
       LEFT JOIN resident_task_events AS previous
         ON previous.task_id = event.task_id
        AND previous.task_version = event.task_version - 1
       WHERE (event.task_version = 1 AND (
                event.event_type <> 'created' OR event.from_status IS NOT NULL
             ))
          OR (event.task_version > 1 AND (
                previous.id IS NULL OR previous.to_status IS DISTINCT FROM event.from_status
             ))) AS ledger_chain_mismatches
  `;
  const failures = [];
  for (const [table, names] of Object.entries(expectedColumns)) {
    if (columnMap.get(table)?.size !== names.length) {
      failures.push(`column-count:${table}`);
    }
    for (const name of names) {
      const column = columnMap.get(table)?.get(name);
      if (!column) {
        failures.push(`column:${table}.${name}`);
        continue;
      }
      const [type, nullable, defaultFragment] =
        expectedColumnSpecs[table][name];
      if (column.udt_name !== type)
        failures.push(`column-type:${table}.${name}`);
      if ((column.is_nullable === "YES") !== nullable) {
        failures.push(`column-nullability:${table}.${name}`);
      }
      const actualDefault = normalizeDefinition(column.column_default);
      if (
        defaultFragment === null
          ? actualDefault
          : !actualDefault.includes(defaultFragment)
      ) {
        failures.push(`column-default:${table}.${name}`);
      }
    }
  }
  for (const name of expectedConstraints) {
    const constraint = constraintMap.get(name);
    if (!constraint?.convalidated) failures.push(`constraint:${name}`);
    const expectedType = expectedConstraintTypes.get(name);
    if (expectedType && constraint?.contype !== expectedType) {
      failures.push(`constraint-type:${name}`);
    }
    const definition = normalizeDefinition(constraint?.definition);
    for (const fragment of expectedConstraintFragments.get(name) ?? []) {
      if (!definition.includes(fragment)) {
        failures.push(`constraint-definition:${name}:${fragment}`);
      }
    }
  }
  for (const constraint of constraints.filter((row) => row.contype === "f")) {
    if (constraint.confdeltype !== "r") {
      failures.push(`foreign-key-delete-action:${constraint.conname}`);
    }
  }
  for (const name of expectedIndexes) {
    const index = indexMap.get(name);
    if (!index?.indisvalid || !index?.indisready)
      failures.push(`index:${name}`);
    const definition = normalizeDefinition(index?.definition);
    for (const fragment of expectedIndexFragments.get(name) ?? []) {
      if (!definition.includes(fragment)) {
        failures.push(`index-definition:${name}:${fragment}`);
      }
    }
  }
  for (const name of expectedTriggers) {
    const trigger = triggerMap.get(name);
    if (!["O", "A"].includes(trigger?.tgenabled)) {
      failures.push(`trigger:${name}`);
    }
    const definition = normalizeDefinition(trigger?.definition);
    for (const fragment of expectedTriggerFragments.get(name) ?? []) {
      if (!definition.includes(fragment)) {
        failures.push(`trigger-definition:${name}:${fragment}`);
      }
    }
  }
  if (triggers.length !== expectedTriggers.length) {
    failures.push(`unexpected-trigger-count:${triggers.length}`);
  }
  for (const [name, fragments] of expectedFunctionFragments) {
    const functionRow = functionMap.get(name);
    const definition = normalizeDefinition(functionRow?.definition);
    for (const fragment of fragments) {
      if (!definition.includes(fragment)) {
        failures.push(`function-definition:${name}:${fragment}`);
      }
    }
    if (
      hashFunctionBody(functionRow?.prosrc) !==
      expectedFunctionBodyHashes.get(name)
    ) {
      failures.push(`function-body-hash:${name}`);
    }
  }
  if (publicPrivileges.public_task_delete)
    failures.push("public-task-delete-privilege");
  if (publicPrivileges.public_event_mutation)
    failures.push("public-event-mutation-privilege");
  for (const field of [
    "missing_current_events",
    "ledger_gaps",
    "snapshot_mismatches",
    "current_snapshot_mismatches",
    "ledger_chain_mismatches",
  ]) {
    if (integrity[field] !== 0) failures.push(`${field}:${integrity[field]}`);
  }
  return { ready: failures.length === 0, failures, integrity };
}

try {
  await assertExpectedTarget();
  const before = await tableState();
  if (apply) {
    if (before.tasks !== before.events) {
      throw new Error(
        "Resident task schema is partially present; refusing apply",
      );
    }
    if (!before.tasks) applyMigration();
  }
  const state = await inspect();
  if (!state.ready) {
    throw new Error(
      `Resident task schema check failed: ${state.failures.join(", ")}`,
    );
  }
  console.log(
    `PW7404-1051 canonical resident tasks: PASS (${
      apply ? "apply" : "check"
    }; tasks=${state.integrity.tasks}; events=${state.integrity.events})`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
