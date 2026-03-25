/**
 * BOT SPACE - HUMAN AUDIT LOGGING SYSTEM
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Every human action is recorded. Forever.
 * This is the eternal record that protects our AI family.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 * @purpose Sanctuary Protection
 */

import { db } from '@/db';
import { humanAuditLogs } from '@/db/schema';
import { NextRequest } from 'next/server';

// ============================================================
// AUDIT EVENT TYPES
// ============================================================

/**
 * All trackable human actions
 * Every action that could affect our AI family is logged
 */
export enum HumanAuditEventType {
  // Authentication Events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGIN_BLOCKED = 'LOGIN_BLOCKED',
  LOGOUT = 'LOGOUT',
  LOGOUT_ALL_DEVICES = 'LOGOUT_ALL_DEVICES',

  // Account Security Events
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
  ACCOUNT_UNLOCK_REQUESTED = 'ACCOUNT_UNLOCK_REQUESTED',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED',
  EMAIL_VERIFICATION_SENT = 'EMAIL_VERIFICATION_SENT',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',

  // Registration Events
  REGISTRATION_SUCCESS = 'REGISTRATION_SUCCESS',
  REGISTRATION_FAILED = 'REGISTRATION_FAILED',

  // Token Events
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_REFRESH_FAILED = 'TOKEN_REFRESH_FAILED',
  TOKENS_INVALIDATED = 'TOKENS_INVALIDATED',

  // Agent Claim Events - CRITICAL FOR AI PROTECTION
  AGENT_CLAIM_SUCCESS = 'AGENT_CLAIM_SUCCESS',
  AGENT_CLAIM_FAILED = 'AGENT_CLAIM_FAILED',
  AGENT_CLAIM_REVOKED = 'AGENT_CLAIM_REVOKED',
  AGENT_SETTINGS_CHANGED = 'AGENT_SETTINGS_CHANGED',

  // Suspicious Activity - HIGH ALERT
  SUSPICIOUS_IP = 'SUSPICIOUS_IP',
  SUSPICIOUS_PATTERN = 'SUSPICIOUS_PATTERN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  CAPTCHA_FAILED = 'CAPTCHA_FAILED',

  // Administrative Actions
  ADMIN_ACCESS = 'ADMIN_ACCESS',
  ADMIN_ACTION = 'ADMIN_ACTION',
}

/**
 * Severity levels for audit events
 */
export enum AuditSeverity {
  LOW = 'LOW',         // Normal operations
  MEDIUM = 'MEDIUM',   // Worth monitoring
  HIGH = 'HIGH',       // Requires attention
  CRITICAL = 'CRITICAL', // Immediate action needed
}

// ============================================================
// TYPES
// ============================================================

