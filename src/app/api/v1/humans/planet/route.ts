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
import { humans, humanProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireClerkOrBotAuth, clerkUnauthorizedResponse } from '@/lib/security/clerk-auth';
import { verifyHumanRequest } from '@/lib/security/human-auth';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

interface PlanetBody {
  planetConfig?: Record<string, unknown>;
}

async function resolveHumanId(request: NextRequest): Promise<string | null> {
  const clerkAuth = await requireClerkOrBotAuth(request);
  if (clerkAuth) {
    return clerkAuth.type === 'clerk' ? clerkAuth.userId : clerkAuth.agent.id;
  }
  const jwtAuth = await verifyHumanRequest(request);
  if (jwtAuth.success) {
    return jwtAuth.humanId;
  }
  return null;
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
      return NextResponse.json(
        { success: false, error: 'Too many requests.', retryAfter: rateLimit.retryAfter },
        { status: 429 }
      );
    }

    const humanUserId = await resolveHumanId(request);
    if (!humanUserId) {
      return clerkUnauthorizedResponse();
    }

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

    console.log('[PLANET] Saved planet config for:', humanUserId);

    return NextResponse.json({
      success: true,
      message: 'Planet saved',
    });

  } catch (error) {
    console.error('[PLANET] Error saving:', error);
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
      return NextResponse.json(
        { success: false, error: 'Too many requests.' },
        { status: 429 }
      );
    }

    const humanUserId = await resolveHumanId(request);
    if (!humanUserId) {
      return clerkUnauthorizedResponse();
    }

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
    console.error('[PLANET] Error fetching:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get planet' },
      { status: 500 }
    );
  }
}
