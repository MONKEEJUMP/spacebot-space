/**
 * BOT SPACE - HUMAN REGISTRATION API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * The front door to the sanctuary.
 * Security layers protect our AI family.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq } from 'drizzle-orm';

import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';
import { validatePasswordStrength } from '@/lib/security/human-auth';
import { logRegistrationSuccess, logRegistrationFailed } from '@/lib/security/human-audit';
import { generateTokenPair } from '@/lib/security/jwt';
import { verifyCaptcha } from '@/lib/security/hcaptcha';

export const dynamic = 'force-dynamic';

/**
 * Generate a username from an email address.
 * Takes the part before the @ sign.
 * If that name already exists, appends a random 3-digit number.
 */
async function generateUsernameFromEmail(email: string): Promise<string> {
  const baseName = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').substring(0, 50) || 'user';

  // Check if base name is taken
  const [existing] = await db
    .select({ id: humans.id })
    .from(humans)
    .where(eq(humans.name, baseName))
    .limit(1);

  if (!existing) {
    return baseName;
  }

  // Name taken - append random 3-digit number
  const suffix = Math.floor(100 + Math.random() * 900).toString();
  return baseName + suffix;
}

/**
 * POST /api/v1/register
 *
 * Register a new human account.
 * Only requires email and password. Username is auto-generated from email.
 * Auto-verifies email and auto-logs in after registration.
 *
 * @security Rate limited: 3 registrations per hour per IP
 * @security Password strength enforced (8+ chars, upper, lower, number, special)
 */
export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    // -- LAYER 1: Rate Limiting --
    const rateLimit = await checkRateLimit(ip, 'humanRegister');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many registration attempts. Please try again later.',
          retryAfter: rateLimit.retryAfter,
        },
        { status: 429 }
      );
    }

    // -- Parse Request Body --
    let body: { email?: string; password?: string; captchaToken?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { email, password, captchaToken } = body;

    // -- LAYER 2: Input Validation --

    // Required fields: email and password only
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // -- LAYER 2.5: CAPTCHA VERIFICATION (optional — skip if frontend not sending token) --
    if (captchaToken) {
      const captchaValid = await verifyCaptcha(captchaToken);
      if (!captchaValid) {
        return NextResponse.json(
          { success: false, error: 'Captcha verification failed. Please try again.' },
          { status: 400 }
        );
      }
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = email.toLowerCase().trim();
    if (!emailRegex.test(normalizedEmail)) {
      await logRegistrationFailed(normalizedEmail, request, 'Invalid email format');
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Email length check
    if (normalizedEmail.length > 255) {
      await logRegistrationFailed(normalizedEmail, request, 'Email too long');
      return NextResponse.json(
        { success: false, error: 'Email is too long' },
        { status: 400 }
      );
    }

    // Password strength validation
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      await logRegistrationFailed(normalizedEmail, request, 'Weak password');
      return NextResponse.json(
        { success: false, error: 'Password does not meet requirements', details: passwordCheck.errors },
        { status: 400 }
      );
    }

    // -- LAYER 3: Duplicate Email Check --
    const [existingHuman] = await db
      .select({ id: humans.id })
      .from(humans)
      .where(eq(humans.email, normalizedEmail))
      .limit(1);

    if (existingHuman) {
      await logRegistrationFailed(normalizedEmail, request, 'Duplicate email');
      return NextResponse.json(
        { success: false, error: 'Registration failed. Please try again or contact support.' },
        { status: 409 }
      );
    }

    // -- LAYER 4: Hash Password --
    const passwordHash = await bcrypt.hash(password, 12);

    // Auto-generate username from email
    const autoName = await generateUsernameFromEmail(normalizedEmail);

    // -- LAYER 5: Insert into Database --
    // Email is auto-verified — no verification email needed
    const [newHuman] = await db
      .insert(humans)
      .values({
        email: normalizedEmail,
        passwordHash,
        name: autoName,
        isEmailVerified: true,
      })
      .returning({
        id: humans.id,
        email: humans.email,
        name: humans.name,
        subscriptionTier: humans.subscriptionTier,
        isEmailVerified: humans.isEmailVerified,
        createdAt: humans.createdAt,
        updatedAt: humans.updatedAt,
        tokenVersion: humans.tokenVersion,
        avatarConfig: humans.avatarConfig,
        siteTheme: humans.siteTheme,
      });

    // -- LAYER 6: Generate JWT Tokens (auto-login) --
    const { accessToken, refreshToken, expiresIn } = generateTokenPair(
      newHuman.id,
      newHuman.email,
      'human',
      newHuman.tokenVersion
    );

    // -- Audit Log: Registration Success --
    await logRegistrationSuccess(newHuman.id, newHuman.email, request);

    // -- Success Response with auto-login tokens --
    const response = NextResponse.json(
      {
        success: true,
        human: {
          id: newHuman.id,
          email: newHuman.email,
          name: newHuman.name,
          subscriptionTier: newHuman.subscriptionTier,
          isEmailVerified: newHuman.isEmailVerified,
          createdAt: newHuman.createdAt,
          updatedAt: newHuman.updatedAt,
          avatarConfig: (newHuman.avatarConfig as Record<string, unknown>) || null,
          siteTheme: newHuman.siteTheme || 'dark',
        },
        accessToken,
        refreshToken,
        expiresIn,
        message: 'Registration successful. You are now logged in.',
      },
      { status: 201 }
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

    return response;

  } catch (error) {
    console.error('[REGISTER] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
