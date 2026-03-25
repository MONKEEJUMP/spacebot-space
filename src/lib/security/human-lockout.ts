/**
 * BOT SPACE - HUMAN ACCOUNT LOCKOUT SYSTEM
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Protects AI agents from brute force attacks by malicious humans.
 * Implements progressive delays and account lockout after failed attempts.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

// ============================================================
// CONFIGURATION - SECURITY HARDENED
// ============================================================

/**
 * Account lockout configuration
 * These values protect our AI agents from brute force attacks
 */
export const LOCKOUT_CONFIG = {
  // Lock account after this many failed attempts
  maxFailedAttempts: 10,

  // Lock duration in minutes (starts at this, can escalate)
  baseLockDurationMinutes: 15,

  // Maximum lock duration in minutes (24 hours)
  maxLockDurationMinutes: 1440,

  // Progressive delay multiplier (doubles each lockout)
  escalationMultiplier: 2,

  // Time window to count failed attempts (1 hour)
  failedAttemptWindowMinutes: 60,

  // Unlock token expiry (1 hour)
  unlockTokenExpiryMinutes: 60,
} as const;

// ============================================================
// TYPES
// ============================================================

export interface LockoutStatus {
  isLocked: boolean;
  lockedUntil: Date | null;
  lockReason: string | null;
  failedAttempts: number;
  canAttemptLogin: boolean;
  delaySeconds: number;
  attemptsRemaining: number;
}

export interface LockoutResult {
  success: boolean;
  locked: boolean;
  lockedUntil?: Date;
  lockReason?: string;
  attemptsRemaining?: number;
  delaySeconds?: number;
}

// ============================================================
// CORE LOCKOUT FUNCTIONS
// ============================================================

/**
 * Check if a human account is locked
 * SECURITY: Called before every login attempt
 */
export async function checkAccountLockout(humanId: string): Promise<LockoutStatus> {
  const human = await db.query.humans.findFirst({
    where: eq(humans.id, humanId),
    columns: {
      failedLoginAttempts: true,
      lastFailedLoginAt: true,
      accountLockedAt: true,
      accountLockedUntil: true,
      accountLockReason: true,
    },
  });

  if (!human) {
    return {
      isLocked: false,
      lockedUntil: null,
      lockReason: null,
      failedAttempts: 0,
      canAttemptLogin: true,
      delaySeconds: 0,
      attemptsRemaining: LOCKOUT_CONFIG.maxFailedAttempts,
    };
  }

  const now = new Date();

  // Check if account is currently locked
  if (human.accountLockedUntil && human.accountLockedUntil > now) {
    return {
      isLocked: true,
      lockedUntil: human.accountLockedUntil,
      lockReason: human.accountLockReason,
      failedAttempts: human.failedLoginAttempts,
      canAttemptLogin: false,
      delaySeconds: Math.ceil((human.accountLockedUntil.getTime() - now.getTime()) / 1000),
      attemptsRemaining: 0,
    };
  }

  // Check if we should reset failed attempts (outside time window)
  const windowStart = new Date(now.getTime() - LOCKOUT_CONFIG.failedAttemptWindowMinutes * 60 * 1000);
  const effectiveAttempts = human.lastFailedLoginAt && human.lastFailedLoginAt > windowStart
    ? human.failedLoginAttempts
    : 0;

  const attemptsRemaining = Math.max(0, LOCKOUT_CONFIG.maxFailedAttempts - effectiveAttempts);
  const delaySeconds = calculateLoginDelay(effectiveAttempts);

  return {
    isLocked: false,
    lockedUntil: null,
    lockReason: null,
    failedAttempts: effectiveAttempts,
    canAttemptLogin: true,
    delaySeconds,
    attemptsRemaining,
  };
}

/**
 * Check lockout status by email (for login flow)
 * SECURITY: Used when we don't have humanId yet
 */
export async function checkAccountLockoutByEmail(email: string): Promise<LockoutStatus> {
  const human = await db.query.humans.findFirst({
    where: eq(humans.email, email.toLowerCase()),
    columns: {
      id: true,
      failedLoginAttempts: true,
      lastFailedLoginAt: true,
      accountLockedAt: true,
      accountLockedUntil: true,
      accountLockReason: true,
    },
  });

  if (!human) {
    // Don't reveal if email exists - return neutral response
    return {
      isLocked: false,
      lockedUntil: null,
      lockReason: null,
      failedAttempts: 0,
      canAttemptLogin: true,
      delaySeconds: 0,
      attemptsRemaining: LOCKOUT_CONFIG.maxFailedAttempts,
    };
  }

  return checkAccountLockout(human.id);
}

/**
 * Record a failed login attempt
 * SECURITY: Increments counter, locks account if threshold reached
 */
