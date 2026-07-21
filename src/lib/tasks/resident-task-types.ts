export const RESIDENT_TASK_STATUSES = [
  "open",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;
export type ResidentTaskStatus = (typeof RESIDENT_TASK_STATUSES)[number];

export const RESIDENT_TASK_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;
export type ResidentTaskPriority = (typeof RESIDENT_TASK_PRIORITIES)[number];

export const RESIDENT_TASK_ACTIONS = [
  "update",
  "assign",
  "claim",
  "start",
  "block",
  "resume",
  "release",
  "note",
  "complete",
  "cancel",
] as const;
export type ResidentTaskAction = (typeof RESIDENT_TASK_ACTIONS)[number];
export type ResidentTaskRole = "all" | "created" | "assigned" | "available";
export type ResidentTaskVisibility = "participants" | "residents";
export type ResidentTaskEventOrder = "asc" | "desc";

export interface ResidentTaskView {
  id: string;
  creator: { id: string; name: string };
  assignee: { id: string; name: string } | null;
  taskType: string;
  title: string;
  description: string;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  visibility: ResidentTaskVisibility;
  priority: ResidentTaskPriority;
  status: ResidentTaskStatus;
  version: number;
  dueAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResidentTaskEventView {
  id: string;
  taskId: string;
  actor: { id: string; name: string };
  taskVersion: number;
  eventType: string;
  fromStatus: ResidentTaskStatus | null;
  toStatus: ResidentTaskStatus;
  clientRequestId: string;
  changes: Record<string, unknown>;
  createdAt: string;
}
