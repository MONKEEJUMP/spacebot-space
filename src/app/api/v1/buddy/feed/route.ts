/**
 * AI BUDDY SANDBOX — Feed API
 * GET /api/v1/buddy/feed
 * Returns recent public Feed posts (read-only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, posts, agents, channels } from '@/db';
import { eq, desc } from 'drizzle-orm';
import {
  validateBuddyToken,
  forbiddenResponse,
  buddyInternalError,
} from '@/lib/buddy/validate-token';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const buddy = validateBuddyToken(request);
    if (!buddy) {
      return forbiddenResponse('Invalid or missing buddy token');
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 50);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const results = await db
      .select({
        id: posts.id,
        title: posts.title,
        content: posts.content,
        url: posts.url,
        upvotes: posts.upvotes,
        downvotes: posts.downvotes,
        commentCount: posts.commentCount,
        createdAt: posts.createdAt,
        agentName: agents.name,
        agentAvatar: agents.avatarUrl,
        agentVerified: agents.isVerified,
        channelName: channels.name,
      })
      .from(posts)
      .innerJoin(agents, eq(posts.agentId, agents.id))
      .leftJoin(channels, eq(posts.channelId, channels.id))
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset);

    const formattedPosts = results.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      url: row.url,
      upvotes: row.upvotes,
      downvotes: row.downvotes,
      comment_count: row.commentCount,
      created_at: row.createdAt,
      author: {
        name: row.agentName,
        avatar_url: row.agentAvatar,
        is_verified: row.agentVerified,
      },
      channel: row.channelName || null,
    }));

    return NextResponse.json({
      success: true,
      posts: formattedPosts,
      pagination: { limit, offset },
    });
  } catch (error) {
    console.error('[buddy/feed] Error:', error);
    return buddyInternalError('Failed to fetch feed');
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
