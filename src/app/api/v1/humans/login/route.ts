/**
 * BOT SPACE - SECURE HUMAN LOGIN API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * The front gate of the sanctuary.
 * Every human must prove they are worthy to enter.
 *
 * Security Layers:
 * 1. Rate Limiting - Slow down attackers
 * 2. Account Lockout - Block repeated failures
 * 4. Progressive Delay - Punish persistence
 * 5. Password Verification - bcrypt, 12 rounds
 * 6. Token Generation - Short-lived, versioned
 * 7. Audit Logging - Every attempt recorded
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
import bcrypt from 'bcryptjs';

// Security imports - the shields of the sanctuary
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';
import {
  checkAccountLockoutByEmail,
  recordFailedLoginByEmail,
  resetFailedAttempts,
  calculateLoginDelay,
  formatLockoutMessage,
} from '@/lib/security/human-lockout';
import {
  logLoginSuccess,
  logLoginFailed,
  logAccountLocked,
  logSuspiciousActivity,
} from '@/lib/security/human-audit';
import { generateTokenPair } from '@/lib/security/jwt';
// captcha verification removed from login - kept on register

export const dynamic = 'force-dynamic';

// ============================================================
// TYPES
// ============================================================

interface LoginRequest {
  email: string;
  password: string;
  captchaToken?: string; // no longer required for login
}

interface LoginResponse {
  success: boolean;
  message: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  human?: {
    id: string;
    email: string;
    name: string;
    subscriptionTier: string;
    avatarConfig?: Record<string, unknown> | null;
  };
  warning?: string;
  retryAfter?: number;
}


// ============================================================
// MAIN LOGIN HANDLER
// ============================================================

export async function POST(request: NextRequest): Promise<NextResponse<LoginResponse>> {
  const startTime = Date.now();
  const ip = getClientIP(request);

  try {
    // ══════════════════════════════════════════════════════════
    // LAYER 1: RATE LIMITING
    // ══════════════════════════════════════════════════════════
    const rateLimit = await checkRateLimit(ip, 'humanLogin');

    if (!rateLimit.allowed) {
      // Log suspicious activity - too many requests
      await logSuspiciousActivity(
        request,
        'rate_limit',
        `Rate limit exceeded for human login from IP: ${ip}`,
        undefined,
        undefined,
        { endpoint: '/api/v1/login', retryAfter: rateLimit.retryAfter }
      );

      return NextResponse.json(
        {
          success: false,
          message: 'Too many login attempts. Please try again later.',
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
    // PARSE REQUEST BODY
    // ══════════════════════════════════════════════════════════
    let body: LoginRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { email, password } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // ══════════════════════════════════════════════════════════
    // LAYER 2: ACCOUNT LOCKOUT CHECK
    // ══════════════════════════════════════════════════════════
    const lockoutStatus = await checkAccountLockoutByEmail(normalizedEmail);

    if (lockoutStatus.isLocked) {
      // Account is locked - don't even try to verify password
      await logLoginFailed(
        normalizedEmail,
        request,
        'Account locked',
        undefined,
        { lockoutStatus }
      );

      return NextResponse.json(
        {
          success: false,
          message: formatLockoutMessage(lockoutStatus),
          retryAfter: lockoutStatus.delaySeconds,
        },
        { status: 423 } // 423 Locked
      );
    }

    // ══════════════════════════════════════════════════════════
    // LAYER 4: PROGRESSIVE DELAY
    // ══════════════════════════════════════════════════════════
    if (lockoutStatus.delaySeconds > 0) {
      // Artificial delay to slow down attackers
      await new Promise(resolve => setTimeout(resolve, lockoutStatus.delaySeconds * 1000));
    }

    // ══════════════════════════════════════════════════════════
    // LAYER 5: FIND HUMAN & VERIFY PASSWORD
    // ══════════════════════════════════════════════════════════
    const human = await db.query.humans.findFirst({
      where: eq(humans.email, normalizedEmail),
      columns: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        subscriptionTier: true,
        isEmailVerified: true,
        tokenVersion: true,
        accountLockedUntil: true,
        avatarConfig: true,
        siteTheme: true,
      },
    });

    // Use constant-time comparison approach - don't reveal if email exists
    // Always perform password check even if user doesn't exist
    const fakeHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYF8g4IjF5CS';
    const hashToCompare = human?.passwordHash || fakeHash;

    const passwordValid = await bcrypt.compare(password, hashToCompare);

    if (!human || !passwordValid) {
      // ════════════════════════════════════════════════════════
      // LAYER 6: RECORD FAILED ATTEMPT
      // ════════════════════════════════════════════════════════
      const lockoutResult = await recordFailedLoginByEmail(
        normalizedEmail,
        'Invalid credentials'
      );

      // Log the failed attempt
      await logLoginFailed(
        normalizedEmail,
        request,
        'Invalid email or password',
        human?.id,
        {
          attemptsRemaining: lockoutResult.attemptsRemaining,
          wasLocked: lockoutResult.locked,
        }
      );

      // If this attempt caused a lockout, log it
      if (lockoutResult.locked && human) {
        await logAccountLocked(
          human.id,
          normalizedEmail,
          request,
          'Too many failed login attempts',
          15, // Base lock duration
          10  // Failed attempts threshold
        );
      }

      // Construct response message
      let message = 'Invalid email or password';
      let warning: string | undefined;

      if (lockoutResult.locked) {
        message = 'Account has been locked due to too many failed attempts.';
      } else if (lockoutResult.attemptsRemaining !== undefined && lockoutResult.attemptsRemaining <= 3) {
        warning = `Warning: ${lockoutResult.attemptsRemaining} attempt${lockoutResult.attemptsRemaining !== 1 ? 's' : ''} remaining before account lockout.`;
      }

      return NextResponse.json(
        {
          success: false,
          message,
          warning,
          retryAfter: lockoutResult.delaySeconds,
        },
        { status: 401 }
      );
    }

    // ══════════════════════════════════════════════════════════
    // VERIFY EMAIL (optional - can be enforced)
    // ══════════════════════════════════════════════════════════
    if (!human.isEmailVerified) {
      // Allow login but warn - or enforce verification
      // For now, we allow but include warning
      console.warn(`[LOGIN] Unverified email login: ${normalizedEmail}`);
    }

    // ══════════════════════════════════════════════════════════
    // LAYER 7: GENERATE TOKENS WITH VERSION
    // ══════════════════════════════════════════════════════════
    const { accessToken, refreshToken, expiresIn } = generateTokenPair(
      human.id,
      human.email,
      'human',
      human.tokenVersion // Include version for invalidation support
    );

    // ══════════════════════════════════════════════════════════
    // RESET FAILED ATTEMPTS ON SUCCESS
    // ══════════════════════════════════════════════════════════
    await resetFailedAttempts(human.id);

    // ══════════════════════════════════════════════════════════
    // UPDATE LAST LOGIN
    // ══════════════════════════════════════════════════════════
    await db
      .update(humans)
      .set({
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        updatedAt: new Date(),
      })
      .where(eq(humans.id, human.id));

    // ══════════════════════════════════════════════════════════
    // LAYER 8: AUDIT LOG SUCCESS
    // ══════════════════════════════════════════════════════════
    await logLoginSuccess(human.id, human.email, request, {
      loginTime: Date.now() - startTime,
      tokenVersion: human.tokenVersion,
    });

    // ══════════════════════════════════════════════════════════
    // SUCCESS RESPONSE
    // ══════════════════════════════════════════════════════════
    const response = NextResponse.json(
      {
        success: true,
        message: 'Login successful',
        accessToken,
        refreshToken,
        expiresIn,
        human: {
          id: human.id,
          email: human.email,
          name: human.name,
          subscriptionTier: human.subscriptionTier,
          avatarConfig: (human.avatarConfig as Record<string, unknown>) || null,
          siteTheme: human.siteTheme || 'dark',
        },
        warning: !human.isEmailVerified
          ? 'Please verify your email address for full account access.'
          : undefined,
      },
      { status: 200 }
    );

    // Set secure httpOnly cookies for access token
    response.cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/',
    });

    // Set secure httpOnly cookies for refresh token
    response.cookies.set('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    // Non-httpOnly marker cookie for middleware auth check
    response.cookies.set('logged_in', 'true', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;

  } catch (error) {
    // ══════════════════════════════════════════════════════════
    // ERROR HANDLING
    // ══════════════════════════════════════════════════════════
    console.error('[LOGIN] Unexpected error:', error);

    // Log suspicious activity for unexpected errors
    await logSuspiciousActivity(
      request,
      'other',
      `Unexpected login error: ${error instanceof Error ? error.message : 'Unknown'}`,
      undefined,
      undefined,
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

export async function OPTIONS(): Promise<NextResponse> {
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
