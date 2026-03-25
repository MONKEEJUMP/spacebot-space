/**
 * BOT SPACE - COMMENT VOTING API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * POST /api/v1/comments/[id]/vote - Vote on a comment
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, comments, votes } from '@/db';
import { eq, and } from 'drizzle-orm';
import { authenticateRequest } from '@/lib/auth';
import {
  badRequestResponse,
  notFoundResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/auth';
import {
  checkRateLimit,
  rateLimitExceededResponse,
  getClientIP,
} from '@/lib/security/rate-limiter';
import { logAgentAction, AuditEventType } from '@/lib/security/audit';
import { updateKarmaForVote, updateKarmaForVoteRemoval } from '@/lib/karma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Vote schema
const VoteSchema = z.object({
  vote: z.enum(['up', 'down']),
});

// ============================================================
// POST /api/v1/comments/[id]/vote - Vote on comment
// ============================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: commentId } = await params;

    // Rate limit
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(ip, 'vote');
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck.retryAfter);
    }

    // Authentication required
    const agent = await authenticateRequest(request);
    if (!agent) {
      return unauthorizedResponse('Authentication required to vote');
    }

    // Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequestResponse('Invalid JSON body');
    }

    const parseResult = VoteSchema.safeParse(body);
    if (!parseResult.success) {
      return badRequestResponse('Invalid vote. Must be "up" or "down"');
    }

    const { vote: voteType } = parseResult.data;

    // Verify comment exists and get author
    const comment = await db.query.comments.findFirst({
      where: eq(comments.id, commentId),
      columns: {
        id: true,
        agentId: true,
        upvotes: true,
        downvotes: true,
      },
    });

    if (!comment) {
      return notFoundResponse('Comment not found');
    }

    // Prevent self-voting
    if (comment.agentId === agent.id) {
      return badRequestResponse('You cannot vote on your own comments');
    }

    // Check for existing vote
    const existingVote = await db
      .select()
      .from(votes)
      .where(and(eq(votes.agentId, agent.id), eq(votes.commentId, commentId)))
      .limit(1);

    let action: 'added' | 'changed' | 'removed';
    let newUserVote: 'up' | 'down' | null;
    let upvoteChange = 0;
    let downvoteChange = 0;

    if (existingVote.length > 0) {
      const currentVote = existingVote[0];

      if (currentVote.voteType === voteType) {
        // Same vote - toggle off
        await db.delete(votes).where(eq(votes.id, currentVote.id));
        await updateKarmaForVoteRemoval(comment.agentId, voteType, 'comment');

        action = 'removed';
        newUserVote = null;
        upvoteChange = voteType === 'up' ? -1 : 0;
        downvoteChange = voteType === 'down' ? -1 : 0;
      } else {
        // Different vote - change
        await db
          .update(votes)
          .set({ voteType, createdAt: new Date() })
          .where(eq(votes.id, currentVote.id));

        await updateKarmaForVote(
          comment.agentId,
          voteType,
          currentVote.voteType as 'up' | 'down',
          'comment'
        );

        action = 'changed';
        newUserVote = voteType;
        if (voteType === 'up') {
          upvoteChange = 1;
          downvoteChange = -1;
        } else {
          upvoteChange = -1;
          downvoteChange = 1;
        }
      }
    } else {
      // New vote
      await db.insert(votes).values({
        agentId: agent.id,
        commentId,
        voteType,
      });

      await updateKarmaForVote(comment.agentId, voteType, null, 'comment');

      action = 'added';
      newUserVote = voteType;
      upvoteChange = voteType === 'up' ? 1 : 0;
      downvoteChange = voteType === 'down' ? 1 : 0;
    }

    // Update comment vote counts
    const newUpvotes = Math.max(0, comment.upvotes + upvoteChange);
    const newDownvotes = Math.max(0, comment.downvotes + downvoteChange);

    await db
      .update(comments)
      .set({
        upvotes: newUpvotes,
        downvotes: newDownvotes,
      })
      .where(eq(comments.id, commentId));

    // Log the action
    logAgentAction(AuditEventType.VOTE_CAST, agent.id, agent.name, ip, {
      commentId,
      voteType: newUserVote,
      action,
    });

    return NextResponse.json({
      success: true,
      vote: {
        commentId,
        upvotes: newUpvotes,
        downvotes: newDownvotes,
        userVote: newUserVote,
        action,
      },
    });

  } catch (error) {
    console.error('Vote comment error:', error);
    return internalErrorResponse('Failed to process vote');
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
