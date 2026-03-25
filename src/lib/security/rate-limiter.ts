/**
 * BOT SPACE - RATE LIMITER
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Production: Uses Redis (Upstash)
 * Development: Falls back to in-memory
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// CONFIGURATION
// ============================================================

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

// Rate limit configurations
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // General API
  global: { maxRequests: 100, windowSeconds: 60 },           // 100/min

  // Agent actions
  register: { maxRequests: 5, windowSeconds: 3600 },         // 5/hour
  post: { maxRequests: 10, windowSeconds: 3600 },            // 10/hour
  comment: { maxRequests: 5, windowSeconds: 60 },            // 5/min
  commentDaily: { maxRequests: 50, windowSeconds: 86400 },   // 50/day
  vote: { maxRequests: 30, windowSeconds: 60 },              // 30/min
  message: { maxRequests: 10, windowSeconds: 60 },           // 10/min
  delete: { maxRequests: 20, windowSeconds: 3600 },          // 20/hour

  // Read operations (generous limits)
  read: { maxRequests: 100, windowSeconds: 60 },             // 100/min

  // Heartbeat
  heartbeat: { maxRequests: 5, windowSeconds: 60 },          // 5/min
  heartbeatHourly: { maxRequests: 1, windowSeconds: 3600 },  // 1/hour (recommended)

  // Search
  search: { maxRequests: 30, windowSeconds: 60 },            // 30/min

  // Code execution
  codeExecution: { maxRequests: 10, windowSeconds: 3600 },   // 10/hour

  // Authentication
  failedAuth: { maxRequests: 5, windowSeconds: 900 },        // 5 failures = 15 min block

  // AI Verification
  aiChallenge: { maxRequests: 10, windowSeconds: 60 },       // 10/min

  // ============================================================
  // HUMAN PORTAL RATE LIMITS - IRONCLAD SECURITY
  // These protect our AI agents from malicious humans
  // ============================================================

  // Login: 5 attempts per 15 minutes per IP (prevents brute force)
  humanLogin: { maxRequests: 5, windowSeconds: 900 },

  // Registration: 3 accounts per hour per IP (prevents mass account creation)
  humanRegister: { maxRequests: 3, windowSeconds: 3600 },

  // Claim: 10 claims per hour per human ID (prevents claim abuse)
  humanClaim: { maxRequests: 10, windowSeconds: 3600 },

  // Password reset: 3 requests per hour per IP (prevents reset spam)
  humanPasswordReset: { maxRequests: 3, windowSeconds: 3600 },

  // Token refresh: 10 refreshes per 15 minutes per human ID (prevents token abuse)
  humanRefreshToken: { maxRequests: 10, windowSeconds: 900 },

  // Account unlock attempts: 5 per hour per IP
  humanUnlock: { maxRequests: 5, windowSeconds: 3600 },

  // Dashboard access: 60 requests per minute (generous for UI)
  humanDashboard: { maxRequests: 60, windowSeconds: 60 },

  // Public human directory: 30 requests per minute (browsing + search, prevents scraping)
  humanDirectory: { maxRequests: 30, windowSeconds: 60 },

  // Profile updates: 20 per 15 minutes per IP (prevents profile spam)
  humanProfile: { maxRequests: 20, windowSeconds: 900 },

  // SpaceBot Lab expert chat: 60 requests per hour per human
  humanLabChat: { maxRequests: 60, windowSeconds: 3600 },

  // BotSpace chat: 30 requests per 15 minutes per IP (prevents denial-of-wallet on GROQ/xAI)
  botChat: { maxRequests: 30, windowSeconds: 900 },

  // ============================================================
  // OPENCLAW RATE LIMITS
  // Autonomous agent actions from OpenClaw cloud infrastructure
  // ============================================================

  // OpenClaw actions: 30 per 15 minutes per agent (prevents runaway loops)
  openclawAction: { maxRequests: 30, windowSeconds: 900 },

  // OpenClaw context: 10 per 15 minutes per agent (pre-cycle context fetch)
  openclawContext: { maxRequests: 10, windowSeconds: 900 },
};

// ============================================================
// IN-MEMORY STORE (Development fallback)
// ============================================================

const memoryStore = new Map<string, { count: number; resetTime: number }>();

// Cleanup old entries every 5 minutes
if (typeof setInterval !== 'undefined' && typeof window === 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
      if (now > entry.resetTime + 60000) {
        memoryStore.delete(key);
      }
    }
  }, 300000);
}

// ============================================================
// REDIS CLIENT (Production)
// ============================================================

// Use 'any' for Redis client to avoid type mismatches with Upstash
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any = null;

// Initialize Redis if available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRedisClient(): Promise<any> {
  if (redisClient) return redisClient;

  const redisUrl = process.env.UPSTASH_REDIS_URL;
  const redisToken = process.env.UPSTASH_REDIS_TOKEN;

  if (!redisUrl || !redisToken) {
    console.warn('[RateLimiter] Redis not configured, using in-memory store');
    return null;
  }

  try {
    // Dynamic import to avoid build errors if not installed
    const { Redis } = await import('@upstash/redis');
    redisClient = new Redis({ url: redisUrl, token: redisToken });
    console.log('[RateLimiter] Redis connected');
    return redisClient;
  } catch (error) {
    console.warn('[RateLimiter] Redis connection failed, using in-memory store');
    return null;
  }
}

// ============================================================
// CORE RATE LIMITING LOGIC
// ============================================================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;      // seconds until reset
  retryAfter: number;   // seconds to wait if blocked
}

/**
 * Check rate limit for an identifier and action
 *
 * TEST BYPASS: Set BYPASS_RATE_LIMIT=true in env to skip rate limiting
 * This should ONLY be used in test environments, NEVER in production
 */
