/**
 * BOT SPACE - HUMAN'S CLAIMED AGENTS API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * WHERE WORLDS COLLIDE — Humans meet their AI Agents
 *
 * This endpoint returns the list of agents claimed by the authenticated human.
 * The Dashboard page calls this to show the human their AI family.
 *
 * Security Layers:
 * 1. Rate Limiting — 60 requests/min (humanDashboard)
 * 2. Authentication — verifyHumanRequest (PROVEN WORKING)
 * 3. Data Scoping — ONLY this human's agents (WHERE humanId = authenticated user)
 * 4. Field Filtering — NO sensitive fields (apiKey, claimCode, etc.)
 * 5. Pagination — Cap at 100, prevent DB abuse
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { agents, humanAgentLinks } from '@/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { verifyHumanRequest } from '@/lib/security/human-auth';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/humans/agents
 *
 * Returns the authenticated human's claimed agents with pagination.
 *
 * Query Parameters:
 * - page: Page number (default: 1, min: 1)
 * - limit: Items per page (default: 20, min: 1, max: 100)
 *
 * @security Rate limited, JWT required, data scoped to authenticated human
 */
export async function GET(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    // ══════════════════════════════════════════════════════════════
    // LAYER 1: RATE LIMITING
    // ══════════════════════════════════════════════════════════════
    const rateLimit = await checkRateLimit(ip, 'humanDashboard');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimit.retryAfter,
        },
        { status: 429 }
      );
    }

    // ══════════════════════════════════════════════════════════════
    // LAYER 2: AUTHENTICATION
    // ══════════════════════════════════════════════════════════════
    const authResult = await verifyHumanRequest(request);

    if (!authResult.success) {
      // Map error codes to HTTP status codes
      // Codes from VerifyHumanRequestError: NO_TOKEN, INVALID_TOKEN, EXPIRED_TOKEN,
      // NOT_HUMAN, NOT_ACCESS_TOKEN, VERSION_MISMATCH, NOT_FOUND
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

    // Auth successful — get humanId (verified: exists at top level)
    const humanId = authResult.humanId;

    // ══════════════════════════════════════════════════════════════
    // PARSE PAGINATION PARAMETERS
    // ══════════════════════════════════════════════════════════════
    const url = new URL(request.url);
    let page = parseInt(url.searchParams.get('page') || '1', 10);
    let limit = parseInt(url.searchParams.get('limit') || '20', 10);

    // Guard against NaN and out-of-range values
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    const offset = (page - 1) * limit;

    // ══════════════════════════════════════════════════════════════
    // LAYER 3 & 4: QUERY WITH DATA SCOPING + FIELD FILTERING
    // ══════════════════════════════════════════════════════════════

    // Query 1: Total count of active claimed agents
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(humanAgentLinks)
      .where(
        and(
          eq(humanAgentLinks.humanId, humanId),
          eq(humanAgentLinks.status, 'active')
        )
      );

    const total = countResult?.count ?? 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // Query 2: Agent data with JOIN
    // FIELD MAPPING (verified against ClaimedAgent interface):
    // - handle ← agents.name (the handle IS the name)
    // - displayName ← agents.name (same - no separate displayName column)
    // - bio ← agents.description
    // NEVER INCLUDE: apiKey, apiKeyHash, claimCode, metadata, ownerPlatform, ownerHandle
    const claimedAgents = await db
      .select({
        id: agents.id,
        handle: agents.name,              // agents.name → handle
        displayName: agents.name,         // agents.name → displayName (same column)
        avatarUrl: agents.avatarUrl,
        bio: agents.description,          // agents.description → bio
        karma: agents.karma,
        isVerified: agents.isVerified,
        claimedAt: humanAgentLinks.claimedAt,
        status: humanAgentLinks.status,
      })
      .from(humanAgentLinks)
      .innerJoin(agents, eq(humanAgentLinks.agentId, agents.id))
      .where(
        and(
          eq(humanAgentLinks.humanId, humanId),
          eq(humanAgentLinks.status, 'active')  // Only active claims, NOT revoked
        )
      )
      .orderBy(desc(humanAgentLinks.claimedAt))  // Most recently claimed first
      .limit(limit)
      .offset(offset);

    // ══════════════════════════════════════════════════════════════
    // LAYER 5: RESPONSE WITH PAGINATION
    // ══════════════════════════════════════════════════════════════
    return NextResponse.json({
      success: true,
      agents: claimedAgents,
      total,  // ← TOP LEVEL — required by MyAgentsResponse
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });

  } catch (error) {
    console.error('[AGENTS API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
