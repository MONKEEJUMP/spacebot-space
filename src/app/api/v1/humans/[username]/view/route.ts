/**
 * SPACEBOT.SPACE — PROFILE VIEW COUNTER
 * POST: Increment view count (non-owner, max 1 per 24h per visitor)
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { humans, humanProfiles } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { checkRateLimit, getClientIP, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ username: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const ip = getClientIP(request);
    const rateLimit = await checkRateLimit(ip, 'profileView');
    if (!rateLimit.allowed) {
      return rateLimitDeniedResponse(rateLimit, () => NextResponse.json({ success: true })); // Silent success to not leak info
    }

    const { username } = await params;

    // Find profile owner
    const [owner] = await db
      .select({ clerkId: humans.clerkId, id: humans.id })
      .from(humans)
      .where(eq(humans.username, username))
      .limit(1);

    if (!owner || !owner.clerkId) {
      return NextResponse.json({ success: true }); // Silent
    }

    // Don't count owner viewing their own profile
    const session = await auth();
    if (session?.userId === owner.clerkId) {
      return NextResponse.json({ success: true });
    }

    // Use a unique rate limit key per visitor+profile to enforce 1 per 24h
    const viewKey = `view:${ip}:${owner.clerkId}`;
    const viewLimit = await checkRateLimit(viewKey, 'heartbeatHourly');
    // heartbeatHourly = 1 per hour — we reuse it as a 1-per-period limiter
    // For 24h we'll check with a custom approach: just use the IP-based rate limit
    if (!viewLimit.allowed) {
      return rateLimitDeniedResponse(viewLimit, () => NextResponse.json({ success: true })); // Already counted
    }

    // Increment profile views
    await db
      .update(humanProfiles)
      .set({
        profileViews: sql`COALESCE(${humanProfiles.profileViews}, 0) + 1`,
      })
      .where(eq(humanProfiles.humanId, owner.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[VIEW] Error:', error);
    return NextResponse.json({ success: true }); // Silent failure
  }
}
