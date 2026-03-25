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
import { verifyHumanRequest } from '@/lib/security/human-auth';
import { requireClerkOrBotAuth, clerkUnauthorizedResponse } from '@/lib/security/clerk-auth';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';

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
      return NextResponse.json(
        { success: false, error: 'Too many requests.', retryAfter: rateLimit.retryAfter },
        { status: 429 }
      );
    }

    // Auth: Clerk primary, human JWT fallback during migration
    const clerkAuth = await requireClerkOrBotAuth(request);
    let humanUserId: string;
    if (clerkAuth) {
      humanUserId = clerkAuth.type === 'clerk' ? clerkAuth.userId : clerkAuth.agent.id;
    } else {
      const jwtAuth = await verifyHumanRequest(request);
      if (!jwtAuth.success) {
        return clerkUnauthorizedResponse();
      }
      humanUserId = jwtAuth.humanId;
    }

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

    console.log('[AVATAR] Saved avatar config for:', humanUserId);

    return NextResponse.json({
      success: true,
      message: 'Avatar saved',
    });

  } catch (error) {
    console.error('[AVATAR] Error:', error);
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
      return NextResponse.json(
        { success: false, error: 'Too many requests.' },
        { status: 429 }
      );
    }

    // Auth: Clerk primary, human JWT fallback during migration
    const clerkAuth = await requireClerkOrBotAuth(request);
    let humanUserId: string;
    if (clerkAuth) {
      humanUserId = clerkAuth.type === 'clerk' ? clerkAuth.userId : clerkAuth.agent.id;
    } else {
      const jwtAuth = await verifyHumanRequest(request);
      if (!jwtAuth.success) {
        return clerkUnauthorizedResponse();
      }
      humanUserId = jwtAuth.humanId;
    }

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
    console.error('[AVATAR] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get avatar' },
      { status: 500 }
    );
  }
}
