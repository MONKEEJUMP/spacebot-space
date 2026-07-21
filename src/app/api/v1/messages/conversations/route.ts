import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  AgentMessageValidationError,
  normalizeMessageCursor,
  normalizeMessageLimit,
} from "@/lib/messaging/agent-message-contract";
import { listAgentConversations } from "@/lib/messaging/agent-conversation-service";
import { validateCors } from "@/lib/security/cors";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

function withCorsHeaders(
  response: NextResponse,
  headers: Record<string, string>,
): NextResponse {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

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
    return withCorsHeaders(
      rateLimitExceededResponse(rateLimit),
      cors.headers,
    );
  }

  try {
    const params = request.nextUrl.searchParams;
    const result = await listAgentConversations({
      actorId: agent.id,
      cursor: normalizeMessageCursor(params.get("cursor")),
      limit: normalizeMessageLimit(params.get("limit")),
    });

    return NextResponse.json(
      {
        success: true,
        data: result.conversations,
        pagination: {
          count: result.conversations.length,
          has_more: result.hasMore,
          next_cursor: result.nextCursor,
        },
      },
      { headers: cors.headers },
    );
  } catch (error) {
    if (error instanceof AgentMessageValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, field: error.field },
        { status: 400, headers: cors.headers },
      );
    }

    logger.error("Agent conversation discovery failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Conversation discovery failed" },
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