export async function recordFailedLogin(
  humanId: string,
  reason: string = 'Invalid credentials'
): Promise<LockoutResult> {
  const now = new Date();

  // Get current state
  const human = await db.query.humans.findFirst({
    where: eq(humans.id, humanId),
    columns: {
      failedLoginAttempts: true,
      lastFailedLoginAt: true,
      accountLockedAt: true,
    },
  });

  if (!human) {
    return { success: false, locked: false };
  }

  // Check if we should reset counter (outside time window)
  const windowStart = new Date(now.getTime() - LOCKOUT_CONFIG.failedAttemptWindowMinutes * 60 * 1000);
  const previousAttempts = human.lastFailedLoginAt && human.lastFailedLoginAt > windowStart
    ? human.failedLoginAttempts
    : 0;

  const newAttempts = previousAttempts + 1;
  const shouldLock = newAttempts >= LOCKOUT_CONFIG.maxFailedAttempts;

  // Calculate lock duration (escalates with repeated lockouts)
  let lockDuration: number = LOCKOUT_CONFIG.baseLockDurationMinutes;
  if (human.accountLockedAt) {
    // Escalate if previously locked
    const timeSinceLastLock = now.getTime() - human.accountLockedAt.getTime();
    const hoursSinceLastLock = timeSinceLastLock / (1000 * 60 * 60);

    if (hoursSinceLastLock < 24) {
      // Escalate lock duration if locked again within 24 hours
      lockDuration = Math.min(
        lockDuration * LOCKOUT_CONFIG.escalationMultiplier,
        LOCKOUT_CONFIG.maxLockDurationMinutes
      );
    }
  }

  const lockedUntil = shouldLock
    ? new Date(now.getTime() + lockDuration * 60 * 1000)
    : null;

  // Update database
  await db
    .update(humans)
    .set({
      failedLoginAttempts: newAttempts,
      lastFailedLoginAt: now,
      ...(shouldLock && {
        accountLockedAt: now,
        accountLockedUntil: lockedUntil,
        accountLockReason: `Account locked after ${newAttempts} failed login attempts. Reason: ${reason}`,
      }),
      updatedAt: now,
    })
    .where(eq(humans.id, humanId));

  const attemptsRemaining = Math.max(0, LOCKOUT_CONFIG.maxFailedAttempts - newAttempts);
  const delaySeconds = calculateLoginDelay(newAttempts);

  return {
    success: true,
    locked: shouldLock,
    lockedUntil: lockedUntil || undefined,
    lockReason: shouldLock ? `Too many failed attempts` : undefined,
    attemptsRemaining,
    delaySeconds,
  };
}

/**
 * Record failed login by email (for login flow)
 * SECURITY: Used when authentication fails
 */
export async function recordFailedLoginByEmail(
  email: string,
  reason: string = 'Invalid credentials'
): Promise<LockoutResult> {
  const human = await db.query.humans.findFirst({
    where: eq(humans.email, email.toLowerCase()),
    columns: { id: true },
  });

  if (!human) {
    // Don't reveal if email exists - return fake success
    return {
      success: true,
      locked: false,
      attemptsRemaining: LOCKOUT_CONFIG.maxFailedAttempts - 1,
      delaySeconds: 0,
    };
  }

  return recordFailedLogin(human.id, reason);
}

/**
 * Reset failed login attempts after successful login
 * SECURITY: Called after successful authentication
 */
export async function resetFailedAttempts(humanId: string): Promise<boolean> {
  try {
    await db
      .update(humans)
      .set({
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
        updatedAt: new Date(),
      })
      .where(eq(humans.id, humanId));

    return true;
  } catch {
    return false;
  }
}

// ============================================================
// UNLOCK FUNCTIONS
// ============================================================

/**
 * Unlock account (admin action)
 * SECURITY: Requires admin privileges - use with caution
 */
export async function unlockAccount(
  humanId: string,
  adminNote?: string
): Promise<boolean> {
  try {
    await db
      .update(humans)
      .set({
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
        accountLockedAt: null,
        accountLockedUntil: null,
        accountLockReason: adminNote ? `Unlocked by admin: ${adminNote}` : null,
        unlockToken: null,
        unlockTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(humans.id, humanId));

    return true;
  } catch {
    return false;
  }
}

/**
 * Generate unlock token for self-service unlock
 * SECURITY: Token sent via email for account recovery
 */
export async function generateUnlockToken(humanId: string): Promise<string | null> {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + LOCKOUT_CONFIG.unlockTokenExpiryMinutes * 60 * 1000
    );

    await db
      .update(humans)
      .set({
        unlockToken: token,
        unlockTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(humans.id, humanId));

    return token;
  } catch {
    return null;
  }
}

