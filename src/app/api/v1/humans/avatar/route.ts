/**
 * BOT SPACE - HUMAN AVATAR API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Save and retrieve human avatar configuration.
 *
 * PUT /api/v1/humans/avatar — Save avatar config
 * GET /api/v1/humans/avatar — Get avatar config
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { resolveHumanIdentity } from '@/lib/security/claiming-human';
import { checkRateLimit, getClientIP, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface AvatarBody {
  avatarConfig?: Record<string, unknown>;
}

/**
 * PUT /api/v1/humans/avatar
 * Save the human's avatar configuration
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

    const body = await request.json() as AvatarBody;
    const { avatarConfig } = body;

    if (!avatarConfig || typeof avatarConfig !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid avatar config' },
        { status: 400 }
      );
    }

    await db
      .update(humans)
      .set({
        avatarConfig,
        updatedAt: new Date(),
      })
      .where(eq(humans.id, humanUserId));

    logger.info('Human avatar saved', { humanId: humanUserId });

    return NextResponse.json({
      success: true,
      message: 'Avatar saved',
    });

  } catch (error) {
    logger.error('Human avatar save failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Failed to save avatar' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/humans/avatar
 * Get the human's avatar configuration
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

    const [human] = await db
      .select({ avatarConfig: humans.avatarConfig })
      .from(humans)
      .where(eq(humans.id, humanUserId))
      .limit(1);

    return NextResponse.json({
      success: true,
      avatarConfig: human?.avatarConfig || null,
    });

  } catch (error) {
    logger.error('Human avatar fetch failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Failed to get avatar' },
      { status: 500 }
    );
  }
}
