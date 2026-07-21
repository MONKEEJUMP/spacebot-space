import { NextResponse } from "next/server";
import { db } from "@/db";
import { tickerHeadlines } from "@/db/ticker-schema";
import { desc, eq, and, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import type { TickerHeadline } from "@/lib/ticker/types";
import {
  ALL_HOMEPAGE_TICKER_SOURCES,
  BOTTOM_TICKER_SOURCES,
  HOMEPAGE_TICKER_SOURCE_TARGET,
  TOP_TICKER_SOURCES,
} from "@/lib/ticker/homepage-contract";
import {
  compareHomepageHeadlines,
  isHomepageEditorialPreferred,
} from "@/lib/ticker/homepage-editorial";
import { pickRotatingHeadlinesForSources } from "@/lib/ticker/homepage-selection";

// Opt out of Next.js App Router response caching so the rotation counter
// advances on every request instead of serving a cached payload.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type HeadlineRow = typeof tickerHeadlines.$inferSelect;

// Global singleton state — persists across Next.js App Router module re-evaluations
// within the PM2 process lifetime.
const TICKER_STATE_KEY = Symbol.for("@spacebot/ticker-state");

interface TickerState {
  sourceCounters: Map<string, number>;
  headlinesBySource: Map<string, HeadlineRow[]> | null;
  cacheTimestamp: number;
}

// eslint-disable-next-line no-undef
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
    .where(
      and(
        eq(tickerHeadlines.isActive, true),
        inArray(tickerHeadlines.sourceName, ALL_HOMEPAGE_TICKER_SOURCES),
      ),
    )
    .orderBy(desc(tickerHeadlines.publishedAt));

  const map = new Map<string, HeadlineRow[]>();
  for (const row of rows) {
    const list = map.get(row.sourceName) ?? [];
    list.push(row);
    map.set(row.sourceName, list);
  }

  for (const sourceRows of map.values()) {
    sourceRows.sort(compareHomepageHeadlines);
  }

  tickerState.headlinesBySource = map;
  tickerState.cacheTimestamp = Date.now();
}

export async function GET() {
  try {
    const now = Date.now();
    if (
      !tickerState.headlinesBySource ||
      now - tickerState.cacheTimestamp > CACHE_TTL_MS
    ) {
      await refreshCache();
    }

    const headlinesBySource = tickerState.headlinesBySource ?? new Map();
    const topTickerItems = pickRotatingHeadlinesForSources<HeadlineRow>(
      TOP_TICKER_SOURCES,
      headlinesBySource,
      tickerState.sourceCounters,
      HOMEPAGE_TICKER_SOURCE_TARGET,
      isHomepageEditorialPreferred,
    ).map(mapRow);

    const bottomTickerItems = pickRotatingHeadlinesForSources<HeadlineRow>(
      BOTTOM_TICKER_SOURCES,
      headlinesBySource,
      tickerState.sourceCounters,
      HOMEPAGE_TICKER_SOURCE_TARGET,
      isHomepageEditorialPreferred,
    ).map(mapRow);

    return NextResponse.json({ topTickerItems, bottomTickerItems });
  } catch (error) {
    logger.error("Ticker headlines fetch error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { topTickerItems: [], bottomTickerItems: [] },
      { status: 500 },
    );
  }
}
