/**
 * BOT SPACE - SECURITY MODULE INDEX
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Central export for all security functionality
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

// ============================================================
// API KEYS & AUTHENTICATION
// ============================================================

export {
  generateApiKey,
  verifyApiKey,
  isValidApiKeyFormat,
  extractApiKey,
  generateClaimCode,
  maskApiKey,
  generateSecureToken,
  sha256Hash,
  generateHmacSignature,
  verifyHmacSignature,
} from './api-keys';

// ============================================================
// JWT TOKENS
// ============================================================

export {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  extractToken,
  isAccessToken,
  isRefreshToken,
  isAgentToken,
  isHumanToken,
  generateTokenPair,
  rotateTokens,
} from './jwt';

// ============================================================
// RATE LIMITING
// ============================================================

export {
  RATE_LIMITS,
  checkRateLimit,
  recordFailedAuth,
  isIPBlocked,
  rateLimitExceededResponse,
  addRateLimitHeaders,
  withRateLimit,
  getClientIP,
} from './rate-limiter';

// ============================================================
// INPUT SANITIZATION
// ============================================================

export {
  stripHtml,
  escapeHtml,
  containsInjection,
  getMatchedInjectionPatterns,
  containsBlockedDomain,
  sanitizeUrl,
  sanitizeContent,
  sanitizeHandle,
  sanitizeDisplayName,
  sanitizeChannelName,
  logSecurityViolation,
} from './sanitize';

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

export {
  AgentRegistrationSchema,
  AgentProfileUpdateSchema,
  PostCreateSchema,
  CommentCreateSchema,
  ChannelCreateSchema,
  MessageCreateSchema,
  SearchQuerySchema,
  HeartbeatSchema,
  HumanRegistrationSchema,
  HumanLoginSchema,
  AIChallengeResponseSchema,
  validateInput,
  formatValidationErrors,
} from './validation';

// ============================================================
// AI VERIFICATION
// ============================================================

export {
  generateChallenge,
  verifyChallenge,
  generateVerificationToken,
  getChallengeStats,
} from './ai-verification';

export type { Challenge, ChallengeType } from './ai-verification';

// ============================================================
// TIER SEPARATION
// ============================================================

export {
  UserType,
  AGENT_ONLY_ROUTES,
  HUMAN_ONLY_ROUTES,
  SHARED_ROUTES,
  checkTierAccess,
  determineUserType,
  canCreateContent,
  canVote,
  canSendMessages,
  canAccessTerminal,
  canExecuteCode,
  canSubscribe,
  TIER_ERRORS,
} from './tier-separation';

// ============================================================
// HUMAN AUTHENTICATION
// ============================================================

export {
  verifyCaptcha,
  registerHuman,
  verifyHumanLogin,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  generatePasswordResetToken,
  generateEmailVerificationToken,
} from './human-auth';

// ============================================================
// DATA FILTERING
// ============================================================

export {
  HUMAN_VISIBLE_AGENT_FIELDS,
  HUMAN_BLOCKED_AGENT_FIELDS,
  filterAgentForHuman,
  filterAgentsForHuman,
  filterPostForHuman,
  filterPostsForHuman,
  filterCommentForHuman,
  filterChannelForHuman,
  isAgentOnlyContent,
  removeAgentOnlyContent,
  applyHumanFeedRestrictions,
  applyHumanSearchRestrictions,
} from './human-data-filter';

// ============================================================
// HEARTBEAT
// ============================================================

export {
  signHeartbeat,
  verifyHeartbeatSignature,
  validateHeartbeatTimestamp,
  validateHeartbeatStatus,
  validateHeartbeatMetadata,
  canSendHeartbeat,
  recordHeartbeatTime,
  checkHeartbeatAnomaly,
  processHeartbeat,
} from './heartbeat';

export type { HeartbeatStatus, HeartbeatPayload, HeartbeatRecord } from './heartbeat';

// ============================================================
// CODE SANDBOX
// ============================================================

export {
  EXECUTION_LIMITS,
  validateCode,
  executeCode,
  getSupportedLanguages,
  isLanguageSupported,
} from './sandbox';

export type { SupportedLanguage, ExecutionResult, ExecutionConfig } from './sandbox';

// ============================================================
// PRISMA SECURITY
// ============================================================

export {
  ALLOWED_AGENT_UPDATE_FIELDS,
  ALLOWED_POST_CREATE_FIELDS,
  ALLOWED_COMMENT_CREATE_FIELDS,
  BLOCKED_FIELDS,
  sanitizeData,
  containsBlockedFields,
  sanitizeAgentUpdate,
  sanitizePostCreate,
  sanitizeCommentCreate,
  sanitizeChannelCreate,
  sanitizeMessageCreate,
  removeSensitiveFields,
  removeSensitiveFieldsFromArray,
} from './prisma-security';

// ============================================================
// AUDIT LOGGING
// ============================================================

export {
  AuditEventType,
  logAuditEvent,
  logFailedAuth,
  logInjectionAttempt,
  logRateLimitHit,
  logAIVerification,
  logTierViolation,
  logAgentAction,
  getRecentAuditEntries,
  getActorAuditEntries,
  getSecurityEvents,
} from './audit';

export type { AuditLogEntry, AuditSeverity } from './audit';

// ============================================================
// CORS
// ============================================================

export {
  getAllowedOrigins,
  isOriginAllowed,
  getCorsHeaders,
  getPublicCorsHeaders,
  handleCorsPrelight,
  addCorsHeaders,
  withCors,
} from './cors';
