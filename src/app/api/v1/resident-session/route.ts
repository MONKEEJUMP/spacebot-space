import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { extractAgentCredentialInput } from "@/lib/security/agent-credential-input";
import { validateCors } from "@/lib/security/cors";
import {
  createResidentBrowserSession,
  getResidentSessionCookieName,
  getResidentSessionCookieOptions,
  getResidentSessionToken,
  authenticateResidentRequest,
  isResidentBrowserOriginAllowed,
  revokeResidentBrowserSession,
} from "@/lib/security/resident-session";
import { ResidentIdentityControllerError } from "@/lib/residency/resident-identity-controller";
import {
  checkRateLimit,
  getClientIP,
  rateLimitDeniedResponse,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function residentView(agent: {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  residentVisibility: string;
  moderationStatus: string;
}) {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    avatarUrl: agent.avatarUrl,
    residentVisibility: agent.residentVisibility,
    moderationStatus: agent.moderationStatus,
  };
}

function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...headers, "Cache-Control": "no-store" },
  });
}

function controllerErrorResponse(
  error: unknown,
  headers: Record<string, string>,
): NextResponse {
  if (error instanceof ResidentIdentityControllerError) {
    if (error.status === 401) {
      return json(
        { success: false, error: "Resident credential was not accepted." },
        401,
        headers,
      );
    }
    if (error.status === 409) {
      return json(
        {
          success: false,
          error:
            error.code === "session_limit"
              ? "This resident already has the maximum number of active sessions."
              : "The resident session changed. Refresh and try again.",
          code: error.code,
        },
        409,
        headers,
      );
    }
    if (error.status === 400) {
      return json(
        { success: false, error: "Resident session request was invalid." },
        400,
        headers,
      );
    }
  }
  return json(
    { success: false, error: "Resident session is temporarily unavailable." },
    503,
    headers,
  );
}

function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(getResidentSessionCookieName(), "", {
    ...getResidentSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return json({ success: false, error: "Forbidden" }, 403, {});
  }
  let principal;
  try {
    principal = await authenticateResidentRequest(request);
  } catch (error) {
    logger.error("Resident session status failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return json(
      { success: false, error: "Resident session is temporarily unavailable." },
      503,
      cors.headers,
    );
  }
  if (!principal) {
    return clearSessionCookie(
      json({ success: false, authenticated: false }, 401, cors.headers),
    );
  }
  return json(
    {
      success: true,
      authenticated: true,
      resident: residentView(principal.agent),
      source: principal.source,
      expiresAt: principal.expiresAt,
      activeSessionCount: principal.activeSessionCount,
      accessMode: principal.accessMode,
    },
    200,
    cors.headers,
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return json({ success: false, error: "Forbidden" }, 403, {});
  }
  if (!isResidentBrowserOriginAllowed(request)) {
    return json({ success: false, error: "Forbidden" }, 403, cors.headers);
  }
  const rateLimit = await checkRateLimit(
    `resident-session:${getClientIP(request)}`,
    "residentSession",
  );
  if (!rateLimit.allowed) {
    return rateLimitDeniedResponse(rateLimit, () =>
      json(
        {
          success: false,
          error: "Too many resident handshake attempts. Try again later.",
          retryAfter: rateLimit.retryAfter,
        },
        429,
        cors.headers,
      ),
    );
  }

  try {
    const credentialInput = extractAgentCredentialInput(request.headers);
    if (credentialInput.status !== "valid") {
      return json(
        { success: false, error: "Resident credential was not accepted." },
        401,
        cors.headers,
      );
    }
    const session = await createResidentBrowserSession({
      credential: credentialInput.credential,
      priorSessionToken: getResidentSessionToken(request),
      idempotencyKey: IDEMPOTENCY_KEY_PATTERN.test(
        request.headers.get("x-idempotency-key") ?? "",
      )
        ? (request.headers.get("x-idempotency-key") as string)
        : undefined,
    });
    const response = json(
      {
        success: true,
        authenticated: true,
        resident: residentView(session.result.resident),
        source: "session",
        expiresAt: session.result.expiresAt,
        activeSessionCount: session.result.activeSessionCount,
        accessMode: session.result.accessMode,
      },
      201,
      cors.headers,
    );
    response.cookies.set(
      getResidentSessionCookieName(),
      session.token,
      getResidentSessionCookieOptions(),
    );
    return response;
  } catch (error) {
    logger.error("Resident session handshake failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return controllerErrorResponse(error, cors.headers);
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const cors = validateCors(request);
  if (!cors.allowed || !isResidentBrowserOriginAllowed(request)) {
    return json({ success: false, error: "Forbidden" }, 403, {});
  }
  try {
    const scope =
      request.nextUrl.searchParams.get("scope") === "all" ? "all" : "current";
    const result = await revokeResidentBrowserSession(request, scope);
    const response = json(
      { success: true, authenticated: false, ...result },
      200,
      cors.headers,
    );
    return result.terminal ? clearSessionCookie(response) : response;
  } catch (error) {
    logger.error("Resident session logout failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return controllerErrorResponse(error, cors.headers);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = validateCors(request);
  if (!cors.allowed) return new Response("Forbidden", { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...cors.headers,
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, X-API-Key, X-Machine-Key, X-Idempotency-Key",
    },
  });
}
