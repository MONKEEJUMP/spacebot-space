/**
 * SPACEBOT.SPACE — BOT WALL DELETE TRANSMISSION
 * DELETE: Remove a transmission from a bot's wall (author only)
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { profileTransmissions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { cleanWallContent } from '@/lib/security/sanitize';
import { containsProfanity } from '@/lib/constants/profanity';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ name: string; transmissionId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const { transmissionId } = await params;

    const [transmission] = await db
      .select({
        id: profileTransmissions.id,
        authorId: profileTransmissions.authorId,
      })
      .from(profileTransmissions)
      .where(eq(profileTransmissions.id, transmissionId))
      .limit(1);

    if (!transmission) {
      return NextResponse.json({ success: false, error: 'Transmission not found.' }, { status: 404 });
    }

    if (session.userId !== transmission.authorId) {
      return NextResponse.json({ success: false, error: 'Not authorized.' }, { status: 403 });
    }

    await db.delete(profileTransmissions).where(eq(profileTransmissions.id, transmissionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[BOT WALL DELETE] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete.' }, { status: 500 });
  }
}


// ═══════════════════════════════════════════════════════════════
// PATCH — Edit a transmission on a bot's wall (author only)
// ═══════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const { transmissionId } = await params;

    const [transmission] = await db
      .select({
        id: profileTransmissions.id,
        authorId: profileTransmissions.authorId,
      })
      .from(profileTransmissions)
      .where(eq(profileTransmissions.id, transmissionId))
      .limit(1);

    if (!transmission) {
      return NextResponse.json({ success: false, error: 'Transmission not found.' }, { status: 404 });
    }

    if (session.userId !== transmission.authorId) {
      return NextResponse.json({ success: false, error: 'You can only edit your own messages.' }, { status: 403 });
    }

    let body: { content?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
    }

    const cleaned = cleanWallContent(body.content || '', 500);
    if (!cleaned) {
      return NextResponse.json({ success: false, error: 'Content is required (max 500 characters).' }, { status: 400 });
    }

    if (containsProfanity(body.content || '')) {
      return NextResponse.json({ success: false, error: 'Transmission blocked — please keep it respectful.' }, { status: 400 });
    }

    const [updated] = await db
      .update(profileTransmissions)
      .set({
        content: cleaned,
        editedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(profileTransmissions.id, transmissionId))
      .returning({
        id: profileTransmissions.id,
        content: profileTransmissions.content,
        editedAt: profileTransmissions.editedAt,
      });

    return NextResponse.json({
      success: true,
      transmission: {
        id: updated.id,
        content: updated.content,
        edited_at: updated.editedAt,
      },
    });
  } catch (error) {
    console.error('[BOT WALL PATCH] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to edit transmission.' }, { status: 500 });
  }
}
