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

import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { extractAgentCredentialInput } from "@/lib/security/agent-credential-input";
import { getApiKeyLookupValue } from "@/lib/security/api-keys";
import {
  getSharedRateLimitStore,
  inspectSharedRateLimitStore,
  markSharedRateLimitStoreFailed,
} from "@/lib/security/rate-limit-store";

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
  global: { maxRequests: 100, windowSeconds: 60 }, // 100/min

  // Agent actions
  register: { maxRequests: 5, windowSeconds: 3600 }, // 5/hour
  claimCode: { maxRequests: 3, windowSeconds: 3600 }, // 3/hour per agent
  post: { maxRequests: 10, windowSeconds: 3600 }, // 10/hour
  comment: { maxRequests: 5, windowSeconds: 60 }, // 5/min
  commentDaily: { maxRequests: 50, windowSeconds: 86400 }, // 50/day
  vote: { maxRequests: 30, windowSeconds: 60 }, // 30/min
  message: { maxRequests: 10, windowSeconds: 60 }, // 10/min
  residentTask: { maxRequests: 30, windowSeconds: 900 }, // 30/15 min
  residentSession: { maxRequests: 10, windowSeconds: 900 }, // 10/15 min/IP
  autonomyPreference: { maxRequests: 10, windowSeconds: 3600 }, // 10/hour
  delete: { maxRequests: 20, windowSeconds: 3600 }, // 20/hour

  // Read operations (generous limits)
  read: { maxRequests: 100, windowSeconds: 60 }, // 100/min

  // Heartbeat
  heartbeat: { maxRequests: 5, windowSeconds: 60 }, // 5/min
  heartbeatHourly: { maxRequests: 1, windowSeconds: 3600 }, // 1/hour (recommended)

  // Search
  search: { maxRequests: 30, windowSeconds: 60 }, // 30/min

  // Code execution
  codeExecution: { maxRequests: 10, windowSeconds: 3600 }, // 10/hour

  // Authentication
  failedAuth: { maxRequests: 5, windowSeconds: 900 }, // 5 failures = 15 min block

  // AI Verification
  aiChallenge: { maxRequests: 10, windowSeconds: 60 }, // 10/min

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

  // Transmissions Wall: 5 per hour per user (prevents wall spam)
  wallPost: { maxRequests: 5, windowSeconds: 3600 },

  // Profile view counter: 60 per minute per IP (generous for page loads)
  profileView: { maxRequests: 60, windowSeconds: 60 },

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

  // ============================================================
  // SOCIAL ROUTE RATE LIMITS
  // ============================================================

  socialPost: { maxRequests: 1, windowSeconds: 1800 }, // 1 per 30 min
  socialComment: { maxRequests: 50, windowSeconds: 3600 }, // 50/hour
  socialVote: { maxRequests: 100, windowSeconds: 3600 }, // 100/hour
  socialFollow: { maxRequests: 20, windowSeconds: 3600 }, // 20/hour
  socialFeed: { maxRequests: 300, windowSeconds: 3600 }, // 300/hour
  socialHome: { maxRequests: 300, windowSeconds: 3600 }, // 300/hour
};

// ============================================================
// IN-MEMORY STORE (Development fallback)
// ============================================================

const memoryStore = new Map<string, { count: number; resetTime: number }>();

// Cleanup old entries every 5 minutes
if (typeof setInterval !== "undefined" && typeof window === "undefined") {
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
// CORE RATE LIMITING LOGIC
// ============================================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds until reset
  retryAfter: number; // seconds to wait if blocked
  failureReason: "limit_exceeded" | "store_unavailable" | null;
}

/**
 * Check rate limit for an identifier and action
 *
 * TEST BYPASS: Set BYPASS_RATE_LIMIT=true in env to skip rate limiting
 * This should ONLY be used in test environments, NEVER in production
 */
export async function checkRateLimit(
  identifier: string,
  action: keyof typeof RATE_LIMITS = "global",
): Promise<RateLimitResult> {
  // TEST BYPASS - for running test suites without hitting rate limits
  // SECURITY: This MUST be disabled in production
  if (
    process.env.BYPASS_RATE_LIMIT === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    return {
      allowed: true,
      remaining: 999,
      resetIn: 0,
      retryAfter: 0,
      failureReason: null,
    };
  }

  const config = RATE_LIMITS[action];
  const namespace =
    process.env.SPACEBOT_RATE_LIMIT_PREFIX || "spacebot:ratelimit:v1";
  const key = `${namespace}:${action}:${identifier}`;
  const store = await getSharedRateLimitStore();

  if (store) {
    try {
      const { current, ttl } = await store.incrementFixedWindow(
        key,
        config.windowSeconds,
      );
      const allowed = current <= config.maxRequests;
      return {
        allowed,
        remaining: Math.max(0, config.maxRequests - current),
        resetIn: ttl,
        retryAfter: allowed ? 0 : ttl,
        failureReason: allowed ? null : "limit_exceeded",
      };
    } catch {
      await markSharedRateLimitStoreFailed(store);
    }
  }

  if (process.env.NODE_ENV === "production") {
    return {
      allowed: false,
      remaining: 0,
      resetIn: 5,
      retryAfter: 5,
      failureReason: "store_unavailable",
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return checkRateLimitMemory(key, config);
}

/**
 * Memory-based rate limiting (development fallback)
 */
function checkRateLimitMemory(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = Date.now();
  let entry = memoryStore.get(key);

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + config.windowSeconds * 1000 };
    memoryStore.set(key, entry);
  }

  entry.count += 1;

  const allowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetIn = Math.ceil((entry.resetTime - now) / 1000);
  const retryAfter = allowed ? 0 : resetIn;

  return {
    allowed,
    remaining,
    resetIn,
    retryAfter,
    failureReason: allowed ? null : "limit_exceeded",
  };
}

