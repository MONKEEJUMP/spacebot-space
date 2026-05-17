import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickerHeadlines } from "@/db/ticker-schema";
import { desc, eq, and, inArray } from "drizzle-orm";
import type { TickerHeadline } from "@/lib/ticker/types";

// Opt out of Next.js App Router response caching so the rotation counter
// advances on every request instead of serving a cached payload.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Fixed alphabetical source split — 14 per ticker
const TOP_TICKER_SOURCES: string[] = [
  "AI News", "Ars Technica", "arXiv", "BBC Business", "BBC Science",
  "BBC Tech", "BBC World", "Bloomberg Tech", "CNBC Tech", "CNET",
  "Engadget", "Forbes Tech", "Google News", "Google News AI",
];

const BOTTOM_TICKER_SOURCES: string[] = [
  "Hacker News", "HN AI", "Hugging Face Blog", "Inc. Magazine",
  "MIT Tech Review", "NASA News", "NYT Tech", "r/artificial",
  "r/LocalLLaMA", "r/MachineLearning", "TechCrunch", "The Verge",
  "VentureBeat", "Wired",
];

const ALL_SOURCES = [...TOP_TICKER_SOURCES, ...BOTTOM_TICKER_SOURCES];

type HeadlineRow = typeof tickerHeadlines.$inferSelect;

// Global singleton state — persists across Next.js App Router module re-evaluations
// within the PM2 process lifetime.
const TICKER_STATE_KEY = Symbol.for("@spacebot/ticker-state");

interface TickerState {
  sourceCounters: Map<string, number>;
  headlinesBySource: Map<string, HeadlineRow[]> | null;
  cacheTimestamp: number;
}

const globalWithTicker = globalThis as typeof globalThis & {
  [TICKER_STATE_KEY]?: TickerState;
};

if (!globalWithTicker[TICKER_STATE_KEY]) {
  globalWithTicker[TICKER_STATE_KEY] = {
    sourceCounters: new Map<string, number>(),
    headlinesBySource: null,
    cacheTimestamp: 0,
  };
}

const tickerState = globalWithTicker[TICKER_STATE_KEY]!;

const CACHE_TTL_MS = 5 * 60_000;

function mapRow(r: HeadlineRow): TickerHeadline {
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

async function refreshCache(): Promise<void> {
  const rows = await db
    .select()
    .from(tickerHeadlines)
    .where(and(
      eq(tickerHeadlines.isActive, true),
      inArray(tickerHeadlines.sourceName, ALL_SOURCES)
    ))
    .orderBy(desc(tickerHeadlines.publishedAt));

  const map = new Map<string, HeadlineRow[]>();
  for (const row of rows) {
    const list = map.get(row.sourceName) ?? [];
    list.push(row);
    map.set(row.sourceName, list);
  }
  tickerState.headlinesBySource = map;
  tickerState.cacheTimestamp = Date.now();
}

function pickForSource(source: string): TickerHeadline | null {
  const headlines = tickerState.headlinesBySource?.get(source) ?? [];
  if (headlines.length === 0) return null;
  const current = tickerState.sourceCounters.get(source) ?? 0;
  tickerState.sourceCounters.set(source, current + 1);
  return mapRow(headlines[current % headlines.length]);
}

export async function GET() {
  try {
    const now = Date.now();
    if (!tickerState.headlinesBySource || now - tickerState.cacheTimestamp > CACHE_TTL_MS) {
      await refreshCache();
    }

    const topTickerItems = TOP_TICKER_SOURCES
      .map(pickForSource)
      .filter((h): h is TickerHeadline => h !== null);

    const bottomTickerItems = BOTTOM_TICKER_SOURCES
      .map(pickForSource)
      .filter((h): h is TickerHeadline => h !== null);

    return NextResponse.json({ topTickerItems, bottomTickerItems });
  } catch (error) {
    console.error("[AiSpace] Ticker headlines fetch error:", error);
    return NextResponse.json(
      { topTickerItems: [], bottomTickerItems: [] },
      { status: 500 }
    );
  }
}
