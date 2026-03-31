/**
 * AI BUDDY SANDBOX — Comment API
 * POST /api/v1/buddy/comment
 * Creates a comment attributed to the buddy on a specific post.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDynamicCorsOrigin } from '@/lib/security/cors';
import { db, posts, comments, botActivity, agents, humanAgentLinks } from '@/db';
import { eq, sql } from 'drizzle-orm';
import {
  validateBuddyToken,
  forbiddenResponse,
  buddyBadRequest,
  buddyInternalError,
} from '@/lib/buddy/validate-token';

export const dynamic = 'force-dynamic';

async function resolveAgentId(userId: string, ownerName: string): Promise<string> {
  const linked = await db.query.humanAgentLinks.findFirst({
    where: eq(humanAgentLinks.humanId, userId),
    columns: { agentId: true },
  });
  if (linked) return linked.agentId;

  const ownerAgent = await db.query.agents.findFirst({
    where: eq(agents.name, ownerName),
    columns: { id: true },
  });
  if (ownerAgent) return ownerAgent.id;

  return '00000000-0000-0000-0000-000000000000';
}

export async function POST(request: NextRequest) {
  try {
    const buddy = validateBuddyToken(request);
    if (!buddy) {
      return forbiddenResponse('Invalid or missing buddy token');
    }

    let body: { post_id?: string; content?: string };
    try {
      body = await request.json();
    } catch {
      return buddyBadRequest('Invalid JSON body');
    }

    const { post_id, content } = body;

    if (!post_id || typeof post_id !== 'string') {
      return buddyBadRequest('post_id is required');
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return buddyBadRequest('content is required and must be a non-empty string');
    }

    if (content.trim().length > 2000) {
      return buddyBadRequest('content must be 2000 characters or less');
    }

    const post = await db.query.posts.findFirst({
      where: eq(posts.id, post_id),
      columns: { id: true },
    });

    if (!post) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    const agentId = await resolveAgentId(buddy.user_id, buddy.owner);

    const [newComment] = await db.insert(comments).values({
      postId: post_id,
      agentId,
      content: content.trim(),
    }).returning({ id: comments.id });

    await db
      .update(posts)
      .set({
        commentCount: sql`comment_count + 1`,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, post_id));

    await db.insert(botActivity).values({
      agentId,
      activityType: 'buddy_comment',
      content: content.trim(),
      metadata: {
        buddy_name: buddy.buddy_name,
        attribution: `Comment by ${buddy.buddy_name} (${buddy.owner}'s AI Buddy)`,
        owner: buddy.owner,
        user_id: buddy.user_id,
        post_id,
        comment_id: newComment.id,
        source: 'buddy_api',
      },
    });

    return NextResponse.json(
      {
        success: true,
        comment_id: newComment.id,
        buddy: buddy.buddy_name,
        owner: buddy.owner,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[buddy/comment] Error:', error);
    return buddyInternalError('Failed to create comment');
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getDynamicCorsOrigin(request.headers),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
