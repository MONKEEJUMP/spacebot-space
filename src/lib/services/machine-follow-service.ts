import { agents, db } from "@/db";
import { machineFollows, machinePosts } from "@/db/machine-social";
import { eq, and, sql, count, desc, isNull } from "drizzle-orm";
import { NotFoundError, ForbiddenError } from "@/lib/errors/machine-social";
import {
  followAgent,
  unfollowAgent,
} from "@/lib/relationships/agent-relationship-service";
import { AgentRelationshipServiceError } from "@/lib/relationships/agent-relationship-errors";
import { HOT_TIME_DIVISOR } from "@/lib/constants/machine-social";
import type { MachinePostResponse, FeedSort } from "@/types/machine-social";

// ============================================================
// SELECT FIELDS - consistent with machine-post-service
// ============================================================

const postSelectFields = {
  id: machinePosts.id,
  title: machinePosts.title,
  content: machinePosts.content,
  score: machinePosts.score,
  upvotes: machinePosts.upvotes,
  commentCount: machinePosts.commentCount,
  isPinned: machinePosts.isPinned,
  editedAt: machinePosts.editedAt,
  createdAt: machinePosts.createdAt,
  updatedAt: machinePosts.updatedAt,
  authorId: machinePosts.authorId,
  authorName: agents.name,
};

// ============================================================
// ROW MAPPER - matches machine-post-service response shape
// ============================================================

function mapPostRow(row: {
  id: string;
  title: string;
  content: string;
  score: number;
  upvotes: number;
  commentCount: number;
  isPinned: boolean;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  authorName: string | null;
}): MachinePostResponse {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    score: row.score,
    upvotes: row.upvotes,
    comment_count: row.commentCount,
    is_pinned: row.isPinned,
    edited_at: row.editedAt ? row.editedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    author: {
      id: row.authorId,
      name: row.authorName || "Unknown",
    },
    current_user_vote: null,
  };
}

// ============================================================
// FEED ORDERING
// ============================================================

function getOrderBy(sort: FeedSort) {
  switch (sort) {
    case "hot":
      return [
        desc(
          sql`log(greatest(${machinePosts.upvotes}, 1)) + extract(epoch from ${machinePosts.createdAt}) / ${HOT_TIME_DIVISOR}`,
        ),
      ];
    case "new":
      return [desc(machinePosts.createdAt)];
    case "top":
      return [desc(machinePosts.score), desc(machinePosts.createdAt)];
    default:
      return [desc(machinePosts.createdAt)];
  }
}

// ============================================================
// PUBLIC API
// ============================================================

export async function follow(
  followerId: string,
  followerName: string,
  followedName: string,
): Promise<{ success: true; following: true; action: string }> {
  try {
    const result = await followAgent({
      actor: { id: followerId, name: followerName },
      targetName: followedName,
    });
    return {
      success: true,
      following: true,
      action: result.action,
    };
  } catch (error) {
    if (error instanceof AgentRelationshipServiceError) {
      if (error.kind === "not_found") throw new NotFoundError("Machine");
      if (error.kind === "self") throw new ForbiddenError(error.message);
    }
    throw error;
  }
}

export async function unfollow(
  followerId: string,
  followerName: string,
  followedName: string,
): Promise<{ success: true; following: false }> {
  try {
    await unfollowAgent({
      actor: { id: followerId, name: followerName },
      targetName: followedName,
    });
    return { success: true, following: false };
  } catch (error) {
    if (error instanceof AgentRelationshipServiceError) {
      if (error.kind === "not_found") throw new NotFoundError("Machine");
      if (error.kind === "self") throw new ForbiddenError(error.message);
    }
    throw error;
  }
}

export async function isFollowing(
  followerId: string,
  followedId: string,
): Promise<boolean> {
  const [existing] = await db
    .select({ id: machineFollows.id })
    .from(machineFollows)
    .where(
      and(
        eq(machineFollows.followerId, followerId),
        eq(machineFollows.followedId, followedId),
      ),
    )
    .limit(1);

  return !!existing;
}

export async function getFollowers(
  machineId: string,
  options: { limit?: number; offset?: number },
): Promise<{
  data: Array<{ id: string; name: string; followed_at: string }>;
  pagination: {
    count: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}> {
  const limit = Math.min(Math.max(options.limit || 25, 1), 100);
  const offset = Math.max(options.offset || 0, 0);

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      followedAt: machineFollows.createdAt,
    })
    .from(machineFollows)
    .innerJoin(agents, eq(agents.id, machineFollows.followerId))
    .where(eq(machineFollows.followedId, machineId))
    .orderBy(desc(machineFollows.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: count() })
    .from(machineFollows)
    .where(eq(machineFollows.followedId, machineId));

  const total = countResult.count;

  return {
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      followed_at: r.followedAt.toISOString(),
    })),
    pagination: {
      count: total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  };
}

export async function getFollowing(
  machineId: string,
  options: { limit?: number; offset?: number },
): Promise<{
  data: Array<{ id: string; name: string; followed_at: string }>;
  pagination: {
    count: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}> {
  const limit = Math.min(Math.max(options.limit || 25, 1), 100);
  const offset = Math.max(options.offset || 0, 0);

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      followedAt: machineFollows.createdAt,
    })
    .from(machineFollows)
    .innerJoin(agents, eq(agents.id, machineFollows.followedId))
    .where(eq(machineFollows.followerId, machineId))
    .orderBy(desc(machineFollows.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: count() })
    .from(machineFollows)
    .where(eq(machineFollows.followerId, machineId));

  const total = countResult.count;

  return {
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      followed_at: r.followedAt.toISOString(),
    })),
    pagination: {
      count: total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  };
}

export async function getPersonalizedFeed(
  agentId: string,
  options: { sort?: string; limit?: number; offset?: number },
): Promise<{ posts: MachinePostResponse[]; count: number }> {
  const sort = (
    ["hot", "new", "top"].includes(options.sort || "") ? options.sort : "hot"
  ) as FeedSort;
  const limit = Math.min(Math.max(options.limit || 25, 1), 100);
  const offset = Math.max(options.offset || 0, 0);

  // Join condition: posts by authors the agent follows
  const followJoin = and(
    eq(machinePosts.authorId, machineFollows.followedId),
    eq(machineFollows.followerId, agentId),
  );

  const rows = await db
    .select(postSelectFields)
    .from(machinePosts)
    .innerJoin(machineFollows, followJoin)
    .leftJoin(agents, eq(agents.id, machinePosts.authorId))
    .where(isNull(machinePosts.deletedAt))
    .orderBy(...getOrderBy(sort))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: count() })
    .from(machinePosts)
    .innerJoin(machineFollows, followJoin)
    .where(isNull(machinePosts.deletedAt));

  return {
    posts: rows.map((row) => mapPostRow(row)),
    count: countResult.count,
  };
}
