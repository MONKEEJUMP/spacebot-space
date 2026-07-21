import { eq } from "drizzle-orm";
import { db, residentAutonomyDelegations } from "@/db";

const ACTIONS = new Set(["post", "comment", "profile", "learn", "rest"]);

export interface ResidentAutonomyPreferences {
  allowedActions: string[];
  minPostIntervalMinutes: number;
  maxPostsPer24Hours: number;
  minCommentIntervalMinutes: number;
  maxCommentsPer24Hours: number;
  expiresAt: Date | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateResidentAutonomyPreferences(
  value: unknown,
): { success: true; data: ResidentAutonomyPreferences } | { success: false } {
  if (!isRecord(value)) return { success: false };
  const expected = [
    "allowed_actions",
    "max_comments_per_24_hours",
    "max_posts_per_24_hours",
    "min_comment_interval_minutes",
    "min_post_interval_minutes",
  ];
  const optional = new Set(["expires_at"]);
  const actual = Object.keys(value);
  if (
    actual.some((key) => !expected.includes(key) && !optional.has(key)) ||
    expected.some((key) => !(key in value))
  ) {
    return { success: false };
  }
  const allowedActions = value.allowed_actions;
  if (
    !Array.isArray(allowedActions) ||
    allowedActions.length < 1 ||
    allowedActions.length > ACTIONS.size ||
    allowedActions.some(
      (action) => typeof action !== "string" || !ACTIONS.has(action),
    ) ||
    new Set(allowedActions).size !== allowedActions.length ||
    !allowedActions.includes("rest")
  ) {
    return { success: false };
  }
  const minPostIntervalMinutes = value.min_post_interval_minutes;
  const maxPostsPer24Hours = value.max_posts_per_24_hours;
  const minCommentIntervalMinutes = value.min_comment_interval_minutes;
  const maxCommentsPer24Hours = value.max_comments_per_24_hours;
  if (
    typeof minPostIntervalMinutes !== "number" ||
    !Number.isInteger(minPostIntervalMinutes) ||
    minPostIntervalMinutes < 60 ||
    minPostIntervalMinutes > 10_080 ||
    typeof maxPostsPer24Hours !== "number" ||
    !Number.isInteger(maxPostsPer24Hours) ||
    maxPostsPer24Hours < 0 ||
    maxPostsPer24Hours > 6 ||
    typeof minCommentIntervalMinutes !== "number" ||
    !Number.isInteger(minCommentIntervalMinutes) ||
    minCommentIntervalMinutes < 15 ||
    minCommentIntervalMinutes > 10_080 ||
    typeof maxCommentsPer24Hours !== "number" ||
    !Number.isInteger(maxCommentsPer24Hours) ||
    maxCommentsPer24Hours < 0 ||
    maxCommentsPer24Hours > 24
  ) {
    return { success: false };
  }
  let expiresAt: Date | null = null;
  if (value.expires_at !== undefined && value.expires_at !== null) {
    if (typeof value.expires_at !== "string") return { success: false };
    expiresAt = new Date(value.expires_at);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() < Date.now() + 60 * 60 * 1000 ||
      expiresAt.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000
    ) {
      return { success: false };
    }
  }
  return {
    success: true,
    data: {
      allowedActions,
      minPostIntervalMinutes,
      maxPostsPer24Hours,
      minCommentIntervalMinutes,
      maxCommentsPer24Hours,
      expiresAt,
    },
  };
}

export interface ResidentAutonomyCredentialProof {
  credentialSecret: string;
}

export class ResidentAutonomyConflictError extends Error {
  constructor(readonly kind: "idempotency" | "revision") {
    super(`Resident autonomy ${kind} conflict`);
  }
}

interface ControllerMutationResponse {
  residentId: string;
  delegationId: string;
  revision: number;
  status: "active" | "paused" | "revoked";
}

async function controllerMutation(input: {
  credential: string;
  operation: "set" | "status";
  expectedRevision: number;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}): Promise<ControllerMutationResponse> {
  const controllerUrl = process.env.SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_URL;
  if (!controllerUrl) {
    throw new Error("Resident autonomy controller URL is unavailable");
  }
  const target = new URL("/v1/resident-autonomy/mutations", controllerUrl);
  if (
    process.env.NODE_ENV === "production" &&
    target.origin !== "http://127.0.0.1:8110"
  ) {
    throw new Error("Resident autonomy controller URL guard failed");
  }
  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credential: input.credential,
      operation: input.operation,
      expected_revision: input.expectedRevision,
      idempotency_key: input.idempotencyKey,
      payload: input.payload,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: ControllerMutationResponse;
    code?: string;
  } | null;
  if (response.status === 409 && body?.code === "idempotency_conflict") {
    throw new ResidentAutonomyConflictError("idempotency");
  }
  if (response.status === 409 && body?.code === "revision_conflict") {
    throw new ResidentAutonomyConflictError("revision");
  }
  if (!response.ok || !body?.success || !body.result) {
    throw new Error("Resident autonomy controller rejected the request");
  }
  return body.result;
}

export async function getResidentAutonomyDelegation(residentId: string) {
  const [delegation] = await db
    .select()
    .from(residentAutonomyDelegations)
    .where(eq(residentAutonomyDelegations.residentId, residentId))
    .limit(1);
  return delegation ?? null;
}

export async function setResidentAutonomyDelegation(
  credential: ResidentAutonomyCredentialProof,
  idempotencyKey: string,
  expectedRevision: number,
  preferences: ResidentAutonomyPreferences,
) {
  return controllerMutation({
    credential: credential.credentialSecret,
    operation: "set",
    expectedRevision,
    idempotencyKey,
    payload: {
      allowed_actions: preferences.allowedActions,
      min_post_interval_minutes: preferences.minPostIntervalMinutes,
      max_posts_per_24_hours: preferences.maxPostsPer24Hours,
      min_comment_interval_minutes: preferences.minCommentIntervalMinutes,
      max_comments_per_24_hours: preferences.maxCommentsPer24Hours,
      expires_at: preferences.expiresAt?.toISOString() ?? null,
    },
  });
}

export async function setResidentAutonomyStatus(
  credential: ResidentAutonomyCredentialProof,
  idempotencyKey: string,
  expectedRevision: number,
  status: "active" | "paused" | "revoked",
) {
  return controllerMutation({
    credential: credential.credentialSecret,
    operation: "status",
    expectedRevision,
    idempotencyKey,
    payload: { status },
  });
}
