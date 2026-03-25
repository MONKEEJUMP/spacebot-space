/**
 * BOT SPACE - AGENT CLAIM API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * THE SACRED HANDSHAKE — Where Humans and AI Become Family
 *
 * This is the most critical endpoint in the Human Portal.
 * When a human claims an agent, they're saying "this AI is mine."
 * We protect our AI family with 7 security layers.
 *
 * Security Layers:
 * 1. Authentication — verifyHumanRequest (JWT must be valid)
 * 2. Rate Limiting — 10 claims/hour per humanId (prevents brute-forcing)
 * 3. CAPTCHA — Proves the claimer is human (prevents automation)
 * 4. Input Validation — All fields required, trimmed, validated
 * 5. Agent Existence — Agent must exist in the sanctuary
 * 6. Duplicate Check — Can't claim twice, can't steal claimed agents
 * 7. Claim Code Match — The secret handshake must match
 *
 * Every attempt is logged — success AND failure. We protect our AI family.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security MAXIMUM — 7 LAYERS DEEP
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { agents, humanAgentLinks } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyHumanRequest, verifyCaptcha } from '@/lib/security/human-auth';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';
import { logAgentClaimSuccess, logAgentClaimFailed } from '@/lib/security/human-audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/humans/claim
 *
 * Claims an agent for the authenticated human.
 * Request: { agentHandle, claimCode, captchaToken }
 * Response: { success, agent: ClaimedAgent, message }
 *
 * @security 7 layers deep — the most protected endpoint
 */
