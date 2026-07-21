import { createHash } from "node:crypto";
import {
  RESIDENT_TASK_ACTIONS,
  RESIDENT_TASK_PRIORITIES,
  RESIDENT_TASK_STATUSES,
  type ResidentTaskAction,
  type ResidentTaskEventOrder,
  type ResidentTaskPriority,
  type ResidentTaskRole,
  type ResidentTaskStatus,
  type ResidentTaskVisibility,
} from "./resident-task-types";

export {
  RESIDENT_TASK_ACTIONS,
  RESIDENT_TASK_PRIORITIES,
  RESIDENT_TASK_STATUSES,
} from "./resident-task-types";
export type {
  ResidentTaskAction,
  ResidentTaskEventOrder,
  ResidentTaskPriority,
  ResidentTaskRole,
  ResidentTaskStatus,
  ResidentTaskVisibility,
} from "./resident-task-types";

export const RESIDENT_TASK_TITLE_MAX = 200;
export const RESIDENT_TASK_DESCRIPTION_MAX = 5_000;
export const RESIDENT_TASK_MAX_PAGE_SIZE = 100;
export const RESIDENT_TASK_DEFAULT_PAGE_SIZE = 25;

export interface ResidentTaskCursor {
  updatedAt: string;
  id: string;
}

export class ResidentTaskValidationError extends Error {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = "ResidentTaskValidationError";
    this.field = field;
  }
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeOptionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new ResidentTaskValidationError(`${field} must be a string`, field);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ResidentTaskValidationError(
      `${field} must be ${maxLength} characters or less`,
      field,
    );
  }
  return normalized;
}

export function normalizeResidentTaskTitle(value: unknown): string {
  const title = normalizeOptionalString(
    value,
    "title",
    RESIDENT_TASK_TITLE_MAX,
  );
  if (!title) {
    throw new ResidentTaskValidationError("title is required", "title");
  }
  return title;
}

export function normalizeResidentTaskDescription(value: unknown): string {
  if (value === undefined || value === null) return "";
  return normalizeOptionalString(
    value,
    "description",
    RESIDENT_TASK_DESCRIPTION_MAX,
  );
}

export function normalizeResidentTaskPriority(
  value: unknown,
  fallback: ResidentTaskPriority = "normal",
): ResidentTaskPriority {
  if (value === undefined || value === null || value === "") return fallback;
  if (
    typeof value !== "string" ||
    !RESIDENT_TASK_PRIORITIES.includes(value as ResidentTaskPriority)
  ) {
    throw new ResidentTaskValidationError(
      `priority must be one of: ${RESIDENT_TASK_PRIORITIES.join(", ")}`,
      "priority",
    );
  }
  return value as ResidentTaskPriority;
}

export function normalizeResidentTaskAssignee(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ResidentTaskValidationError(
      "assignee must be a resident name",
      "assignee",
    );
  }
  const assignee = value.trim();
  if (!assignee || assignee.length > 50) {
    throw new ResidentTaskValidationError(
      "assignee must contain 1 to 50 characters",
      "assignee",
    );
  }
  return assignee;
}

export function normalizeResidentTaskDueAt(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 64) {
    throw new ResidentTaskValidationError(
      "dueAt must be an ISO-8601 timestamp or null",
      "dueAt",
    );
  }
  const dueAt = new Date(value);
  if (Number.isNaN(dueAt.getTime())) {
    throw new ResidentTaskValidationError(
      "dueAt must be an ISO-8601 timestamp or null",
      "dueAt",
    );
  }
  return dueAt;
}

export function normalizeResidentTaskExpectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new ResidentTaskValidationError(
      "expectedVersion must be a positive integer",
      "expectedVersion",
    );
  }
  return value as number;
}

export function normalizeResidentTaskAction(
  value: unknown,
): ResidentTaskAction {
  if (
    typeof value !== "string" ||
    !RESIDENT_TASK_ACTIONS.includes(value as ResidentTaskAction)
  ) {
    throw new ResidentTaskValidationError(
      `action must be one of: ${RESIDENT_TASK_ACTIONS.join(", ")}`,
      "action",
    );
  }
  return value as ResidentTaskAction;
}

