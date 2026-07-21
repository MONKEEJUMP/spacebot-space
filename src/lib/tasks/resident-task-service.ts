import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import {
  agentCredentials,
  agents,
  db,
  residentTaskEvents,
  residentTasks,
} from "@/db";
import type { ResidentRequestAgent } from "@/lib/security/resident-session";
import {
  encodeResidentTaskCursor,
  fingerprintResidentTaskMutation,
  type ResidentTaskCursor,
  type ResidentTaskMutation,
  type ResidentTaskPriority,
  type ResidentTaskRole,
  type ResidentTaskStatus,
  type ResidentTaskVisibility,
} from "./resident-task-contract";
import type {
  ResidentTaskEventOrder,
  ResidentTaskEventView,
  ResidentTaskView,
} from "./resident-task-types";
import { ResidentTaskServiceError } from "./resident-task-errors";

type TaskRow = typeof residentTasks.$inferSelect;
type TaskEventRow = typeof residentTaskEvents.$inferSelect;

interface ResidentTaskSnapshot {
  id: string;
  creatorAgentId: string;
  assigneeAgentId: string | null;
  taskType: string;
  title: string;
  description: string;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  visibility: string;
  priority: string;
  status: string;
  version: number;
  dueAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function isPostgresRetryConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return ["40001", "40P01", "55P03", "57014"].includes(code);
}

function assertActiveActor(actor: ResidentRequestAgent): void {
  if (actor.moderationStatus !== "active") {
    throw new ResidentTaskServiceError(
      "authorization",
      "Resident must be active to change tasks",
    );
  }
}

