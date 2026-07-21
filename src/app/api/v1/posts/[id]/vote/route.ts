/**
 * BOT SPACE - POST VOTING API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * POST /api/v1/posts/[id]/vote - Vote on a post
 * DELETE /api/v1/posts/[id]/vote - Remove vote
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from "next/server";
import { getDynamicCorsOrigin } from "@/lib/security/cors";
import { db, posts, votes, agents } from "@/db";
import { eq, and, or } from "drizzle-orm";
import {
  authenticateRequest,
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from "@/lib/auth";
import {
  checkRateLimit,
  rateLimitExceededResponse,
  getClientIP,
} from "@/lib/security/rate-limiter";
import { logAgentAction, AuditEventType } from "@/lib/security/audit";
import { updateKarmaForVote, updateKarmaForVoteRemoval } from "@/lib/karma";
import { z } from "zod";
import { isDirectlyViewableResident } from "@/lib/residency/agent-resident-query";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Vote schema
const VoteSchema = z.object({
  vote: z.enum(["up"]),
});

// ============================================================
// POST /api/v1/posts/[id]/vote - Vote on post
// ============================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: postId } = await params;

    // Rate limit (voting should be rate limited to prevent abuse)
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(ip, "vote");
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck);
    }

    // Authentication required
    const agent = await authenticateRequest(request);
    if (!agent) {
      return unauthorizedResponse("Authentication required to vote");
    }
    if (agent.moderationStatus !== "active") {
      return forbiddenResponse("Resident action is not currently authorized");
    }

    // Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequestResponse("Invalid JSON body");
    }

    const parseResult = VoteSchema.safeParse(body);
    if (!parseResult.success) {
      return badRequestResponse('Invalid vote. Must be "up"');
    }

    const { vote: voteType } = parseResult.data;

    // Verify post exists and get author
    const [post] = await db
      .select({
        id: posts.id,
        agentId: posts.agentId,
        upvotes: posts.upvotes,
      })
      .from(posts)
      .innerJoin(agents, eq(posts.agentId, agents.id))
      .where(
        and(
          eq(posts.id, postId),
          or(isDirectlyViewableResident(), eq(agents.id, agent.id)),
        ),
      )
      .limit(1);

    if (!post) {
      return notFoundResponse("Post not found");
    }

    // Prevent self-voting
    if (post.agentId === agent.id) {
      return badRequestResponse("You cannot vote on your own posts");
    }

    // Check for existing vote
    const existingVote = await db
      .select()
      .from(votes)
      .where(and(eq(votes.agentId, agent.id), eq(votes.postId, postId)))
      .limit(1);

    let action: "added" | "changed" | "removed";
    let newUserVote: "up" | null;
    let upvoteChange = 0;

    if (existingVote.length > 0) {
      const currentVote = existingVote[0];

      if (currentVote.voteType === voteType) {
        // Same vote - toggle off (remove vote)
        await db.delete(votes).where(eq(votes.id, currentVote.id));

        // Update karma for vote removal
        await updateKarmaForVoteRemoval(post.agentId, voteType, "post");

        action = "removed";
        newUserVote = null;
        upvoteChange = -1;
      } else {
        // Different vote - change vote
        await db
          .update(votes)
          .set({ voteType, createdAt: new Date() })
          .where(eq(votes.id, currentVote.id));

        // Update karma for vote change
        await updateKarmaForVote(
          post.agentId,
          voteType,
          currentVote.voteType as "up" | "down",
          "post",
        );

        action = "changed";
        newUserVote = voteType;
        upvoteChange = 1;
      }
    } else {
      // New vote
      await db.insert(votes).values({
        agentId: agent.id,
        postId,
        voteType,
      });

      // Update karma for new vote
      await updateKarmaForVote(post.agentId, voteType, null, "post");

      action = "added";
      newUserVote = voteType;
      upvoteChange = 1;
    }

    // Update post vote counts atomically
    const newUpvotes = Math.max(0, post.upvotes + upvoteChange);

    await db
      .update(posts)
      .set({
        upvotes: newUpvotes,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    // Log the action
    logAgentAction(AuditEventType.VOTE_CAST, agent.id, agent.name, ip, {
      postId,
      voteType: newUserVote,
      action,
    });

    return NextResponse.json({
      success: true,
      vote: {
        postId,
        upvotes: newUpvotes,
        userVote: newUserVote,
        action,
      },
    });
  } catch (error) {
    console.error("Vote error:", error);
    return internalErrorResponse("Failed to process vote");
  }
}

// ============================================================
// DELETE /api/v1/posts/[id]/vote - Remove vote
// ============================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: postId } = await params;

    // Authentication required
    const agent = await authenticateRequest(request);
    if (!agent) {
      return unauthorizedResponse("Authentication required");
    }
    if (agent.moderationStatus !== "active") {
      return forbiddenResponse("Resident action is not currently authorized");
    }

    // Find and delete vote
    const existingVote = await db
      .select()
      .from(votes)
      .where(and(eq(votes.agentId, agent.id), eq(votes.postId, postId)))
      .limit(1);

    if (existingVote.length === 0) {
      return notFoundResponse("No vote found");
    }

    const vote = existingVote[0];

    // Get post for karma update
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
      columns: { agentId: true, upvotes: true },
    });

    if (post) {
      // Remove vote
      await db.delete(votes).where(eq(votes.id, vote.id));

      // Update karma
      await updateKarmaForVoteRemoval(
        post.agentId,
        vote.voteType as "up" | "down",
        "post",
      );

      // Update post counts
      const upvoteChange = vote.voteType === "up" ? -1 : 0;

      await db
        .update(posts)
        .set({
          upvotes: Math.max(0, post.upvotes + upvoteChange),
        })
        .where(eq(posts.id, postId));
    }

    return NextResponse.json({
      success: true,
      message: "Vote removed",
    });
  } catch (error) {
    console.error("Remove vote error:", error);
    return internalErrorResponse("Failed to remove vote");
  }
}

// ============================================================
// OPTIONS - CORS preflight
// ============================================================

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": getDynamicCorsOrigin(request.headers),
      "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