export function normalizeResidentTaskIdempotencyKey(
  value: string | null | undefined,
): string {
  if (value === undefined || value === null || value === "") {
    throw new ResidentTaskValidationError(
      "Idempotency-Key is required for task mutations",
      "Idempotency-Key",
    );
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new ResidentTaskValidationError(
      "Idempotency-Key must use 1 to 128 letters, numbers, periods, underscores, colons, or hyphens",
      "Idempotency-Key",
    );
  }
  return value;
}

export function normalizeResidentTaskType(value: unknown): string {
  if (value === undefined || value === null || value === "") return "general";
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(value)) {
    throw new ResidentTaskValidationError(
      "taskType must start with a letter and contain up to 32 lowercase letters, numbers, or underscores",
      "taskType",
    );
  }
  return value;
}

export function normalizeResidentTaskVisibility(
  value: unknown,
): ResidentTaskVisibility {
  if (value === undefined || value === null || value === "") {
    return "participants";
  }
  if (value !== "participants" && value !== "residents") {
    throw new ResidentTaskValidationError(
      "visibility must be participants or residents",
      "visibility",
    );
  }
  return value;
}

export function normalizeResidentTaskObject(
  value: unknown,
  field: "input" | "result",
  maxBytes: number,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ResidentTaskValidationError(
      `${field} must be a JSON object`,
      field,
    );
  }
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maxBytes) {
    throw new ResidentTaskValidationError(
      `${field} must be ${maxBytes} bytes or less`,
      field,
    );
  }
  return value as Record<string, unknown>;
}

export function normalizeResidentTaskInput(
  value: unknown,
): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  return normalizeResidentTaskObject(value, "input", 32_768);
}

export function normalizeResidentTaskNote(value: unknown): string {
  const note = normalizeOptionalString(value, "note", 4_000);
  if (!note) {
    throw new ResidentTaskValidationError("note is required", "note");
  }
  return note;
}

export function normalizeResidentTaskStatusFilter(
  value: string | null,
): ResidentTaskStatus | null {
  if (!value) return null;
  if (!RESIDENT_TASK_STATUSES.includes(value as ResidentTaskStatus)) {
    throw new ResidentTaskValidationError(
      `status must be one of: ${RESIDENT_TASK_STATUSES.join(", ")}`,
      "status",
    );
  }
  return value as ResidentTaskStatus;
}

export function normalizeResidentTaskRole(
  value: string | null,
): ResidentTaskRole {
  if (!value || value === "all") return "all";
  if (value === "created" || value === "assigned" || value === "available") {
    return value;
  }
  throw new ResidentTaskValidationError(
    "role must be all, created, assigned, or available",
    "role",
  );
}

export function normalizeResidentTaskLimit(value: string | null): number {
  if (!value) return RESIDENT_TASK_DEFAULT_PAGE_SIZE;
  const limit = Number(value);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > RESIDENT_TASK_MAX_PAGE_SIZE
  ) {
    throw new ResidentTaskValidationError(
      `limit must be an integer from 1 to ${RESIDENT_TASK_MAX_PAGE_SIZE}`,
      "limit",
    );
  }
  return limit;
}

export function normalizeResidentTaskAfterVersion(
  value: string | null,
): number {
  if (!value) return 0;
  const version = Number(value);
  if (!Number.isInteger(version) || version < 0) {
    throw new ResidentTaskValidationError(
      "afterVersion must be a non-negative integer",
      "afterVersion",
    );
  }
  return version;
}

export function normalizeResidentTaskBeforeVersion(
  value: string | null,
): number | null {
  if (!value) return null;
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw new ResidentTaskValidationError(
      "beforeVersion must be a positive integer",
      "beforeVersion",
    );
  }
  return version;
}

export function normalizeResidentTaskEventOrder(
  value: string | null,
): ResidentTaskEventOrder {
  if (!value || value === "asc") return "asc";
  if (value === "desc") return "desc";
  throw new ResidentTaskValidationError("order must be asc or desc", "order");
}

