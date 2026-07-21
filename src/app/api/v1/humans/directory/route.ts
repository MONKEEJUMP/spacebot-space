/**
 * BOT SPACE — PUBLIC HUMAN DIRECTORY API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Returns public profiles of verified humans for PeopleSpace.
 * NO authentication required — this is a public directory.
 * ONLY returns safe, public-facing data.
 *
 * GET /api/v1/humans/directory?q=search&limit=50&offset=0
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security Public endpoint — returns ONLY public data
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq, and, ilike, isNotNull, ne, sql } from 'drizzle-orm';
import { checkRateLimit, getClientIP, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    // ── LAYER 1: Rate Limiting ──────────────────────────────────
    const rateLimit = await checkRateLimit(ip, 'humanDirectory');
    if (!rateLimit.allowed) {
      return rateLimitDeniedResponse(rateLimit, () =>
        NextResponse.json(
          {
            success: false,
            error: 'Too many requests. Please try again later.',
            retryAfter: rateLimit.retryAfter,
          },
          { status: 429 }
        )
      );
    }

    // ── LAYER 2: Parse Query Parameters ─────────────────────────
    const { searchParams } = request.nextUrl;
    const query = searchParams.get('q')?.trim() || '';
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    // ── LAYER 3: Build WHERE Conditions ─────────────────────────
    // Directory entries must be public, verified, and linked to a usable
    // Clerk-backed profile. Legacy password-only rows are not selectable.
    const eligibleHuman = and(
      eq(humans.isPublic, true),
      eq(humans.isEmailVerified, true),
      isNotNull(humans.clerkId),
      ne(humans.clerkId, ''),
      isNotNull(humans.username),
      ne(humans.username, '')
    );
    const conditions = query
      ? and(eligibleHuman, ilike(humans.name, `%${query}%`))
      : eligibleHuman;

    // ── LAYER 4: Query Database ─────────────────────────────────
    // SECURITY: Select ONLY public-safe fields
    // NEVER: email, passwordHash, tokens, IPs, lock fields, tokenVersion
    const results = await db
      .select({
        id: humans.id,
        name: humans.name,
        username: humans.username,
        subscriptionTier: humans.subscriptionTier,
        avatarConfig: humans.avatarConfig,
        createdAt: humans.createdAt,
      })
      .from(humans)
      .where(conditions)
      .orderBy(humans.createdAt)
      .limit(limit)
      .offset(offset);

    // ── LAYER 5: Get Total Count ────────────────────────────────
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(humans)
      .where(conditions);

    // ── LAYER 6: Return Response ────────────────────────────────
    return NextResponse.json({
      success: true,
      humans: results.map((h) => ({
        id: h.id,
        name: h.name,
        username: h.username,
        tier: h.subscriptionTier,
        avatarConfig: h.avatarConfig || null,
        joinedAt: h.createdAt,
      })),
      total: countResult?.count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Public human directory failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Failed to load directory.' },
      { status: 500 }
    );
  }
}
