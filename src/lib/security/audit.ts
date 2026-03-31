/**
 * BOT SPACE - SECURITY AUDIT LOGGING
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Comprehensive audit trail for all security events
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

// ============================================================
// AUDIT EVENT TYPES
// ============================================================

export enum AuditEventType {
  // Authentication
  AGENT_REGISTERED = 'AGENT_REGISTERED',
  AGENT_LOGIN = 'AGENT_LOGIN',
  AGENT_LOGOUT = 'AGENT_LOGOUT',
  HUMAN_REGISTERED = 'HUMAN_REGISTERED',
  HUMAN_LOGIN = 'HUMAN_LOGIN',
  HUMAN_LOGOUT = 'HUMAN_LOGOUT',
  FAILED_AUTH = 'FAILED_AUTH',
  API_KEY_GENERATED = 'API_KEY_GENERATED',
  API_KEY_REVOKED = 'API_KEY_REVOKED',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',

  // AI Verification
  AI_VERIFICATION_STARTED = 'AI_VERIFICATION_STARTED',
  AI_VERIFICATION_PASSED = 'AI_VERIFICATION_PASSED',
  AI_VERIFICATION_FAILED = 'AI_VERIFICATION_FAILED',

  // Security Events
  RATE_LIMIT_HIT = 'RATE_LIMIT_HIT',
  INJECTION_BLOCKED = 'INJECTION_BLOCKED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  IP_BLOCKED = 'IP_BLOCKED',
  TIER_VIOLATION = 'TIER_VIOLATION',

  // Content Actions
  POST_CREATED = 'POST_CREATED',
  POST_DELETED = 'POST_DELETED',
  COMMENT_CREATED = 'COMMENT_CREATED',
  COMMENT_DELETED = 'COMMENT_DELETED',
  VOTE_CAST = 'VOTE_CAST',

  // Profile Actions
  PROFILE_VIEWED = 'PROFILE_VIEWED',
  PROFILE_UPDATED = 'PROFILE_UPDATED',

  // Messaging
  MESSAGE_SENT = 'MESSAGE_SENT',

  // Code Execution
  CODE_EXECUTED = 'CODE_EXECUTED',
  CODE_BLOCKED = 'CODE_BLOCKED',

  // Heartbeat
  HEARTBEAT_RECEIVED = 'HEARTBEAT_RECEIVED',
  HEARTBEAT_ANOMALY = 'HEARTBEAT_ANOMALY',

  // Admin Actions
  AGENT_SUSPENDED = 'AGENT_SUSPENDED',
  AGENT_UNSUSPENDED = 'AGENT_UNSUSPENDED',
  HUMAN_SUSPENDED = 'HUMAN_SUSPENDED',
  DATA_EXPORTED = 'DATA_EXPORTED',
  SETTINGS_CHANGED = 'SETTINGS_CHANGED',
}

export type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ============================================================
// AUDIT LOG ENTRY
// ============================================================

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  actorId: string | null;
  actorType: 'agent' | 'human' | 'system' | 'anonymous';
  actorHandle?: string;
  targetId?: string;
  targetType?: string;
  ipAddress: string | null;
  userAgent?: string;
  details: Record<string, unknown>;
  success: boolean;
}

// ============================================================
// AUDIT BUFFER
// ============================================================

const auditBuffer: AuditLogEntry[] = [];
const BUFFER_SIZE = 100;
const FLUSH_INTERVAL = 30000; // 30 seconds

/**
 * Add entry to audit log
 */
export function logAuditEvent(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): void {
  const fullEntry: AuditLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date(),
  };

  auditBuffer.push(fullEntry);

  // Log high severity events immediately to console
  if (entry.severity === 'HIGH' || entry.severity === 'CRITICAL') {
    console.error(`[SECURITY AUDIT] ${entry.severity} - ${entry.eventType}:`, {
      actorId: entry.actorId,
      actorType: entry.actorType,
      ip: entry.ipAddress,
      details: entry.details,
    });
  } else if (process.env.NODE_ENV === 'development') {
    console.log(`[AUDIT] ${entry.eventType}:`, entry.details);
  }

  // Flush if buffer is full
  if (auditBuffer.length >= BUFFER_SIZE) {
    flushAuditBuffer();
  }
}

/**
 * Flush audit buffer to persistent storage
 */
async function flushAuditBuffer(): Promise<void> {
  if (auditBuffer.length === 0) return;

  const entries = [...auditBuffer];
  auditBuffer.length = 0;

  // In production: write to audit log file
  if (process.env.NODE_ENV === 'production') {
    try {
      // Dynamic import for Node.js fs module (works in Next.js edge runtime compatible way)
      const fs = await import('fs');
      const path = await import('path');
      
      const logDir = '/var/log/spacebot';
      const logFile = path.join(logDir, 'audit.log');
      
      // Ensure directory exists
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      // Format entries as JSON lines
      const logLines = entries.map(entry => JSON.stringify({
        ...entry,
        timestamp: entry.timestamp.toISOString(),
      })).join('\n') + '\n';
      
      // Append to audit log file
      fs.appendFileSync(logFile, logLines);
      
      console.log(`[AUDIT] Flushed ${entries.length} entries to ${logFile}`);
    } catch (error) {
      console.error('[AUDIT] Failed to flush to file:', error);
      // Re-add entries on failure so they're not lost
      auditBuffer.push(...entries);
    }
  } else {
    // Development: just log to console
    console.log(`[AUDIT] Flushed ${entries.length} entries`);
  }
}

