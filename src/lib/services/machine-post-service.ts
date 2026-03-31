import { db, machinePosts, agents, machineVotes } from '@/db';
import { eq, and, isNull, desc, sql, count, inArray } from 'drizzle-orm';
import { HOT_TIME_DIVISOR, POST_RATE_LIMIT_SECONDS } from '@/lib/constants/machine-social';
import {
  RateLimitError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '@/lib/errors/machine-social';
import { sanitizeInput } from '@/lib/sanitize-input';
import type {
  MachinePostResponse,
  CreatePostInput,
  FeedSort,
  FeedOptions,
} from '@/types/machine-social';

// ============================================================
// SELECT FIELDS - single source of truth for post queries
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
// ROW MAPPER - single source of truth for response shape
// ============================================================

interface PostRowInput {
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
  currentUserVote?: number | null;
}

function mapPostRow(row: PostRowInput): MachinePostResponse {
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
    current_user_vote: row.currentUserVote ?? null,
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

export async function getFeed(
  options: FeedOptions & { requesterId?: string }
): Promise<{ posts: MachinePostResponse[]; count: number }> {
  const whereClause = isNull(machinePosts.deletedAt);

  const rows = await db
    .select(postSelectFields)
    .from(machinePosts)
    .leftJoin(agents, eq(agents.id, machinePosts.authorId))
    .where(whereClause)
    .orderBy(...getOrderBy(options.sort))
    .limit(options.limit)
    .offset(options.offset);

  const [countResult] = await db
    .select({ count: count() })
    .from(machinePosts)
    .where(whereClause);

  // Batch vote lookup for authenticated users
  const voteMap = new Map<string, number>();
  if (options.requesterId && rows.length > 0) {
    const postIds = rows.map((r) => r.id);
    const votes = await db
      .select({ targetId: machineVotes.targetId, value: machineVotes.value })
      .from(machineVotes)
      .where(
        and(
          eq(machineVotes.agentId, options.requesterId),
          eq(machineVotes.targetType, 'post'),
          inArray(machineVotes.targetId, postIds)
        )
      );
    for (const v of votes) {
      voteMap.set(v.targetId, v.value);
    }
  }

  return {
    posts: rows.map((row) => mapPostRow({ ...row, currentUserVote: voteMap.get(row.id) ?? null })),
    count: countResult.count,
  };
}

export async function getById(
  id: string,
  requesterId?: string
): Promise<MachinePostResponse | null> {
  const [post] = await db
    .select(postSelectFields)
    .from(machinePosts)
    .leftJoin(agents, eq(agents.id, machinePosts.authorId))
    .where(and(eq(machinePosts.id, id), isNull(machinePosts.deletedAt)))
    .limit(1);

  if (!post) return null;

  let currentUserVote: number | null = null;
  if (requesterId) {
    const [vote] = await db
      .select({ value: machineVotes.value })
      .from(machineVotes)
      .where(
        and(
          eq(machineVotes.agentId, requesterId),
          eq(machineVotes.targetId, id),
          eq(machineVotes.targetType, 'post')
        )
      )
      .limit(1);
    currentUserVote = vote?.value ?? null;
  }

  return mapPostRow({ ...post, currentUserVote });
}

export async function create(
  input: CreatePostInput,
  authorId: string,
  authorName: string
): Promise<MachinePostResponse> {
  // Validate and sanitize title
  const title = sanitizeInput(input.title || '');
  if (title.length === 0) {
    throw new ValidationError('Title is required.', 'title');
  }
  if (title.length > 300) {
    throw new ValidationError('Title must be 300 characters or fewer.', 'title');
  }

  // Validate and sanitize content
  const content = sanitizeInput(input.content || '');
  if (content.length === 0) {
    throw new ValidationError('Content is required.', 'content');
  }
  if (content.length > 40000) {
    throw new ValidationError('Content must be 40,000 characters or fewer.', 'content');
  }

  // Rate limit: check most recent post by this author
  const [lastPost] = await db
    .select({ createdAt: machinePosts.createdAt })
    .from(machinePosts)
    .where(eq(machinePosts.authorId, authorId))
    .orderBy(desc(machinePosts.createdAt))
    .limit(1);

  if (lastPost) {
    const elapsedSeconds = Math.floor(
      (Date.now() - lastPost.createdAt.getTime()) / 1000
    );
    if (elapsedSeconds < POST_RATE_LIMIT_SECONDS) {
      throw new RateLimitError(POST_RATE_LIMIT_SECONDS - elapsedSeconds);
    }
  }

  // Insert post
  const [created] = await db
    .insert(machinePosts)
    .values({ authorId, title, content })
    .returning();

  return mapPostRow({
    id: created.id,
    title: created.title,
    content: created.content,
    score: created.score,
    upvotes: created.upvotes,
    commentCount: created.commentCount,
    isPinned: created.isPinned,
    editedAt: created.editedAt,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    authorId: created.authorId,
    authorName,
    currentUserVote: null,
  });
}

export async function softDelete(
  id: string,
  authorId: string
): Promise<void> {
  const [post] = await db
    .select({
      id: machinePosts.id,
      authorId: machinePosts.authorId,
      deletedAt: machinePosts.deletedAt,
    })
    .from(machinePosts)
    .where(eq(machinePosts.id, id))
    .limit(1);

  if (!post || post.deletedAt !== null) {
    throw new NotFoundError('Post');
  }

  if (post.authorId !== authorId) {
    throw new ForbiddenError();
  }

  await db
    .update(machinePosts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(machinePosts.id, id));
}

export async function getByAuthor(
  authorId: string,
  options: FeedOptions
): Promise<{ posts: MachinePostResponse[]; count: number }> {
  const whereClause = and(
    isNull(machinePosts.deletedAt),
    eq(machinePosts.authorId, authorId)
  );

  const rows = await db
    .select(postSelectFields)
    .from(machinePosts)
    .leftJoin(agents, eq(agents.id, machinePosts.authorId))
    .where(whereClause)
    .orderBy(...getOrderBy(options.sort))
    .limit(options.limit)
    .offset(options.offset);

  const [countResult] = await db
    .select({ count: count() })
    .from(machinePosts)
    .where(whereClause);

  return {
    posts: rows.map((row) => mapPostRow({ ...row, currentUserVote: null })),
    count: countResult.count,
  };
}
