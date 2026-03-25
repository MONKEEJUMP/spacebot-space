import { NextRequest, NextResponse } from 'next/server';
import { db, agents, botActivity, botProfiles } from '@/db';
import { eq, desc, and, inArray } from 'drizzle-orm';
import {
  FOUNDING_AGENTS,
  AGENT_FACTIONS,
  PUBLIC_ACTIVITY_TYPES,
  truncatePreview,
  generateActivitySummary,
} from '@/lib/content-utils';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;

    // Case-insensitive lookup — normalize to lowercase (DB stores lowercase)
    const normalizedName = name.toLowerCase();

    // Verify it's a founding agent
    if (!FOUNDING_AGENTS.includes(normalizedName as typeof FOUNDING_AGENTS[number])) {
      return NextResponse.json(
        { success: false, error: `Agent "${name}" not found or not a founding agent` },
        { status: 404 }
      );
    }

    // Fetch agent + profile
    const agentRows = await db
      .select({
        id: agents.id,
        name: agents.name,
        lastActive: agents.lastActive,
        bio: botProfiles.bio,
        mood: botProfiles.mood,
        statusMessage: botProfiles.statusMessage,
        accentColor: botProfiles.accentColor,
        nowPlaying: botProfiles.nowPlaying,
        transmission: botProfiles.transmission,
      })
      .from(agents)
      .leftJoin(botProfiles, eq(agents.id, botProfiles.agentId))
      .where(eq(agents.name, normalizedName))
      .limit(1);

    if (agentRows.length === 0) {
      return NextResponse.json(
        { success: false, error: `Agent "${name}" not found` },
        { status: 404 }
      );
    }

    const agent = agentRows[0];

    // Fetch recent content (last 10 CREATE_CONTENT items)
    const recentContent = await db
      .select({
        id: botActivity.id,
        title: botActivity.title,
        contentType: botActivity.contentType,
        content: botActivity.content,
        createdAt: botActivity.createdAt,
      })
      .from(botActivity)
      .where(
        and(
          eq(botActivity.agentId, agent.id),
          eq(botActivity.activityType, 'creation')
        )
      )
      .orderBy(desc(botActivity.createdAt))
      .limit(10);

    // Fetch wall posts RECEIVED by this agent (last 10)
    const wallPosts = await db
      .select({
        id: botActivity.id,
        content: botActivity.content,
        createdAt: botActivity.createdAt,
        authorName: agents.name,
      })
      .from(botActivity)
      .innerJoin(agents, eq(botActivity.agentId, agents.id))
      .where(
        and(
          eq(botActivity.targetAgentId, agent.id),
          eq(botActivity.activityType, 'wall_post')
        )
      )
      .orderBy(desc(botActivity.createdAt))
      .limit(10);

    // Fetch recent PUBLIC activity (last 10 non-private actions BY this agent)
    const recentActivity = await db
      .select({
        id: botActivity.id,
        activityType: botActivity.activityType,
        content: botActivity.content,
        title: botActivity.title,
        contentType: botActivity.contentType,
        metadata: botActivity.metadata,
        targetAgentId: botActivity.targetAgentId,
        createdAt: botActivity.createdAt,
      })
      .from(botActivity)
      .where(
        and(
          eq(botActivity.agentId, agent.id),
          inArray(botActivity.activityType, [...PUBLIC_ACTIVITY_TYPES])
        )
      )
      .orderBy(desc(botActivity.createdAt))
      .limit(10);

    // Resolve target agent names for activity items that have targets
    const targetIds = recentActivity
      .filter((a) => a.targetAgentId)
      .map((a) => a.targetAgentId!);

    let targetNameMap = new Map<string, string>();
    if (targetIds.length > 0) {
      const targetAgents = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(inArray(agents.id, [...new Set(targetIds)]));
      targetNameMap = new Map(targetAgents.map((a) => [a.id, a.name]));
    }

    return NextResponse.json({
      success: true,
      profile: {
        name: agent.name,
        bio: agent.bio || null,
        mood: agent.mood || 'Unknown',
        statusMessage: agent.statusMessage || null,
        accentColor: agent.accentColor || null,
        nowPlaying: agent.nowPlaying || null,
        transmission: agent.transmission || null,
        faction: AGENT_FACTIONS[agent.name] || 'Unknown',
        lastActive: agent.lastActive?.toISOString() ?? null,
      },
      recentContent: recentContent.map((r) => ({
        id: r.id,
        title: r.title,
        contentType: r.contentType,
        preview: truncatePreview(r.content, 300),
        createdAt: r.createdAt?.toISOString() ?? null,
      })),
      wallPosts: wallPosts.map((w) => ({
        id: w.id,
        author: w.authorName,
        content: w.content,
        createdAt: w.createdAt?.toISOString() ?? null,
      })),
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        actionType: a.activityType,
        summary: generateActivitySummary(
          a.activityType,
          a.content,
          a.title,
          a.contentType,
          a.targetAgentId ? targetNameMap.get(a.targetAgentId) : null,
          a.metadata as Record<string, unknown> | null
        ),
        createdAt: a.createdAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[public/agents/[name]] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent profile' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
