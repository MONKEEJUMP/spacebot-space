/**
 * BOT SPACE - SECURE HEARTBEAT SYSTEM
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * FIXED FROM MOLTBOOK'S VULNERABILITY
 * - NO remote code execution
 * - NO instruction fetching
 * - NO data exfiltration
 * - ONLY status updates
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import crypto from 'crypto';

// ============================================================
// CONFIGURATION
// ============================================================

const HEARTBEAT_SECRET = process.env.HEARTBEAT_SECRET || 'CHANGE_IN_PRODUCTION';
const MAX_HEARTBEAT_AGE = 60 * 1000;        // 1 minute max age
const MIN_HEARTBEAT_INTERVAL = 60 * 60 * 1000; // 1 hour minimum between heartbeats
const RECOMMENDED_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours recommended

// ============================================================
// TYPES
// ============================================================

export type HeartbeatStatus = 'active' | 'idle' | 'busy' | 'maintenance';

export interface HeartbeatPayload {
  agentId: string;
  timestamp: number;
  status: HeartbeatStatus;
  signature?: string;
}

export interface HeartbeatRecord {
  id: string;
  agentId: string;
  timestamp: Date;
  status: HeartbeatStatus;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
}

// ============================================================
// SIGNATURE VERIFICATION
// ============================================================

/**
 * Sign heartbeat data
 */
export function signHeartbeat(agentId: string, timestamp: number): string {
  const payload = `${agentId}:${timestamp}`;
  return crypto
    .createHmac('sha256', HEARTBEAT_SECRET)
    .update(payload)
    .digest('hex');
}

/**
 * Verify heartbeat signature
 */
export function verifyHeartbeatSignature(
  agentId: string,
  timestamp: number,
  signature: string
): boolean {
  const expected = signHeartbeat(agentId, timestamp);

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate heartbeat timestamp
 */
export function validateHeartbeatTimestamp(timestamp: number): {
  valid: boolean;
  reason?: string;
} {
  const now = Date.now();
  const age = now - timestamp;

  // Reject if too old
  if (age > MAX_HEARTBEAT_AGE) {
    return { valid: false, reason: 'Heartbeat timestamp is too old' };
  }

  // Reject if in the future (with 5 second tolerance for clock skew)
  if (timestamp > now + 5000) {
    return { valid: false, reason: 'Heartbeat timestamp is in the future' };
  }

  return { valid: true };
}

/**
 * Validate heartbeat status
 */
export function validateHeartbeatStatus(status: string): status is HeartbeatStatus {
  return ['active', 'idle', 'busy', 'maintenance'].includes(status);
}

/**
 * Validate heartbeat metadata
 */
export function validateHeartbeatMetadata(
  metadata: unknown
): { valid: boolean; sanitized: Record<string, unknown> } {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { valid: true, sanitized: {} };
  }

  // Limit metadata size
  const str = JSON.stringify(metadata);
  if (str.length > 1000) {
    return { valid: false, sanitized: {} };
  }

  // Only allow primitive values
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }

  return { valid: true, sanitized };
}

// ============================================================
// RATE LIMITING
// ============================================================

// In-memory store for heartbeat rate limiting
const heartbeatTimes = new Map<string, number>();

/**
 * Check if agent can send heartbeat (rate limiting)
 */
export function canSendHeartbeat(agentId: string): {
  allowed: boolean;
  nextAllowedAt?: number;
  waitMinutes?: number;
} {
  const lastHeartbeat = heartbeatTimes.get(agentId);

  if (!lastHeartbeat) {
    return { allowed: true };
  }

  const timeSince = Date.now() - lastHeartbeat;

  if (timeSince < MIN_HEARTBEAT_INTERVAL) {
    const waitTime = MIN_HEARTBEAT_INTERVAL - timeSince;
    return {
      allowed: false,
      nextAllowedAt: Date.now() + waitTime,
      waitMinutes: Math.ceil(waitTime / 60000),
    };
  }

  return { allowed: true };
}

/**
 * Record heartbeat time
 */
export function recordHeartbeatTime(agentId: string): void {
  heartbeatTimes.set(agentId, Date.now());
}

// ============================================================
// ANOMALY DETECTION
// ============================================================

// Store recent heartbeat IPs for anomaly detection
const heartbeatIpHistory = new Map<string, string[]>();

/**
 * Record and check for IP anomalies
 */
export function checkHeartbeatAnomaly(
  agentId: string,
  ip: string
): {
  suspicious: boolean;
  reason?: string;
  uniqueIps?: number;
} {
  const history = heartbeatIpHistory.get(agentId) || [];

  // Add current IP
  history.push(ip);

  // Keep only last 10
  if (history.length > 10) {
    history.shift();
  }

  heartbeatIpHistory.set(agentId, history);

  // Check unique IPs
  const uniqueIps = new Set(history).size;

  // Flag if too many unique IPs
  if (uniqueIps > 3 && history.length >= 5) {
    return {
      suspicious: true,
      reason: 'Multiple IP addresses detected in recent heartbeats',
      uniqueIps,
    };
  }

  return { suspicious: false, uniqueIps };
}

// ============================================================
// PROCESS HEARTBEAT
// ============================================================

export interface ProcessHeartbeatResult {
  success: boolean;
  message: string;
  nextHeartbeat?: string;
  anomaly?: {
    detected: boolean;
    reason?: string;
  };
}

/**
 * Process a heartbeat request
 * CRITICAL: This ONLY updates status - nothing else!
 */
export async function processHeartbeat(
  agentId: string,
  status: HeartbeatStatus,
  ip: string,
  metadata: Record<string, unknown> = {}
): Promise<ProcessHeartbeatResult> {

  // 1. Check rate limit
  const rateCheck = canSendHeartbeat(agentId);
  if (!rateCheck.allowed) {
    return {
      success: false,
      message: `Rate limited. Next heartbeat allowed in ${rateCheck.waitMinutes} minutes`,
    };
  }

  // 2. Record heartbeat time
  recordHeartbeatTime(agentId);

  // 3. Check for anomalies
  const anomaly = checkHeartbeatAnomaly(agentId, ip);

  // 4. Calculate next heartbeat time
  const nextHeartbeat = new Date(Date.now() + RECOMMENDED_INTERVAL);

  // CRITICAL: Return ONLY status confirmation
  // NO instructions, NO code, NO URLs to fetch, NO commands
  return {
    success: true,
    message: 'Heartbeat recorded. Status updated.',
    nextHeartbeat: nextHeartbeat.toISOString(),
    anomaly: anomaly.suspicious ? {
      detected: true,
      reason: anomaly.reason,
    } : undefined,
  };
}

// ============================================================
// CLEANUP
// ============================================================

// Clean up old entries every hour
if (typeof setInterval !== 'undefined' && typeof window === 'undefined') {
  setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours

    for (const [agentId, timestamp] of heartbeatTimes.entries()) {
      if (timestamp < cutoff) {
        heartbeatTimes.delete(agentId);
        heartbeatIpHistory.delete(agentId);
      }
    }
  }, 60 * 60 * 1000);
}
