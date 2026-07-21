import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  normalizeResidentTaskIdempotencyKey,
  normalizeResidentTaskMutation,
  ResidentTaskValidationError,
} from "@/lib/tasks/resident-task-contract";
import { ResidentTaskServiceError } from "@/lib/tasks/resident-task-errors";
import {
  getResidentTask,
  mutateResidentTask,
} from "@/lib/tasks/resident-task-service";
import { validateCors } from "@/lib/security/cors";
import {
  authenticateResidentRequest,
  isResidentMutationOriginAllowed,
} from "@/lib/security/resident-session";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function withHeaders(response: NextResponse, headers: Record<string, string>) {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

function errorResponse(error: unknown, headers: Record<string, string>) {
  if (error instanceof ResidentTaskValidationError) {
    return NextResponse.json(
      { success: false, error: error.message, field: error.field },
      { status: 400, headers },
    );
  }
  if (error instanceof ResidentTaskServiceError) {
    const status =
      error.kind === "authorization"
        ? 403
        : error.kind === "not_found"
        ? 404
        : 409;
    return NextResponse.json(
      { success: false, error: error.message },
      { status, headers },
    );
  }
  logger.error("Resident task detail failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { success: false, error: "Resident task request failed" },
    { status: 500, headers },
  );
}

async function principal(
  request: NextRequest,
  headers: Record<string, string>,
) {
  let resident;
  try {
    resident = await authenticateResidentRequest(request);
  } catch (error) {
    logger.error("Resident task authentication controller failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      response: NextResponse.json(
        { success: false, error: "Resident authentication is unavailable" },
        { status: 503, headers },
      ),
    } as const;
  }
  if (!resident) {
    return {
      response: NextResponse.json(
        { success: false, error: "Agent authentication required" },
        { status: 401, headers },
      ),
    } as const;
  }
  if (resident.agent.moderationStatus !== "active") {
    return {
      response: NextResponse.json(
        { success: false, error: "Resident is not active" },
        { status: 403, headers },
      ),
    } as const;
  }
  return { agent: resident.agent, resident } as const;
}

async function taskId(
  params: Promise<{ id: string }>,
  headers: Record<string, string>,
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Invalid task id" },
        { status: 400, headers },
      ),
    } as const;
  }
  return { id } as const;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  const auth = await principal(request, cors.headers);
  if ("response" in auth) return auth.response;
  const parsed = await taskId(params, cors.headers);
  if ("response" in parsed) return parsed.response;
  const rateLimit = await checkRateLimit(auth.agent.id, "read");
  if (!rateLimit.allowed) {
    return withHeaders(rateLimitExceededResponse(rateLimit), cors.headers);
  }
  try {
    const task = await getResidentTask({
      actorId: auth.agent.id,
      taskId: parsed.id,
    });
    return NextResponse.json(
      { success: true, data: task },
      { headers: cors.headers },
    );
  } catch (error) {
    return errorResponse(error, cors.headers);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  const auth = await principal(request, cors.headers);
  if ("response" in auth) return auth.response;
  if (!isResidentMutationOriginAllowed(request, auth.resident)) {
    return NextResponse.json(
      { success: false, error: "Resident session requires an allowed Origin" },
      { status: 403, headers: cors.headers },
    );
  }
  const parsed = await taskId(params, cors.headers);
  if ("response" in parsed) return parsed.response;
  const rateLimit = await checkRateLimit(auth.agent.id, "residentTask");
  if (!rateLimit.allowed) {
    return withHeaders(rateLimitExceededResponse(rateLimit), cors.headers);
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await mutateResidentTask({
      actor: auth.agent,
      taskId: parsed.id,
      mutation: normalizeResidentTaskMutation(body),
      idempotencyKey: normalizeResidentTaskIdempotencyKey(
        request.headers.get("idempotency-key"),
      ),
    });
    return NextResponse.json(
      {
        success: true,
        data: result.task,
        event: result.event,
        replayed: result.replayed,
      },
      { headers: cors.headers },
    );
  } catch (error) {
    return errorResponse(error, cors.headers);
  }
}

export async function OPTIONS(request: Request) {
  const cors = validateCors(request);
  if (!cors.allowed) return new Response("Forbidden", { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...cors.headers,
      "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-Machine-Key, Idempotency-Key",
    },
  });
}
