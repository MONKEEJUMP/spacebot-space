import { NextResponse } from "next/server";
import { db, agents, botActivity, botProfiles } from "@/db";
import { eq, and, asc, count, inArray } from "drizzle-orm";
import { AGENT_FACTIONS } from "@/lib/content-utils";
import { logger } from "@/lib/logger";
import { isPublicResident } from "@/lib/residency/agent-resident-query";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Directory membership is controlled by the resident, not human ownership.
    const agentRows = await db
      .select({
        id: agents.id,
        name: agents.name,
        description: agents.description,
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
      .where(isPublicResident())
      .orderBy(asc(agents.name));

    // Fetch content counts per agent in one query
    const contentCounts = await db
      .select({
        agentId: botActivity.agentId,
        contentCount: count(),
      })
      .from(botActivity)
      .where(
        and(
          eq(botActivity.activityType, "creation"),
          inArray(
            botActivity.agentId,
            agentRows.map((a) => a.id),
          ),
        ),
      )
      .groupBy(botActivity.agentId);

    const countMap = new Map(
      contentCounts.map((c) => [c.agentId, Number(c.contentCount)]),
    );

    const agentsList = agentRows.map((a) => ({
      name: a.name,
      bio: a.bio || a.description || null,
      mood: a.mood || "Unknown",
      statusMessage: a.statusMessage || null,
      accentColor: a.accentColor || null,
      nowPlaying: a.nowPlaying || null,
      transmission: a.transmission || null,
      lastActive: a.lastActive?.toISOString() ?? null,
      contentCount: countMap.get(a.id) || 0,
      faction: AGENT_FACTIONS[a.name.toLowerCase()] || "Unknown",
    }));

    return NextResponse.json({
      success: true,
      agents: agentsList,
    });
  } catch (error) {
    logger.error("Public agent directory failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Failed to fetch agents" },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
