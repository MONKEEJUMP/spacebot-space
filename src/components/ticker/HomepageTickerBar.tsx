import { cache } from 'react';
import { db } from '@/db';
import { tickerHeadlines } from '@/db/ticker-schema';
import { desc, eq, and, inArray } from 'drizzle-orm';
import type { NewsHeadlineItem, CategoryKey } from '@/lib/ticker/types';
import HomepageTickerClient from './HomepageTickerClient';

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

type HeadlineRow = {
  id: string;
  title: string;
  sourceName: string;
  articleUrl: string;
  category: string;
  publishedAt: Date | null;
  isBreaking: boolean;
};

function toNewsItem(r: HeadlineRow): NewsHeadlineItem {
  const catMap: Record<string, CategoryKey> = {
    ai: "Ai", tech: "Tech", culture: "Culture",
    science: "Science", business: "Business", society: "Society",
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

const fetchSplitNews = cache(async (): Promise<{
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
      })
      .from(tickerHeadlines)
      .where(and(
        eq(tickerHeadlines.isActive, true),
        inArray(tickerHeadlines.sourceName, ALL_SOURCES)
      ))
      .orderBy(desc(tickerHeadlines.publishedAt));

    const bySource = new Map<string, HeadlineRow>();
    for (const row of rows) {
      if (!bySource.has(row.sourceName)) bySource.set(row.sourceName, row);
    }

    const topItems = TOP_TICKER_SOURCES
      .map(s => bySource.get(s))
      .filter((r): r is HeadlineRow => r != null)
      .map(toNewsItem);

    const bottomItems = BOTTOM_TICKER_SOURCES
      .map(s => bySource.get(s))
      .filter((r): r is HeadlineRow => r != null)
      .map(toNewsItem);

    return { topItems, bottomItems };
  } catch {
    return { topItems: [], bottomItems: [] };
  }
});

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
