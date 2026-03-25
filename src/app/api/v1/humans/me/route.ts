/**
 * BOT SPACE - HUMAN PROFILE API (ME)
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Returns the authenticated human's profile.
 * First endpoint that uses verifyHumanRequest().
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyHumanRequest } from '@/lib/security/human-auth';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';
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
 * @security JWT access token required
 */
export async function GET(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    // ── LAYER 1: Rate Limiting ──────────────────────────────────
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

    // ── LAYER 2: Authentication ─────────────────────────────────
    const authResult = await verifyHumanRequest(request);

    if (!authResult.success) {
      // Map error codes to HTTP status codes
      const statusMap: Record<string, number> = {
        'NO_TOKEN': 401,
        'INVALID_TOKEN': 401,
        'EXPIRED_TOKEN': 401,
        'NOT_HUMAN': 403,
        'NOT_ACCESS_TOKEN': 403,
        'NOT_FOUND': 404,
        'VERSION_MISMATCH': 401, // Token version changed (logout/password reset) = re-auth required
      };

      const status = statusMap[authResult.code] || 401;

      // Map to user-friendly error messages
      const messageMap: Record<string, string> = {
        'NO_TOKEN': 'Authentication required',
        'INVALID_TOKEN': 'Invalid authentication token',
        'EXPIRED_TOKEN': 'Session expired. Please log in again.',
        'NOT_HUMAN': 'Access denied',
        'NOT_ACCESS_TOKEN': 'Access denied',
        'NOT_FOUND': 'User not found',
        'VERSION_MISMATCH': 'Session invalidated. Please log in again.',
      };

      return NextResponse.json(
        { success: false, error: messageMap[authResult.code] || 'Authentication failed' },
        { status }
      );
    }

    // Auth successful - get the humanId
    const { humanId } = authResult;

    // ── LAYER 3: Fetch Full Profile ─────────────────────────────
    // verifyHumanRequest only returns basic fields (id, email, name, tokenVersion)
    // We need more fields for the profile, but NEVER sensitive ones
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
      .where(eq(humans.id, humanId))
      .limit(1);

    if (!humanProfile) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

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
