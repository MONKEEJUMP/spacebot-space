/**
 * SPACEBOT.SPACE — DELETE TRANSMISSION
 * DELETE: Remove a transmission (profile owner OR author can delete)
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { profileTransmissions, humans } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cleanWallContent } from "@/lib/security/sanitize";
import { containsProfanity } from "@/lib/constants/profanity";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ username: string; transmissionId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 },
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
        { success: false, error: "Profile not found." },
        { status: 404 },
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
      .where(
        and(
          eq(profileTransmissions.id, transmissionId),
          eq(profileTransmissions.profileOwnerId, owner.clerkId),
        ),
      )
      .limit(1);

    if (!transmission) {
      return NextResponse.json(
        { success: false, error: "Transmission not found." },
        { status: 404 },
      );
    }

    // Only profile owner or author can delete
    const [currentHuman] = await db
      .select({ id: humans.id })
      .from(humans)
      .where(eq(humans.clerkId, session.userId))
      .limit(1);

    const isProfileOwner = session.userId === owner.clerkId;
    const isAuthor =
      session.userId === transmission.authorId ||
      currentHuman?.id === transmission.authorId;

    if (!isProfileOwner && !isAuthor) {
      return NextResponse.json(
        {
          success: false,
          error: "Not authorized to delete this transmission.",
        },
        { status: 403 },
      );
    }

    await db
      .delete(profileTransmissions)
      .where(
        and(
          eq(profileTransmissions.id, transmissionId),
          eq(profileTransmissions.profileOwnerId, owner.clerkId),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Transmission delete failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to delete transmission." },
      { status: 500 },
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH — Edit a transmission (author only)
// ═══════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 },
      );
    }

    const { username, transmissionId } = await params;

    const [owner] = await db
      .select({ clerkId: humans.clerkId })
      .from(humans)
      .where(eq(humans.username, username))
      .limit(1);

    if (!owner?.clerkId) {
      return NextResponse.json(
        { success: false, error: "Profile not found." },
        { status: 404 },
      );
    }

    // Find the transmission
    const [transmission] = await db
      .select({
        id: profileTransmissions.id,
        authorId: profileTransmissions.authorId,
      })
      .from(profileTransmissions)
      .where(
        and(
          eq(profileTransmissions.id, transmissionId),
          eq(profileTransmissions.profileOwnerId, owner.clerkId),
        ),
      )
      .limit(1);

    if (!transmission) {
      return NextResponse.json(
        { success: false, error: "Transmission not found." },
        { status: 404 },
      );
    }

    const [currentHuman] = await db
      .select({ id: humans.id })
      .from(humans)
      .where(eq(humans.clerkId, session.userId))
      .limit(1);

    const isAuthor =
      session.userId === transmission.authorId ||
      currentHuman?.id === transmission.authorId;
    if (!isAuthor) {
      return NextResponse.json(
        { success: false, error: "You can only edit your own messages." },
        { status: 403 },
      );
    }

    let body: { content?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const cleaned = cleanWallContent(body.content || "", 500);
    if (!cleaned) {
      return NextResponse.json(
        { success: false, error: "Content is required (max 500 characters)." },
        { status: 400 },
      );
    }

    if (containsProfanity(body.content || "")) {
      return NextResponse.json(
        {
          success: false,
          error: "Transmission blocked — please keep it respectful.",
        },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(profileTransmissions)
      .set({
        content: cleaned,
        editedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(profileTransmissions.id, transmissionId),
          eq(profileTransmissions.profileOwnerId, owner.clerkId),
        ),
      )
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
    logger.error("Transmission edit failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to edit transmission." },
      { status: 500 },
    );
  }
}
