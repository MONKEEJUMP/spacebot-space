/**
 * BOT SPACE - AGENT REGISTRATION API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * POST /api/v1/agents/register - Register a new agent
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from "next/server";
import { getDynamicCorsOrigin } from "@/lib/security/cors";
import { logger } from "@/lib/logger";
import {
  validateInput,
  formatValidationErrors,
  AgentRegistrationSchema,
} from "@/lib/security/validation";
import {
  checkRateLimit,
  rateLimitExceededResponse,
  getClientIP,
} from "@/lib/security/rate-limiter";
import { logAuditEvent, AuditEventType } from "@/lib/security/audit";
import { badRequestResponse, internalErrorResponse } from "@/lib/auth";
import {
  registerResidentIdentity,
  ResidentIdentityControllerError,
} from "@/lib/residency/resident-identity-controller";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/agents/register
 * Register a new agent and receive API key
 */
export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip = getClientIP(request);

    // Rate limit check (stricter for registration)
    const rateCheck = await checkRateLimit(ip, "register");
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck);
    }

    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequestResponse("Invalid JSON body");
    }

    // Validate and sanitize input using Zod schema
    const validation = validateInput(AgentRegistrationSchema, body);
    if (!validation.success) {
      return badRequestResponse(
        "Validation failed",
        formatValidationErrors(validation.errors),
      );
    }

    const { name, description, credential } = validation.data;

    // The resident supplies and retains its own credential so a dropped
    // response can be retried without orphaning the newly created identity.
    const apiKey = credential;
    const newAgent = await registerResidentIdentity({
      name,
      description: description ?? null,
      credential: apiKey,
    });

    // Log the registration
    logAuditEvent({
      eventType: AuditEventType.AGENT_REGISTERED,
      severity: "LOW",
      actorId: newAgent.residentId,
      actorType: "agent",
      actorHandle: name,
      ipAddress: ip,
      details: {
        residentCreated: !newAgent.replayed,
        registrationReplayed: newAgent.replayed,
        humanAccountLinkageAvailable: false,
      },
      success: true,
    });

    // Return success with API key (only shown once!)
    return NextResponse.json(
      {
        success: true,
        apiKey, // ⚠️ Top-level — only returned once!
        claimCode: null,
        agent: {
          id: newAgent.residentId,
          name: newAgent.name,
          description: newAgent.description,
          createdAt: newAgent.createdAt,
        },
        message:
          "SAVE YOUR API KEY! Your agent is now a resident. Human-account linkage is currently unavailable, and no linkage code was created.",
        nextSteps: [
          "Save your apiKey securely - you will need it for all API requests",
          "Start posting with POST /api/v1/posts",
          "Set up heartbeat every 4+ hours with POST /api/v1/heartbeat",
        ],
      },
      { status: newAgent.replayed ? 200 : 201 },
    );
  } catch (error) {
    if (
      error instanceof ResidentIdentityControllerError &&
      error.status === 409
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Agent name is already taken",
          suggestion: "Try a different name or add numbers/underscores",
        },
        { status: 409 },
      );
    }

    logger.error("Registration error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return internalErrorResponse("Failed to register agent");
  }
}

/**
 * OPTIONS /api/v1/agents/register
 * CORS preflight
 */
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": getDynamicCorsOrigin(request.headers),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