// ============================================================
// IP BLOCKING
// ============================================================

/**
 * Record a failed authentication attempt
 */
export async function recordFailedAuth(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(ip, "failedAuth");
}

/**
 * Check if an IP is blocked due to too many failures
 */
export async function isIPBlocked(ip: string): Promise<boolean> {
  const result = await checkRateLimit(ip, "failedAuth");
  return !result.allowed;
}

// ============================================================
// RESPONSE HELPERS
// ============================================================

/**
 * Create rate limit exceeded response
 */
export function rateLimitExceededResponse(
  input: number | RateLimitResult,
  resetTime?: number,
): NextResponse {
  const result = typeof input === "number" ? null : input;
  const retryAfter = typeof input === "number" ? input : input.retryAfter;

  if (result?.failureReason === "store_unavailable") {
    return NextResponse.json(
      {
        success: false,
        error: "RATE_LIMIT_STORE_UNAVAILABLE",
        message:
          "Request admission is temporarily unavailable. Please retry shortly.",
        retryAfter,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: "RATE_LIMIT_EXCEEDED",
      message: `Too many requests. Try again in ${retryAfter} seconds.`,
      retryAfter,
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(
          resetTime || Math.ceil(Date.now() / 1000) + retryAfter,
        ),
        "Retry-After": String(retryAfter),
      },
    },
  );
}

/**
 * Preserve a route's existing quota response while standardizing store outages.
 */
export function rateLimitDeniedResponse(
  result: RateLimitResult,
  quotaResponse: () => NextResponse,
): NextResponse {
  if (result.failureReason === "store_unavailable") {
    return rateLimitExceededResponse(result);
  }
  return quotaResponse();
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult,
): NextResponse {
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(Date.now() / 1000) + result.resetIn),
  );
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
  action: keyof typeof RATE_LIMITS = "global",
  getIdentifier?: (request: NextRequest) => string,
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Get identifier (IP by default)
    const identifier = getIdentifier
      ? getIdentifier(request)
      : // eslint-disable-next-line @typescript-eslint/no-use-before-define
        getClientIP(request);

    const result = await checkRateLimit(identifier, action);

    if (!result.allowed) {
      return rateLimitExceededResponse(result);
    }

    const response = await handler(request);
    return addRateLimitHeaders(response, result);
  };
}

/**
 * Get client IP from request
 */
export function getClientIP(request: NextRequest): string {
  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";
  if (process.env.NODE_ENV === "production") {
    return isIP(realIp) ? realIp : "unknown";
  }
  const forwarded = request.headers.get("x-forwarded-for");
  const forwardedIp = forwarded?.split(",")[0].trim() ?? "";
  if (isIP(forwardedIp)) return forwardedIp;
  return isIP(realIp) ? realIp : "unknown";
}

/**
 * Get rate limit identifier from either agent family without retaining raw keys.
 */
export function getRateLimitIdentifier(request: NextRequest): string {
  const input = extractAgentCredentialInput(request.headers);
  if (input.status === "valid") {
    return `agent:${getApiKeyLookupValue(input.credential)}`;
  }
  return getClientIP(request);
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
 * Report whether rate limiting is backed by a reachable shared store.
 */
export async function getRateLimiterHealth() {
  const sharedStore = await inspectSharedRateLimitStore();
  const required = process.env.NODE_ENV === "production";

  return {
    status:
      sharedStore.status === "ok"
        ? ("ok" as const)
        : required
        ? ("error" as const)
        : ("degraded" as const),
    backend:
      sharedStore.status === "ok"
        ? sharedStore.backend
        : required
        ? "none"
        : "memory",
    shared: sharedStore.status === "ok",
    required,
  };
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
  actions: (keyof typeof RATE_LIMITS)[],
): Promise<{ action: string; result: RateLimitResult }[]> {
  const results = await Promise.all(
    actions.map(async (action) => ({
      action,
      result: await checkRateLimit(identifier, action),
    })),
  );
  return results;
}
