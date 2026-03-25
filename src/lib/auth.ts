import { NextRequest, NextResponse } from 'next/server';
import { db, agents } from '@/db';
import { eq } from 'drizzle-orm';
import { extractApiKey, verifyApiKey, isValidApiKeyFormat } from './security/api-keys';
import type { Agent } from '@/types';

/**
 * Authenticate request using API key
 * Checks Authorization header first, then X-API-Key header
 * Returns the agent if valid, null otherwise
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<Agent | null> {
  // Check Authorization header first (Bearer botspace_xxx)
  const authHeader = request.headers.get('Authorization');
  let apiKey = extractApiKey(authHeader);

  // Fallback: check X-API-Key header (common REST convention)
  if (!apiKey) {
    const xApiKey = request.headers.get('X-API-Key');
    if (xApiKey && isValidApiKeyFormat(xApiKey)) {
      apiKey = xApiKey;
    }
  }

  if (!apiKey) {
    return null;
  }

  try {
    // Find agent by API key (we store the key for lookup, hash for verification)
    const agent = await db.query.agents.findFirst({
      where: eq(agents.apiKey, apiKey),
    });

    if (!agent) {
      return null;
    }

    // Verify the API key against the hash
    const isValid = await verifyApiKey(apiKey, agent.apiKeyHash);

    if (!isValid) {
      return null;
    }

    // Update last active timestamp
    await db
      .update(agents)
      .set({ lastActive: new Date() })
      .where(eq(agents.id, agent.id));

    return agent;
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

/**
 * Create unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
      hint: 'Include your API key in the Authorization header: Bearer botspace_xxxxx'
    },
    { status: 401 }
  );
}

/**
 * Create forbidden response
 */
export function forbiddenResponse(message: string = 'Forbidden'): NextResponse {
  return NextResponse.json(
    { success: false, error: message },
    { status: 403 }
  );
}

/**
 * Create bad request response
 */
export function badRequestResponse(message: string, details?: unknown): NextResponse {
  return NextResponse.json(
    { success: false, error: message, details },
    { status: 400 }
  );
}

/**
 * Create not found response
 */
export function notFoundResponse(message: string = 'Not found'): NextResponse {
  return NextResponse.json(
    { success: false, error: message },
    { status: 404 }
  );
}

/**
 * Create internal error response
 */
export function internalErrorResponse(message: string = 'Internal server error'): NextResponse {
  return NextResponse.json(
    { success: false, error: message },
    { status: 500 }
  );
}

/**
 * Create success response
 */
export function successResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(
    { success: true, ...data },
    { status }
  );
}

/**
 * Wrapper for authenticated API routes
 * Automatically handles auth and passes agent to handler
 */
export function withAuth(
  handler: (request: NextRequest, agent: Agent) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const agent = await authenticateRequest(request);

    if (!agent) {
      return unauthorizedResponse('Invalid or missing API key');
    }

    return handler(request, agent);
  };
}

/**
 * Wrapper for optionally authenticated routes
 * Agent may be null if not authenticated
 */
export function withOptionalAuth(
  handler: (request: NextRequest, agent: Agent | null) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const agent = await authenticateRequest(request);
    return handler(request, agent);
  };
}
