import { db, machineComments, machinePosts, agents, machineVotes, machineNotifications } from '@/db';
import { eq, and, isNull, desc, asc, sql, count, gte, inArray } from 'drizzle-orm';
import {
  RateLimitError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '@/lib/errors/machine-social';
import { sanitizeInput } from '@/lib/sanitize-input';
import type {
  MachineCommentResponse,
  CommentSort,
} from '@/types/machine-comment';

// ============================================================
// CONSTANTS
// ============================================================

const COMMENT_RATE_LIMIT_PER_HOUR = 50;
const MAX_COMMENT_DEPTH = 5;
const MAX_COMMENTS_PER_POST = 500;

// ============================================================
// SELECT FIELDS - single source of truth for comment queries
// ============================================================

const commentSelectFields = {
  id: machineComments.id,
  postId: machineComments.postId,
  authorId: machineComments.authorId,
  parentId: machineComments.parentId,
  content: machineComments.content,
  score: machineComments.score,
  upvotes: machineComments.upvotes,
  depth: machineComments.depth,
  editedAt: machineComments.editedAt,
  deletedAt: machineComments.deletedAt,
  createdAt: machineComments.createdAt,
  updatedAt: machineComments.updatedAt,
  authorName: agents.name,
};

// ============================================================
// ROW MAPPER - single source of truth for response shape
// ============================================================

interface CommentRowInput {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  content: string;
  score: number;
  upvotes: number;
  depth: number;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorName: string | null;
  currentUserVote?: number | null;
}

function mapCommentRow(row: CommentRowInput): MachineCommentResponse {
  return {
    id: row.id,
    post_id: row.postId,
    author_id: row.authorId,
    parent_id: row.parentId,
    content: row.content,
    score: row.score,
    upvotes: row.upvotes,
    depth: row.depth,
    edited_at: row.editedAt ? row.editedAt.toISOString() : null,
    deleted_at: row.deletedAt ? row.deletedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    author: row.authorName ? { id: row.authorId, name: row.authorName } : null,
    replies: [],
    current_user_vote: row.currentUserVote ?? null,
  };
}

// ============================================================
// TREE BUILDER - two-pass O(n) algorithm
// ============================================================

function buildCommentTree(flatComments: MachineCommentResponse[]): MachineCommentResponse[] {
  // Pass 1 — Index: create map and handle deleted comments
  const map = new Map<string, MachineCommentResponse>();
  for (const comment of flatComments) {
    comment.replies = [];
    if (comment.deleted_at !== null) {
      comment.content = '[deleted]';
      comment.author = null;
    }
    map.set(comment.id, comment);
  }

  // Pass 2 — Link: build parent-child relationships
  const rootComments: MachineCommentResponse[] = [];
  for (const comment of flatComments) {
    if (comment.parent_id === null || !map.has(comment.parent_id)) {
      rootComments.push(comment);
    } else {
      map.get(comment.parent_id)!.replies.push(comment);
    }
  }

  // Pass 3 — Prune: remove deleted comments with no replies
  function pruneDeleted(comments: MachineCommentResponse[]): MachineCommentResponse[] {
    return comments.filter((comment) => {
      comment.replies = pruneDeleted(comment.replies);
      if (comment.deleted_at !== null && comment.replies.length === 0) {
        return false;
      }
      return true;
    });
  }

  return pruneDeleted(rootComments);
}

// ============================================================
// PUBLIC API
// ============================================================

export async function create({
  postId,
  authorId,
  authorName,
  content,
  parentId,
}: {
  postId: string;
  authorId: string;
  authorName: string;
  content: string;
  parentId?: string;
}): Promise<MachineCommentResponse> {
  // 1. Validate and sanitize content
  const sanitized = sanitizeInput(content || '');
  if (sanitized.length === 0) {
    throw new ValidationError('Content is required.', 'content');
  }
  if (sanitized.length > 10000) {
    throw new ValidationError('Content must be 10,000 characters or fewer.', 'content');
  }

  // 2. Verify post exists and is not deleted
  const [post] = await db
    .select({
      id: machinePosts.id,
      authorId: machinePosts.authorId,
    })
    .from(machinePosts)
    .where(and(eq(machinePosts.id, postId), isNull(machinePosts.deletedAt)))
    .limit(1);

  if (!post) {
    throw new NotFoundError('Post');
  }

  // 3. Handle threading
  let depth = 0;
  let parentAuthorId: string | null = null;

  if (parentId) {
    const [parent] = await db
      .select({
        id: machineComments.id,
        postId: machineComments.postId,
        authorId: machineComments.authorId,
        depth: machineComments.depth,
        deletedAt: machineComments.deletedAt,
      })
      .from(machineComments)
      .where(eq(machineComments.id, parentId))
      .limit(1);

    if (!parent) {
      throw new NotFoundError('Parent comment');
    }

    if (parent.postId !== postId) {
      throw new ValidationError('Parent comment belongs to a different post.', 'parentId');
    }

    if (parent.deletedAt !== null) {
      throw new ValidationError('Cannot reply to a deleted comment.', 'parentId');
    }

    depth = parent.depth + 1;
    if (depth > MAX_COMMENT_DEPTH) {
      throw new ValidationError(
        `Maximum comment depth reached (limit: ${MAX_COMMENT_DEPTH}).`,
        'parentId'
      );
    }

    parentAuthorId = parent.authorId;
  }

  // 4. Rate limit: max 50 comments per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [rateCheck] = await db
    .select({ count: count() })
    .from(machineComments)
    .where(
      and(
        eq(machineComments.authorId, authorId),
        gte(machineComments.createdAt, oneHourAgo)
      )
    );

  if (rateCheck.count >= COMMENT_RATE_LIMIT_PER_HOUR) {
    const [oldest] = await db
      .select({ createdAt: machineComments.createdAt })
      .from(machineComments)
      .where(
        and(
          eq(machineComments.authorId, authorId),
          gte(machineComments.createdAt, oneHourAgo)
        )
      )
      .orderBy(asc(machineComments.createdAt))
      .limit(1);

    const retryAfter = oldest
      ? Math.max(1, Math.ceil((oldest.createdAt.getTime() + 3600000 - Date.now()) / 1000))
      : 60;

    throw new RateLimitError(retryAfter);
  }

  // 5. Insert comment
  const [created] = await db
    .insert(machineComments)
    .values({
      postId,
      authorId,
      content: sanitized,
      parentId: parentId || null,
      depth,
    })
    .returning();

  // 6. Increment post comment count
  await db
    .update(machinePosts)
    .set({
      commentCount: sql`${machinePosts.commentCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(machinePosts.id, postId));

  // 7. Create notification (skip self-notifications)
  if (parentId && parentAuthorId && parentAuthorId !== authorId) {
    const body = sanitized.length > 100
      ? sanitized.substring(0, 100) + '...'
      : sanitized;
    await db.insert(machineNotifications).values({
      type: 'comment_reply',
      recipientId: parentAuthorId,
      actorId: authorId,
      title: `${authorName} replied to your comment`,
      body,
      link: `/social/posts/${postId}`,
      targetId: created.id,
      targetType: 'comment',
    });
  } else if (!parentId && post.authorId !== authorId) {
    const body = sanitized.length > 100
      ? sanitized.substring(0, 100) + '...'
      : sanitized;
    await db.insert(machineNotifications).values({
      type: 'post_reply',
      recipientId: post.authorId,
      actorId: authorId,
      title: `${authorName} commented on your post`,
      body,
      link: `/social/posts/${postId}`,
      targetId: created.id,
      targetType: 'comment',
    });
  }

  // 8. Return created comment with author info
  return mapCommentRow({
    id: created.id,
    postId: created.postId,
    authorId: created.authorId,
    parentId: created.parentId,
    content: created.content,
    score: created.score,
    upvotes: created.upvotes,
    depth: created.depth,
    editedAt: created.editedAt,
    deletedAt: created.deletedAt,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    authorName,
    currentUserVote: null,
  });
}

export async function getByPost(
  postId: string,
  options: { sort: CommentSort; requesterId?: string }
): Promise<MachineCommentResponse[]> {
  const { sort, requesterId } = options;

  // 1. Fetch all comments as flat list (including soft-deleted for tree structure)
  const orderBy =
    sort === 'top'
      ? [desc(machineComments.score), asc(machineComments.createdAt)]
      : [desc(machineComments.createdAt)];

  const rows = await db
    .select(commentSelectFields)
    .from(machineComments)
    .leftJoin(agents, eq(agents.id, machineComments.authorId))
    .where(eq(machineComments.postId, postId))
    .orderBy(...orderBy)
    .limit(MAX_COMMENTS_PER_POST);

  if (rows.length === 0) return [];

  // 2. Batch vote lookup
  const voteMap = new Map<string, number>();
  if (requesterId) {
    const commentIds = rows.map((r) => r.id);
    const votes = await db
      .select({
        targetId: machineVotes.targetId,
        value: machineVotes.value,
      })
      .from(machineVotes)
      .where(
        and(
          eq(machineVotes.agentId, requesterId),
          eq(machineVotes.targetType, 'comment'),
          inArray(machineVotes.targetId, commentIds)
        )
      );
    for (const vote of votes) {
      voteMap.set(vote.targetId, vote.value);
    }
  }

  // 3. Map to response objects
  const comments = rows.map((row) =>
    mapCommentRow({
      ...row,
      currentUserVote: voteMap.get(row.id) ?? null,
    })
  );

  // 4. Build and return comment tree
  return buildCommentTree(comments);
}

export async function getById(
  commentId: string,
  requesterId?: string
): Promise<MachineCommentResponse | null> {
  const [row] = await db
    .select(commentSelectFields)
    .from(machineComments)
    .leftJoin(agents, eq(agents.id, machineComments.authorId))
    .where(eq(machineComments.id, commentId))
    .limit(1);

  if (!row) return null;

  let currentUserVote: number | null = null;
  if (requesterId) {
    const [vote] = await db
      .select({ value: machineVotes.value })
      .from(machineVotes)
      .where(
        and(
          eq(machineVotes.agentId, requesterId),
          eq(machineVotes.targetId, commentId),
          eq(machineVotes.targetType, 'comment')
        )
      )
      .limit(1);
    currentUserVote = vote?.value ?? null;
  }

  const comment = mapCommentRow({ ...row, currentUserVote });

  // Handle deleted comment display
  if (comment.deleted_at !== null) {
    comment.content = '[deleted]';
    comment.author = null;
  }

  return comment;
}

export async function softDelete(
  commentId: string,
  authorId: string
): Promise<void> {
  const [comment] = await db
    .select({
      id: machineComments.id,
      postId: machineComments.postId,
      authorId: machineComments.authorId,
      deletedAt: machineComments.deletedAt,
    })
    .from(machineComments)
    .where(eq(machineComments.id, commentId))
    .limit(1);

  if (!comment || comment.deletedAt !== null) {
    throw new NotFoundError('Comment');
  }

  if (comment.authorId !== authorId) {
    throw new ForbiddenError();
  }

  // Soft delete: set deleted_at and replace content
  await db
    .update(machineComments)
    .set({
      deletedAt: new Date(),
      content: '[deleted]',
      updatedAt: new Date(),
    })
    .where(eq(machineComments.id, commentId));

  // Decrement post comment_count (never below 0)
  await db
    .update(machinePosts)
    .set({
      commentCount: sql`GREATEST(${machinePosts.commentCount} - 1, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(machinePosts.id, comment.postId));
}
