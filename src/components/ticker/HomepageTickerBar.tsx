import { cache } from "react";
import { db } from "@/db";
import { tickerHeadlines } from "@/db/ticker-schema";
import { desc, eq, and, inArray } from "drizzle-orm";
import type { NewsHeadlineItem, CategoryKey } from "@/lib/ticker/types";
import {
  ALL_HOMEPAGE_TICKER_SOURCES,
  BOTTOM_TICKER_SOURCES,
  HOMEPAGE_TICKER_SOURCE_TARGET,
  TOP_TICKER_SOURCES,
} from "@/lib/ticker/homepage-contract";
import { compareHomepageHeadlines } from "@/lib/ticker/homepage-editorial";
import { pickStaticHeadlinesForSources } from "@/lib/ticker/homepage-selection";
import HomepageTickerClient from "./HomepageTickerClient";

type HeadlineRow = {
  id: string;
  title: string;
  sourceName: string;
  articleUrl: string;
  category: string;
  publishedAt: Date | null;
  isBreaking: boolean;
  editorApproved: boolean | null;
  editorReviewedAt: Date | null;
};

function toNewsItem(r: HeadlineRow): NewsHeadlineItem {
  const catMap: Record<string, CategoryKey> = {
    ai: "Ai",
    tech: "Tech",
    culture: "Culture",
    science: "Science",
    business: "Business",
    society: "Society",
    world: "Tech",
  };
  return {
    type: "news-headline" as const,
    id: r.id,
    title: r.title,
    source: r.sourceName,
    category: catMap[r.category?.toLowerCase()] ?? "Tech",
    url: r.articleUrl,
    publishedAt: r.publishedAt ? r.publishedAt.getTime() : Date.now(),
    isBreaking: r.isBreaking,
  };
}

const fetchSplitNews = cache(
  async (): Promise<{
    topItems: NewsHeadlineItem[];
    bottomItems: NewsHeadlineItem[];
  }> => {
    try {
      const rows = await db
        .select({
          id: tickerHeadlines.id,
          title: tickerHeadlines.title,
          sourceName: tickerHeadlines.sourceName,
          articleUrl: tickerHeadlines.articleUrl,
          category: tickerHeadlines.category,
          publishedAt: tickerHeadlines.publishedAt,
          isBreaking: tickerHeadlines.isBreaking,
          editorApproved: tickerHeadlines.editorApproved,
          editorReviewedAt: tickerHeadlines.editorReviewedAt,
        })
        .from(tickerHeadlines)
        .where(
          and(
            eq(tickerHeadlines.isActive, true),
            inArray(tickerHeadlines.sourceName, ALL_HOMEPAGE_TICKER_SOURCES),
          ),
        )
        .orderBy(desc(tickerHeadlines.publishedAt));

      const bySource = new Map<string, HeadlineRow[]>();
      for (const row of rows) {
        const sourceRows = bySource.get(row.sourceName) ?? [];
        sourceRows.push(row);
        bySource.set(row.sourceName, sourceRows);
      }

      for (const sourceRows of bySource.values()) {
        sourceRows.sort(compareHomepageHeadlines);
      }

      const topItems = pickStaticHeadlinesForSources(
        TOP_TICKER_SOURCES,
        bySource,
        HOMEPAGE_TICKER_SOURCE_TARGET,
      ).map(toNewsItem);

      const bottomItems = pickStaticHeadlinesForSources(
        BOTTOM_TICKER_SOURCES,
        bySource,
        HOMEPAGE_TICKER_SOURCE_TARGET,
      ).map(toNewsItem);

      return { topItems, bottomItems };
    } catch {
      return { topItems: [], bottomItems: [] };
    }
  },
);

export default async function HomepageTickerBar() {
  const { topItems, bottomItems } = await fetchSplitNews();

  return (
    <div className="homepage-ticker-bar" aria-label="Live news feed">
      <HomepageTickerClient
        topInitialItems={topItems}
        bottomInitialItems={bottomItems}
      />
    </div>
  );
}