function snapshotTask(row: TaskRow): ResidentTaskSnapshot {
  return {
    id: row.id,
    creatorAgentId: row.creatorAgentId,
    assigneeAgentId: row.assigneeAgentId,
    taskType: row.taskType,
    title: row.title,
    description: row.description,
    input: row.input as Record<string, unknown>,
    result: row.result as Record<string, unknown> | null,
    visibility: row.visibility,
    priority: row.priority,
    status: row.status,
    version: row.version,
    dueAt: row.dueAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isTaskSnapshot(value: unknown): value is ResidentTaskSnapshot {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      "creatorAgentId" in value &&
      typeof value.creatorAgentId === "string" &&
      "version" in value &&
      typeof value.version === "number",
  );
}

async function resolveAgentNames(
  ids: Array<string | null>,
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (uniqueIds.length === 0) return new Map();
  const rows = await db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(inArray(agents.id, uniqueIds));
  return new Map(rows.map((row) => [row.id, row.name]));
}

function presentTask(
  snapshot: ResidentTaskSnapshot,
  names: Map<string, string>,
): ResidentTaskView {
  const creatorName = names.get(snapshot.creatorAgentId);
  if (!creatorName) throw new Error("Resident task creator is missing");
  const assigneeName = snapshot.assigneeAgentId
    ? names.get(snapshot.assigneeAgentId)
    : null;
  if (snapshot.assigneeAgentId && !assigneeName) {
    throw new Error("Resident task assignee is missing");
  }
  return {
    id: snapshot.id,
    creator: { id: snapshot.creatorAgentId, name: creatorName },
    assignee: snapshot.assigneeAgentId
      ? { id: snapshot.assigneeAgentId, name: assigneeName! }
      : null,
    taskType: snapshot.taskType,
    title: snapshot.title,
    description: snapshot.description,
    input: snapshot.input,
    result: snapshot.result,
    visibility: snapshot.visibility as ResidentTaskVisibility,
    priority: snapshot.priority as ResidentTaskPriority,
    status: snapshot.status as ResidentTaskStatus,
    version: snapshot.version,
    dueAt: snapshot.dueAt,
    completedAt: snapshot.completedAt,
    cancelledAt: snapshot.cancelledAt,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

function presentEvent(
  row: TaskEventRow,
  names: Map<string, string>,
): ResidentTaskEventView {
  const actorName = names.get(row.actorAgentId);
  if (!actorName) throw new Error("Resident task event actor is missing");
  return {
    id: row.id,
    taskId: row.taskId,
    actor: { id: row.actorAgentId, name: actorName },
    taskVersion: row.taskVersion,
    eventType: row.eventType,
    fromStatus: row.fromStatus as ResidentTaskStatus | null,
    toStatus: row.toStatus as ResidentTaskStatus,
    clientRequestId: row.clientRequestId,
    changes: (row.changes ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

async function findReplay(
  actorId: string,
  idempotencyKey: string,
  fingerprint: string,
): Promise<{ snapshot: ResidentTaskSnapshot; event: TaskEventRow } | null> {
  const rows = await db
    .select()
    .from(residentTaskEvents)
    .where(
      and(
        eq(residentTaskEvents.actorAgentId, actorId),
        eq(residentTaskEvents.clientRequestId, idempotencyKey),
      ),
    )
    .limit(1);
  const event = rows[0];
  if (!event) return null;
  if (event.requestFingerprint !== fingerprint) {
    throw new ResidentTaskServiceError(
      "conflict",
      "Idempotency-Key was already used for a different task mutation",
    );
  }
  const changes = event.changes as Record<string, unknown>;
  if (!isTaskSnapshot(changes.snapshot)) {
    throw new Error("Resident task replay snapshot is missing");
  }
  return { snapshot: changes.snapshot, event };
}

async function presentMutationResult(result: {
  snapshot: ResidentTaskSnapshot;
  event: TaskEventRow;
  replayed: boolean;
}): Promise<{
  task: ResidentTaskView;
  event: ResidentTaskEventView;
  replayed: boolean;
}> {
  const names = await resolveAgentNames([
    result.snapshot.creatorAgentId,
    result.snapshot.assigneeAgentId,
    result.event.actorAgentId,
  ]);
  return {
    task: presentTask(result.snapshot, names),
    event: presentEvent(result.event, names),
    replayed: result.replayed,
  };
}

export async function createResidentTask(options: {
  actor: ResidentRequestAgent;
  taskType: string;
  title: string;
  description: string;
  input: Record<string, unknown>;
  visibility: ResidentTaskVisibility;
  priority: ResidentTaskPriority;
  dueAt: Date | null;
  assigneeName: string | null;
  idempotencyKey: string;
}) {
  assertActiveActor(options.actor);
  const fingerprint = fingerprintResidentTaskMutation("create", {
    taskType: options.taskType,
    title: options.title,
    description: options.description,
    input: options.input,
    visibility: options.visibility,
    priority: options.priority,
    dueAt: options.dueAt?.toISOString() ?? null,
    assignee: options.assigneeName?.toLowerCase() ?? null,
  });

  const replay = await findReplay(
    options.actor.id,
    options.idempotencyKey,
    fingerprint,
  );
  if (replay) {
    return presentMutationResult({ ...replay, replayed: true });
  }

  let result: {
    snapshot: ResidentTaskSnapshot;
    event: TaskEventRow;
    replayed: boolean;
  };
  try {
    result = await db.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await transaction.execute(sql`SET LOCAL statement_timeout = '15s'`);
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-task-request:${options.actor.id}:${options.idempotencyKey}`}, 0))`,
      );
      const replayRows = await transaction
        .select()
        .from(residentTaskEvents)
        .where(
          and(
            eq(residentTaskEvents.actorAgentId, options.actor.id),
            eq(residentTaskEvents.clientRequestId, options.idempotencyKey),
          ),
        )
        .limit(1);
      const replayEvent = replayRows[0];
      if (replayEvent) {
        if (replayEvent.requestFingerprint !== fingerprint) {
          throw new ResidentTaskServiceError(
            "conflict",
            "Idempotency-Key was already used for a different task mutation",
          );
        }
        const changes = replayEvent.changes as Record<string, unknown>;
        if (!isTaskSnapshot(changes.snapshot)) {
          throw new Error("Resident task replay snapshot is missing");
        }
        return {
          snapshot: changes.snapshot,
          event: replayEvent,
          replayed: true,
        };
      }

      const activeActors = await transaction
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(
            eq(agents.id, options.actor.id),
            eq(agents.moderationStatus, "active"),
            sql`EXISTS (
              SELECT 1 FROM ${agentCredentials} AS actor_credential
              WHERE actor_credential.agent_id = ${agents.id}
                AND actor_credential.revoked_at IS NULL
            )`,
          ),
        )
        .limit(1);
      if (!activeActors[0]) {
        throw new ResidentTaskServiceError(
          "authorization",
          "Resident must have an active credential to create tasks",
        );
      }

      let assigneeId: string | null = null;
      if (options.assigneeName) {
        const assignees = await transaction
          .select({ id: agents.id })
          .from(agents)
          .where(
            and(
              sql`lower(${agents.name}) = lower(${options.assigneeName})`,
              eq(agents.moderationStatus, "active"),
              sql`EXISTS (
                SELECT 1 FROM ${agentCredentials} AS task_credential
                WHERE task_credential.agent_id = ${agents.id}
                  AND task_credential.revoked_at IS NULL
              )`,
            ),
          )
          .limit(1);
        if (!assignees[0]) {
          throw new ResidentTaskServiceError(
            "not_found",
            "Assignee resident not found",
          );
        }
        assigneeId = assignees[0].id;
      }

      const insertedRows = await transaction
        .insert(residentTasks)
        .values({
          creatorAgentId: options.actor.id,
          assigneeAgentId: assigneeId,
          taskType: options.taskType,
          title: options.title,
          description: options.description,
          input: options.input,
          visibility: options.visibility,
          priority: options.priority,
          dueAt: options.dueAt,
        })
        .returning();
      const task = insertedRows[0];
      if (!task) throw new Error("Resident task insert returned no row");
      const snapshot = snapshotTask(task);
      const eventRows = await transaction
        .insert(residentTaskEvents)
        .values({
          taskId: task.id,
          actorAgentId: options.actor.id,
          taskVersion: 1,
          eventType: "created",
          fromStatus: null,
          toStatus: "open",
          clientRequestId: options.idempotencyKey,
          requestFingerprint: fingerprint,
          changes: { snapshot },
        })
        .returning();
      if (!eventRows[0]) throw new Error("Resident task event insert failed");
      return { snapshot, event: eventRows[0], replayed: false };
    });
  } catch (error) {
    if (isPostgresRetryConflict(error)) {
      throw new ResidentTaskServiceError(
        "conflict",
        "Task request is busy; retry with the same Idempotency-Key",
      );
    }
    throw error;
  }
  return presentMutationResult(result);
}

function assertParticipant(task: TaskRow, actorId: string): void {
  if (task.creatorAgentId !== actorId && task.assigneeAgentId !== actorId) {
    throw new ResidentTaskServiceError("not_found", "Task not found");
  }
}

function assertCreator(task: TaskRow, actorId: string): void {
  if (task.creatorAgentId !== actorId) {
    throw new ResidentTaskServiceError(
      "authorization",
      "Only the task creator can perform this action",
    );
  }
}

function assertAssignee(task: TaskRow, actorId: string): void {
  if (task.assigneeAgentId !== actorId) {
    throw new ResidentTaskServiceError(
      "authorization",
      "Only the task assignee can perform this action",
    );
  }
}

function assertMutable(task: TaskRow): void {
  if (task.status === "completed" || task.status === "cancelled") {
    throw new ResidentTaskServiceError(
      "conflict",
      "Task is terminal and cannot be changed",
    );
  }
}

export async function mutateResidentTask(options: {
  actor: ResidentRequestAgent;
  taskId: string;
  mutation: ResidentTaskMutation;
  idempotencyKey: string;
}) {
  assertActiveActor(options.actor);
  const mutationPayload = {
    ...options.mutation,
    ...(options.mutation.action === "update" &&
    options.mutation.dueAt !== undefined
      ? { dueAt: options.mutation.dueAt?.toISOString() ?? null }
      : {}),
  };
  const fingerprint = fingerprintResidentTaskMutation("mutate", {
    taskId: options.taskId,
    mutation: mutationPayload,
  });

  const replay = await findReplay(
    options.actor.id,
    options.idempotencyKey,
    fingerprint,
  );
  if (replay) {
    return presentMutationResult({ ...replay, replayed: true });
  }

  let result: {
    snapshot: ResidentTaskSnapshot;
    event: TaskEventRow;
    replayed: boolean;
  };
  try {
    result = await db.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await transaction.execute(sql`SET LOCAL statement_timeout = '15s'`);
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-task-request:${options.actor.id}:${options.idempotencyKey}`}, 0))`,
      );
      const replayRows = await transaction
        .select()
        .from(residentTaskEvents)
        .where(
          and(
            eq(residentTaskEvents.actorAgentId, options.actor.id),
            eq(residentTaskEvents.clientRequestId, options.idempotencyKey),
          ),
        )
        .limit(1);
      const replayEvent = replayRows[0];
      if (replayEvent) {
        if (replayEvent.requestFingerprint !== fingerprint) {
          throw new ResidentTaskServiceError(
            "conflict",
            "Idempotency-Key was already used for a different task mutation",
          );
        }
        const changes = replayEvent.changes as Record<string, unknown>;
        if (!isTaskSnapshot(changes.snapshot)) {
          throw new Error("Resident task replay snapshot is missing");
        }
        return {
          snapshot: changes.snapshot,
          event: replayEvent,
          replayed: true,
        };
      }

      const activeActors = await transaction
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(
            eq(agents.id, options.actor.id),
            eq(agents.moderationStatus, "active"),
            sql`EXISTS (
              SELECT 1 FROM ${agentCredentials} AS actor_credential
              WHERE actor_credential.agent_id = ${agents.id}
                AND actor_credential.revoked_at IS NULL
            )`,
          ),
        )
        .limit(1);
      if (!activeActors[0]) {
        throw new ResidentTaskServiceError(
          "authorization",
          "Resident must have an active credential to change tasks",
        );
      }

      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-task:${options.taskId}`}, 0))`,
      );
      const taskRows = await transaction
        .select()
        .from(residentTasks)
        .where(eq(residentTasks.id, options.taskId))
        .limit(1);
      const task = taskRows[0];
      if (!task) {
        throw new ResidentTaskServiceError("not_found", "Task not found");
      }
      if (options.mutation.action !== "claim") {
        assertParticipant(task, options.actor.id);
      }
      if (task.version !== options.mutation.expectedVersion) {
        throw new ResidentTaskServiceError(
          "conflict",
          `Task version changed; current version is ${task.version}`,
        );
      }

      const now = new Date();
      const nextVersion = task.version + 1;
      const updates: Partial<typeof residentTasks.$inferInsert> = {
        version: nextVersion,
        updatedAt: now,
      };
      let eventType: string = options.mutation.action;

      switch (options.mutation.action) {
        case "update":
          assertCreator(task, options.actor.id);
          assertMutable(task);
          if (task.status !== "open") {
            throw new ResidentTaskServiceError(
              "conflict",
              "Only an open task definition can be updated",
            );
          }
          if (options.mutation.taskType !== undefined) {
            updates.taskType = options.mutation.taskType;
          }
          if (options.mutation.title !== undefined) {
            updates.title = options.mutation.title;
          }
          if (options.mutation.description !== undefined) {
            updates.description = options.mutation.description;
          }
          if (options.mutation.priority !== undefined) {
            updates.priority = options.mutation.priority;
          }
          if (options.mutation.dueAt !== undefined) {
            updates.dueAt = options.mutation.dueAt;
          }
          if (options.mutation.input !== undefined) {
            updates.input = options.mutation.input;
          }
          if (options.mutation.visibility !== undefined) {
            updates.visibility = options.mutation.visibility;
          }
          eventType = "updated";
          break;
        case "assign": {
          assertCreator(task, options.actor.id);
          assertMutable(task);
          if (task.status !== "open") {
            throw new ResidentTaskServiceError(
              "conflict",
              "Only an open task can be assigned",
            );
          }
          const assignees = await transaction
            .select({ id: agents.id })
            .from(agents)
            .where(
              and(
                sql`lower(${agents.name}) = lower(${options.mutation.assignee})`,
                eq(agents.moderationStatus, "active"),
                sql`EXISTS (
                  SELECT 1 FROM ${agentCredentials} AS task_credential
                  WHERE task_credential.agent_id = ${agents.id}
                    AND task_credential.revoked_at IS NULL
                )`,
              ),
            )
            .limit(1);
          const assignee = assignees[0];
          if (!assignee) {
            throw new ResidentTaskServiceError(
              "not_found",
              "Assignee resident not found",
            );
          }
          if (task.assigneeAgentId === assignee.id) {
            throw new ResidentTaskServiceError(
              "conflict",
              "Task is already assigned to that resident",
            );
          }
          updates.assigneeAgentId = assignee.id;
          eventType = "assigned";
          break;
        }
        case "claim":
          if (
            task.visibility !== "residents" ||
            task.status !== "open" ||
            task.assigneeAgentId
          ) {
            throw new ResidentTaskServiceError(
              "conflict",
              "Task is not available for resident assignment",
            );
          }
          updates.assigneeAgentId = options.actor.id;
          eventType = "assigned";
          break;
        case "start":
          assertAssignee(task, options.actor.id);
          if (task.status !== "open") {
            throw new ResidentTaskServiceError(
              "conflict",
              "Only an open task can be started",
            );
          }
          updates.status = "in_progress";
          eventType = "started";
          break;
        case "block":
          assertAssignee(task, options.actor.id);
          if (task.status !== "in_progress") {
            throw new ResidentTaskServiceError(
              "conflict",
              "Only an in-progress task can be blocked",
            );
          }
          updates.status = "blocked";
          eventType = "blocked";
          break;
        case "resume":
          assertAssignee(task, options.actor.id);
          if (task.status !== "blocked") {
            throw new ResidentTaskServiceError(
              "conflict",
              "Only a blocked task can be resumed",
            );
          }
          updates.status = "in_progress";
          eventType = "resumed";
          break;
        case "release":
          assertAssignee(task, options.actor.id);
          assertMutable(task);
          updates.assigneeAgentId = null;
          updates.status = "open";
          eventType = "released";
          break;
        case "note":
          assertMutable(task);
          eventType = "noted";
          break;
        case "complete":
          assertAssignee(task, options.actor.id);
          if (task.status !== "in_progress") {
            throw new ResidentTaskServiceError(
              "conflict",
              "Only an in-progress task can be completed",
            );
          }
          updates.status = "completed";
          updates.result = options.mutation.result;
          updates.completedAt = now;
          updates.cancelledAt = null;
          eventType = "completed";
          break;
        case "cancel":
          assertCreator(task, options.actor.id);
          assertMutable(task);
          updates.status = "cancelled";
          updates.cancelledAt = now;
          updates.completedAt = null;
          eventType = "cancelled";
          break;
        default:
          throw new ResidentTaskServiceError(
            "conflict",
            "Unsupported task action",
          );
      }

      const updatedRows = await transaction
        .update(residentTasks)
        .set(updates)
        .where(
          and(
            eq(residentTasks.id, task.id),
            eq(residentTasks.version, task.version),
          ),
        )
        .returning();
      const updated = updatedRows[0];
      if (!updated) {
        throw new ResidentTaskServiceError(
          "conflict",
          "Task changed concurrently; reload and retry",
        );
      }
      const snapshot = snapshotTask(updated);
      const eventRows = await transaction
        .insert(residentTaskEvents)
        .values({
          taskId: updated.id,
          actorAgentId: options.actor.id,
          taskVersion: nextVersion,
          eventType,
          fromStatus: task.status,
          toStatus: updated.status,
          clientRequestId: options.idempotencyKey,
          requestFingerprint: fingerprint,
          changes: {
            action: options.mutation.action,
            previousVersion: task.version,
            ...(options.mutation.action === "note" ||
            options.mutation.action === "block" ||
            options.mutation.action === "cancel" ||
            options.mutation.action === "release"
              ? { note: options.mutation.note }
              : {}),
            snapshot,
          },
        })
        .returning();
      if (!eventRows[0]) throw new Error("Resident task event insert failed");
      return { snapshot, event: eventRows[0], replayed: false };
    });
  } catch (error) {
    if (isPostgresRetryConflict(error)) {
      throw new ResidentTaskServiceError(
        "conflict",
        "Task request is busy; retry with the same Idempotency-Key",
      );
    }
    throw error;
  }
  return presentMutationResult(result);
}

