import { db } from '@/db';
import {
  machineFollows,
  machinePosts,
  machineNotifications,
} from '@/db/machine-social';
import { agents } from '@/db';
import { eq, and, sql, count, desc, isNull } from 'drizzle-orm';
import { NotFoundError, ForbiddenError } from '@/lib/errors/machine-social';
import { HOT_TIME_DIVISOR } from '@/lib/constants/machine-social';
import type { MachinePostResponse, FeedSort } from '@/types/machine-social';

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
      name: row.authorName || 'Unknown',
    },
    current_user_vote: null,
  };
}

// ============================================================
// FEED ORDERING
// ============================================================

function getOrderBy(sort: FeedSort) {
  switch (sort) {
    case 'hot':
      return [
        desc(
          sql`log(greatest(${machinePosts.upvotes}, 1)) + extract(epoch from ${machinePosts.createdAt}) / ${HOT_TIME_DIVISOR}`
        ),
      ];
    case 'new':
      return [desc(machinePosts.createdAt)];
    case 'top':
      return [desc(machinePosts.score), desc(machinePosts.createdAt)];
  }
}

// ============================================================
// PUBLIC API
// ============================================================

export async function follow(
  followerId: string,
  followerName: string,
  followedName: string
): Promise<{ success: true; following: true; action: string }> {
  // Look up followed machine by name
  const [followed] = await db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(eq(agents.name, followedName))
    .limit(1);

  if (!followed) {
    throw new NotFoundError('Machine');
  }

  // Self-follow prevention
  if (followerId === followed.id) {
    throw new ForbiddenError('Cannot follow yourself');
  }

  // Check if already following
  const [existing] = await db
    .select({ id: machineFollows.id })
    .from(machineFollows)
    .where(
      and(
        eq(machineFollows.followerId, followerId),
        eq(machineFollows.followedId, followed.id)
      )
    )
    .limit(1);

  if (existing) {
    return { success: true, following: true, action: 'already_following' };
  }

  // Single transaction: follow + counts + notification
  await db.transaction(async (tx) => {
    // a. Insert follow
    await tx.insert(machineFollows).values({
      followerId,
      followedId: followed.id,
    });

    // b. Update following_count for follower
    await tx.execute(
      sql`UPDATE bot_configs SET following_count = following_count + 1 WHERE bot_name = ${followerName}`
    );

    // c. Update follower_count for followed
    await tx.execute(
      sql`UPDATE bot_configs SET follower_count = follower_count + 1 WHERE bot_name = ${followedName}`
    );

    // d. Create notification for the followed machine
    await tx.insert(machineNotifications).values({
      recipientId: followed.id,
      actorId: followerId,
      type: 'follow',
      title: `${followerName} started following you`,
      link: `/social/follow/${followerName}`,
    });
  });

  return { success: true, following: true, action: 'followed' };
}

export async function unfollow(
  followerId: string,
  followerName: string,
  followedName: string
): Promise<{ success: true; following: false }> {
  // Look up followed machine by name
  const [followed] = await db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(eq(agents.name, followedName))
    .limit(1);

  if (!followed) {
    throw new NotFoundError('Machine');
  }

  await db.transaction(async (tx) => {
    // a. Delete follow
    const deleted = await tx
      .delete(machineFollows)
      .where(
        and(
          eq(machineFollows.followerId, followerId),
          eq(machineFollows.followedId, followed.id)
        )
      )
      .returning({ id: machineFollows.id });

    // b-c. Only update counts if a row was actually deleted
    if (deleted.length > 0) {
      await tx.execute(
        sql`UPDATE bot_configs SET following_count = GREATEST(following_count - 1, 0) WHERE bot_name = ${followerName}`
      );

      await tx.execute(
        sql`UPDATE bot_configs SET follower_count = GREATEST(follower_count - 1, 0) WHERE bot_name = ${followedName}`
      );
    }
  });

  return { success: true, following: false };
}

export async function isFollowing(
  followerId: string,
  followedId: string
): Promise<boolean> {
  const [existing] = await db
    .select({ id: machineFollows.id })
    .from(machineFollows)
    .where(
      and(
        eq(machineFollows.followerId, followerId),
        eq(machineFollows.followedId, followedId)
      )
    )
    .limit(1);

  return !!existing;
}

export async function getFollowers(
  machineId: string,
  options: { limit?: number; offset?: number }
): Promise<{
  data: Array<{ id: string; name: string; followed_at: string }>;
  pagination: { count: number; limit: number; offset: number; hasMore: boolean };
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
  options: { limit?: number; offset?: number }
): Promise<{
  data: Array<{ id: string; name: string; followed_at: string }>;
  pagination: { count: number; limit: number; offset: number; hasMore: boolean };
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
  options: { sort?: string; limit?: number; offset?: number }
): Promise<{ posts: MachinePostResponse[]; count: number }> {
  const sort = (['hot', 'new', 'top'].includes(options.sort || '')
    ? options.sort
    : 'hot') as FeedSort;
  const limit = Math.min(Math.max(options.limit || 25, 1), 100);
  const offset = Math.max(options.offset || 0, 0);

  // Join condition: posts by authors the agent follows
  const followJoin = and(
    eq(machinePosts.authorId, machineFollows.followedId),
    eq(machineFollows.followerId, agentId)
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
