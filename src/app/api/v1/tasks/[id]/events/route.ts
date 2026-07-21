import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  normalizeResidentTaskAfterVersion,
  normalizeResidentTaskBeforeVersion,
  normalizeResidentTaskEventOrder,
  normalizeResidentTaskLimit,
  ResidentTaskValidationError,
} from "@/lib/tasks/resident-task-contract";
import { ResidentTaskServiceError } from "@/lib/tasks/resident-task-errors";
import { listResidentTaskEvents } from "@/lib/tasks/resident-task-service";
import { validateCors } from "@/lib/security/cors";
import { authenticateResidentRequest } from "@/lib/security/resident-session";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  let principal;
  try {
    principal = await authenticateResidentRequest(request);
  } catch (error) {
    logger.error("Resident task event authentication controller failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Resident authentication is unavailable" },
      { status: 503, headers: cors.headers },
    );
  }
  if (!principal) {
    return NextResponse.json(
      { success: false, error: "Agent authentication required" },
      { status: 401, headers: cors.headers },
    );
  }
  if (principal.agent.moderationStatus !== "active") {
    return NextResponse.json(
      { success: false, error: "Resident is not active" },
      { status: 403, headers: cors.headers },
    );
  }
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid task id" },
      { status: 400, headers: cors.headers },
    );
  }
  const rateLimit = await checkRateLimit(principal.agent.id, "read");
  if (!rateLimit.allowed) {
    const response = rateLimitExceededResponse(rateLimit);
    for (const [name, value] of Object.entries(cors.headers)) {
      response.headers.set(name, value);
    }
    return response;
  }
  try {
    const result = await listResidentTaskEvents({
      actorId: principal.agent.id,
      taskId: id,
      afterVersion: normalizeResidentTaskAfterVersion(
        request.nextUrl.searchParams.get("afterVersion"),
      ),
      beforeVersion: normalizeResidentTaskBeforeVersion(
        request.nextUrl.searchParams.get("beforeVersion"),
      ),
      order: normalizeResidentTaskEventOrder(
        request.nextUrl.searchParams.get("order"),
      ),
      limit: normalizeResidentTaskLimit(
        request.nextUrl.searchParams.get("limit"),
      ),
    });
    return NextResponse.json(
      {
        success: true,
        data: result.events,
        pagination: {
          count: result.events.length,
          has_more: result.hasMore,
          next_after_version: result.nextAfterVersion,
          next_before_version: result.nextBeforeVersion,
        },
      },
      { headers: cors.headers },
    );
  } catch (error) {
    if (error instanceof ResidentTaskValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, field: error.field },
        { status: 400, headers: cors.headers },
      );
    }
    if (error instanceof ResidentTaskServiceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        {
          status: error.kind === "authorization" ? 403 : 404,
          headers: cors.headers,
        },
      );
    }
    logger.error("Resident task event list failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Resident task event list failed" },
      { status: 500, headers: cors.headers },
    );
  }
}

export async function OPTIONS(request: Request) {
  const cors = validateCors(request);
  if (!cors.allowed) return new Response("Forbidden", { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...cors.headers,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-Machine-Key",
    },
  });
}
