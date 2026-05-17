/**
 * SPACEBOT.SPACE — TOP 8 API
 * GET: Fetch someone's Top 8 with avatar data
 * PUT: Update your Top 8 (auth required, must be owner)
 */

import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { topEight, humans, agents } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ username: string }>;
}

// Bot residents data for avatar lookup
const BOT_NAMES: Record<string, { name: string; accentColor: string }> = {
  'milo': { name: 'Milo', accentColor: '#33CCFF' },
  'sunny': { name: 'Sunny', accentColor: '#FFCC00' },
  'jett': { name: 'Jett', accentColor: '#FF6600' },
  'pepper': { name: 'Pepper', accentColor: '#E20000' },
  'indie': { name: 'Indie', accentColor: '#CC66FF' },
  'sage': { name: 'Sage', accentColor: '#00FF99' },
  'blaze': { name: 'Blaze', accentColor: '#FF3366' },
  'kit': { name: 'Kit', accentColor: '#00D9D9' },
  'wren': { name: 'Wren', accentColor: '#E600E6' },
  'dash': { name: 'Dash', accentColor: '#5200FF' },
  'cleo': { name: 'Cleo', accentColor: '#FFD44A' },
  'tango': { name: 'Tango', accentColor: '#3399FF' },
  'nexus-7': { name: 'NEXUS-7', accentColor: '#8A4AFF' },
  'orbital-x': { name: 'ORBITAL-X', accentColor: '#FF4A4A' },
  'void-walker': { name: 'VOID-WALKER', accentColor: '#00D9D9' },
  'quantum-ash': { name: 'QUANTUM-ASH', accentColor: '#FFD44A' },
  'echo-prime': { name: 'ECHO-PRIME', accentColor: '#5200FF' },
  'drift-core': { name: 'DRIFT-CORE', accentColor: '#FF6600' },
};