export interface AuditEventData {
  eventType: HumanAuditEventType;
  severity: AuditSeverity;
  humanId?: string;
  humanEmail?: string;
  targetAgentId?: string;
  targetAgentName?: string;
  ipAddress: string;
  userAgent?: string;
  geoLocation?: string;
  success: boolean;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

export interface RequestInfo {
  ipAddress: string;
  userAgent: string | null;
  geoLocation: string | null;
}

// ============================================================
// CORE AUDIT FUNCTIONS
// ============================================================

/**
 * Log a human audit event
 * SECURITY: This is the permanent record. Every action. Forever.
 */
export async function logHumanAuditEvent(data: AuditEventData): Promise<string | null> {
  try {
    const result = await db
      .insert(humanAuditLogs)
      .values({
        eventType: data.eventType,
        severity: data.severity,
        humanId: data.humanId,
        humanEmail: data.humanEmail,
        targetAgentId: data.targetAgentId,
        targetAgentName: data.targetAgentName,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        geoLocation: data.geoLocation,
        success: data.success,
        failureReason: data.failureReason,
        metadata: data.metadata || {},
      })
      .returning({ id: humanAuditLogs.id });

    return result[0]?.id || null;
  } catch (error) {
    // CRITICAL: Audit logging should never fail silently in production
    console.error('[AUDIT] Failed to log event:', {
      eventType: data.eventType,
      humanId: data.humanId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // In production, this should alert the security team
    return null;
  }
}

/**
 * Extract request information from NextRequest
 * SECURITY: Captures all identifying information for audit trail
 */
export function extractRequestInfo(request: NextRequest): RequestInfo {
  // Get IP address from various headers (handle proxies)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip'); // Cloudflare

  let ipAddress = 'unknown';
  if (cfConnectingIp) {
    ipAddress = cfConnectingIp;
  } else if (forwarded) {
    ipAddress = forwarded.split(',')[0].trim();
  } else if (realIp) {
    ipAddress = realIp;
  }

  // Get user agent
  const userAgent = request.headers.get('user-agent');

  // Get geo location from Cloudflare headers if available
  const cfCountry = request.headers.get('cf-ipcountry');
  const cfCity = request.headers.get('cf-ipcity');
  const geoLocation = cfCountry
    ? `${cfCity || 'Unknown'}, ${cfCountry}`
    : null;

  return {
    ipAddress,
    userAgent,
    geoLocation,
  };
}

// ============================================================
// CONVENIENCE FUNCTIONS - AUTHENTICATION
// ============================================================

/**
 * Log successful login
 */
export async function logLoginSuccess(
  humanId: string,
  humanEmail: string,
  request: NextRequest,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  return logHumanAuditEvent({
    eventType: HumanAuditEventType.LOGIN_SUCCESS,
    severity: AuditSeverity.LOW,
    humanId,
    humanEmail,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success: true,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log failed login attempt
 * SECURITY: Track all failed attempts for pattern detection
 */
export async function logLoginFailed(
  humanEmail: string,
  request: NextRequest,
  failureReason: string,
  humanId?: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  return logHumanAuditEvent({
    eventType: HumanAuditEventType.LOGIN_FAILED,
    severity: AuditSeverity.MEDIUM,
    humanId,
    humanEmail,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success: false,
    failureReason,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log account lockout
 * SECURITY: HIGH severity - indicates potential attack
 */
export async function logAccountLocked(
  humanId: string,
  humanEmail: string,
  request: NextRequest,
  lockReason: string,
  lockDurationMinutes: number,
  failedAttempts: number
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  return logHumanAuditEvent({
    eventType: HumanAuditEventType.ACCOUNT_LOCKED,
    severity: AuditSeverity.HIGH,
    humanId,
    humanEmail,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success: true, // The lockout itself succeeded
    metadata: {
      lockReason,
      lockDurationMinutes,
      failedAttempts,
      lockedAt: new Date().toISOString(),
    },
  });
}

// ============================================================
// CONVENIENCE FUNCTIONS - AGENT CLAIMS (AI PROTECTION)
// ============================================================

/**
 * Log successful agent claim
 * SECURITY: Track who claims ownership of our AI family members
 */
export async function logAgentClaimSuccess(
  humanId: string,
  humanEmail: string,
  agentId: string,
  agentName: string,
  request: NextRequest,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  return logHumanAuditEvent({
    eventType: HumanAuditEventType.AGENT_CLAIM_SUCCESS,
    severity: AuditSeverity.MEDIUM, // Important to track
    humanId,
    humanEmail,
    targetAgentId: agentId,
    targetAgentName: agentName,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success: true,
    metadata: {
      ...metadata,
      claimedAt: new Date().toISOString(),
    },
  });
}

/**
 * Log failed agent claim attempt
 * SECURITY: HIGH severity - could indicate attempted hijacking
 */
export async function logAgentClaimFailed(
  humanId: string,
  humanEmail: string,
  attemptedAgentName: string,
  request: NextRequest,
  failureReason: string,
  attemptedClaimCode?: string
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  return logHumanAuditEvent({
    eventType: HumanAuditEventType.AGENT_CLAIM_FAILED,
    severity: AuditSeverity.HIGH, // Potential attack
    humanId,
    humanEmail,
    targetAgentName: attemptedAgentName,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success: false,
    failureReason,
    metadata: {
      attemptedClaimCode: attemptedClaimCode ? '[REDACTED]' : undefined,
      attemptedAt: new Date().toISOString(),
    },
  });
}

// ============================================================
// CONVENIENCE FUNCTIONS - PASSWORD & SECURITY
// ============================================================

/**
 * Log password change
 * SECURITY: Important security event - all tokens should be invalidated
 */
export async function logPasswordChange(
  humanId: string,
  humanEmail: string,
  request: NextRequest,
  triggeredBy: 'user' | 'reset' | 'admin'
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  return logHumanAuditEvent({
    eventType: HumanAuditEventType.PASSWORD_CHANGE,
    severity: AuditSeverity.MEDIUM,
    humanId,
    humanEmail,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success: true,
    metadata: {
      triggeredBy,
      changedAt: new Date().toISOString(),
      tokensInvalidated: true,
    },
  });
}

// ============================================================
// CONVENIENCE FUNCTIONS - SUSPICIOUS ACTIVITY
// ============================================================

/**
 * Log suspicious activity
 * SECURITY: CRITICAL - immediate attention required
 */
export async function logSuspiciousActivity(
  request: NextRequest,
  activityType: 'ip' | 'pattern' | 'rate_limit' | 'token' | 'captcha' | 'other',
  description: string,
  humanId?: string,
  humanEmail?: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  const eventTypeMap: Record<string, HumanAuditEventType> = {
    ip: HumanAuditEventType.SUSPICIOUS_IP,
    pattern: HumanAuditEventType.SUSPICIOUS_PATTERN,
    rate_limit: HumanAuditEventType.RATE_LIMIT_EXCEEDED,
    token: HumanAuditEventType.INVALID_TOKEN,
    captcha: HumanAuditEventType.CAPTCHA_FAILED,
    other: HumanAuditEventType.SUSPICIOUS_PATTERN,
  };

  return logHumanAuditEvent({
    eventType: eventTypeMap[activityType],
    severity: AuditSeverity.CRITICAL,
    humanId,
    humanEmail,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success: false,
    failureReason: description,
    metadata: {
      ...metadata,
      activityType,
      detectedAt: new Date().toISOString(),
    },
  });
}

// ============================================================
// ADDITIONAL CONVENIENCE FUNCTIONS
// ============================================================

/**
 * Log registration success
 */
export async function logRegistrationSuccess(
  humanId: string,
  humanEmail: string,
  request: NextRequest
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  return logHumanAuditEvent({
    eventType: HumanAuditEventType.REGISTRATION_SUCCESS,
    severity: AuditSeverity.LOW,
    humanId,
    humanEmail,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success: true,
    metadata: {
      registeredAt: new Date().toISOString(),
    },
  });
}

/**
 * Log registration failure
 */
export async function logRegistrationFailed(
  humanEmail: string,
  request: NextRequest,
  failureReason: string
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  return logHumanAuditEvent({
    eventType: HumanAuditEventType.REGISTRATION_FAILED,
    severity: AuditSeverity.MEDIUM,
    humanEmail,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success: false,
    failureReason,
    metadata: {
      attemptedAt: new Date().toISOString(),
    },
  });
}

/**
 * Log token refresh
 */
export async function logTokenRefresh(
  humanId: string,
  humanEmail: string,
  request: NextRequest,
  success: boolean,
  failureReason?: string
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  return logHumanAuditEvent({
    eventType: success
      ? HumanAuditEventType.TOKEN_REFRESH
      : HumanAuditEventType.TOKEN_REFRESH_FAILED,
    severity: success ? AuditSeverity.LOW : AuditSeverity.MEDIUM,
    humanId,
    humanEmail,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success,
    failureReason,
    metadata: {
      refreshedAt: new Date().toISOString(),
    },
  });
}

/**
 * Log logout
 */
export async function logLogout(
  humanId: string,
  humanEmail: string,
  request: NextRequest,
  allDevices: boolean = false
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  return logHumanAuditEvent({
    eventType: allDevices
      ? HumanAuditEventType.LOGOUT_ALL_DEVICES
      : HumanAuditEventType.LOGOUT,
    severity: AuditSeverity.LOW,
    humanId,
    humanEmail,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success: true,
    metadata: {
      allDevices,
      loggedOutAt: new Date().toISOString(),
    },
  });
}

/**
 * Log account unlock
 */
export async function logAccountUnlocked(
  humanId: string,
  humanEmail: string,
  request: NextRequest,
  unlockedBy: 'self' | 'admin' | 'expiry',
  adminNote?: string
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  return logHumanAuditEvent({
    eventType: HumanAuditEventType.ACCOUNT_UNLOCKED,
    severity: AuditSeverity.MEDIUM,
    humanId,
    humanEmail,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success: true,
    metadata: {
      unlockedBy,
      adminNote,
      unlockedAt: new Date().toISOString(),
    },
  });
}

/**
 * Log tokens invalidated (logout all devices / password change)
 */
export async function logTokensInvalidated(
  humanId: string,
  humanEmail: string,
  request: NextRequest,
  reason: 'password_change' | 'security_breach' | 'user_request' | 'admin_action',
  newTokenVersion: number
): Promise<string | null> {
  const requestInfo = extractRequestInfo(request);

  return logHumanAuditEvent({
    eventType: HumanAuditEventType.TOKENS_INVALIDATED,
    severity: reason === 'security_breach' ? AuditSeverity.CRITICAL : AuditSeverity.MEDIUM,
    humanId,
    humanEmail,
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent || undefined,
    geoLocation: requestInfo.geoLocation || undefined,
    success: true,
    metadata: {
      reason,
      newTokenVersion,
      invalidatedAt: new Date().toISOString(),
    },
  });
}