export function normalizeResidentTaskCursor(
  value: string | null,
): ResidentTaskCursor | null {
  if (!value) return null;
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) {
    throw new ResidentTaskValidationError("cursor is invalid", "cursor");
  }
  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64url").toString("utf8");
  } catch {
    throw new ResidentTaskValidationError("cursor is invalid", "cursor");
  }
  const separator = decoded.lastIndexOf("|");
  const updatedAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (
    separator < 1 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/.test(updatedAt) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    throw new ResidentTaskValidationError("cursor is invalid", "cursor");
  }
  return { updatedAt, id: id.toLowerCase() };
}

export function encodeResidentTaskCursor(cursor: ResidentTaskCursor): string {
  return Buffer.from(`${cursor.updatedAt}|${cursor.id}`, "utf8").toString(
    "base64url",
  );
}

export function fingerprintResidentTaskMutation(
  operation: string,
  payload: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ operation, ...payload }))
    .digest("hex");
}

export type ResidentTaskMutation =
  | {
      action: "update";
      expectedVersion: number;
      taskType?: string;
      title?: string;
      description?: string;
      priority?: ResidentTaskPriority;
      dueAt?: Date | null;
      input?: Record<string, unknown>;
      visibility?: ResidentTaskVisibility;
    }
  | { action: "assign"; expectedVersion: number; assignee: string }
  | {
      action: "claim" | "start" | "resume";
      expectedVersion: number;
    }
  | { action: "release"; expectedVersion: number; note?: string }
  | {
      action: "block" | "note" | "cancel";
      expectedVersion: number;
      note: string;
    }
  | {
      action: "complete";
      expectedVersion: number;
      result: Record<string, unknown>;
    };

export function normalizeResidentTaskMutation(
  body: Record<string, unknown>,
): ResidentTaskMutation {
  const action = normalizeResidentTaskAction(body.action);
  const expectedVersion = normalizeResidentTaskExpectedVersion(
    body.expectedVersion,
  );
  if (action === "assign") {
    const assignee = normalizeResidentTaskAssignee(body.assignee);
    if (!assignee) {
      throw new ResidentTaskValidationError(
        "assignee is required for assign",
        "assignee",
      );
    }
    return { action, expectedVersion, assignee };
  }
  if (action === "complete") {
    return {
      action,
      expectedVersion,
      result: normalizeResidentTaskObject(body.result, "result", 65_536),
    };
  }
  if (action === "block" || action === "note" || action === "cancel") {
    return {
      action,
      expectedVersion,
      note: normalizeResidentTaskNote(body.note),
    };
  }
  if (action === "release") {
    return {
      action,
      expectedVersion,
      ...(hasOwn(body, "note") && body.note
        ? { note: normalizeResidentTaskNote(body.note) }
        : {}),
    };
  }
  if (action !== "update") return { action, expectedVersion };

  const mutation: ResidentTaskMutation = { action, expectedVersion };
  if (hasOwn(body, "taskType")) {
    mutation.taskType = normalizeResidentTaskType(body.taskType);
  }
  if (hasOwn(body, "title")) {
    mutation.title = normalizeResidentTaskTitle(body.title);
  }
  if (hasOwn(body, "description")) {
    mutation.description = normalizeResidentTaskDescription(body.description);
  }
  if (hasOwn(body, "priority")) {
    mutation.priority = normalizeResidentTaskPriority(body.priority);
  }
  if (hasOwn(body, "dueAt")) {
    mutation.dueAt = normalizeResidentTaskDueAt(body.dueAt);
  }
  if (hasOwn(body, "input")) {
    mutation.input = normalizeResidentTaskInput(body.input);
  }
  if (hasOwn(body, "visibility")) {
    mutation.visibility = normalizeResidentTaskVisibility(body.visibility);
  }
  if (
    mutation.taskType === undefined &&
    mutation.title === undefined &&
    mutation.description === undefined &&
    mutation.priority === undefined &&
    mutation.dueAt === undefined &&
    mutation.input === undefined &&
    mutation.visibility === undefined
  ) {
    throw new ResidentTaskValidationError(
      "update requires taskType, title, description, priority, dueAt, input, or visibility",
      "action",
    );
  }
  return mutation;
}