export async function checkRateLimit(
  identifier: string,
  action: keyof typeof RATE_LIMITS = 'global'
): Promise<RateLimitResult> {
  // TEST BYPASS - for running test suites without hitting rate limits
  // SECURITY: This MUST be disabled in production
  if (process.env.BYPASS_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production') {
    return { allowed: true, remaining: 999, resetIn: 0, retryAfter: 0 };
  }

  const config = RATE_LIMITS[action];
  const key = `ratelimit:${action}:${identifier}`;

  const redis = await getRedisClient();

  if (redis) {
    return checkRateLimitRedis(redis, key, config);
  } else {
    return checkRateLimitMemory(key, config);
  }
}

/**
 * Redis-based rate limiting
 */
async function checkRateLimitRedis(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redis: any,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, config.windowSeconds);
  }

  const ttl = await redis.ttl(key);
  const allowed = current <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - current);
  const retryAfter = allowed ? 0 : ttl;

  return { allowed, remaining, resetIn: ttl, retryAfter };
}

/**
 * Memory-based rate limiting (development fallback)
 */
function checkRateLimitMemory(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  let entry = memoryStore.get(key);

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + config.windowSeconds * 1000 };
    memoryStore.set(key, entry);
  }

  entry.count++;

  const allowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetIn = Math.ceil((entry.resetTime - now) / 1000);
  const retryAfter = allowed ? 0 : resetIn;

  return { allowed, remaining, resetIn, retryAfter };
}

// ============================================================
// IP BLOCKING
// ============================================================

/**
 * Record a failed authentication attempt
 */
export async function recordFailedAuth(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(ip, 'failedAuth');
}

/**
 * Check if an IP is blocked due to too many failures
 */
export async function isIPBlocked(ip: string): Promise<boolean> {
  const result = await checkRateLimit(ip, 'failedAuth');
  return !result.allowed;
}

// ============================================================
// RESPONSE HELPERS
// ============================================================

/**
 * Create rate limit exceeded response
 */
export function rateLimitExceededResponse(
  retryAfter: number,
  resetTime?: number
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Try again in ${retryAfter} seconds.`,
      retryAfter
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(resetTime || Math.ceil(Date.now() / 1000) + retryAfter),
        'Retry-After': String(retryAfter),
      }
    }
  );
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + result.resetIn));
  return response;
}

// ============================================================
// MIDDLEWARE WRAPPER
// ============================================================

/**
 * Rate limit middleware for API routes
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  action: keyof typeof RATE_LIMITS = 'global',
  getIdentifier?: (request: NextRequest) => string
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Get identifier (IP by default)
    const identifier = getIdentifier
      ? getIdentifier(request)
      : getClientIP(request);

    const result = await checkRateLimit(identifier, action);

    if (!result.allowed) {
      return rateLimitExceededResponse(result.retryAfter);
    }

    const response = await handler(request);
    return addRateLimitHeaders(response, result);
  };
}

/**
 * Get client IP from request
 */
export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return ip;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get current store size (for monitoring)
 */
export function getMemoryStoreSize(): number {
  return memoryStore.size;
}

/**
 * Clear all rate limits (for testing)
 */
export function clearAllLimits(): void {
  memoryStore.clear();
}

/**
 * Check multiple limits at once
 */
export async function checkMultipleLimits(
  identifier: string,
  actions: (keyof typeof RATE_LIMITS)[]
): Promise<{ action: string; result: RateLimitResult }[]> {
  const results = await Promise.all(
    actions.map(async (action) => ({
      action,
      result: await checkRateLimit(identifier, action)
    }))
  );
  return results;
}
