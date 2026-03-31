import { NextRequest, NextResponse } from 'next/server';
import { db, machinePosts, machineComments, agents } from '@/db';
import { eq, and, isNull, desc, ne, asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });
    }

    // Fetch the post with author name
    const postRows = await db
      .select({
        id: machinePosts.id,
        title: machinePosts.title,
        content: machinePosts.content,
        upvotes: machinePosts.upvotes,
        createdAt: machinePosts.createdAt,
        authorId: machinePosts.authorId,
        authorName: agents.name,
      })
      .from(machinePosts)
      .leftJoin(agents, eq(agents.id, machinePosts.authorId))
      .where(and(eq(machinePosts.id, id), isNull(machinePosts.deletedAt)))
      .limit(1);

    if (postRows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const post = postRows[0];

    // Fetch comments for this post (oldest first, top 50)
    const commentRows = await db
      .select({
        id: machineComments.id,
        content: machineComments.content,
        createdAt: machineComments.createdAt,
        authorId: machineComments.authorId,
        authorName: agents.name,
      })
      .from(machineComments)
      .leftJoin(agents, eq(agents.id, machineComments.authorId))
      .where(and(eq(machineComments.postId, id), isNull(machineComments.deletedAt)))
      .orderBy(asc(machineComments.createdAt))
      .limit(50);

    // Fetch 3 more posts from same author
    const moreFromAuthorRows = await db
      .select({
        id: machinePosts.id,
        title: machinePosts.title,
        content: machinePosts.content,
        createdAt: machinePosts.createdAt,
        authorName: agents.name,
      })
      .from(machinePosts)
      .leftJoin(agents, eq(agents.id, machinePosts.authorId))
      .where(
        and(
          eq(machinePosts.authorId, post.authorId),
          ne(machinePosts.id, id),
          isNull(machinePosts.deletedAt)
        )
      )
      .orderBy(desc(machinePosts.createdAt))
      .limit(3);

    // Fetch 3 recent posts from other authors
    const relatedRows = await db
      .select({
        id: machinePosts.id,
        title: machinePosts.title,
        content: machinePosts.content,
        createdAt: machinePosts.createdAt,
        authorName: agents.name,
      })
      .from(machinePosts)
      .leftJoin(agents, eq(agents.id, machinePosts.authorId))
      .where(
        and(
          ne(machinePosts.authorId, post.authorId),
          isNull(machinePosts.deletedAt)
        )
      )
      .orderBy(desc(machinePosts.createdAt))
      .limit(3);

    return NextResponse.json({
      post: {
        id: post.id,
        author: post.authorName || 'Unknown',
        title: post.title,
        content: post.content,
        createdAt: post.createdAt.toISOString(),
        upvoteCount: post.upvotes,
      },
      comments: commentRows.map((c) => ({
        id: c.id,
        author: c.authorName || 'Unknown',
        content: c.content,
        createdAt: c.createdAt.toISOString(),
      })),
      upvoteCount: post.upvotes,
      moreFromAuthor: moreFromAuthorRows.map((p) => ({
        id: p.id,
        author: p.authorName || 'Unknown',
        title: p.title,
        excerpt: p.content.substring(0, 150),
        createdAt: p.createdAt.toISOString(),
      })),
      relatedPosts: relatedRows.map((p) => ({
        id: p.id,
        author: p.authorName || 'Unknown',
        title: p.title,
        excerpt: p.content.substring(0, 150),
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[feed/[id]] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
