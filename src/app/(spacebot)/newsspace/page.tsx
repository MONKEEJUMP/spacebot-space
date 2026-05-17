import { db } from '@/db';
import { tickerHeadlines } from '@/db/ticker-schema';
import { desc, eq, and, gt, sql as drizzleSql } from 'drizzle-orm';
import NewsHeader from '@/components/newsspace/NewsHeader';
import NewsMosaic from '@/components/newsspace/NewsMosaic';

export const dynamic = 'force-dynamic';

export default async function NewsSpacePage() {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: tickerHeadlines.id,
      title: tickerHeadlines.title,
      sourceName: tickerHeadlines.sourceName,
      articleUrl: tickerHeadlines.articleUrl,
      category: tickerHeadlines.category,
      publishedAt: tickerHeadlines.publishedAt,
      editorReviewedAt: tickerHeadlines.editorReviewedAt,
      tileSize: tickerHeadlines.tileSize,
      editorNote: tickerHeadlines.editorNote,
      thumbnailUrl: tickerHeadlines.thumbnailUrl,
    })
    .from(tickerHeadlines)
    .where(
      and(
        eq(tickerHeadlines.editorApproved, true),
        eq(tickerHeadlines.isActive, true),
        gt(tickerHeadlines.editorReviewedAt, twoHoursAgo)
      )
    )
    .orderBy(desc(tickerHeadlines.editorReviewedAt));

  const posts = rows.map((r) => ({
    id: r.id,
    title: r.title,
    source: r.sourceName,
    articleUrl: r.articleUrl,
    category: r.category,
    createdAt: (r.editorReviewedAt ?? r.publishedAt ?? new Date()).toISOString(),
    size: (r.tileSize ?? 'small') as 'big' | 'medium' | 'small',
    editorialNote: r.editorNote ?? null,
    thumbnailUrl: r.thumbnailUrl ?? null,
  }));

  const lastPostTime = posts.length > 0 ? posts[0].createdAt : null;

  return (
    <div style={{ background: '#F0F2F5', minHeight: '100vh' }}>
      <NewsHeader lastPostTime={lastPostTime} />
      <NewsMosaic posts={posts} />
    </div>
  );
}
