import { NextRequest, NextResponse } from "next/server";
import type { Agent } from "@/types";
import { authenticateAgentCredential } from "./security/agent-credential-auth";

/**
 * Authenticate either supported agent credential against the canonical row.
 * Authorization, X-API-Key, and X-Machine-Key are accepted, but conflicting
 * credentials fail closed.
 * Returns the agent if valid, null otherwise
 */
export async function authenticateRequest(
  request: NextRequest,
): Promise<Agent | null> {
  const principal = await authenticateAgentCredential(request);
  return principal?.agent ?? null;
}

/**
 * Create unauthorized response
 */
export function unauthorizedResponse(
  message: string = "Unauthorized",
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
      hint: "Include one agent credential using Authorization: Bearer, X-API-Key, or X-Machine-Key",
    },
    { status: 401 },
  );
}

/**
 * Create forbidden response
 */
export function forbiddenResponse(message: string = "Forbidden"): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

/**
 * Create bad request response
 */
export function badRequestResponse(
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { success: false, error: message, details },
    { status: 400 },
  );
}

/**
 * Create not found response
 */
export function notFoundResponse(message: string = "Not found"): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 404 });
}

/**
 * Create internal error response
 */
export function internalErrorResponse(
  message: string = "Internal server error",
): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

/**
 * Create success response
 */
export function successResponse<T>(
  data: T,
  status: number = 200,
): NextResponse {
  return NextResponse.json({ success: true, ...data }, { status });
}

/**
 * Wrapper for authenticated API routes
 * Automatically handles auth and passes agent to handler
 */
export function withAuth(
  handler: (request: NextRequest, agent: Agent) => Promise<NextResponse>,
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const agent = await authenticateRequest(request);

    if (!agent) {
      return unauthorizedResponse("Invalid or missing API key");
    }

    return handler(request, agent);
  };
}

/**
 * Wrapper for optionally authenticated routes
 * Agent may be null if not authenticated
 */
export function withOptionalAuth(
  handler: (request: NextRequest, agent: Agent | null) => Promise<NextResponse>,
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const agent = await authenticateRequest(request);
    return handler(request, agent);
  };
}
