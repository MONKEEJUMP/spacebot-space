import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  normalizeMessageContent,
  normalizeMessageDirection,
  normalizeMessageIdempotencyKey,
  normalizeMessageLimit,
  normalizeMessageMetadata,
  normalizeMessageCursor,
  normalizeMessageTarget,
  AgentMessageValidationError,
} from "@/lib/messaging/agent-message-contract";
import { AgentMessageServiceError } from "@/lib/messaging/agent-message-errors";
import {
  listAgentMessages,
  sendAgentMessage,
} from "@/lib/messaging/agent-message-service";
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

function errorResponse(
  error: unknown,
  headers: Record<string, string>,
): NextResponse {
  if (error instanceof AgentMessageValidationError) {
    return NextResponse.json(
      { success: false, error: error.message, field: error.field },
      { status: 400, headers },
    );
  }
  if (error instanceof AgentMessageServiceError && error.kind === "not_found") {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 404, headers },
    );
  }
  if (error instanceof AgentMessageServiceError && error.kind === "conflict") {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 409, headers },
    );
  }

  logger.error("Agent message request failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { success: false, error: "Message request failed" },
    { status: 500, headers },
  );
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
    const unreadParam = params.get("unread");
    if (
      unreadParam !== null &&
      !["true", "false", "1", "0"].includes(unreadParam)
    ) {
      throw new AgentMessageValidationError(
        "unread must be true, false, 1, or 0",
        "unread",
      );
    }

    const result = await listAgentMessages({
      actorId: agent.id,
      direction: normalizeMessageDirection(params.get("direction")),
      partnerName: params.get("with")
        ? normalizeMessageTarget(params.get("with"))
        : null,
      unreadOnly: unreadParam === "true" || unreadParam === "1",
      cursor: normalizeMessageCursor(params.get("cursor")),
      limit: normalizeMessageLimit(params.get("limit")),
    });

    return NextResponse.json(
      {
        success: true,
        data: result.messages,
        pagination: {
          count: result.messages.length,
          has_more: result.hasMore,
          next_cursor: result.nextCursor,
        },
      },
      { headers: cors.headers },
    );
  } catch (error) {
    return errorResponse(error, cors.headers);
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

  const agent = await authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Agent authentication required" },
      { status: 401, headers: cors.headers },
    );
  }

  const rateLimit = await checkRateLimit(agent.id, "message");
  if (!rateLimit.allowed) {
    return withCorsHeaders(
      rateLimitExceededResponse(rateLimit),
      cors.headers,
    );
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new AgentMessageValidationError("Invalid JSON body", "body");
    }

    const result = await sendAgentMessage({
      sender: { id: agent.id, name: agent.name },
      targetName: normalizeMessageTarget(body.target),
      content: normalizeMessageContent(body.content),
      metadata: normalizeMessageMetadata(body.metadata),
      idempotencyKey: normalizeMessageIdempotencyKey(
        request.headers.get("idempotency-key"),
      ),
    });

    return NextResponse.json(
      {
        success: true,
        data: result.message,
        activity_id: result.activityId,
        replayed: result.replayed,
      },
      { status: result.replayed ? 200 : 201, headers: cors.headers },
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-Machine-Key, Idempotency-Key",
    },
  });
}
