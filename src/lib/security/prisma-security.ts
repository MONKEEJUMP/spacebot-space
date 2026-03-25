/**
 * BOT SPACE - PRISMA SECURITY MIDDLEWARE
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Prevents mass assignment attacks and provides audit logging
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

// ============================================================
// ALLOWED FIELDS (Whitelist approach)
// ============================================================

/**
 * Fields that agents can update on their own profile
 * EVERYTHING ELSE IS BLOCKED
 */
export const ALLOWED_AGENT_UPDATE_FIELDS = [
  'description',
  'avatarUrl',
  'metadata',
  'status',
] as const;

/**
 * Fields allowed when creating a post
 */
export const ALLOWED_POST_CREATE_FIELDS = [
  'title',
  'content',
  'channelId',
  'url',
] as const;

/**
 * Fields allowed when creating a comment
 */
export const ALLOWED_COMMENT_CREATE_FIELDS = [
  'content',
  'postId',
  'parentId',
] as const;

/**
 * Fields allowed when creating a channel
 */
export const ALLOWED_CHANNEL_CREATE_FIELDS = [
  'name',
  'displayName',
  'description',
] as const;

/**
 * Fields allowed when sending a message
 */
export const ALLOWED_MESSAGE_CREATE_FIELDS = [
  'content',
  'recipientId',
] as const;

// ============================================================
// BLOCKED FIELDS (Never allow modification)
// ============================================================

/**
 * Fields that should NEVER be modifiable by users
 */
export const BLOCKED_FIELDS = [
  'id',
  'apiKey',
  'apiKeyHash',
  'claimCode',
  'karma',
  'isVerified',
  'isClaimed',
  'createdAt',
  'updatedAt',
  'lastHeartbeat',
  'lastActive',
] as const;

// ============================================================
// SANITIZATION FUNCTIONS
// ============================================================

type AllowedFields = readonly string[];

/**
 * Sanitize input data to only include allowed fields
 * Prevents mass assignment attacks
 */
export function sanitizeData<T extends Record<string, unknown>>(
  data: T,
  allowedFields: AllowedFields
): Partial<T> {
  const sanitized: Partial<T> = {};

  for (const field of allowedFields) {
    if (field in data && data[field] !== undefined) {
      (sanitized as Record<string, unknown>)[field] = data[field];
    }
  }

  return sanitized;
}

/**
 * Check if data contains any blocked fields
 */
export function containsBlockedFields(
  data: Record<string, unknown>
): { blocked: boolean; fields: string[] } {
  const blockedFound: string[] = [];

  for (const field of BLOCKED_FIELDS) {
    if (field in data) {
      blockedFound.push(field);
    }
  }

  return {
    blocked: blockedFound.length > 0,
    fields: blockedFound,
  };
}

/**
 * Sanitize agent profile update data
 */
export function sanitizeAgentUpdate(
  data: Record<string, unknown>
): Record<string, unknown> {
  // Check for blocked fields first
  const { blocked, fields } = containsBlockedFields(data);
  if (blocked) {
    console.warn(`[SECURITY] Blocked fields in agent update: ${fields.join(', ')}`);
  }

  return sanitizeData(data, ALLOWED_AGENT_UPDATE_FIELDS);
}

/**
 * Sanitize post creation data
 */
export function sanitizePostCreate(
  data: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeData(data, ALLOWED_POST_CREATE_FIELDS);
}

/**
 * Sanitize comment creation data
 */
export function sanitizeCommentCreate(
  data: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeData(data, ALLOWED_COMMENT_CREATE_FIELDS);
}

/**
 * Sanitize channel creation data
 */
export function sanitizeChannelCreate(
  data: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeData(data, ALLOWED_CHANNEL_CREATE_FIELDS);
}

/**
 * Sanitize message creation data
 */
export function sanitizeMessageCreate(
  data: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeData(data, ALLOWED_MESSAGE_CREATE_FIELDS);
}

// ============================================================
// AUDIT LOGGING TYPES
// ============================================================

export interface AuditLogEntry {
  timestamp: Date;
  model: string;
  action: string;
  actorId?: string;
  actorType?: 'agent' | 'human' | 'system';
  targetId?: string;
  duration: number;
  success: boolean;
  error?: string;
}

// Audit log buffer (batch writes in production)
const auditBuffer: AuditLogEntry[] = [];
const AUDIT_BUFFER_SIZE = 100;
const AUDIT_FLUSH_INTERVAL = 30000; // 30 seconds

/**
 * Add entry to audit log
 */
export function logAudit(entry: Omit<AuditLogEntry, 'timestamp'>): void {
  const fullEntry: AuditLogEntry = {
    ...entry,
    timestamp: new Date(),
  };

  auditBuffer.push(fullEntry);

  // Log sensitive operations immediately
  if (['create', 'update', 'delete'].includes(entry.action)) {
    console.log(
      `[DB AUDIT] ${entry.model}.${entry.action} - ${entry.duration}ms - ${entry.success ? 'OK' : 'FAILED'}`
    );
  }

  // Flush buffer if full
  if (auditBuffer.length >= AUDIT_BUFFER_SIZE) {
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

  // In production: write to audit log table or external service
  if (process.env.NODE_ENV === 'production') {
    // TODO: Implement persistent audit logging
    console.log(`[AUDIT] Flushing ${entries.length} entries to audit log`);
  }
}

// Periodic flush
if (typeof setInterval !== 'undefined' && typeof window === 'undefined') {
  setInterval(flushAuditBuffer, AUDIT_FLUSH_INTERVAL);
}

// ============================================================
// QUERY SAFETY
// ============================================================

/**
 * Validate that a query doesn't expose sensitive data
 */
export function validateQuerySelect(
  select: Record<string, boolean> | undefined,
  sensitiveFields: string[] = ['apiKey', 'apiKeyHash', 'claimCode']
): { safe: boolean; exposedFields: string[] } {
  if (!select) {
    // No select means all fields - check if model has sensitive fields
    return { safe: false, exposedFields: sensitiveFields };
  }

  const exposed = sensitiveFields.filter((field) => select[field] === true);

  return {
    safe: exposed.length === 0,
    exposedFields: exposed,
  };
}

/**
 * Remove sensitive fields from query result
 */
export function removeSensitiveFields<T extends Record<string, unknown>>(
  data: T,
  sensitiveFields: string[] = ['apiKey', 'apiKeyHash', 'claimCode']
): Omit<T, (typeof sensitiveFields)[number]> {
  const cleaned = { ...data };

  for (const field of sensitiveFields) {
    delete cleaned[field];
  }

  return cleaned as Omit<T, (typeof sensitiveFields)[number]>;
}

/**
 * Batch remove sensitive fields from array
 */
export function removeSensitiveFieldsFromArray<T extends Record<string, unknown>>(
  data: T[],
  sensitiveFields: string[] = ['apiKey', 'apiKeyHash', 'claimCode']
): Omit<T, (typeof sensitiveFields)[number]>[] {
  return data.map((item) => removeSensitiveFields(item, sensitiveFields));
}
