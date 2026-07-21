/**
 * PLANET SPACE — Planet Configuration API
 *
 * Save and retrieve planet configuration for the user's profile.
 *
 * PUT /api/v1/humans/planet — Save planet config
 * GET /api/v1/humans/planet — Get planet config
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { humanProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { resolveHumanIdentity } from '@/lib/security/claiming-human';
import { checkRateLimit, getClientIP, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface PlanetBody {
  planetConfig?: Record<string, unknown>;
}

/**
 * PUT /api/v1/humans/planet
 * Save the human's planet configuration
 */
export async function PUT(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    const rateLimit = await checkRateLimit(ip, 'humanDashboard');
    if (!rateLimit.allowed) {
      return rateLimitDeniedResponse(rateLimit, () =>
        NextResponse.json(
          { success: false, error: 'Too many requests.', retryAfter: rateLimit.retryAfter },
          { status: 429 }
        )
      );
    }

    const identity = await resolveHumanIdentity();
    if (!identity.success) {
      return NextResponse.json(
        { success: false, error: identity.error },
        { status: identity.status }
      );
    }
    const humanUserId = identity.humanId;

    const body = await request.json() as PlanetBody;
    const { planetConfig } = body;

    if (!planetConfig || typeof planetConfig !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid planet config' },
        { status: 400 }
      );
    }

    // Stringify for text column storage
    const configStr = JSON.stringify(planetConfig);

    // Upsert into humanProfiles
    const existingProfile = await db
      .select({ id: humanProfiles.id })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, humanUserId))
      .limit(1);

    if (existingProfile.length) {
      await db
        .update(humanProfiles)
        .set({
          planetConfig: configStr,
          updatedAt: new Date(),
        })
        .where(eq(humanProfiles.humanId, humanUserId));
    } else {
      await db
        .insert(humanProfiles)
        .values({
          humanId: humanUserId,
          planetConfig: configStr,
        });
    }

    logger.info('Human planet saved', { humanId: humanUserId });

    return NextResponse.json({
      success: true,
      message: 'Planet saved',
    });

  } catch (error) {
    logger.error('Human planet save failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Failed to save planet' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/humans/planet
 * Get the human's planet configuration
 */
export async function GET(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    const rateLimit = await checkRateLimit(ip, 'humanDashboard');
    if (!rateLimit.allowed) {
      return rateLimitDeniedResponse(rateLimit, () =>
        NextResponse.json(
          { success: false, error: 'Too many requests.' },
          { status: 429 }
        )
      );
    }

    const identity = await resolveHumanIdentity();
    if (!identity.success) {
      return NextResponse.json(
        { success: false, error: identity.error },
        { status: identity.status }
      );
    }
    const humanUserId = identity.humanId;

    const [profile] = await db
      .select({ planetConfig: humanProfiles.planetConfig })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, humanUserId))
      .limit(1);

    let parsed = null;
    if (profile?.planetConfig) {
      try {
        parsed = JSON.parse(profile.planetConfig);
      } catch {
        parsed = null;
      }
    }

    return NextResponse.json({
      success: true,
      planetConfig: parsed,
    });

  } catch (error) {
    logger.error('Human planet fetch failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Failed to get planet' },
      { status: 500 }
    );
  }
}
