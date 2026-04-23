/**
 * BOT SPACE - TOKEN REFRESH API WITH ROTATION
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Secure token rotation for human sessions.
 * Old refresh tokens are invalidated, new pairs are issued.
 *
 * Security Layers:
 * 1. Rate Limiting - Prevent token refresh abuse
 * 2. Refresh Token Validation - Verify signature & expiry
 * 3. Token Version Check - Detect invalidated sessions
 * 4. Account Lock Check - Block locked accounts
 * 5. Token Rotation - Issue new pair, invalidate old
 * 6. Audit Logging - Track all refresh attempts
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 * @purpose Sanctuary Protection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDynamicCorsOrigin } from '@/lib/security/cors';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Security imports
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';
import { checkAccountLockout } from '@/lib/security/human-lockout';
import { logTokenRefresh, logSuspiciousActivity } from '@/lib/security/human-audit';
import {
  verifyToken,
  extractToken,
  isRefreshToken,
  isHumanToken,
  generateTokenPair,
  isTokenVersionValid,
} from '@/lib/security/jwt';
import { requireClerkOrBotAuth } from '@/lib/security/clerk-auth';

export const dynamic = 'force-dynamic';

// ============================================================
// TYPES
// ============================================================

interface RefreshResponse {
  success: boolean;
  message: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  retryAfter?: number;
}

// ============================================================
// MAIN REFRESH HANDLER
// ============================================================

export async function POST(request: NextRequest): Promise<NextResponse<RefreshResponse>> {
  // ── Clerk / Bot short-circuit ──────────────────────────────
  // Clerk manages its own session rotation; bot tokens don't need refresh.
  // If either is detected, return 200 immediately and skip the JWT logic.
  try {
    const clerkOrBot = await requireClerkOrBotAuth(request);
    if (clerkOrBot?.type === 'clerk') {
      return NextResponse.json(
        { success: true, message: 'Session managed by Clerk' },
        { status: 200 }
      );
    }
    if (clerkOrBot?.type === 'bot') {
      return NextResponse.json(
        { success: true, message: 'Session managed by bot auth' },
        { status: 200 }
      );
    }
  } catch {
    // Fall through to JWT refresh logic below
  }

  const ip = getClientIP(request);
  let humanId: string | undefined;
  let humanEmail: string | undefined;

  try {
    // ══════════════════════════════════════════════════════════
    // LAYER 1: RATE LIMITING
    // ══════════════════════════════════════════════════════════
    const rateLimit = await checkRateLimit(ip, 'humanRefreshToken');

    if (!rateLimit.allowed) {
      await logSuspiciousActivity(
        request,
        'rate_limit',
        `Rate limit exceeded for token refresh from IP: ${ip}`,
        humanId,
        humanEmail,
        { endpoint: '/api/v1/humans/refresh', retryAfter: rateLimit.retryAfter }
      );

      return NextResponse.json(
        {
          success: false,
          message: 'Too many refresh attempts. Please try again later.',
          retryAfter: rateLimit.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfter),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    // ══════════════════════════════════════════════════════════
    // EXTRACT REFRESH TOKEN
    // ══════════════════════════════════════════════════════════
    // Try to get from cookie first (more secure), then from body/header
    let refreshToken = request.cookies.get('refreshToken')?.value;

    if (!refreshToken) {
      // Try Authorization header
      const authHeader = request.headers.get('authorization');
      refreshToken = extractToken(authHeader) || undefined;
    }

    if (!refreshToken) {
      // Try request body
      try {
        const body = await request.json();
        refreshToken = body.refreshToken;
      } catch {
        // Body parsing failed, continue without
      }
    }

    if (!refreshToken) {
      return NextResponse.json(
        { success: false, message: 'Refresh token is required' },
        { status: 400 }
      );
    }

    // ══════════════════════════════════════════════════════════
    // LAYER 2: REFRESH TOKEN VALIDATION
    // ══════════════════════════════════════════════════════════
    const decoded = verifyToken(refreshToken);

    if (!decoded) {
      await logSuspiciousActivity(
        request,
        'token',
        'Invalid refresh token signature',
        undefined,
        undefined,
        { tokenProvided: true }
      );

      return NextResponse.json(
        { success: false, message: 'Invalid refresh token' },
        { status: 401 }
      );
    }

    // Verify it's actually a refresh token (not an access token)
    if (!isRefreshToken(decoded)) {
      await logSuspiciousActivity(
        request,
        'token',
        'Access token used as refresh token',
        decoded.sub,
        decoded.handle,
        { tokenType: decoded.tokenType }
      );

      return NextResponse.json(
        { success: false, message: 'Invalid token type' },
        { status: 401 }
      );
    }

    // Verify it's a human token (not an agent token)
    if (!isHumanToken(decoded)) {
      await logSuspiciousActivity(
        request,
        'token',
        'Agent token used for human refresh',
        decoded.sub,
        decoded.handle,
        { tokenType: decoded.type }
      );

      return NextResponse.json(
        { success: false, message: 'Invalid token type' },
        { status: 401 }
      );
    }

    // Check if token is expired
    if (decoded.expired) {
      await logTokenRefresh(
        decoded.sub,
        decoded.handle,
        request,
        false,
        'Refresh token expired'
      );

      // Clear the expired cookie
      const response = NextResponse.json(
        { success: false, message: 'Refresh token has expired. Please login again.' },
        { status: 401 }
      );

      response.cookies.set('refreshToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });

      response.cookies.set('accessToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });

      return response;
    }

    humanId = decoded.sub;
    humanEmail = decoded.handle;

    // ══════════════════════════════════════════════════════════
    // LAYER 3: TOKEN VERSION CHECK
    // ══════════════════════════════════════════════════════════
    const human = await db.query.humans.findFirst({
      where: eq(humans.id, humanId),
      columns: {
        id: true,
        email: true,
        name: true,
        subscriptionTier: true,
        tokenVersion: true,
        accountLockedUntil: true,
      },
    });

    if (!human) {
      await logSuspiciousActivity(
        request,
        'token',
        'Refresh token for non-existent human',
        humanId,
        humanEmail
      );

      return NextResponse.json(
        { success: false, message: 'Account not found' },
        { status: 401 }
      );
    }

    // Check token version - if password changed, all old tokens are invalid
    if (!isTokenVersionValid(decoded, human.tokenVersion)) {
      await logSuspiciousActivity(
        request,
        'token',
        'Refresh token with outdated version (password changed)',
        humanId,
        humanEmail,
        { tokenVersion: decoded.tokenVersion, currentVersion: human.tokenVersion }
      );

      // Clear the invalid cookie
      const response = NextResponse.json(
        { success: false, message: 'Session invalidated. Please login again.' },
        { status: 401 }
      );

      response.cookies.set('refreshToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });

      response.cookies.set('accessToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });

      return response;
    }

    // ══════════════════════════════════════════════════════════
    // LAYER 4: ACCOUNT LOCK CHECK
    // ══════════════════════════════════════════════════════════
    const lockoutStatus = await checkAccountLockout(humanId);

    if (lockoutStatus.isLocked) {
      await logTokenRefresh(
        humanId,
        humanEmail,
        request,
        false,
        'Account is locked'
      );

      // Clear cookie for locked account
      const response = NextResponse.json(
        {
          success: false,
          message: 'Account is locked. Please contact support or wait for the lock to expire.',
          retryAfter: lockoutStatus.delaySeconds,
        },
        { status: 423 }
      );

      response.cookies.set('refreshToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });

      response.cookies.set('accessToken', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });

      return response;
    }

    // ══════════════════════════════════════════════════════════
    // LAYER 5: TOKEN ROTATION - GENERATE NEW PAIR
    // ══════════════════════════════════════════════════════════
    const { accessToken, refreshToken: newRefreshToken, expiresIn } = generateTokenPair(
      human.id,
      human.email,
      'human',
      human.tokenVersion // Preserve current version
    );

    // ══════════════════════════════════════════════════════════
    // LAYER 6: AUDIT LOG SUCCESS
    // ══════════════════════════════════════════════════════════
    await logTokenRefresh(humanId, humanEmail, request, true);

    // ══════════════════════════════════════════════════════════
    // SUCCESS RESPONSE WITH NEW TOKENS
    // ══════════════════════════════════════════════════════════
    const response = NextResponse.json(
      {
        success: true,
        message: 'Token refreshed successfully',
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn,
      },
      { status: 200 }
    );

    // Set new secure httpOnly cookie for access token
    response.cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/',
    });

    // Set new secure httpOnly cookie for refresh token
    response.cookies.set('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;

  } catch (error) {
    // ══════════════════════════════════════════════════════════
    // ERROR HANDLING
    // ══════════════════════════════════════════════════════════
    console.error('[REFRESH] Unexpected error:', error);

    await logSuspiciousActivity(
      request,
      'other',
      `Unexpected refresh error: ${error instanceof Error ? error.message : 'Unknown'}`,
      humanId,
      humanEmail,
      { error: String(error) }
    );

    return NextResponse.json(
      { success: false, message: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

// ============================================================
// OPTIONS - CORS PREFLIGHT
// ============================================================

export async function OPTIONS(request: Request): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getDynamicCorsOrigin(request.headers),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