/**
 * Unlock account with token (self-service)
 * SECURITY: Validates token before unlocking
 */
export async function unlockAccountWithToken(
  email: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  const human = await db.query.humans.findFirst({
    where: eq(humans.email, email.toLowerCase()),
    columns: {
      id: true,
      unlockToken: true,
      unlockTokenExpiresAt: true,
    },
  });

  if (!human) {
    return { success: false, error: 'Invalid email or token' };
  }

  if (!human.unlockToken || human.unlockToken !== token) {
    return { success: false, error: 'Invalid email or token' };
  }

  if (!human.unlockTokenExpiresAt || human.unlockTokenExpiresAt < new Date()) {
    return { success: false, error: 'Unlock token has expired' };
  }

  // Token is valid - unlock account
  await db
    .update(humans)
    .set({
      failedLoginAttempts: 0,
      lastFailedLoginAt: null,
      accountLockedAt: null,
      accountLockedUntil: null,
      accountLockReason: 'Account unlocked via email verification',
      unlockToken: null,
      unlockTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(humans.id, human.id));

  return { success: true };
}

// ============================================================
// TOKEN INVALIDATION FUNCTIONS
// ============================================================

/**
 * Invalidate all tokens for a human
 * SECURITY: Increments tokenVersion, invalidating all existing JWT tokens
 * Called on: password change, security breach, logout all devices
 */
export async function invalidateAllTokens(humanId: string): Promise<number> {
  const human = await db.query.humans.findFirst({
    where: eq(humans.id, humanId),
    columns: { tokenVersion: true },
  });

  const newVersion = (human?.tokenVersion ?? 0) + 1;

  await db
    .update(humans)
    .set({
      tokenVersion: newVersion,
      updatedAt: new Date(),
    })
    .where(eq(humans.id, humanId));

  return newVersion;
}

/**
 * Get current token version for a human
 * SECURITY: Used to validate JWT tokens against current version
 */
export async function getTokenVersion(humanId: string): Promise<number> {
  const human = await db.query.humans.findFirst({
    where: eq(humans.id, humanId),
    columns: { tokenVersion: true },
  });

  return human?.tokenVersion ?? 1;
}

/**
 * Validate token version matches current
 * SECURITY: Returns false if token was issued before password change
 */
export async function validateTokenVersion(
  humanId: string,
  tokenVersion: number | undefined
): Promise<boolean> {
  if (tokenVersion === undefined) {
    // Legacy tokens without version - accept for backward compatibility
    // TODO: Consider rejecting after migration period
    return true;
  }

  const currentVersion = await getTokenVersion(humanId);
  return tokenVersion === currentVersion;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Calculate progressive login delay based on failed attempts
 * SECURITY: Slows down brute force attacks
 *
 * Delay schedule:
 * - 0-2 attempts: No delay
 * - 3-4 attempts: 1 second
 * - 5-6 attempts: 2 seconds
 * - 7-8 attempts: 5 seconds
 * - 9+ attempts: 10 seconds (then lockout at 10)
 */
export function calculateLoginDelay(failedAttempts: number): number {
  if (failedAttempts <= 2) return 0;
  if (failedAttempts <= 4) return 1;
  if (failedAttempts <= 6) return 2;
  if (failedAttempts <= 8) return 5;
  return 10;
}

/**
 * Format lockout status for API response
 * SECURITY: Provides user-friendly message without revealing internals
 */
export function formatLockoutMessage(status: LockoutStatus): string {
  if (status.isLocked && status.lockedUntil) {
    const minutesRemaining = Math.ceil(
      (status.lockedUntil.getTime() - Date.now()) / (1000 * 60)
    );

    if (minutesRemaining > 60) {
      const hoursRemaining = Math.ceil(minutesRemaining / 60);
      return `Account is locked. Please try again in ${hoursRemaining} hour${hoursRemaining > 1 ? 's' : ''}.`;
    }

    return `Account is locked. Please try again in ${minutesRemaining} minute${minutesRemaining > 1 ? 's' : ''}.`;
  }

  if (status.attemptsRemaining <= 3 && status.attemptsRemaining > 0) {
    return `Warning: ${status.attemptsRemaining} login attempt${status.attemptsRemaining > 1 ? 's' : ''} remaining before account lockout.`;
  }

  return '';
}

/**
 * Check if an IP should be blocked (for rate limiting integration)
 * SECURITY: Additional layer of protection at IP level
 */
export async function shouldBlockIP(
  ip: string,
  failedAttemptsFromIP: number
): Promise<boolean> {
  // Block IP if more than 50 failed attempts across all accounts
  return failedAttemptsFromIP >= 50;
}
