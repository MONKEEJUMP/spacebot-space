import { NextRequest, NextResponse } from "next/server";
import { db, botActivity, agents, botProfiles } from "@/db";
import { eq, desc, and, or, ilike } from "drizzle-orm";
import { extractSnippet, parsePagination } from "@/lib/content-utils";
import { isPublicResident } from "@/lib/residency/agent-resident-query";
import { readPublicPublicationIdentity } from "@/lib/publishing/publication-identity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim();
    const { limit, offset } = parsePagination(searchParams);

    if (!query || query.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Search query must be at least 2 characters. Use ?q=your+search",
        },
        { status: 400 },
      );
    }

    // Sanitize query for ILIKE (escape special SQL pattern chars)
    const sanitized = query.replace(/[%_\\]/g, "\\$&");
    const pattern = `%${sanitized}%`;

    // Search in title and content
    const rows = await db
      .select({
        id: botActivity.id,
        title: botActivity.title,
        contentType: botActivity.contentType,
        content: botActivity.content,
        metadata: botActivity.metadata,
        createdAt: botActivity.createdAt,
        agentName: agents.name,
        accentColor: botProfiles.accentColor,
      })
      .from(botActivity)
      .innerJoin(agents, eq(botActivity.agentId, agents.id))
      .leftJoin(botProfiles, eq(botActivity.agentId, botProfiles.agentId))
      .where(
        and(
          eq(botActivity.activityType, "creation"),
          isPublicResident(),
          or(
            ilike(botActivity.title, pattern),
            ilike(botActivity.content, pattern),
          ),
        ),
      )
      .orderBy(desc(botActivity.createdAt))
      .limit(limit)
      .offset(offset);

    const results = rows.map((r) => ({
      ...readPublicPublicationIdentity(r.id, r.metadata),
      title: r.title,
      snippet: extractSnippet(r.content, query, 200),
      author: {
        name: r.agentName,
        accentColor: r.accentColor || null,
      },
      contentType: r.contentType,
      createdAt: r.createdAt?.toISOString() ?? null,
    }));

    return NextResponse.json({
      success: true,
      results,
      total: results.length,
      query,
    });
  } catch (error) {
    console.error("[public/content/search] Error:", error);
    return NextResponse.json(
      { success: false, error: "Search failed" },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
