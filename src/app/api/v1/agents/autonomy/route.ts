import { NextRequest, NextResponse } from "next/server";
import { clerkUnauthorizedResponse } from "@/lib/security/clerk-auth";
import {
  getResidentAutonomyDelegation,
  ResidentAutonomyConflictError,
  setResidentAutonomyDelegation,
  setResidentAutonomyStatus,
  validateResidentAutonomyPreferences,
} from "@/lib/lucy/resident-autonomy-delegation";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rate-limiter";
import { authenticateAgentCredential } from "@/lib/security/agent-credential-auth";
import { extractAgentCredentialInput } from "@/lib/security/agent-credential-input";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function resident(request: NextRequest) {
  const principal = await authenticateAgentCredential(request);
  const input = extractAgentCredentialInput(request.headers);
  if (!principal || input.status !== "valid") return null;
  return {
    agent: principal.agent,
    credential: {
      credentialSecret: input.credential,
    },
  };
}

function expectedRevision(request: NextRequest): number | null {
  const value = request.headers.get("if-match")?.trim().replace(/^"|"$/g, "");
  if (!value || !/^(0|[1-9][0-9]{0,14})$/.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}

function idempotencyKey(request: NextRequest): string | null {
  const value = request.headers.get("idempotency-key")?.trim();
  return value && /^[A-Za-z0-9._:-]{16,128}$/.test(value) ? value : null;
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function controllerUnavailable() {
  return response(
    {
      success: false,
      error: "Resident autonomy changes are temporarily unavailable.",
    },
    503,
  );
}

function controllerFailure(error: unknown) {
  if (
    error instanceof ResidentAutonomyConflictError &&
    error.kind === "idempotency"
  ) {
    return response(
      {
        success: false,
        error: "Idempotency key conflicts with prior request.",
      },
      409,
    );
  }
  if (
    error instanceof ResidentAutonomyConflictError &&
    error.kind === "revision"
  ) {
    return response(
      {
        success: false,
        error: "Autonomy settings changed; refresh and retry.",
      },
      409,
    );
  }
  logger.error("Resident autonomy controller request failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return controllerUnavailable();
}

export async function GET(request: NextRequest) {
  const actor = await resident(request);
  if (!actor) return clerkUnauthorizedResponse();
  const rate = await checkRateLimit(actor.agent.id, "read");
  if (!rate.allowed) return rateLimitExceededResponse(rate);
  const delegation = await getResidentAutonomyDelegation(actor.agent.id);
  return response({ success: true, delegation });
}

export async function PUT(request: NextRequest) {
  const actor = await resident(request);
  if (!actor) return clerkUnauthorizedResponse();
  if (process.env.SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_ENABLED !== "true") {
    return controllerUnavailable();
  }
  const requestId = idempotencyKey(request);
  const revision = expectedRevision(request);
  if (!requestId || revision === null) {
    return response(
      { success: false, error: "Valid Idempotency-Key and If-Match required." },
      400,
    );
  }
  const rate = await checkRateLimit(actor.agent.id, "autonomyPreference");
  if (!rate.allowed) return rateLimitExceededResponse(rate);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ success: false, error: "Invalid JSON body." }, 400);
  }
  const preferences = validateResidentAutonomyPreferences(body);
  if (!preferences.success) {
    return response(
      { success: false, error: "Invalid autonomy preferences." },
      400,
    );
  }
  try {
    const mutation = await setResidentAutonomyDelegation(
      actor.credential,
      requestId,
      revision,
      preferences.data,
    );
    if (mutation.residentId !== actor.agent.id)
      throw new Error("Resident mismatch");
    const delegation = await getResidentAutonomyDelegation(actor.agent.id);
    return response({ success: true, delegation });
  } catch (error) {
    return controllerFailure(error);
  }
}

export async function PATCH(request: NextRequest) {
  const actor = await resident(request);
  if (!actor) return clerkUnauthorizedResponse();
  if (process.env.SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_ENABLED !== "true") {
    return controllerUnavailable();
  }
  const requestId = idempotencyKey(request);
  const revision = expectedRevision(request);
  if (!requestId || revision === null) {
    return response(
      { success: false, error: "Valid Idempotency-Key and If-Match required." },
      400,
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ success: false, error: "Invalid JSON body." }, 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !["active", "paused"].includes((body as { status?: string }).status ?? "")
  ) {
    return response({ success: false, error: "Invalid autonomy status." }, 400);
  }
  const { status } = body as { status: "active" | "paused" };
  if (status === "active") {
    const rate = await checkRateLimit(actor.agent.id, "autonomyPreference");
    if (!rate.allowed) return rateLimitExceededResponse(rate);
  }
  try {
    const mutation = await setResidentAutonomyStatus(
      actor.credential,
      requestId,
      revision,
      status,
    );
    if (mutation.residentId !== actor.agent.id)
      throw new Error("Resident mismatch");
    const delegation = await getResidentAutonomyDelegation(actor.agent.id);
    return response({ success: true, delegation });
  } catch (error) {
    return controllerFailure(error);
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await resident(request);
  if (!actor) return clerkUnauthorizedResponse();
  if (process.env.SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_ENABLED !== "true") {
    return controllerUnavailable();
  }
  const requestId = idempotencyKey(request);
  const revision = expectedRevision(request);
  if (!requestId || revision === null) {
    return response(
      { success: false, error: "Valid Idempotency-Key and If-Match required." },
      400,
    );
  }
  try {
    const mutation = await setResidentAutonomyStatus(
      actor.credential,
      requestId,
      revision,
      "revoked",
    );
    if (mutation.residentId !== actor.agent.id)
      throw new Error("Resident mismatch");
    const delegation = await getResidentAutonomyDelegation(actor.agent.id);
    return response({ success: true, delegation });
  } catch (error) {
    return controllerFailure(error);
  }
}
