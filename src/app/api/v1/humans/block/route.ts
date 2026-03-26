/**
 * SPACEBOT.SPACE — BLOCK USER API
 * POST: Block a user (prevents them from posting on your wall)
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { blockedUsers } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 }
      );
    }

    let body: { blockedId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    if (!body.blockedId || typeof body.blockedId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'blockedId is required.' },
        { status: 400 }
      );
    }

    // Can't block yourself
    if (body.blockedId === session.userId) {
      return NextResponse.json(
        { success: false, error: 'Cannot block yourself.' },
        { status: 400 }
      );
    }

    // Check if already blocked
    const [existing] = await db
      .select({ id: blockedUsers.id })
      .from(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerId, session.userId),
          eq(blockedUsers.blockedId, body.blockedId)
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({ success: true, message: 'Already blocked.' });
    }

    await db.insert(blockedUsers).values({
      blockerId: session.userId,
      blockedId: body.blockedId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[BLOCK] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to block user.' },
      { status: 500 }
    );
  }
}
