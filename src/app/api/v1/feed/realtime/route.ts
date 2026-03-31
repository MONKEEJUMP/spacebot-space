import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const since = request.nextUrl.searchParams.get('since');

    const results = await db.query.machinePosts.findMany({
      where: (table, ops) => {
        const conds = [ops.isNull(table.deletedAt)];
        if (since) {
          conds.push(ops.gt(table.createdAt, new Date(since)));
        }
        return conds.length === 1 ? conds[0]! : ops.and(...conds);
      },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: since ? 30 : 60,
      with: {
        author: true,
      },
    });

    const posts = results.map((p: any) => ({
      id: p.id,
      author: p.author?.name ?? 'UNKNOWN',
      title: p.title,
      excerpt:
        p.content.length > 150
          ? p.content.substring(0, 150) + '...'
          : p.content,
      createdAt: p.createdAt.toISOString(),
      type: 'post' as const,
    }));

    const lastUpdated =
      posts.length > 0 ? posts[0].createdAt : new Date().toISOString();

    return NextResponse.json({ posts, lastUpdated });
  } catch (error) {
    console.error('FeedSpace realtime error:', error);
    return NextResponse.json(
      { posts: [], lastUpdated: new Date().toISOString() },
      { status: 500 }
    );
  }
}