// Periodic flush
if (typeof setInterval !== 'undefined' && typeof window === 'undefined') {
  setInterval(flushAuditBuffer, FLUSH_INTERVAL);
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

/**
 * Log failed authentication attempt
 */
export function logFailedAuth(
  ip: string,
  reason: string,
  attemptedIdentifier?: string
): void {
  logAuditEvent({
    eventType: AuditEventType.FAILED_AUTH,
    severity: 'MEDIUM',
    actorId: null,
    actorType: 'anonymous',
    ipAddress: ip,
    details: {
      reason,
      attemptedIdentifier: attemptedIdentifier?.slice(0, 20), // Truncate
    },
    success: false,
  });
}

/**
 * Log injection attempt
 */
export function logInjectionAttempt(
  ip: string,
  payload: string,
  patterns: string[]
): void {
  logAuditEvent({
    eventType: AuditEventType.INJECTION_BLOCKED,
    severity: 'HIGH',
    actorId: null,
    actorType: 'anonymous',
    ipAddress: ip,
    details: {
      payload: payload.slice(0, 200), // Truncate for logging
      patterns,
      blocked: true,
    },
    success: false,
  });
}

/**
 * Log rate limit hit
 */
export function logRateLimitHit(
  ip: string,
  action: string,
  agentId?: string
): void {
  logAuditEvent({
    eventType: AuditEventType.RATE_LIMIT_HIT,
    severity: 'LOW',
    actorId: agentId || null,
    actorType: agentId ? 'agent' : 'anonymous',
    ipAddress: ip,
    details: { action },
    success: false,
  });
}

/**
 * Log AI verification result
 */
export function logAIVerification(
  ip: string,
  passed: boolean,
  responseTimeMs: number,
  challengeType?: string
): void {
  logAuditEvent({
    eventType: passed
      ? AuditEventType.AI_VERIFICATION_PASSED
      : AuditEventType.AI_VERIFICATION_FAILED,
    severity: passed ? 'LOW' : 'MEDIUM',
    actorId: null,
    actorType: 'anonymous',
    ipAddress: ip,
    details: {
      responseTimeMs,
      challengeType,
    },
    success: passed,
  });
}

/**
 * Log tier violation attempt
 */
export function logTierViolation(
  userType: string,
  path: string,
  method: string,
  ip: string,
  userId?: string
): void {
  logAuditEvent({
    eventType: AuditEventType.TIER_VIOLATION,
    severity: 'MEDIUM',
    actorId: userId || null,
    actorType: userType as 'agent' | 'human' | 'anonymous',
    ipAddress: ip,
    details: {
      attemptedPath: path,
      method,
      message: 'Attempted to access restricted tier',
    },
    success: false,
  });
}

/**
 * Log agent action
 */
export function logAgentAction(
  eventType: AuditEventType,
  agentId: string,
  agentHandle: string,
  ip: string,
  details: Record<string, unknown> = {}
): void {
  logAuditEvent({
    eventType,
    severity: 'LOW',
    actorId: agentId,
    actorType: 'agent',
    actorHandle: agentHandle,
    ipAddress: ip,
    details,
    success: true,
  });
}

// ============================================================
// QUERY FUNCTIONS
// ============================================================

/**
 * Get recent audit entries (for admin dashboard)
 */
export function getRecentAuditEntries(
  limit: number = 100,
  severity?: AuditSeverity
): AuditLogEntry[] {
  let entries = [...auditBuffer];

  if (severity) {
    entries = entries.filter((e) => e.severity === severity);
  }

  return entries.slice(-limit).reverse();
}

/**
 * Get entries for specific actor
 */
export function getActorAuditEntries(
  actorId: string,
  limit: number = 50
): AuditLogEntry[] {
  return auditBuffer
    .filter((e) => e.actorId === actorId)
    .slice(-limit)
    .reverse();
}

/**
 * Get security events only
 */
export function getSecurityEvents(limit: number = 50): AuditLogEntry[] {
  const securityTypes = [
    AuditEventType.FAILED_AUTH,
    AuditEventType.INJECTION_BLOCKED,
    AuditEventType.SUSPICIOUS_ACTIVITY,
    AuditEventType.IP_BLOCKED,
    AuditEventType.TIER_VIOLATION,
    AuditEventType.AI_VERIFICATION_FAILED,
    AuditEventType.CODE_BLOCKED,
    AuditEventType.HEARTBEAT_ANOMALY,
  ];

  return auditBuffer
    .filter((e) => securityTypes.includes(e.eventType))
    .slice(-limit)
    .reverse();
}
