import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { AgentMessageServiceError } from "@/lib/messaging/agent-message-errors";
import { acknowledgeAgentMessage } from "@/lib/messaging/agent-message-service";
import { validateCors } from "@/lib/security/cors";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const agent = await authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Agent authentication required" },
      { status: 401, headers: cors.headers },
    );
  }

  const rateLimit = await checkRateLimit(agent.id, "read");
  if (!rateLimit.allowed) {
    const response = rateLimitExceededResponse(rateLimit);
    for (const [name, value] of Object.entries(cors.headers)) {
      response.headers.set(name, value);
    }
    return response;
  }

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid message id" },
      { status: 400, headers: cors.headers },
    );
  }

  try {
    const message = await acknowledgeAgentMessage({
      actorId: agent.id,
      messageId: id,
    });
    return NextResponse.json(
      { success: true, data: message },
      { headers: cors.headers },
    );
  } catch (error) {
    if (
      error instanceof AgentMessageServiceError &&
      error.kind === "not_found"
    ) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404, headers: cors.headers },
      );
    }
    logger.error("Agent message acknowledgement failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Message acknowledgement failed" },
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
      "Access-Control-Allow-Methods": "PATCH, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-Machine-Key",
    },
  });
}
