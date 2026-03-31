/**
 * SPACEBOT.SPACE — TRANSMISSIONS WALL API
 * GET: Fetch wall transmissions (paginated, public)
 * POST: Post a transmission (auth required)
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { profileTransmissions, blockedUsers, humans } from '@/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';
import { containsProfanity } from '@/lib/constants/profanity';
import { cleanWallContent } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ username: string }>;
}

// ═══════════════════════════════════════════════════════════════
// GET — Fetch transmissions for a profile wall
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const ip = getClientIP(request);
    const rateLimit = await checkRateLimit(ip, 'humanDirectory');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests.' },
        { status: 429 }
      );
    }

    const { username } = await params;

    // Find profile owner by username
    const [owner] = await db
      .select({ clerkId: humans.clerkId, id: humans.id })
      .from(humans)
      .where(eq(humans.username, username))
      .limit(1);

    if (!owner || !owner.clerkId) {
      return NextResponse.json(
        { success: false, error: 'Profile not found.' },
        { status: 404 }
      );
    }

    // Pagination
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = 20;
    const offset = (page - 1) * limit;

    // Fetch transmissions (non-hidden, newest first)
    const transmissions = await db
      .select({
        id: profileTransmissions.id,
        authorId: profileTransmissions.authorId,
        content: profileTransmissions.content,
        createdAt: profileTransmissions.createdAt,
        editedAt: profileTransmissions.editedAt,
      })
      .from(profileTransmissions)
      .where(
        and(
          eq(profileTransmissions.profileOwnerId, owner.clerkId),
          eq(profileTransmissions.isHidden, false)
        )
      )
      .orderBy(desc(profileTransmissions.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [totalResult] = await db
      .select({ total: count() })
      .from(profileTransmissions)
      .where(
        and(
          eq(profileTransmissions.profileOwnerId, owner.clerkId),
          eq(profileTransmissions.isHidden, false)
        )
      );

    // Fetch author data for each transmission
    const authorIds = [...new Set(transmissions.map((t) => t.authorId))];
    const authors: Record<string, { name: string; username: string | null; avatarConfig: unknown }> = {};

    if (authorIds.length > 0) {
      const authorRows = await db
        .select({
          clerkId: humans.clerkId,
          name: humans.name,
          username: humans.username,
          avatarConfig: humans.avatarConfig,
        })
        .from(humans)
        .where(sql`${humans.clerkId} IN (${sql.join(authorIds.map(id => sql`${id}`), sql`, `)})`);

      for (const row of authorRows) {
        if (row.clerkId) {
          authors[row.clerkId] = {
            name: row.name,
            username: row.username,
            avatarConfig: row.avatarConfig,
          };
        }
      }
    }

    const enrichedTransmissions = transmissions.map((t) => ({
      id: t.id,
      content: t.content,
      created_at: t.createdAt,
      edited_at: t.editedAt || null,
      authorId: t.authorId,
      author: authors[t.authorId] || { name: 'Unknown', username: null, avatarConfig: null },
    }));

    return NextResponse.json({
      success: true,
      transmissions: enrichedTransmissions,
      total: totalResult?.total || 0,
      page,
      hasMore: offset + limit < (totalResult?.total || 0),
    });
  } catch (error) {
    console.error('[WALL GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load transmissions.' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// POST — Post a transmission on someone's wall
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Auth required
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 }
      );
    }

    // Rate limit: 5 per hour per user
    const rateLimit = await checkRateLimit(session.userId, 'wallPost');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Max 5 transmissions per hour.' },
        { status: 429 }
      );
    }

    const { username } = await params;

    // Find profile owner
    const [owner] = await db
      .select({ clerkId: humans.clerkId, id: humans.id })
      .from(humans)
      .where(eq(humans.username, username))
      .limit(1);

    if (!owner || !owner.clerkId) {
      return NextResponse.json(
        { success: false, error: 'Profile not found.' },
        { status: 404 }
      );
    }

    // Check if author is blocked by profile owner
    const [blocked] = await db
      .select({ id: blockedUsers.id })
      .from(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerId, owner.clerkId),
          eq(blockedUsers.blockedId, session.userId)
        )
      )
      .limit(1);

    if (blocked) {
      // Silently reject — blocked users see no indication
      return NextResponse.json(
        { success: false, error: 'Unable to post transmission.' },
        { status: 403 }
      );
    }

    // Parse body
    let body: { content?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    // Validate and sanitize content
    const cleaned = cleanWallContent(body.content || '', 500);
    if (!cleaned) {
      return NextResponse.json(
        { success: false, error: 'Content is required (max 500 characters).' },
        { status: 400 }
      );
    }

    // Profanity check
    if (containsProfanity(body.content || '')) {
      return NextResponse.json(
        { success: false, error: 'Transmission blocked — please keep it respectful.' },
        { status: 400 }
      );
    }

    // Insert transmission
    const [transmission] = await db
      .insert(profileTransmissions)
      .values({
        profileOwnerId: owner.clerkId,
        authorId: session.userId,
        content: cleaned,
      })
      .returning({ id: profileTransmissions.id, createdAt: profileTransmissions.createdAt });

    return NextResponse.json({
      success: true,
      transmission: {
        id: transmission.id,
        content: cleaned,
        created_at: transmission.createdAt,
      },
    });
  } catch (error) {
    console.error('[WALL POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to post transmission.' },
      { status: 500 }
    );
  }
}
