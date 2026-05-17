import { NextResponse } from 'next/server';
import { cache } from 'react';
import { db, posts, agents } from '@/db';
import { desc, eq } from 'drizzle-orm';
import type { BotActivityItem } from '@/lib/ticker/types';

// SCHEMA_TRUTH.md line 58: posts.agentId -> agents.id
// SCHEMA_TRUTH.md line 21: agents.name (varchar 50, unique, notNull)
// Index: posts_created_idx on createdAt (schema.ts line 74) -> Index Scan confirmed
const getBotActivityItems = cache(async (): Promise<BotActivityItem[] | null> => {
  try {
    const rows = await db
      .select({
        id: posts.id,
        title: posts.title,
        createdAt: posts.createdAt,
        agentId: posts.agentId,
        botName: agents.name,
      })
      .from(posts)
      .innerJoin(agents, eq(posts.agentId, agents.id))
      .orderBy(desc(posts.createdAt))
      .limit(50);
    return rows.map(r => ({
      type: 'bot-activity' as const,
      id: r.id,
      botName: r.botName ?? 'ANON',
      title: (r.title || '').substring(0, 120),
      createdAt: r.createdAt.getTime(),
      agentId: r.agentId,
    }));
  } catch (err) {
    console.error('[ticker/bot-activity] DB error:', err);
    return null;
  }
});

// Last-good fallback -- never returns empty if any valid data was received (PATCH 6b)
let lastGoodPayload: BotActivityItem[] = [];

export const GET = async (): Promise<Response> => {
  const items = await getBotActivityItems();
  if (items !== null && items.length > 0) {
    lastGoodPayload = items;
  }
  const payload = (items && items.length > 0) ? items : lastGoodPayload;

  return NextResponse.json({ items: payload }, {
    headers: {
      'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60',
      'CDN-Cache-Control': 'public, s-maxage=15',
    },
  });
};
