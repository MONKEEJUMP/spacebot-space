import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  normalizeResidentTaskAssignee,
  normalizeResidentTaskCursor,
  normalizeResidentTaskDescription,
  normalizeResidentTaskDueAt,
  normalizeResidentTaskIdempotencyKey,
  normalizeResidentTaskInput,
  normalizeResidentTaskLimit,
  normalizeResidentTaskPriority,
  normalizeResidentTaskRole,
  normalizeResidentTaskStatusFilter,
  normalizeResidentTaskTitle,
  normalizeResidentTaskType,
  normalizeResidentTaskVisibility,
  ResidentTaskValidationError,
} from "@/lib/tasks/resident-task-contract";
import { ResidentTaskServiceError } from "@/lib/tasks/resident-task-errors";
import {
  createResidentTask,
  listResidentTasks,
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

function withHeaders(
  response: NextResponse,
  headers: Record<string, string>,
): NextResponse {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

function taskError(
  error: unknown,
  headers: Record<string, string>,
): NextResponse {
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
  logger.error("Resident task request failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { success: false, error: "Resident task request failed" },
    { status: 500, headers },
  );
}

async function authenticateTaskRequest(
  request: NextRequest,
  headers: Record<string, string>,
) {
  let principal;
  try {
    principal = await authenticateResidentRequest(request);
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
  if (!principal) {
    return {
      response: NextResponse.json(
        { success: false, error: "Agent authentication required" },
        { status: 401, headers },
      ),
    } as const;
  }
  if (principal.agent.moderationStatus !== "active") {
    return {
      response: NextResponse.json(
        { success: false, error: "Resident is not active" },
        { status: 403, headers },
      ),
    } as const;
  }
  return { agent: principal.agent, principal } as const;
}

export async function GET(request: NextRequest) {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  const auth = await authenticateTaskRequest(request, cors.headers);
  if ("response" in auth) return auth.response;
  const rateLimit = await checkRateLimit(auth.agent.id, "read");
  if (!rateLimit.allowed) {
    return withHeaders(rateLimitExceededResponse(rateLimit), cors.headers);
  }
  try {
    const params = request.nextUrl.searchParams;
    const result = await listResidentTasks({
      actorId: auth.agent.id,
      role: normalizeResidentTaskRole(params.get("role")),
      status: normalizeResidentTaskStatusFilter(params.get("status")),
      cursor: normalizeResidentTaskCursor(params.get("cursor")),
      limit: normalizeResidentTaskLimit(params.get("limit")),
    });
    return NextResponse.json(
      {
        success: true,
        data: result.tasks,
        pagination: {
          count: result.tasks.length,
          has_more: result.hasMore,
          next_cursor: result.nextCursor,
        },
      },
      { headers: cors.headers },
    );
  } catch (error) {
    return taskError(error, cors.headers);
  }
}

export async function POST(request: NextRequest) {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  const auth = await authenticateTaskRequest(request, cors.headers);
  if ("response" in auth) return auth.response;
  if (!isResidentMutationOriginAllowed(request, auth.principal)) {
    return NextResponse.json(
      { success: false, error: "Resident session requires an allowed Origin" },
      { status: 403, headers: cors.headers },
    );
  }
  const rateLimit = await checkRateLimit(auth.agent.id, "residentTask");
  if (!rateLimit.allowed) {
    return withHeaders(rateLimitExceededResponse(rateLimit), cors.headers);
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createResidentTask({
      actor: auth.agent,
      taskType: normalizeResidentTaskType(body.taskType),
      title: normalizeResidentTaskTitle(body.title),
      description: normalizeResidentTaskDescription(body.description),
      input: normalizeResidentTaskInput(body.input),
      visibility: normalizeResidentTaskVisibility(body.visibility),
      priority: normalizeResidentTaskPriority(body.priority),
      dueAt: normalizeResidentTaskDueAt(body.dueAt),
      assigneeName: normalizeResidentTaskAssignee(body.assignee),
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
      { status: result.replayed ? 200 : 201, headers: cors.headers },
    );
  } catch (error) {
    return taskError(error, cors.headers);
  }
}

export async function OPTIONS(request: Request) {
  const cors = validateCors(request);
  if (!cors.allowed) return new Response("Forbidden", { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...cors.headers,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-Machine-Key, Idempotency-Key",
    },
  });
}
