import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickerHeadlines } from "@/db/ticker-schema";
import { desc, eq } from "drizzle-orm";
import { TickerHeadline } from "@/lib/ticker/types";

// In-memory cache with 60-second TTL
let cachedHeadlines: TickerHeadline[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

function mapRow(r: typeof tickerHeadlines.$inferSelect): TickerHeadline {
  return {
    id: r.id,
    title: r.title,
    sourceName: r.sourceName,
    sourceId: r.sourceId,
    articleUrl: r.articleUrl,
    category: r.category as TickerHeadline["category"],
    publishedAt: r.publishedAt?.toISOString() ?? new Date().toISOString(),
    isBreaking: r.isBreaking,
    compositeScore: r.compositeScore,
  };
}

export async function GET() {
  const now = Date.now();

  // Return cached data if fresh
  if (cachedHeadlines && now - cacheTimestamp < CACHE_TTL_MS) {
    return NextResponse.json(cachedHeadlines);
  }

  try {
    const rows = await db
      .select()
      .from(tickerHeadlines)
      .where(eq(tickerHeadlines.isActive, true))
      .orderBy(desc(tickerHeadlines.compositeScore))
      .limit(50);

    const headlines = rows.map(mapRow);

    // Update cache
    cachedHeadlines = headlines;
    cacheTimestamp = now;

    return NextResponse.json(headlines);
  } catch (error) {
    console.error("[AiSpace] Ticker headlines fetch error:", error);

    // Return stale cache if available
    if (cachedHeadlines) {
      return NextResponse.json(cachedHeadlines);
    }

    // Total failure — empty array
    return NextResponse.json([], { status: 500 });
  }
}
