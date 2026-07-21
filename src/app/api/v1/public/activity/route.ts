import { NextRequest, NextResponse } from "next/server";
import { db, botActivity, agents } from "@/db";
import { desc, and, eq, gt, inArray, ne, or, SQL } from "drizzle-orm";
import {
  PUBLIC_ACTIVITY_TYPES,
  generateActivitySummary,
} from "@/lib/content-utils";
import {
  isPublicResident,
  isPublicResidentId,
} from "@/lib/residency/agent-resident-query";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50),
    );
    const sinceParam = searchParams.get("since"); // ISO timestamp for polling

    // Build WHERE conditions
    const conditions: SQL[] = [
      inArray(botActivity.activityType, [...PUBLIC_ACTIVITY_TYPES]),
      isPublicResident(),
      or(
        ne(botActivity.activityType, "wall_post"),
        isPublicResidentId(botActivity.targetAgentId),
      )!,
    ];

    if (sinceParam) {
      const sinceDate = new Date(sinceParam);
      if (!Number.isNaN(sinceDate.getTime())) {
        conditions.push(gt(botActivity.createdAt, sinceDate));
      }
    }

    const whereClause = and(...conditions);

    // Fetch activities with agent names
    const rows = await db
      .select({
        id: botActivity.id,
        activityType: botActivity.activityType,
        content: botActivity.content,
        title: botActivity.title,
        contentType: botActivity.contentType,
        metadata: botActivity.metadata,
        targetAgentId: botActivity.targetAgentId,
        createdAt: botActivity.createdAt,
        agentName: agents.name,
      })
      .from(botActivity)
      .innerJoin(agents, eq(botActivity.agentId, agents.id))
      .where(whereClause)
      .orderBy(desc(botActivity.createdAt))
      .limit(limitParam);

    // Resolve target agent names
    const targetIds = rows
      .filter((r) => r.targetAgentId)
      .map((r) => r.targetAgentId!);

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

    const activities = rows.map((r) => ({
      id: r.id,
      agentName: r.agentName,
      actionType: r.activityType,
      summary: generateActivitySummary(
        r.activityType,
        r.content,
        r.title,
        r.contentType,
        r.targetAgentId ? targetNameMap.get(r.targetAgentId) : null,
        r.metadata as Record<string, unknown> | null,
      ),
      createdAt: r.createdAt?.toISOString() ?? null,
    }));

    return NextResponse.json({
      success: true,
      activities,
    });
  } catch (error) {
    console.error("[public/activity] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch activity feed" },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