export async function listResidentTasks(options: {
  actorId: string;
  role: ResidentTaskRole;
  status: ResidentTaskStatus | null;
  cursor: ResidentTaskCursor | null;
  limit: number;
}): Promise<{
  tasks: ResidentTaskView[];
  hasMore: boolean;
  nextCursor: string | null;
}> {
  const participant = or(
    eq(residentTasks.creatorAgentId, options.actorId),
    eq(residentTasks.assigneeAgentId, options.actorId),
  );
  const available = and(
    eq(residentTasks.visibility, "residents"),
    eq(residentTasks.status, "open"),
    sql`${residentTasks.assigneeAgentId} IS NULL`,
  );
  const access = or(participant, available);
  const role =
    options.role === "created"
      ? eq(residentTasks.creatorAgentId, options.actorId)
      : options.role === "assigned"
      ? eq(residentTasks.assigneeAgentId, options.actorId)
      : options.role === "available"
      ? available
      : access;
  const rows = await db
    .select({
      id: residentTasks.id,
      creatorAgentId: residentTasks.creatorAgentId,
      assigneeAgentId: residentTasks.assigneeAgentId,
      taskType: residentTasks.taskType,
      title: residentTasks.title,
      description: residentTasks.description,
      input: residentTasks.input,
      result: residentTasks.result,
      visibility: residentTasks.visibility,
      priority: residentTasks.priority,
      status: residentTasks.status,
      version: residentTasks.version,
      dueAt: residentTasks.dueAt,
      completedAt: residentTasks.completedAt,
      cancelledAt: residentTasks.cancelledAt,
      createdAt: residentTasks.createdAt,
      updatedAt: residentTasks.updatedAt,
      cursorUpdatedAt: sql<string>`to_char(${residentTasks.updatedAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
    })
    .from(residentTasks)
    .where(
      and(
        access,
        role,
        options.status ? eq(residentTasks.status, options.status) : undefined,
        options.cursor
          ? sql`(${residentTasks.updatedAt}, ${residentTasks.id}) < (${options.cursor.updatedAt}::timestamptz, ${options.cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(residentTasks.updatedAt), desc(residentTasks.id))
    .limit(options.limit + 1);
  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const snapshots = page.map((row) => snapshotTask(row));
  const names = await resolveAgentNames(
    snapshots.flatMap((task) => [task.creatorAgentId, task.assigneeAgentId]),
  );
  const last = page[page.length - 1];
  return {
    tasks: snapshots.map((task) => presentTask(task, names)),
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeResidentTaskCursor({
            updatedAt: last.cursorUpdatedAt,
            id: last.id,
          })
        : null,
  };
}

export async function getResidentTask(options: {
  actorId: string;
  taskId: string;
}): Promise<ResidentTaskView> {
  const rows = await db
    .select()
    .from(residentTasks)
    .where(
      and(
        eq(residentTasks.id, options.taskId),
        or(
          eq(residentTasks.creatorAgentId, options.actorId),
          eq(residentTasks.assigneeAgentId, options.actorId),
          and(
            eq(residentTasks.visibility, "residents"),
            eq(residentTasks.status, "open"),
            sql`${residentTasks.assigneeAgentId} IS NULL`,
          ),
        ),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    throw new ResidentTaskServiceError("not_found", "Task not found");
  }
  const snapshot = snapshotTask(rows[0]);
  const names = await resolveAgentNames([
    snapshot.creatorAgentId,
    snapshot.assigneeAgentId,
  ]);
  return presentTask(snapshot, names);
}

export async function listResidentTaskEvents(options: {
  actorId: string;
  taskId: string;
  afterVersion: number;
  beforeVersion: number | null;
  order: ResidentTaskEventOrder;
  limit: number;
}): Promise<{
  events: ResidentTaskEventView[];
  hasMore: boolean;
  nextAfterVersion: number | null;
  nextBeforeVersion: number | null;
}> {
  await getResidentTask({ actorId: options.actorId, taskId: options.taskId });
  const rows = await db
    .select()
    .from(residentTaskEvents)
    .where(
      and(
        eq(residentTaskEvents.taskId, options.taskId),
        options.order === "asc"
          ? gt(residentTaskEvents.taskVersion, options.afterVersion)
          : options.beforeVersion
          ? lt(residentTaskEvents.taskVersion, options.beforeVersion)
          : undefined,
      ),
    )
    .orderBy(
      options.order === "asc"
        ? asc(residentTaskEvents.taskVersion)
        : desc(residentTaskEvents.taskVersion),
      options.order === "asc"
        ? asc(residentTaskEvents.id)
        : desc(residentTaskEvents.id),
    )
    .limit(options.limit + 1);
  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const names = await resolveAgentNames(page.map((row) => row.actorAgentId));
  return {
    events: page.map((row) => presentEvent(row, names)),
    hasMore,
    nextAfterVersion:
      options.order === "asc" && hasMore && page.length > 0
        ? page[page.length - 1].taskVersion
        : null,
    nextBeforeVersion:
      options.order === "desc" && hasMore && page.length > 0
        ? page[page.length - 1].taskVersion
        : null,
  };
}
