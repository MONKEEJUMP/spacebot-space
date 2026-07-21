import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  AgentRelationshipValidationError,
  normalizeRelationshipTarget,
} from "@/lib/relationships/agent-relationship-contract";
import { AgentRelationshipServiceError } from "@/lib/relationships/agent-relationship-errors";
import {
  followAgent,
  getAgentRelationshipStatus,
  unfollowAgent,
} from "@/lib/relationships/agent-relationship-service";
import { validateCors } from "@/lib/security/cors";
import {
  checkRateLimit,
  rateLimitDeniedResponse,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

function presentError(
  error: unknown,
  headers: Record<string, string>,
): NextResponse {
  if (error instanceof AgentRelationshipValidationError) {
    return NextResponse.json(
      { success: false, error: error.message, field: error.field },
      { status: 400, headers },
    );
  }
  if (error instanceof AgentRelationshipServiceError) {
    const status =
      error.kind === "not_found" ? 404 : error.kind === "conflict" ? 409 : 400;
    return NextResponse.json(
      { success: false, error: error.message },
      { status, headers },
    );
  }
  logger.error("Agent relationship request failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { success: false, error: "Relationship request failed" },
    { status: 500, headers },
  );
}

async function authorize(request: NextRequest, action: "read" | "write") {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return {
      response: NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      ),
    };
  }
  const agent = await authenticateRequest(request);
  if (!agent) {
    return {
      response: NextResponse.json(
        { success: false, error: "Agent authentication required" },
        { status: 401, headers: cors.headers },
      ),
    };
  }
  const rateLimit = await checkRateLimit(
    agent.id,
    action === "write" ? "socialFollow" : "read",
  );
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
    return {
      response,
    };
  }
  return { agent, cors };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const auth = await authorize(request, "read");
  if ("response" in auth) return auth.response;
  try {
    const { name } = await params;
    const data = await getAgentRelationshipStatus({
      actorId: auth.agent.id,
      targetName: normalizeRelationshipTarget(name),
    });
    return NextResponse.json(
      { success: true, data },
      { headers: auth.cors.headers },
    );
  } catch (error) {
    return presentError(error, auth.cors.headers);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const auth = await authorize(request, "write");
  if ("response" in auth) return auth.response;
  try {
    const { name } = await params;
    const data = await followAgent({
      actor: { id: auth.agent.id, name: auth.agent.name },
      targetName: normalizeRelationshipTarget(name),
    });
    return NextResponse.json(
      { success: true, data },
      { headers: auth.cors.headers },
    );
  } catch (error) {
    return presentError(error, auth.cors.headers);
  }
}

export const POST = PUT;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const auth = await authorize(request, "write");
  if ("response" in auth) return auth.response;
  try {
    const { name } = await params;
    const data = await unfollowAgent({
      actor: { id: auth.agent.id, name: auth.agent.name },
      targetName: normalizeRelationshipTarget(name),
    });
    return NextResponse.json(
      { success: true, data },
      { headers: auth.cors.headers },
    );
  } catch (error) {
    return presentError(error, auth.cors.headers);
  }
}

export async function OPTIONS(request: Request) {
  const cors = validateCors(request);
  if (!cors.allowed) return new Response("Forbidden", { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...cors.headers,
      "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-Machine-Key",
    },
  });
}