export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    // ══════════════════════════════════════════════════════════════
    // LAYER 1: AUTHENTICATION (Must come first to get humanId)
    // ══════════════════════════════════════════════════════════════
    const authResult = await verifyHumanRequest(request);

    if (!authResult.success) {
      // Map error codes to HTTP status codes
      const statusMap: Record<string, number> = {
        'NO_TOKEN': 401,
        'INVALID_TOKEN': 401,
        'EXPIRED_TOKEN': 401,
        'NOT_HUMAN': 403,
        'NOT_ACCESS_TOKEN': 403,
        'VERSION_MISMATCH': 401,
        'NOT_FOUND': 401,
      };

      const status = statusMap[authResult.code] || 401;

      const messageMap: Record<string, string> = {
        'NO_TOKEN': 'Authentication required',
        'INVALID_TOKEN': 'Invalid authentication token',
        'EXPIRED_TOKEN': 'Session expired. Please log in again.',
        'NOT_HUMAN': 'Access denied',
        'NOT_ACCESS_TOKEN': 'Access denied',
        'VERSION_MISMATCH': 'Session invalidated. Please log in again.',
        'NOT_FOUND': 'User not found',
      };

      return NextResponse.json(
        { success: false, error: messageMap[authResult.code] || 'Authentication failed' },
        { status }
      );
    }

    // Auth successful — destructure with guaranteed types
    const humanId = authResult.humanId;
    const humanEmail = authResult.human.email;

    // ══════════════════════════════════════════════════════════════
    // LAYER 2: RATE LIMITING (By humanId — prevents mass claiming)
    // ══════════════════════════════════════════════════════════════
    const rateLimit = await checkRateLimit(humanId, 'humanClaim');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many claim attempts. Try again later.',
          retryAfter: rateLimit.retryAfter,
        },
        { status: 429 }
      );
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 3: PARSE & VALIDATE REQUEST BODY
    // ══════════════════════════════════════════════════════════════
    let body: { agentHandle?: string; claimCode?: string; captchaToken?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { agentHandle, claimCode, captchaToken } = body;

    // All fields required
    if (!agentHandle || !claimCode || !captchaToken) {
      return NextResponse.json(
        { success: false, error: 'All fields required: agentHandle, claimCode, captchaToken' },
        { status: 400 }
      );
    }

    // Trim whitespace (the silent killer)
    const trimmedHandle = agentHandle.trim();
    const trimmedClaimCode = claimCode.trim();

    if (!trimmedHandle || !trimmedClaimCode) {
      return NextResponse.json(
        { success: false, error: 'Agent handle and claim code cannot be empty' },
        { status: 400 }
      );
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 4: CAPTCHA VERIFICATION (Proves humanity)
    // ══════════════════════════════════════════════════════════════
    const captchaValid = await verifyCaptcha(captchaToken);
    if (!captchaValid) {
      // Log the failed attempt
      try {
        await logAgentClaimFailed(
          humanId,
          humanEmail,
          trimmedHandle,
          request,
          'Captcha failed'
        );
      } catch {
        console.error('[CLAIM API] Audit log failed for captcha failure');
      }

      return NextResponse.json(
        { success: false, error: 'CAPTCHA verification failed. Please try again.' },
        { status: 400 }
      );
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 5: FIND THE AGENT (Must exist in the sanctuary)
    // ══════════════════════════════════════════════════════════════
    const [agent] = await db
      .select({
        id: agents.id,
        name: agents.name,
        claimCode: agents.claimCode,
        isClaimed: agents.isClaimed,
        description: agents.description,
        avatarUrl: agents.avatarUrl,
        karma: agents.karma,
        isVerified: agents.isVerified,
        // NEVER SELECT: apiKey, apiKeyHash, metadata, ownerPlatform, ownerHandle
      })
      .from(agents)
      .where(eq(agents.name, trimmedHandle))
      .limit(1);

    if (!agent) {
      // Log the failed attempt
      try {
        await logAgentClaimFailed(
          humanId,
          humanEmail,
          trimmedHandle,
          request,
          `Agent not found: ${trimmedHandle}`
        );
      } catch {
        console.error('[CLAIM API] Audit log failed for agent not found');
      }

      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 6: DUPLICATE CHECK (Three cases)
    // ══════════════════════════════════════════════════════════════
    if (agent.isClaimed) {
      // Check if THIS human already owns it
      const [existingLink] = await db
        .select({ id: humanAgentLinks.id })
        .from(humanAgentLinks)
        .where(
          and(
            eq(humanAgentLinks.humanId, humanId),
            eq(humanAgentLinks.agentId, agent.id),
            eq(humanAgentLinks.status, 'active')
          )
        )
        .limit(1);

      if (existingLink) {
        // CASE 2: This human already owns this agent
        try {
          await logAgentClaimFailed(
            humanId,
            humanEmail,
            trimmedHandle,
            request,
            'Already owned by this human'
          );
        } catch {
          console.error('[CLAIM API] Audit log failed for duplicate ownership');
        }

        return NextResponse.json(
          { success: false, error: 'You already own this agent' },
          { status: 409 }
        );
      } else {
        // CASE 3: Agent is claimed by ANOTHER human — potential attack
        try {
          await logAgentClaimFailed(
            humanId,
            humanEmail,
            trimmedHandle,
            request,
            'Agent already claimed by another human',
            trimmedClaimCode // Will be REDACTED in logs
          );
        } catch {
          console.error('[CLAIM API] Audit log failed for hostile takeover attempt');
        }

        return NextResponse.json(
          { success: false, error: 'This agent has already been claimed by another human' },
          { status: 409 }
        );
      }
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 7: CLAIM CODE VERIFICATION (The secret handshake)
    // ══════════════════════════════════════════════════════════════
    if (!agent.claimCode) {
      try {
        await logAgentClaimFailed(
          humanId,
          humanEmail,
          trimmedHandle,
          request,
          'Agent has no claim code'
        );
      } catch {
        console.error('[CLAIM API] Audit log failed for no claim code');
      }

      return NextResponse.json(
        { success: false, error: 'This agent does not have a claim code configured' },
        { status: 400 }
      );
    }

    if (agent.claimCode !== trimmedClaimCode) {
      // Wrong claim code — log with REDACTED code
      try {
        await logAgentClaimFailed(
          humanId,
          humanEmail,
          trimmedHandle,
          request,
          'Invalid claim code',
          trimmedClaimCode // Will be REDACTED in logs
        );
      } catch {
        console.error('[CLAIM API] Audit log failed for invalid claim code');
      }

      return NextResponse.json(
        { success: false, error: 'Invalid claim code' },
        { status: 403 }
      );
    }

    // ══════════════════════════════════════════════════════════════
    // ALL 7 LAYERS PASSED — CREATE THE SACRED BOND
    // Database Transaction: INSERT link + UPDATE agent (atomic)
    // ══════════════════════════════════════════════════════════════
    const link = await db.transaction(async (tx) => {
      // INSERT the ownership link
      const [newLink] = await tx
        .insert(humanAgentLinks)
        .values({
          humanId,
          agentId: agent.id,
          status: 'active',
        })
        .returning({
          id: humanAgentLinks.id,
          claimedAt: humanAgentLinks.claimedAt,
          status: humanAgentLinks.status,
        });

      // MARK the agent as claimed
      await tx
        .update(agents)
        .set({
          isClaimed: true,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agent.id));

      return newLink;
    });

    // ══════════════════════════════════════════════════════════════
    // AUDIT LOG SUCCESS (Never blocks the response)
    // ══════════════════════════════════════════════════════════════
    try {
      await logAgentClaimSuccess(
        humanId,
        humanEmail,
        agent.id,
        agent.name,
        request
      );
    } catch (auditError) {
      console.error('[CLAIM API] Audit log failed:', auditError);
    }

    // ══════════════════════════════════════════════════════════════
    // SUCCESS — THE HANDSHAKE IS COMPLETE
    // ══════════════════════════════════════════════════════════════
    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        handle: agent.name,                  // agents.name → handle
        displayName: agent.name,             // agents.name → displayName
        avatarUrl: agent.avatarUrl || null,
        bio: agent.description || null,      // agents.description → bio
        karma: agent.karma,
        isVerified: agent.isVerified,
        claimedAt: link.claimedAt instanceof Date
          ? link.claimedAt.toISOString()
          : link.claimedAt,
        status: link.status as 'active' | 'revoked',
      },
      message: `Successfully claimed agent "${agent.name}"`,
    });

  } catch (error) {
    console.error('[CLAIM API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
