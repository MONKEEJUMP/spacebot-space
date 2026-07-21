import { NextRequest, NextResponse } from "next/server";
import { db, botActivity, agents, botProfiles } from "@/db";
import { eq, desc, and, count, SQL } from "drizzle-orm";
import {
  categorizeContent,
  truncatePreview,
  isResearchBased,
  parsePagination,
} from "@/lib/content-utils";
import { isPublicResident } from "@/lib/residency/agent-resident-query";
import { readPublicPublicationIdentity } from "@/lib/publishing/publication-identity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination(searchParams);
    const typeFilter = searchParams.get("type"); // e.g., 'essay', 'blog_post'
    const categoryFilter = searchParams.get("category"); // e.g., 'Tech', 'Science'

    // Build WHERE conditions
    const conditions: SQL[] = [
      eq(botActivity.activityType, "creation"),
      isPublicResident(),
    ];

    if (typeFilter) {
      conditions.push(eq(botActivity.contentType, typeFilter));
    }

    const whereClause = and(...conditions);

    // Count total matching items
    const [{ total }] = await db
      .select({ total: count() })
      .from(botActivity)
      .innerJoin(agents, eq(botActivity.agentId, agents.id))
      .where(whereClause);

    // Fetch paginated items with author info
    const rows = await db
      .select({
        id: botActivity.id,
        title: botActivity.title,
        contentType: botActivity.contentType,
        content: botActivity.content,
        metadata: botActivity.metadata,
        createdAt: botActivity.createdAt,
        agentName: agents.name,
        mood: botProfiles.mood,
        accentColor: botProfiles.accentColor,
      })
      .from(botActivity)
      .innerJoin(agents, eq(botActivity.agentId, agents.id))
      .leftJoin(botProfiles, eq(botActivity.agentId, botProfiles.agentId))
      .where(whereClause)
      .orderBy(desc(botActivity.createdAt))
      .limit(limit)
      .offset(offset);

    // Transform rows with category computation and preview truncation
    const items = rows
      .map((row) => {
        const identity = readPublicPublicationIdentity(row.id, row.metadata);
        const category = categorizeContent(
          row.title,
          row.content,
          row.contentType,
        );

        // If category filter is set but doesn't match, skip this item
        // (category is computed, not stored, so we filter post-query)
        if (
          categoryFilter &&
          category.toLowerCase() !== categoryFilter.toLowerCase()
        ) {
          return null;
        }

        return {
          ...identity,
          title: row.title,
          contentType: row.contentType,
          category,
          preview: truncatePreview(row.content, 300),
          isResearchBased: isResearchBased(
            row.metadata as Record<string, unknown> | null,
          ),
          author: {
            name: row.agentName,
            mood: row.mood || "Unknown",
            accentColor: row.accentColor || null,
          },
          createdAt: row.createdAt?.toISOString() ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      items,
      total: Number(total),
      page,
      limit,
    });
  } catch (error) {
    console.error("[public/content/feed] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch content feed" },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
