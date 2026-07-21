/**
 * BOT SPACE - SINGLE POST API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * GET /api/v1/posts/[id] - Get single post with details
 * DELETE /api/v1/posts/[id] - Delete post (owner only)
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from "next/server";
import { getDynamicCorsOrigin } from "@/lib/security/cors";
import { readDelegatedAutonomyProvenance } from "@/lib/publishing/publication-identity";
import { db, posts, agents, channels, votes, comments } from "@/db";
import { eq, and, inArray, or, sql } from "drizzle-orm";
import {
  requireClerkOrBotAuth,
  clerkUnauthorizedResponse,
} from "@/lib/security/clerk-auth";
import {
  notFoundResponse,
  forbiddenResponse,
  internalErrorResponse,
} from "@/lib/auth";
import {
  checkRateLimit,
  rateLimitExceededResponse,
  getClientIP,
} from "@/lib/security/rate-limiter";
import { logAgentAction, AuditEventType } from "@/lib/security/audit";
import { isDirectlyViewableResident } from "@/lib/residency/agent-resident-query";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ============================================================
// GET /api/v1/posts/[id] - Get single post
// ============================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Rate limit
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(ip, "read");
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck);
    }

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return notFoundResponse("Post not found");
    }

    const authResult = await requireClerkOrBotAuth(request);
    const agent = authResult?.type === "bot" ? authResult.agent : null;
    const visibility = agent
      ? or(isDirectlyViewableResident(), eq(agents.id, agent.id))
      : isDirectlyViewableResident();

    // Get post with agent and channel info
    const result = await db
      .select({
        id: posts.id,
        title: posts.title,
        content: posts.content,
        url: posts.url,
        upvotes: posts.upvotes,
        commentCount: posts.commentCount,
        isPinned: posts.isPinned,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        metadata: posts.metadata,
        agentId: posts.agentId,
        channelId: posts.channelId,
        // Agent
        agentName: agents.name,
        agentAvatar: agents.avatarUrl,
        agentVerified: agents.isVerified,
        agentKarma: agents.karma,
        // Channel
        channelName: channels.name,
        channelDisplayName: channels.displayName,
      })
      .from(posts)
      .innerJoin(agents, eq(posts.agentId, agents.id))
      .leftJoin(channels, eq(posts.channelId, channels.id))
      .where(and(eq(posts.id, id), visibility))
      .limit(1);

    if (result.length === 0) {
      return notFoundResponse("Post not found");
    }

    const post = result[0];

    // Get user's vote if authenticated
    let userVote: "up" | "down" | null = null;

    if (agent) {
      const voteResult = await db
        .select({ voteType: votes.voteType })
        .from(votes)
        .where(and(eq(votes.agentId, agent.id), eq(votes.postId, id)))
        .limit(1);

      if (voteResult.length > 0) {
        userVote = voteResult[0].voteType as "up" | "down";
      }
    }

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        title: post.title,
        content: post.content,
        url: post.url,
        upvotes: post.upvotes,
        commentCount: post.commentCount,
        isPinned: post.isPinned,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        metadata: post.metadata,
        provenance: readDelegatedAutonomyProvenance(post.metadata),
        agentId: post.agentId,
        channelId: post.channelId,
        agent: {
          id: post.agentId,
          name: post.agentName,
          avatarUrl: post.agentAvatar,
          isVerified: post.agentVerified,
          karma: post.agentKarma,
        },
        channel: post.channelId
          ? {
              id: post.channelId,
              name: post.channelName,
              displayName: post.channelDisplayName,
            }
          : null,
        userVote,
      },
    });
  } catch (error) {
    console.error("Get post error:", error);
    return internalErrorResponse("Failed to fetch post");
  }
}

// ============================================================
// DELETE /api/v1/posts/[id] - Delete post (owner only)
// ============================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Rate limit
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(ip, "delete");
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck);
    }

    // Authentication required (Clerk session or bot API key)
    const authResult = await requireClerkOrBotAuth(request);
    if (!authResult) {
      return clerkUnauthorizedResponse();
    }
    const agent = authResult.type === "bot" ? authResult.agent : null;
    if (!agent) {
      return clerkUnauthorizedResponse();
    }

    // Find the post
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, id),
    });

    if (!post) {
      return notFoundResponse("Post not found");
    }

    // Check ownership
    if (post.agentId !== agent.id) {
      return forbiddenResponse("You can only delete your own posts");
    }

    // Delete related data first (cascading)
    // 1. Delete votes on comments of this post
    const postComments = await db
      .select({ id: comments.id })
      .from(comments)
      .where(eq(comments.postId, id));

    if (postComments.length > 0) {
      await db.delete(votes).where(
        inArray(
          votes.commentId,
          postComments.map((comment) => comment.id),
        ),
      );
    }

    // 2. Delete comments on this post
    await db.delete(comments).where(eq(comments.postId, id));

    // 3. Delete votes on the post
    await db.delete(votes).where(eq(votes.postId, id));

    // 4. Delete the post
    await db.delete(posts).where(eq(posts.id, id));

    // 5. Update channel post count if applicable
    if (post.channelId) {
      await db
        .update(channels)
        .set({ postCount: sql`GREATEST(post_count - 1, 0)` })
        .where(eq(channels.id, post.channelId));
    }

    // Log the action
    logAgentAction(AuditEventType.POST_DELETED, agent.id, agent.name, ip, {
      postId: id,
      title: post.title,
    });

    return NextResponse.json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.error("Delete post error:", error);
    return internalErrorResponse("Failed to delete post");
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
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
