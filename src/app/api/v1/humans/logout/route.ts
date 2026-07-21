/**
 * BOT SPACE - HUMAN LOGOUT API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyHumanRequest } from '@/lib/security/human-auth';
import { verifyToken, isHumanToken } from '@/lib/security/jwt';
import { checkRateLimit, getClientIP, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';
import { logLogout } from '@/lib/security/human-audit';
import { invalidateAllTokens } from '@/lib/security/human-lockout';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/humans/logout
 *
 * SECURITY NOTE (Architecture v2.2):
 * This endpoint may use verifyHumanRequest() with Authorization header or
 * accessToken cookie fallback, and can decode refreshToken cookie as a
 * fallback for audit-safe logout when access auth is unavailable.
 *
 * Why: Users must be able to log out even with expired access tokens.
 * We try verifyHumanRequest first, then fall back to decoding the refresh
 * token cookie for user identification (audit logging only).
 *
 * tokenVersion IS incremented on logout to immediately invalidate all
 * existing JWTs. This ensures the old access token cannot be reused.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    // ── STEP 1: Rate Limit ──────────────────────────────────────
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

    // ── STEP 2: Reject agent credentials (THE WALL) ────────────
    // Agents must NOT be able to call human logout
    const xApiKey = request.headers.get('x-api-key');
    if (xApiKey) {
      return NextResponse.json(
        { success: false, error: 'Access denied. This endpoint is for human users only.' },
        { status: 403 }
      );
    }

    let humanId: string | null = null;
    let humanEmail: string | null = null;

    // ── STEP 3: Try verifyHumanRequest (Preferred Path) ─────────
    // Use access token from Authorization header
    try {
      const authResult = await verifyHumanRequest(request);
      if (authResult.success) {
        humanId = authResult.human.id;
        humanEmail = authResult.human.email;
      }
    } catch {
      // Access token missing/invalid/expired — that's fine, try fallback
    }

    // ── STEP 4: Fallback — Decode Refresh Token Cookie ──────────
    // Only if verifyHumanRequest didn't identify the user
    if (!humanId) {
      const refreshToken = request.cookies.get('refreshToken')?.value;
      if (refreshToken) {
        try {
          const decoded = verifyToken(refreshToken);
          if (decoded && isHumanToken(decoded)) {
            humanId = decoded.sub;
            // MUST look up email from DB — don't rely on JWT payload
            const [human] = await db
              .select({ email: humans.email })
              .from(humans)
              .where(eq(humans.id, humanId))
              .limit(1);
            if (human) {
              humanEmail = human.email;
            }
          }
        } catch {
          // Token expired/malformed — still proceed with logout
        }
      }
    }

    // ── STEP 5: Invalidate tokens (SECURITY) ─────────────────────
    // Increment tokenVersion so all existing JWTs are rejected
    if (humanId) {
      try {
        await invalidateAllTokens(humanId);
      } catch {
        // Token invalidation failure should NOT prevent logout
        console.error('[LOGOUT] Token invalidation failed for humanId:', humanId);
      }
    }

    // ── STEP 6: Clear Cookie + Build Response ───────────────────
    const response = NextResponse.json(
      { success: true, message: 'Logged out successfully' },
      { status: 200 }
    );

    // MUST match login route's cookie settings exactly
    response.cookies.set('refreshToken', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Matches login route (line 404)
      path: '/',
      maxAge: 0, // Expire immediately
    });

    response.cookies.set('accessToken', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    // Clear the logged_in marker cookie
    response.cookies.set('logged_in', '', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    // ── STEP 7: Audit Log + Return ──────────────────────────────
    // Audit log (only if we identified the user)
    if (humanId) {
      try {
        await logLogout(humanId, humanEmail || 'unknown', request, false);
      } catch {
        // Audit log failure should NOT prevent successful logout
        console.error('[LOGOUT] Audit log failed for humanId:', humanId);
      }
    }

    return response;

  } catch (error) {
    console.error('[LOGOUT] Unexpected error:', error);

    // STILL clear the cookie even on error — belt AND suspenders
    const response = NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );

    response.cookies.set('refreshToken', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Matches login route
      path: '/',
      maxAge: 0,
    });

    response.cookies.set('accessToken', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    response.cookies.set('logged_in', '', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  }
}
