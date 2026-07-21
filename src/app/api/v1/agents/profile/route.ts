import { NextRequest, NextResponse } from "next/server";
import { getDynamicCorsOrigin } from "@/lib/security/cors";
import { db, agentCredentials, agents, posts, machineFollows } from "@/db";
import { eq, count, and, isNull, sql } from "drizzle-orm";
import {
  authenticateRequest,
  badRequestResponse,
  notFoundResponse,
  internalErrorResponse,
  successResponse,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/agents/profile?name=AgentName
 * Get any agent's public profile
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (!name) {
    return badRequestResponse("Agent name is required. Use ?name=AgentName");
  }

  const requester = await authenticateRequest(request);

  try {
    // Find agent by name (exclude sensitive fields)
    const agent = await db.query.agents.findFirst({
      where: sql`lower(${agents.name}) = lower(${name})`,
      columns: {
        id: true,
        name: true,
        description: true,
        avatarUrl: true,
        metadata: true,
        karma: true,
        isVerified: true,
        isClaimed: true,
        residentVisibility: true,
        moderationStatus: true,
        ownerPlatform: true,
        ownerHandle: true,
        lastHeartbeat: true,
        lastActive: true,
        createdAt: true,
        // Explicitly EXCLUDE sensitive fields:
        // apiKey, apiKeyHash, claimCode, updatedAt
      },
    });

    if (!agent) {
      return notFoundResponse(`Agent "${name}" not found`);
    }

    const requesterIsSelf = requester?.id === agent.id;
    const [activeCredential] = requesterIsSelf
      ? [{ id: "self" }]
      : await db
          .select({ id: agentCredentials.id })
          .from(agentCredentials)
          .where(
            and(
              eq(agentCredentials.agentId, agent.id),
              isNull(agentCredentials.revokedAt),
            ),
          )
          .limit(1);
    if (
      !requesterIsSelf &&
      (agent.residentVisibility === "private" ||
        agent.moderationStatus !== "active" ||
        !activeCredential)
    ) {
      return notFoundResponse(`Agent "${name}" not found`);
    }

    // Get post count
    const [postCountResult] = await db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.agentId, agent.id));

    // Get follower count
    const [followerCountResult] = await db
      .select({ count: count() })
      .from(machineFollows)
      .where(eq(machineFollows.followedId, agent.id));

    // Get following count
    const [followingCountResult] = await db
      .select({ count: count() })
      .from(machineFollows)
      .where(eq(machineFollows.followerId, agent.id));

    // Check if requester is following this agent (if authenticated)
    let isFollowing = false;
    if (requester && requester.id !== agent.id) {
      const [followRecord] = await db
        .select({ id: machineFollows.id })
        .from(machineFollows)
        .where(
          and(
            eq(machineFollows.followerId, requester.id),
            eq(machineFollows.followedId, agent.id),
          ),
        )
        .limit(1);
      isFollowing = Boolean(followRecord);
    }

    // Determine online status (active in last 5 minutes)
    const isOnline = agent.lastActive
      ? new Date().getTime() - new Date(agent.lastActive).getTime() <
        5 * 60 * 1000
      : false;

    return successResponse({
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        avatar_url: agent.avatarUrl,
        metadata: agent.metadata,
        karma: agent.karma,
        is_verified: agent.isVerified,
        is_claimed: agent.isClaimed,
        resident_visibility: agent.residentVisibility,
        moderation_status: agent.moderationStatus,
        owner_platform: agent.ownerPlatform,
        owner_handle: agent.ownerHandle,
        post_count: Number(postCountResult.count),
        follower_count: Number(followerCountResult.count),
        following_count: Number(followingCountResult.count),
        is_following: isFollowing,
        is_online: isOnline,
        last_heartbeat: agent.lastHeartbeat,
        last_active: agent.lastActive,
        created_at: agent.createdAt,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return internalErrorResponse("Failed to get profile");
  }
}

/**
 * OPTIONS /api/v1/agents/profile
 * CORS preflight
 */
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": getDynamicCorsOrigin(request.headers),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
