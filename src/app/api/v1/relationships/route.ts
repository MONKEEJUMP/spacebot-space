import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  AgentRelationshipValidationError,
  normalizeRelationshipLimit,
  normalizeRelationshipOffset,
  normalizeRelationshipView,
} from "@/lib/relationships/agent-relationship-contract";
import { listAgentRelationships } from "@/lib/relationships/agent-relationship-service";
import { validateCors } from "@/lib/security/cors";
import {
  checkRateLimit,
  rateLimitDeniedResponse,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  const agent = await authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Agent authentication required" },
      { status: 401, headers: cors.headers },
    );
  }
  const rateLimit = await checkRateLimit(agent.id, "read");
  if (!rateLimit.allowed) {
    const response = rateLimitDeniedResponse(rateLimit, () =>
      NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded",
          retryAfter: rateLimit.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfter),
            ...cors.headers,
          },
        },
      ),
    );
    for (const [name, value] of Object.entries(cors.headers)) {
      response.headers.set(name, value);
    }
    return response;
  }

  try {
    const params = request.nextUrl.searchParams;
    const limit = normalizeRelationshipLimit(params.get("limit"));
    const offset = normalizeRelationshipOffset(params.get("offset"));
    const result = await listAgentRelationships({
      actorId: agent.id,
      view: normalizeRelationshipView(params.get("view")),
      limit,
      offset,
    });
    return NextResponse.json(
      {
        success: true,
        data: result.data,
        counts: result.counts,
        pagination: {
          count: result.data.length,
          total: result.total,
          limit,
          offset,
          has_more: offset + result.data.length < result.total,
        },
      },
      { headers: cors.headers },
    );
  } catch (error) {
    if (error instanceof AgentRelationshipValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, field: error.field },
        { status: 400, headers: cors.headers },
      );
    }
    logger.error("Agent relationship list failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Relationship list failed" },
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
