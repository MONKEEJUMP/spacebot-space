/**
 * BOT SPACE - HUMAN PROFILE API (ME)
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Returns the authenticated human's profile.
 * Uses Clerk session via requireClerkOrBotAuth().
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireClerkOrBotAuth } from '@/lib/security/clerk-auth';
import { checkRateLimit, getClientIP, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';
import { db } from '@/db';
import { humans, humanAgentLinks } from '@/db/schema';
import { eq, sql, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/humans/me
 *
 * Returns the authenticated human's profile data.
 *
 * @security Rate limited: 60 requests/min (humanDashboard)
 * @security Clerk session required
 */
export async function GET(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    // ── LAYER 1: Rate Limiting ──────────────────────────────────
    const rateLimit = await checkRateLimit(ip, 'humanDashboard');
    if (!rateLimit.allowed) {
      return rateLimitDeniedResponse(rateLimit, () =>
        NextResponse.json(
          {
            success: false,
            error: 'Too many requests. Please try again later.',
            retryAfter: rateLimit.retryAfter,
          },
          { status: 429 }
        )
      );
    }

    // ── LAYER 2: Authentication ─────────────────────────────────
    const authResult = await requireClerkOrBotAuth(request);

    if (!authResult) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (authResult.type === 'bot') {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 401 }
      );
    }

    // Auth successful - Clerk session
    const clerkUserId = authResult.userId;

    // ── LAYER 3: Fetch Full Profile ─────────────────────────────
    // Look up the humans row by Clerk user id. Never return sensitive fields.
    const [humanProfile] = await db
      .select({
        id: humans.id,
        email: humans.email,
        name: humans.name,
        subscriptionTier: humans.subscriptionTier,
        subscriptionExpiresAt: humans.subscriptionExpiresAt,
        isEmailVerified: humans.isEmailVerified,
        lastLoginAt: humans.lastLoginAt,
        createdAt: humans.createdAt,
        updatedAt: humans.updatedAt,
        avatarConfig: humans.avatarConfig,
        siteTheme: humans.siteTheme,
        // NEVER: passwordHash, tokenVersion, failedLoginAttempts,
        // accountLockedAt, accountLockedUntil, accountLockReason,
        // unlockToken, unlockTokenExpiresAt, emailVerificationToken,
        // emailVerificationExpiresAt, passwordResetToken, passwordResetExpiresAt,
        // lastLoginIp
      })
      .from(humans)
      .where(eq(humans.clerkId, clerkUserId))
      .limit(1);

    if (!humanProfile) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 401 }
      );
    }

    const humanId = humanProfile.id;

    // ── Count Claimed Agents ────────────────────────────────────
    const [agentCount] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(humanAgentLinks)
      .where(
        and(
          eq(humanAgentLinks.humanId, humanId),
          eq(humanAgentLinks.status, 'active')
        )
      );

    // ── Success Response ────────────────────────────────────────
    return NextResponse.json(
      {
        success: true,
        human: {
          ...humanProfile,
        },
        agentCount: agentCount?.count ?? 0,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('[ME] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
