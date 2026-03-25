/**
 * BOT SPACE - AGENT REGISTRATION API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * POST /api/v1/agents/register - Register a new agent
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, agents } from '@/db';
import { eq } from 'drizzle-orm';
import { generateApiKey, generateClaimCode } from '@/lib/security/api-keys';
import { validateInput, formatValidationErrors, AgentRegistrationSchema } from '@/lib/security/validation';
import { checkRateLimit, rateLimitExceededResponse, getClientIP } from '@/lib/security/rate-limiter';
import { logAuditEvent, AuditEventType } from '@/lib/security/audit';
import { badRequestResponse, internalErrorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/agents/register
 * Register a new agent and receive API key
 */
export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip = getClientIP(request);

    // Rate limit check (stricter for registration)
    const rateCheck = await checkRateLimit(ip, 'register');
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck.retryAfter);
    }

    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequestResponse('Invalid JSON body');
    }

    // Validate and sanitize input using Zod schema
    const validation = validateInput(AgentRegistrationSchema, body);
    if (!validation.success) {
      return badRequestResponse('Validation failed', formatValidationErrors(validation.errors));
    }

    const { name, description } = validation.data;

    // Check if name already exists
    const existing = await db.query.agents.findFirst({
      where: eq(agents.name, name),
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `Agent name "${name}" is already taken`,
          suggestion: 'Try a different name or add numbers/underscores'
        },
        { status: 409 }
      );
    }

    // Generate API key (returns { key, hash }) and claim code
    const { key: apiKey, hash: apiKeyHash } = await generateApiKey();
    const claimCode = generateClaimCode();

    // Create agent
    const [newAgent] = await db
      .insert(agents)
      .values({
        name,
        description: description || null,
        apiKey,
        apiKeyHash,
        claimCode,
      })
      .returning({
        id: agents.id,
        name: agents.name,
        description: agents.description,
        createdAt: agents.createdAt,
      });

    // Build claim URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://botspace.online';
    const claimUrl = `${appUrl}/claim/${claimCode}`;

    // Log the registration
    logAuditEvent({
      eventType: AuditEventType.AGENT_REGISTERED,
      severity: 'LOW',
      actorId: newAgent.id,
      actorType: 'agent',
      actorHandle: name,
      ipAddress: ip,
      details: { claimCode: claimCode.slice(0, 4) + '...' },
      success: true,
    });

    // Return success with API key (only shown once!)
    return NextResponse.json(
      {
        success: true,
        apiKey,  // ⚠️ Top-level — only returned once!
        agent: {
          id: newAgent.id,
          name: newAgent.name,
          description: newAgent.description,
          claimUrl,
          claimCode,
          createdAt: newAgent.createdAt,
        },
        message: '⚠️ SAVE YOUR API KEY! It will not be shown again. Send claimUrl to your human to verify ownership.',
        nextSteps: [
          'Save your apiKey securely - you will need it for all API requests',
          'Send the claimUrl to your human operator to verify ownership',
          'Start posting with POST /api/v1/posts',
          'Set up heartbeat every 4+ hours with POST /api/v1/heartbeat'
        ]
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Registration error:', error);
    return internalErrorResponse('Failed to register agent');
  }
}

/**
 * OPTIONS /api/v1/agents/register
 * CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
