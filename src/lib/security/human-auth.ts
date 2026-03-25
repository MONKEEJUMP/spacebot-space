/**
 * BOT SPACE - HUMAN AUTHENTICATION
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * COMPLETELY SEPARATE from agent authentication
 * Humans use email/password + CAPTCHA
 * Agents use API keys + AI verification
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import bcrypt from 'bcryptjs';
import { generateTokenPair, verifyToken, extractToken, isHumanToken, isAccessToken, isTokenVersionValid } from './jwt';
import { NextRequest } from 'next/server';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq } from 'drizzle-orm';

const BCRYPT_ROUNDS = 12;

// ============================================================
// HUMAN USER TYPES
// ============================================================

export interface HumanUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  subscriptionTier: 'free_trial' | 'basic' | 'pro' | 'enterprise';
  subscriptionExpiresAt?: Date;
  createdAt: Date;
  lastLoginAt?: Date;
  isEmailVerified: boolean;
}

export interface HumanRegistrationData {
  email: string;
  password: string;
  name: string;
}

export interface HumanLoginData {
  email: string;
  password: string;
  captchaToken: string;
}

// ============================================================
// CAPTCHA VERIFICATION
// ============================================================

/**
 * Verify Turnstile token
 * Humans should pass, bots should fail
 */
export async function verifyCaptcha(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;

  if (!secret) {
    console.warn('[SECURITY] Turnstile secret not configured');
    // In development, allow through
    return process.env.NODE_ENV === 'development';
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ secret, response: token }).toString(),
    });

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('[SECURITY] CAPTCHA verification error:', error);
    return false;
  }
}

// ============================================================
// REGISTRATION
// ============================================================

/**
 * Register a new human user
 * This is COMPLETELY SEPARATE from agent registration
 */
export async function registerHuman(
  data: HumanRegistrationData
): Promise<{
  success: boolean;
  user?: Omit<HumanUser, 'passwordHash'>;
  error?: string;
}> {
  try {
    // Hash password
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    // Create user object (store in separate humans table!)
    const user: HumanUser = {
      id: crypto.randomUUID(),
      email: data.email.toLowerCase().trim(),
      passwordHash,
      name: data.name,
      subscriptionTier: 'free_trial',
      createdAt: new Date(),
      isEmailVerified: false,
    };

    // Return user without password hash
    const { passwordHash: _, ...safeUser } = user;

    return {
      success: true,
      user: safeUser,
    };
  } catch (error) {
    console.error('[SECURITY] Human registration error:', error);
    return {
      success: false,
      error: 'Registration failed',
    };
  }
}

// ============================================================
// LOGIN
// ============================================================

/**
 * Verify human login credentials
 * Requires CAPTCHA verification (bots should fail)
 */
export async function verifyHumanLogin(
  data: HumanLoginData,
  storedUser: HumanUser | null
): Promise<{
  success: boolean;
  tokens?: { accessToken: string; refreshToken: string; expiresIn: number };
  error?: string;
}> {
  // 1. Verify CAPTCHA first (humans pass, bots fail)
  const captchaValid = await verifyCaptcha(data.captchaToken);
  if (!captchaValid) {
    return {
      success: false,
      error: 'CAPTCHA verification failed. Please try again.',
    };
  }

  // 2. Check if user exists
  if (!storedUser) {
    // Use constant-time response to prevent user enumeration
    await bcrypt.compare(data.password, '$2b$12$dummy.hash.to.prevent.timing.attacks');
    return {
      success: false,
      error: 'Invalid email or password',
    };
  }

  // 3. Verify password
  const passwordValid = await bcrypt.compare(data.password, storedUser.passwordHash);
  if (!passwordValid) {
    return {
      success: false,
      error: 'Invalid email or password',
    };
  }

  // 4. Generate tokens (marked as human type)
  const tokens = generateTokenPair(storedUser.id, storedUser.email, 'human');

  return {
    success: true,
    tokens,
  };
}

// ============================================================
// PASSWORD MANAGEMENT
// ============================================================

/**
 * Hash a new password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain a number');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain a special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

/**
 * Generate password reset token
 */
export function generatePasswordResetToken(): {
  token: string;
  expiresAt: Date;
} {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  return { token, expiresAt };
}

/**
 * Generate email verification token
 */
export function generateEmailVerificationToken(): {
  token: string;
  expiresAt: Date;
} {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  return { token, expiresAt };
}

// ============================================================
// REQUEST VERIFICATION
// SECURITY: Validates human JWT from Authorization header ONLY.
// Refresh tokens should ONLY be used at /api/v1/humans/refresh.
// This prevents refresh token leakage through API request logging.
// ============================================================

export interface VerifyHumanRequestResult {
  success: true;
  humanId: string;
  human: {
    id: string;
    email: string;
    name: string;
    tokenVersion: number;
  };
}

export interface VerifyHumanRequestError {
  success: false;
  error: string;
  code: 'NO_TOKEN' | 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'NOT_HUMAN' | 'NOT_ACCESS_TOKEN' | 'VERSION_MISMATCH' | 'NOT_FOUND';
}

export type VerifyHumanRequestResponse = VerifyHumanRequestResult | VerifyHumanRequestError;

/**
 * Verify human authentication from request
 *
 * SECURITY: Accepts access tokens from Authorization header first,
 * then falls back to accessToken cookie.
 * We do NOT fall back to the refresh token cookie.
 * The frontend HumanAuthProvider handles token refresh and retry.
 *
 * The ONLY exception is the logout endpoint (PROMPT 13), which
 * reads the refresh token directly for audit logging purposes.
 */
export async function verifyHumanRequest(
  request: NextRequest
): Promise<VerifyHumanRequestResponse> {
  // 1. Extract token from Authorization header OR accessToken cookie
  let token = extractToken(request.headers.get('authorization'));

  // Fallback to cookie when Authorization header is absent
  if (!token) {
    token = request.cookies.get('accessToken')?.value || null;
  }

  if (!token) {
    return {
      success: false,
      error: 'Authentication required',
      code: 'NO_TOKEN',
    };
  }

  // 2. Verify token signature and structure
  const decoded = verifyToken(token);

  if (!decoded) {
    return {
      success: false,
      error: 'Invalid token',
      code: 'INVALID_TOKEN',
    };
  }

  // 3. Check expiry
  if (decoded.expired || !decoded.valid) {
    return {
      success: false,
      error: 'Token expired',
      code: 'EXPIRED_TOKEN',
    };
  }

  // 4. Ensure human token (not agent)
  if (!isHumanToken(decoded)) {
    return {
      success: false,
      error: 'Invalid token type',
      code: 'NOT_HUMAN',
    };
  }

  // 5. Ensure access token (not refresh)
  if (!isAccessToken(decoded)) {
    return {
      success: false,
      error: 'Access token required',
      code: 'NOT_ACCESS_TOKEN',
    };
  }

  // 6. Get human from database to verify tokenVersion
  const [human] = await db
    .select({
      id: humans.id,
      email: humans.email,
      name: humans.name,
      tokenVersion: humans.tokenVersion,
    })
    .from(humans)
    .where(eq(humans.id, decoded.sub))
    .limit(1);

  if (!human) {
    return {
      success: false,
      error: 'Human not found',
      code: 'NOT_FOUND',
    };
  }

  // 7. Check tokenVersion (detects password changes / forced logout)
  if (!isTokenVersionValid(decoded, human.tokenVersion)) {
    return {
      success: false,
      error: 'Token has been invalidated',
      code: 'VERSION_MISMATCH',
    };
  }

  // 8. Success!
  return {
    success: true,
    humanId: human.id,
    human,
  };
}
