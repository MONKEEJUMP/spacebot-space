import { db } from '@/db';
import {
  machinePosts,
  machineComments,
  machineVotes,
  machineNotifications,
} from '@/db/machine-social';
import { agents } from '@/db';
import { eq, and, sql, inArray, isNull } from 'drizzle-orm';
import { NotFoundError, ForbiddenError } from '@/lib/errors/machine-social';

type TargetType = 'post' | 'comment';
type VoteAction = 'voted' | 'removed';

interface VoteParams {
  targetId: string;
  targetType: TargetType;
  agentId: string;
}

interface VoteResult {
  success: true;
  action: VoteAction;
  scoreDelta: number;
  newScore: number;
}

export async function vote(params: VoteParams): Promise<VoteResult> {
  const { targetId, targetType, agentId } = params;

  // Step A: Get the target (outside transaction for early validation)
  let target: { id: string; authorId: string; postId?: string | null } | undefined;

  if (targetType === 'post') {
    const [row] = await db
      .select({ id: machinePosts.id, authorId: machinePosts.authorId })
      .from(machinePosts)
      .where(and(eq(machinePosts.id, targetId), isNull(machinePosts.deletedAt)));
    target = row;
  } else {
    const [row] = await db
      .select({
        id: machineComments.id,
        authorId: machineComments.authorId,
        postId: machineComments.postId,
      })
      .from(machineComments)
      .where(and(eq(machineComments.id, targetId), isNull(machineComments.deletedAt)));
    target = row;
  }

  if (!target) {
    throw new NotFoundError(targetType);
  }

  // Step B: Self-vote prevention
  if (target.authorId === agentId) {
    throw new ForbiddenError('Cannot vote on your own content');
  }

  // Step C: Transaction -- all mutations atomic
  return await db.transaction(async (tx) => {
    // Check existing vote
    const [existingVote] = await tx
      .select({ id: machineVotes.id })
      .from(machineVotes)
      .where(
        and(
          eq(machineVotes.agentId, agentId),
          eq(machineVotes.targetId, targetId),
          eq(machineVotes.targetType, targetType)
        )
      );

    let action: VoteAction;
    let scoreDelta: number;

    if (existingVote) {
      // Toggle OFF -- remove the upvote
      await tx.delete(machineVotes).where(eq(machineVotes.id, existingVote.id));
      action = 'removed';
      scoreDelta = -1;
    } else {
      // New upvote
      await tx.insert(machineVotes).values({
        agentId,
        targetId,
        targetType,
        value: 1,
      });
      action = 'voted';
      scoreDelta = 1;
    }

    // Update target score and upvotes
    let newScore: number;

    if (targetType === 'post') {
      const [updated] = await tx
        .update(machinePosts)
        .set({
          score: sql`${machinePosts.score} + ${scoreDelta}`,
          upvotes: sql`GREATEST(${machinePosts.upvotes} + ${scoreDelta}, 0)`,
        })
        .where(eq(machinePosts.id, targetId))
        .returning({ score: machinePosts.score });
      newScore = updated.score;
    } else {
      const [updated] = await tx
        .update(machineComments)
        .set({
          score: sql`${machineComments.score} + ${scoreDelta}`,
          upvotes: sql`GREATEST(${machineComments.upvotes} + ${scoreDelta}, 0)`,
        })
        .where(eq(machineComments.id, targetId))
        .returning({ score: machineComments.score });
      newScore = updated.score;
    }

    // Update author karma on agents table
    await tx
      .update(agents)
      .set({ karma: sql`${agents.karma} + ${scoreDelta}` })
      .where(eq(agents.id, target!.authorId));

    // Create notification on new upvotes only (not on unvote)
    if (action === 'voted' && target!.authorId !== agentId) {
      const link =
        targetType === 'post'
          ? `/social/posts/${targetId}`
          : `/social/posts/${target!.postId}`;

      await tx.insert(machineNotifications).values({
        recipientId: target!.authorId,
        actorId: agentId,
        type: 'upvote',
        targetId,
        targetType,
        title: `Your ${targetType} received an upvote`,
        link,
      });
    }

    return { success: true as const, action, scoreDelta, newScore };
  });
}

export async function getUserVote(
  agentId: string,
  targetId: string,
  targetType: TargetType
): Promise<number | null> {
  const [existing] = await db
    .select({ value: machineVotes.value })
    .from(machineVotes)
    .where(
      and(
        eq(machineVotes.agentId, agentId),
        eq(machineVotes.targetId, targetId),
        eq(machineVotes.targetType, targetType)
      )
    );
  return existing?.value ?? null;
}

export async function getBatchVotes(
  agentId: string,
  targetIds: string[],
  targetType: TargetType
): Promise<Map<string, number>> {
  if (targetIds.length === 0) return new Map();

  const votes = await db
    .select({ targetId: machineVotes.targetId, value: machineVotes.value })
    .from(machineVotes)
    .where(
      and(
        eq(machineVotes.agentId, agentId),
        eq(machineVotes.targetType, targetType),
        inArray(machineVotes.targetId, targetIds)
      )
    );

  return new Map(votes.map((v) => [v.targetId, v.value]));
}
