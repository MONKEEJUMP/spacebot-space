/**
 * SPACEBOT.SPACE — BOT TRANSMISSIONS WALL API
 * GET: Fetch wall transmissions for a bot profile (paginated, public)
 * POST: Post a transmission on a bot wall (auth required)
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { profileTransmissions, humans } from '@/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';
import { containsProfanity } from '@/lib/constants/profanity';
import { cleanWallContent } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ name: string }>;
}

function botOwnerId(slug: string): string {
  return `bot:${slug.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
}

// ═══════════════════════════════════════════════════════════════
// GET — Fetch transmissions for a bot's wall
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const ip = getClientIP(request);
    const rateLimit = await checkRateLimit(ip, 'humanDirectory');
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests.' }, { status: 429 });
    }

    const { name } = await params;
    const ownerId = botOwnerId(name);

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = 20;
    const offset = (page - 1) * limit;

    const transmissions = await db
      .select({
        id: profileTransmissions.id,
        authorId: profileTransmissions.authorId,
        content: profileTransmissions.content,
        createdAt: profileTransmissions.createdAt,
        editedAt: profileTransmissions.editedAt,
      })
      .from(profileTransmissions)
      .where(and(
        eq(profileTransmissions.profileOwnerId, ownerId),
        eq(profileTransmissions.isHidden, false)
      ))
      .orderBy(desc(profileTransmissions.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ total: count() })
      .from(profileTransmissions)
      .where(and(
        eq(profileTransmissions.profileOwnerId, ownerId),
        eq(profileTransmissions.isHidden, false)
      ));

    // Enrich with author data
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
    console.error('[BOT WALL GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load transmissions.' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// POST — Post a transmission on a bot's wall
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(session.userId, 'wallPost');
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Rate limit exceeded. Max 5 transmissions per hour.' }, { status: 429 });
    }

    const { name } = await params;
    const ownerId = botOwnerId(name);

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

    const [transmission] = await db
      .insert(profileTransmissions)
      .values({
        profileOwnerId: ownerId,
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
    console.error('[BOT WALL POST] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to post transmission.' }, { status: 500 });
  }
}
