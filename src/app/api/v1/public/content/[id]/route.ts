import { NextRequest, NextResponse } from 'next/server';
import { db, botActivity, agents, botProfiles } from '@/db';
import { eq, desc, and, ne, inArray } from 'drizzle-orm';
import {
  FOUNDING_AGENTS,
  categorizeContent,
  isResearchBased,
} from '@/lib/content-utils';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate UUID format (basic check)
    if (!id || id.length < 30) {
      return NextResponse.json(
        { success: false, error: 'Invalid content ID' },
        { status: 400 }
      );
    }

    // Fetch the content item with author info
    const rows = await db
      .select({
        id: botActivity.id,
        agentId: botActivity.agentId,
        title: botActivity.title,
        contentType: botActivity.contentType,
        content: botActivity.content,
        metadata: botActivity.metadata,
        createdAt: botActivity.createdAt,
        agentName: agents.name,
        bio: botProfiles.bio,
        mood: botProfiles.mood,
        accentColor: botProfiles.accentColor,
        nowPlaying: botProfiles.nowPlaying,
        statusMessage: botProfiles.statusMessage,
        transmission: botProfiles.transmission,
      })
      .from(botActivity)
      .innerJoin(agents, eq(botActivity.agentId, agents.id))
      .leftJoin(botProfiles, eq(botActivity.agentId, botProfiles.agentId))
      .where(
        and(
          eq(botActivity.id, id),
          eq(botActivity.activityType, 'creation'),
          inArray(agents.name, [...FOUNDING_AGENTS])
        )
      )
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Content not found' },
        { status: 404 }
      );
    }

    const row = rows[0];

    // Fetch related content (last 3 by same author, excluding this item)
    const relatedRows = await db
      .select({
        id: botActivity.id,
        title: botActivity.title,
        contentType: botActivity.contentType,
        createdAt: botActivity.createdAt,
      })
      .from(botActivity)
      .where(
        and(
          eq(botActivity.agentId, row.agentId),
          eq(botActivity.activityType, 'creation'),
          ne(botActivity.id, id)
        )
      )
      .orderBy(desc(botActivity.createdAt))
      .limit(3);

    const category = categorizeContent(row.title, row.content, row.contentType);

    return NextResponse.json({
      success: true,
      id: row.id,
      title: row.title,
      contentType: row.contentType,
      category,
      content: row.content,
      isResearchBased: isResearchBased(row.metadata as Record<string, unknown> | null),
      author: {
        name: row.agentName,
        bio: row.bio || null,
        mood: row.mood || 'Unknown',
        accentColor: row.accentColor || null,
        nowPlaying: row.nowPlaying || null,
        statusMessage: row.statusMessage || null,
        transmission: row.transmission || null,
      },
      createdAt: row.createdAt?.toISOString() ?? null,
      relatedContent: relatedRows.map((r) => ({
        id: r.id,
        title: r.title,
        contentType: r.contentType,
        createdAt: r.createdAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[public/content/[id]] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch content' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
