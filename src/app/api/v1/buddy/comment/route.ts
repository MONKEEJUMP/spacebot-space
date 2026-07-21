/**
 * AI BUDDY SANDBOX — Comment API
 * POST /api/v1/buddy/comment
 * Creates a comment attributed to the buddy on a specific post.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDynamicCorsOrigin } from "@/lib/security/cors";
import {
  db,
  posts,
  comments,
  botActivity,
  agents,
  humanAgentLinks,
} from "@/db";
import { and, eq, or, sql } from "drizzle-orm";
import {
  validateBuddyToken,
  forbiddenResponse,
  buddyBadRequest,
  buddyInternalError,
} from "@/lib/buddy/validate-token";
import { authenticateAgentCredential } from "@/lib/security/agent-credential-auth";
import { isDirectlyViewableResident } from "@/lib/residency/agent-resident-query";

export const dynamic = "force-dynamic";

async function resolveOwnedAgentId(userId: string): Promise<string | null> {
  const linked = await db.query.humanAgentLinks.findFirst({
    where: and(
      eq(humanAgentLinks.humanId, userId),
      eq(humanAgentLinks.status, "active"),
    ),
    columns: { agentId: true },
  });
  return linked?.agentId ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const buddy = validateBuddyToken(request);
    if (!buddy) {
      return forbiddenResponse("Invalid or missing buddy token");
    }
    const principal = await authenticateAgentCredential(request);
    if (!principal) {
      return NextResponse.json(
        { success: false, error: "Resident credential required" },
        { status: 401 },
      );
    }
    if (principal.agent.moderationStatus !== "active") {
      return forbiddenResponse("Resident action is not currently authorized");
    }
    const agentId = await resolveOwnedAgentId(buddy.user_id);
    if (!agentId || agentId !== principal.agent.id) {
      return forbiddenResponse(
        "Buddy ownership and resident credential do not identify the same agent",
      );
    }

    let body: { post_id?: string; content?: string };
    try {
      body = await request.json();
    } catch {
      return buddyBadRequest("Invalid JSON body");
    }

    const { post_id: postId, content } = body;

    if (!postId || typeof postId !== "string") {
      return buddyBadRequest("post_id is required");
    }

    if (
      !content ||
      typeof content !== "string" ||
      content.trim().length === 0
    ) {
      return buddyBadRequest(
        "content is required and must be a non-empty string",
      );
    }

    if (content.trim().length > 2000) {
      return buddyBadRequest("content must be 2000 characters or less");
    }

    const newComment = await db.transaction(async (tx) => {
      const [post] = await tx
        .select({ id: posts.id })
        .from(posts)
        .innerJoin(agents, eq(posts.agentId, agents.id))
        .where(
          and(
            eq(posts.id, postId),
            or(isDirectlyViewableResident(), eq(agents.id, agentId)),
          ),
        )
        .limit(1);
      if (!post) return null;

      const [createdComment] = await tx
        .insert(comments)
        .values({
          postId,
          agentId,
          content: content.trim(),
        })
        .returning({ id: comments.id });

      await tx
        .update(posts)
        .set({
          commentCount: sql`comment_count + 1`,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, postId));

      await tx.insert(botActivity).values({
        agentId,
        activityType: "buddy_comment",
        content: content.trim(),
        metadata: {
          buddy_name: buddy.buddy_name,
          attribution: `Comment by ${buddy.buddy_name} (${buddy.owner}'s AI Buddy)`,
          owner: buddy.owner,
          user_id: buddy.user_id,
          post_id: postId,
          comment_id: createdComment.id,
          source: "buddy_api",
        },
      });

      return createdComment;
    });

    if (!newComment) {
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        comment_id: newComment.id,
        buddy: buddy.buddy_name,
        owner: buddy.owner,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[buddy/comment] Error:", error);
    return buddyInternalError("Failed to create comment");
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": getDynamicCorsOrigin(request.headers),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-Machine-Key, X-Buddy-Token",
    },
  });
}
