/**
 * AI BUDDY SANDBOX — Token Validation Middleware
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Validates buddy_token from Authorization header.
 * Each token maps to exactly ONE user_id. If the token is invalid
 * or the request targets a different user, access is denied.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD — sandbox isolation per user
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================
// TYPES
// ============================================================

export interface BuddyIdentity {
  user_id: string;
  buddy_name: string;
  owner: string;
}

interface BuddyTokenEntry {
  user_id: string;
  buddy_name: string;
  owner: string;
  active: boolean;
  created_at: string;
}

interface BuddyConfig {
  tokens: Record<string, BuddyTokenEntry>;
}

// ============================================================
// CONFIG LOADER
// ============================================================

let cachedConfig: BuddyConfig | null = null;
let lastLoadMs = 0;
const CACHE_TTL = 30_000; // 30 seconds

function loadBuddyConfig(): BuddyConfig {
  const now = Date.now();
  if (cachedConfig && now - lastLoadMs < CACHE_TTL) {
    return cachedConfig;
  }

  const configPath = join(process.cwd(), "buddy-config.json");
  const raw = readFileSync(configPath, "utf-8");
  cachedConfig = JSON.parse(raw) as BuddyConfig;
  lastLoadMs = now;
  return cachedConfig;
}

// ============================================================
// TOKEN VALIDATOR
// ============================================================

/**
 * Validates a buddy token from the Authorization header.
 * Format: "Bearer {buddy_token}"
 *
 * @returns BuddyIdentity if valid, null if invalid
 */
export function validateBuddyToken(request: NextRequest): BuddyIdentity | null {
  const explicitToken = request.headers.get("X-Buddy-Token")?.trim();
  const authHeader = request.headers.get("Authorization");
  const parts = authHeader?.split(" ") ?? [];
  const token =
    explicitToken ||
    (parts.length === 2 && parts[0] === "Bearer" ? parts[1] : null);
  if (!token || token.length < 10) return null;

  try {
    const config = loadBuddyConfig();
    const entry = config.tokens[token];

    if (!entry) return null;
    if (!entry.active) return null;

    return {
      user_id: entry.user_id,
      buddy_name: entry.buddy_name,
      owner: entry.owner,
    };
  } catch (error) {
    console.error("[buddy] Failed to validate token:", error);
    return null;
  }
}

// ============================================================
// RESPONSE HELPERS
// ============================================================

export function forbiddenResponse(message: string = "Forbidden"): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

export function buddyBadRequest(
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { success: false, error: message, details },
    { status: 400 },
  );
}

export function buddyInternalError(
  message: string = "Internal server error",
): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}