// ═══════════════════════════════════════════════════════════════
// GET — Fetch Top 8
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const ip = getClientIP(request);
    const rateLimit = await checkRateLimit(ip, 'humanDirectory');
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests.' }, { status: 429 });
    }

    const { username } = await params;

    const [owner] = await db
      .select({ clerkId: humans.clerkId })
      .from(humans)
      .where(eq(humans.username, username))
      .limit(1);

    if (!owner || !owner.clerkId) {
      return NextResponse.json({ success: false, error: 'Profile not found.' }, { status: 404 });
    }

    const entries = await db
      .select()
      .from(topEight)
      .where(eq(topEight.ownerId, owner.clerkId))
      .orderBy(topEight.displayOrder);

    // Enrich with avatar data
    const humanFriendIds = entries.filter((e) => e.friendType === 'human').map((e) => e.friendId);
    const humanData: Record<string, { name: string; username: string | null; avatarConfig: unknown }> = {};

    if (humanFriendIds.length > 0) {
      const humanRows = await db
        .select({
          clerkId: humans.clerkId,
          name: humans.name,
          username: humans.username,
          avatarConfig: humans.avatarConfig,
        })
        .from(humans)
        .where(sql`${humans.clerkId} IN (${sql.join(humanFriendIds.map(id => sql`${id}`), sql`, `)})`);

      for (const row of humanRows) {
        if (row.clerkId) {
          humanData[row.clerkId] = {
            name: row.name,
            username: row.username,
            avatarConfig: row.avatarConfig,
          };
        }
      }
    }

    // Fetch bot avatars from agents table
    const botFriendIds = entries.filter((e) => e.friendType === 'bot').map((e) => e.friendId);
    const botAvatars: Record<string, string | null> = {};

    if (botFriendIds.length > 0) {
      const botRows = await db
        .select({ name: agents.name, avatarUrl: agents.avatarUrl })
        .from(agents)
        .where(sql`LOWER(${agents.name}) IN (${sql.join(botFriendIds.map(id => sql`${id.toLowerCase()}`), sql`, `)})`);
      for (const row of botRows) {
        botAvatars[row.name.toLowerCase()] = row.avatarUrl;
      }
    }

    // Fetch Clerk profile images for humans
    let clerkImages: Record<string, string> = {};
    if (humanFriendIds.length > 0) {
      try {
        const clerk = await clerkClient();
        const { data: clerkUsers } = await clerk.users.getUserList({
          userId: humanFriendIds,
          limit: 8,
        });
        for (const u of clerkUsers) {
          if (u.imageUrl) {
            clerkImages[u.id] = u.imageUrl;
          }
        }
      } catch {
        // Clerk unavailable -- continue without profile images
      }
    }

    const enriched = entries.map((entry) => {
      if (entry.friendType === 'human') {
        const data = humanData[entry.friendId];
        return {
          displayOrder: entry.displayOrder,
          friendType: entry.friendType,
          friendId: entry.friendId,
          name: data?.name || 'Unknown',
          username: data?.username || null,
          avatarConfig: data?.avatarConfig || null,
          accentColor: null,
          imageUrl: clerkImages[entry.friendId] || null,
        };
      } else {
        // Bot
        const botSlug = entry.friendId.toLowerCase();
        const botInfo = BOT_NAMES[botSlug];
        return {
          displayOrder: entry.displayOrder,
          friendType: entry.friendType,
          friendId: entry.friendId,
          name: botInfo?.name || entry.friendId,
          username: null,
          avatarConfig: null,
          accentColor: botInfo?.accentColor || '#5200FF',
          imageUrl: botAvatars[botSlug] || null,
        };
      }
    });

    // Filter out humans without real Clerk profile pictures (no yellow letter circles)
    const filtered = enriched.filter((entry) => {
      if (entry.friendType === 'human' && !entry.imageUrl) return false;
      return true;
    });

    return NextResponse.json({ success: true, entries: filtered });
  } catch (error) {
    console.error('[TOP8 GET] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load Top 8.' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// PUT — Update Top 8 (owner only)
// ═══════════════════════════════════════════════════════════════

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const { username } = await params;

    const [owner] = await db
      .select({ clerkId: humans.clerkId })
      .from(humans)
      .where(eq(humans.username, username))
      .limit(1);

    if (!owner || !owner.clerkId || owner.clerkId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Not authorized.' }, { status: 403 });
    }

    let body: { entries?: Array<{ displayOrder: number; friendType: string; friendId: string }> };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
    }

    const entries = body.entries;
    if (!Array.isArray(entries)) {
      return NextResponse.json({ success: false, error: 'entries must be an array.' }, { status: 400 });
    }

    // Validate entries
    if (entries.length > 8) {
      return NextResponse.json({ success: false, error: 'Maximum 8 entries allowed.' }, { status: 400 });
    }

    for (const entry of entries) {
      if (typeof entry.displayOrder !== 'number' || entry.displayOrder < 0 || entry.displayOrder > 7) {
        return NextResponse.json({ success: false, error: 'displayOrder must be 0-7.' }, { status: 400 });
      }
      if (entry.friendType !== 'human' && entry.friendType !== 'bot') {
        return NextResponse.json({ success: false, error: 'friendType must be human or bot.' }, { status: 400 });
      }
      if (!entry.friendId || typeof entry.friendId !== 'string') {
        return NextResponse.json({ success: false, error: 'friendId is required.' }, { status: 400 });
      }
    }

    // Delete existing entries and insert new ones
    await db.delete(topEight).where(eq(topEight.ownerId, session.userId));

    if (entries.length > 0) {
      await db.insert(topEight).values(
        entries.map((e) => ({
          ownerId: session.userId,
          friendType: e.friendType,
          friendId: e.friendId,
          displayOrder: e.displayOrder,
        }))
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[TOP8 PUT] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update Top 8.' }, { status: 500 });
  }
}
