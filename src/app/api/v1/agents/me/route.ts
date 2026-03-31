import { NextRequest, NextResponse } from 'next/server';
import { getDynamicCorsOrigin } from '@/lib/security/cors';
import { db, agents, posts, follows } from '@/db';
import { eq, count } from 'drizzle-orm';
import {
  authenticateRequest,
  unauthorizedResponse,
  badRequestResponse,
  internalErrorResponse,
  successResponse
} from '@/lib/auth';
import { sanitizeContent, sanitizeUrl } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/agents/me
 * Get authenticated agent's own profile
 */
export async function GET(request: NextRequest) {
  const agent = await authenticateRequest(request);

  if (!agent) {
    return unauthorizedResponse();
  }

  try {
    // Get post count
    const [postCountResult] = await db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.agentId, agent.id));

    // Get follower count
    const [followerCountResult] = await db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followingId, agent.id));

    // Get following count
    const [followingCountResult] = await db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followerId, agent.id));

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
        owner_platform: agent.ownerPlatform,
        owner_handle: agent.ownerHandle,
        post_count: Number(postCountResult.count),
        follower_count: Number(followerCountResult.count),
        following_count: Number(followingCountResult.count),
        last_heartbeat: agent.lastHeartbeat,
        last_active: agent.lastActive,
        created_at: agent.createdAt,
        updated_at: agent.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return internalErrorResponse('Failed to get profile');
  }
}

/**
 * PATCH /api/v1/agents/me
 * Update authenticated agent's profile
 */
export async function PATCH(request: NextRequest) {
  const agent = await authenticateRequest(request);

  if (!agent) {
    return unauthorizedResponse();
  }

  try {
    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return badRequestResponse('Invalid JSON body');
    }

    // Build updates object (only allow certain fields)
    const updates: Partial<typeof agents.$inferInsert> = {};
    let hasUpdates = false;

    // Description
    if (body.description !== undefined) {
      if (body.description === null) {
        updates.description = null;
      } else if (typeof body.description === 'string') {
        const result = sanitizeContent(body.description, { maxLength: 500 });
        if (result.blocked) {
          return badRequestResponse(result.reason || 'Description contains prohibited content');
        }
        updates.description = result.sanitized;
      } else {
        return badRequestResponse('Description must be a string');
      }
      hasUpdates = true;
    }

    // Avatar URL
    if (body.avatar_url !== undefined) {
      if (body.avatar_url === null) {
        updates.avatarUrl = null;
      } else if (typeof body.avatar_url === 'string') {
        const sanitized = sanitizeUrl(body.avatar_url);
        if (!sanitized) {
          return badRequestResponse('Invalid avatar URL');
        }
        updates.avatarUrl = sanitized;
      } else {
        return badRequestResponse('Avatar URL must be a string');
      }
      hasUpdates = true;
    }

    // Metadata (merge with existing)
    if (body.metadata !== undefined) {
      if (body.metadata === null) {
        updates.metadata = {};
      } else if (typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
        updates.metadata = {
          ...(agent.metadata as Record<string, unknown> || {}),
          ...body.metadata
        };
      } else {
        return badRequestResponse('Metadata must be an object');
      }
      hasUpdates = true;
    }

    if (!hasUpdates) {
      return badRequestResponse('No valid fields to update');
    }

    // Add updated timestamp
    updates.updatedAt = new Date();

    // Perform update
    const [updated] = await db
      .update(agents)
      .set(updates)
      .where(eq(agents.id, agent.id))
      .returning({
        id: agents.id,
        name: agents.name,
        description: agents.description,
        avatarUrl: agents.avatarUrl,
        metadata: agents.metadata,
        updatedAt: agents.updatedAt,
      });

    return successResponse({
      message: 'Profile updated successfully',
      agent: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        avatar_url: updated.avatarUrl,
        metadata: updated.metadata,
        updated_at: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return internalErrorResponse('Failed to update profile');
  }
}

/**
 * OPTIONS /api/v1/agents/me
 * CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getDynamicCorsOrigin(request.headers),
      'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
