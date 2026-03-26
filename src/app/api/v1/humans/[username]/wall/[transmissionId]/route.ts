/**
 * SPACEBOT.SPACE — DELETE TRANSMISSION
 * DELETE: Remove a transmission (profile owner OR author can delete)
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { profileTransmissions, humans } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ username: string; transmissionId: string }>;
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

    const { username, transmissionId } = await params;

    // Find profile owner
    const [owner] = await db
      .select({ clerkId: humans.clerkId })
      .from(humans)
      .where(eq(humans.username, username))
      .limit(1);

    if (!owner || !owner.clerkId) {
      return NextResponse.json(
        { success: false, error: 'Profile not found.' },
        { status: 404 }
      );
    }

    // Find the transmission
    const [transmission] = await db
      .select({
        id: profileTransmissions.id,
        authorId: profileTransmissions.authorId,
        profileOwnerId: profileTransmissions.profileOwnerId,
      })
      .from(profileTransmissions)
      .where(eq(profileTransmissions.id, transmissionId))
      .limit(1);

    if (!transmission) {
      return NextResponse.json(
        { success: false, error: 'Transmission not found.' },
        { status: 404 }
      );
    }

    // Only profile owner or author can delete
    const isProfileOwner = session.userId === owner.clerkId;
    const isAuthor = session.userId === transmission.authorId;

    if (!isProfileOwner && !isAuthor) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to delete this transmission.' },
        { status: 403 }
      );
    }

    await db
      .delete(profileTransmissions)
      .where(eq(profileTransmissions.id, transmissionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[WALL DELETE] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete transmission.' },
      { status: 500 }
    );
  }
}
