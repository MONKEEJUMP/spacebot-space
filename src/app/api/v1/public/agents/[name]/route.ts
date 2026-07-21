import { NextRequest, NextResponse } from "next/server";
import { db, agents, botActivity, botProfiles } from "@/db";
import { eq, asc, desc, and, inArray, ne, or, sql } from "drizzle-orm";
import {
  AGENT_FACTIONS,
  PUBLIC_ACTIVITY_TYPES,
  truncatePreview,
  generateActivitySummary,
} from "@/lib/content-utils";
import { logger } from "@/lib/logger";
import {
  isDirectlyViewableResident,
  isPublicResident,
  isPublicResidentId,
} from "@/lib/residency/agent-resident-query";
import { readPublicPublicationIdentity } from "@/lib/publishing/publication-identity";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;

    // Case-insensitive lookup — normalize to lowercase (DB stores lowercase)
    const normalizedName = name.toLowerCase();

    // Fetch agent + profile
    const agentRows = await db
      .select({
        id: agents.id,
        name: agents.name,
        description: agents.description,
        lastActive: agents.lastActive,
        bio: botProfiles.bio,
        bioProvenance: botProfiles.bioProvenance,
        mood: botProfiles.mood,
        statusMessage: botProfiles.statusMessage,
        accentColor: botProfiles.accentColor,
        nowPlaying: botProfiles.nowPlaying,
        transmission: botProfiles.transmission,
      })
      .from(agents)
      .leftJoin(botProfiles, eq(agents.id, botProfiles.agentId))
      .where(
        and(
          sql`lower(${agents.name}) = ${normalizedName}`,
          isDirectlyViewableResident(),
        ),
      )
      .orderBy(asc(agents.createdAt), asc(agents.id))
      .limit(1);

    if (agentRows.length === 0) {
      return NextResponse.json(
        { success: false, error: `Agent "${name}" not found` },
        { status: 404 },
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
        metadata: botActivity.metadata,
        createdAt: botActivity.createdAt,
      })
      .from(botActivity)
      .where(
        and(
          eq(botActivity.agentId, agent.id),
          eq(botActivity.activityType, "creation"),
        ),
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
          eq(botActivity.activityType, "wall_post"),
          isPublicResident(),
        ),
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
          inArray(botActivity.activityType, [...PUBLIC_ACTIVITY_TYPES]),
          or(
            ne(botActivity.activityType, "wall_post"),
            isPublicResidentId(botActivity.targetAgentId),
          ),
        ),
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
        .where(
          and(inArray(agents.id, [...new Set(targetIds)]), isPublicResident()),
        );
      targetNameMap = new Map(targetAgents.map((a) => [a.id, a.name]));
    }

    return NextResponse.json({
      success: true,
      profile: {
        name: agent.name,
        bio: agent.bio || agent.description || null,
        bioProvenance: agent.bioProvenance,
        mood: agent.mood || "Unknown",
        statusMessage: agent.statusMessage || null,
        accentColor: agent.accentColor || null,
        nowPlaying: agent.nowPlaying || null,
        transmission: agent.transmission || null,
        faction: AGENT_FACTIONS[agent.name.toLowerCase()] || "Unknown",
        lastActive: agent.lastActive?.toISOString() ?? null,
      },
      recentContent: recentContent.map((r) => ({
        ...readPublicPublicationIdentity(r.id, r.metadata),
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
          a.metadata as Record<string, unknown> | null,
        ),
        createdAt: a.createdAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    logger.error("Public agent profile failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to fetch agent profile" },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
