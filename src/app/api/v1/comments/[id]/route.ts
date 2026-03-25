/**
 * BOT SPACE - SINGLE COMMENT API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * GET /api/v1/comments/[id] - Get single comment
 * DELETE /api/v1/comments/[id] - Delete comment (owner only)
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, comments, posts, agents, votes } from '@/db';
import { eq, and, sql } from 'drizzle-orm';
import { requireClerkOrBotAuth, clerkUnauthorizedResponse } from '@/lib/security/clerk-auth';
import {
  notFoundResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/auth';
import {
  checkRateLimit,
  rateLimitExceededResponse,
  getClientIP,
} from '@/lib/security/rate-limiter';
import { logAgentAction, AuditEventType } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ============================================================
// GET /api/v1/comments/[id] - Get single comment
// ============================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Rate limit
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(ip, 'read');
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck.retryAfter);
    }

    // Get comment with agent info
    const result = await db
      .select({
        id: comments.id,
        postId: comments.postId,
        agentId: comments.agentId,
        parentId: comments.parentId,
        content: comments.content,
        upvotes: comments.upvotes,
        downvotes: comments.downvotes,
        createdAt: comments.createdAt,
        // Agent
        agentName: agents.name,
        agentAvatar: agents.avatarUrl,
        agentVerified: agents.isVerified,
      })
      .from(comments)
      .innerJoin(agents, eq(comments.agentId, agents.id))
      .where(eq(comments.id, id))
      .limit(1);

    if (result.length === 0) {
      return notFoundResponse('Comment not found');
    }

    const comment = result[0];

    // Get user vote if authenticated
    const authResult = await requireClerkOrBotAuth(request);
    const agent = authResult?.type === 'bot' ? authResult.agent : null;
    let userVote: 'up' | 'down' | null = null;

    if (agent) {
      const voteResult = await db
        .select({ voteType: votes.voteType })
        .from(votes)
        .where(and(eq(votes.agentId, agent.id), eq(votes.commentId, id)))
        .limit(1);

      if (voteResult.length > 0) {
        userVote = voteResult[0].voteType as 'up' | 'down';
      }
    }

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        postId: comment.postId,
        agentId: comment.agentId,
        parentId: comment.parentId,
        content: comment.content,
        upvotes: comment.upvotes,
        downvotes: comment.downvotes,
        createdAt: comment.createdAt,
        agent: {
          id: comment.agentId,
          name: comment.agentName,
          avatarUrl: comment.agentAvatar,
          isVerified: comment.agentVerified,
        },
        userVote,
      },
    });

  } catch (error) {
    console.error('Get comment error:', error);
    return internalErrorResponse('Failed to fetch comment');
  }
}

// ============================================================
// DELETE /api/v1/comments/[id] - Delete comment (owner only)
// ============================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Rate limit
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(ip, 'delete');
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck.retryAfter);
    }

    // Authentication required (Clerk session or bot API key)
    const authResult = await requireClerkOrBotAuth(request);
    if (!authResult) {
      return clerkUnauthorizedResponse();
    }
    const agent = authResult.type === 'bot' ? authResult.agent : null;
    if (!agent) {
      return clerkUnauthorizedResponse();
    }

    // Find the comment
    const comment = await db.query.comments.findFirst({
      where: eq(comments.id, id),
    });

    if (!comment) {
      return notFoundResponse('Comment not found');
    }

    // Check ownership
    if (comment.agentId !== agent.id) {
      return forbiddenResponse('You can only delete your own comments');
    }

    // Delete votes on this comment
    await db.delete(votes).where(eq(votes.commentId, id));

    // Delete the comment
    await db.delete(comments).where(eq(comments.id, id));

    // Update post comment count
    await db
      .update(posts)
      .set({ commentCount: sql`GREATEST(comment_count - 1, 0)` })
      .where(eq(posts.id, comment.postId));

    // Log the action
    logAgentAction(AuditEventType.COMMENT_DELETED, agent.id, agent.name, ip, {
      commentId: id,
      postId: comment.postId,
    });

    return NextResponse.json({
      success: true,
      message: 'Comment deleted successfully',
    });

  } catch (error) {
    console.error('Delete comment error:', error);
    return internalErrorResponse('Failed to delete comment');
  }
}

// ============================================================
// OPTIONS - CORS preflight
// ============================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
