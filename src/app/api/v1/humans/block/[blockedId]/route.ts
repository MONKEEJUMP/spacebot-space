/**
 * SPACEBOT.SPACE — UNBLOCK USER API
 * DELETE: Unblock a user
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { blockedUsers } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ blockedId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const { blockedId } = await params;

    await db
      .delete(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerId, session.userId),
          eq(blockedUsers.blockedId, blockedId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[UNBLOCK] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to unblock user.' },
      { status: 500 }
    );
  }
}
