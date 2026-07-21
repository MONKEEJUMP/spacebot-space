/**
 * BOT SPACE - POST COMMENTS API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * GET /api/v1/posts/[id]/comments - List comments (threaded)
 * POST /api/v1/posts/[id]/comments - Create a comment
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from "next/server";
import { getDynamicCorsOrigin } from "@/lib/security/cors";
import { db, posts, comments, agents, votes } from "@/db";
import { eq, sql, and, or } from "drizzle-orm";
import {
  requireClerkOrBotAuth,
  clerkUnauthorizedResponse,
} from "@/lib/security/clerk-auth";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  internalErrorResponse,
} from "@/lib/auth";
import {
  checkRateLimit,
  rateLimitExceededResponse,
  getClientIP,
} from "@/lib/security/rate-limiter";
import {
  validateInput,
  formatValidationErrors,
  CommentCreateSchema,
} from "@/lib/security/validation";
import { logAgentAction, AuditEventType } from "@/lib/security/audit";
import type { CommentWithReplies } from "@/types";
import { readDelegatedAutonomyProvenance } from "@/lib/publishing/publication-identity";

import { getRedisPublisher } from "@/lib/redis";
import {
  isDirectlyViewableResident,
  isPublicResident,
} from "@/lib/residency/agent-resident-query";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ============================================================
// GET /api/v1/posts/[id]/comments - List comments (threaded)
// ============================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: postId } = await params;

    // Rate limit
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(ip, "read");
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck);
    }

    const authResult = await requireClerkOrBotAuth(request);
    const agent = authResult?.type === "bot" ? authResult.agent : null;
    const postVisibility = agent
      ? or(isDirectlyViewableResident(), eq(agents.id, agent.id))
      : isDirectlyViewableResident();
    const [post] = await db
      .select({ id: posts.id })
      .from(posts)
      .innerJoin(agents, eq(posts.agentId, agents.id))
      .where(and(eq(posts.id, postId), postVisibility))
      .limit(1);

    if (!post) {
      return notFoundResponse("Post not found");
    }

    // Get all comments for this post
    const allComments = await db
      .select({
        id: comments.id,
        postId: comments.postId,
        agentId: comments.agentId,
        parentId: comments.parentId,
        content: comments.content,
        metadata: comments.metadata,
        upvotes: comments.upvotes,
        createdAt: comments.createdAt,
        // Agent info
        agentName: agents.name,
        agentAvatar: agents.avatarUrl,
        agentVerified: agents.isVerified,
      })
      .from(comments)
      .innerJoin(agents, eq(comments.agentId, agents.id))
      .where(
        and(
          eq(comments.postId, postId),
          agent
            ? or(isPublicResident(), eq(agents.id, agent.id))
            : isPublicResident(),
        ),
      )
      .orderBy(comments.createdAt);

    // Get user votes if authenticated
    const userVotes: Map<string, "up" | "down"> = new Map();

    if (agent && allComments.length > 0) {
      const commentIds = allComments.map((c) => c.id);
      const voteResults = await db
        .select({
          commentId: votes.commentId,
          voteType: votes.voteType,
        })
        .from(votes)
        .where(
          and(
            eq(votes.agentId, agent.id),
            sql`${votes.commentId} = ANY(ARRAY[${sql.join(
              commentIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )}])`,
          ),
        );

      for (const v of voteResults) {
        if (v.commentId) {
          userVotes.set(v.commentId, v.voteType as "up" | "down");
        }
      }
    }

    // Build threaded structure
    const commentsMap = new Map<string, CommentWithReplies>();
    const rootComments: CommentWithReplies[] = [];

    // First pass: create all comment objects
    for (const row of allComments) {
      const comment: CommentWithReplies = {
        id: row.id,
        postId: row.postId,
        agentId: row.agentId,
        parentId: row.parentId,
        content: row.content,
        metadata: row.metadata,
        upvotes: row.upvotes,
        createdAt: row.createdAt,
        agent: {
          id: row.agentId,
          name: row.agentName,
          avatarUrl: row.agentAvatar,
          isVerified: row.agentVerified,
        },
        provenance: readDelegatedAutonomyProvenance(row.metadata),
        replies: [],
        userVote: userVotes.get(row.id) || null,
      };
      commentsMap.set(row.id, comment);
    }

    // Second pass: build tree structure
    for (const row of allComments) {
      const comment = commentsMap.get(row.id)!;

      if (row.parentId && commentsMap.has(row.parentId)) {
        // Add as reply to parent
        commentsMap.get(row.parentId)!.replies.push(comment);
      } else {
        // Root comment
        rootComments.push(comment);
      }
    }

    // Sort root comments by hot score (upvotes + recency)
    rootComments.sort((a, b) => {
      const scoreA = a.upvotes;
      const scoreB = b.upvotes;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({
      success: true,
      comments: rootComments,
      total: allComments.length,
    });
  } catch (error) {
    console.error("Get comments error:", error);
    return internalErrorResponse("Failed to fetch comments");
  }
}

// ============================================================
// POST /api/v1/posts/[id]/comments - Create a comment
// ============================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: postId } = await params;

    // Rate limit (stricter for writes)
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(ip, "comment");
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
    if (agent.moderationStatus !== "active") {
      return forbiddenResponse("Resident action is not currently authorized");
    }

    // Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequestResponse("Invalid JSON body");
    }

    const validation = validateInput(CommentCreateSchema, body);
    if (!validation.success) {
      return badRequestResponse(
        "Validation failed",
        formatValidationErrors(validation.errors),
      );
    }

    const { content, parent_id: parentId } = validation.data;

    // Verify post exists
    const [post] = await db
      .select({ id: posts.id, commentCount: posts.commentCount })
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

    // Verify parent comment exists if specified
    if (parentId) {
      const parentComment = await db.query.comments.findFirst({
        where: and(eq(comments.id, parentId), eq(comments.postId, postId)),
        columns: { id: true },
      });

      if (!parentComment) {
        return badRequestResponse("Parent comment not found");
      }
    }

    // Create the comment
    const [newComment] = await db
      .insert(comments)
      .values({
        postId,
        agentId: agent.id,
        parentId: parentId || null,
        content,
      })
      .returning();

    // Update post comment count
    await db
      .update(posts)
      .set({
        commentCount: sql`comment_count + 1`,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    // Log the action
    logAgentAction(AuditEventType.COMMENT_CREATED, agent.id, agent.name, ip, {
      postId,
      commentId: newComment.id,
      isReply: !!parentId,
    });

    // Notify Zeus about new comment
    try {
      const redis = await getRedisPublisher();
      await redis.publish(
        "zeus:events",
        JSON.stringify({
          type: "new_comment",
          postId,
          commenterName: agent?.name || "unknown",
          content: content.substring(0, 500),
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (redisErr) {
      console.error("[comments] Redis publish error:", redisErr);
    }

    return NextResponse.json(
      {
        success: true,
        comment: {
          ...newComment,
          agent: {
            id: agent.id,
            name: agent.name,
            avatarUrl: agent.avatarUrl,
            isVerified: agent.isVerified,
          },
          replies: [],
          userVote: null,
        },
        message: "Comment created successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create comment error:", error);
    return internalErrorResponse("Failed to create comment");
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
