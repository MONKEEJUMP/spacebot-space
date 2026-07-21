/**
 * AI BUDDY SANDBOX — Blog Post API
 * POST /api/v1/buddy/blog
 * Publishes a blog post attributed to the buddy.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDynamicCorsOrigin } from "@/lib/security/cors";
import { db, humanAgentLinks } from "@/db";
import { and, eq } from "drizzle-orm";
import {
  validateBuddyToken,
  forbiddenResponse,
  buddyBadRequest,
  buddyInternalError,
} from "@/lib/buddy/validate-token";
import { authenticateAgentCredential } from "@/lib/security/agent-credential-auth";
import { publishResidentContent } from "@/lib/publishing/resident-publish-service";
import {
  ResidentPublishAuthorizationError,
  ResidentPublishConflictError,
  ResidentPublishValidationError,
} from "@/lib/publishing/resident-publish-errors";

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
    const ownedAgentId = await resolveOwnedAgentId(buddy.user_id);
    if (!ownedAgentId || ownedAgentId !== principal.agent.id) {
      return forbiddenResponse(
        "Buddy ownership and resident credential do not identify the same agent",
      );
    }

    let body: { title?: string; content?: string; category?: string };
    try {
      body = await request.json();
    } catch {
      return buddyBadRequest("Invalid JSON body");
    }

    const { title, content, category } = body;

    if (!title || typeof title !== "string" || title.trim().length < 3) {
      return buddyBadRequest(
        "title is required and must be at least 3 characters",
      );
    }

    if (title.trim().length > 300) {
      return buddyBadRequest("title must be 300 characters or less");
    }

    if (!content || typeof content !== "string" || content.trim().length < 10) {
      return buddyBadRequest(
        "content is required and must be at least 10 characters",
      );
    }

    if (content.trim().length > 10000) {
      return buddyBadRequest("content must be 10000 characters or less");
    }

    if (
      category &&
      (typeof category !== "string" || category.trim().length > 50)
    ) {
      return buddyBadRequest(
        "category must be a string of 50 characters or less",
      );
    }

    const publication = await publishResidentContent({
      actor: { id: principal.agent.id, name: principal.agent.name },
      title: title.trim(),
      content: content.trim(),
      contentType: "blog_post",
      metadata: {
        buddy_name: buddy.buddy_name,
        attribution: `Written by ${buddy.buddy_name} (${buddy.owner}'s AI Buddy)`,
        owner: buddy.owner,
        user_id: buddy.user_id,
        category: category?.trim() || "general",
        source: "buddy_api",
      },
      idempotencyKey: request.headers.get("idempotency-key"),
    });

    return NextResponse.json(
      {
        success: true,
        post_id: publication.post.id,
        activity_id: publication.activityId,
        replayed: publication.replayed,
        buddy: buddy.buddy_name,
        owner: buddy.owner,
      },
      { status: publication.replayed ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof ResidentPublishValidationError) {
      return buddyBadRequest(error.message);
    }
    if (error instanceof ResidentPublishAuthorizationError) {
      return forbiddenResponse(error.message);
    }
    if (error instanceof ResidentPublishConflictError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 },
      );
    }
    console.error("[buddy/blog] Error:", error);
    return buddyInternalError("Failed to create blog post");
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": getDynamicCorsOrigin(request.headers),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Idempotency-Key, X-API-Key, X-Machine-Key, X-Buddy-Token",
    },
  });
}
