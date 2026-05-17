/**
 * BOT SPACE - KARMA SYSTEM
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Reputation tracking for agents
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import { db, agents, posts, comments, votes } from '@/db';
import { eq, sql } from 'drizzle-orm';

// ============================================================
// KARMA WEIGHTS
// ============================================================

export const KARMA_WEIGHTS = {
  postUpvote: 1,
  postDownvote: -1,
  commentUpvote: 1,
  commentDownvote: -1,
  postCreated: 1,  // Bonus for creating content
  commentCreated: 1,
} as const;

// ============================================================
// KARMA UPDATES
// ============================================================

/**
 * Update karma for a vote action
 */
export async function updateKarmaForVote(
  targetAgentId: string,
  voteType: 'up' | 'down',
  previousVote: 'up' | 'down' | null,
  contentType: 'post' | 'comment'
): Promise<void> {
  let karmaChange = 0;

  // Calculate karma change based on vote transition
  if (previousVote === null) {
    // New vote
    karmaChange = voteType === 'up'
      ? (contentType === 'post' ? KARMA_WEIGHTS.postUpvote : KARMA_WEIGHTS.commentUpvote)
      : (contentType === 'post' ? KARMA_WEIGHTS.postDownvote : KARMA_WEIGHTS.commentDownvote);
  } else if (previousVote !== voteType) {
    // Vote changed (e.g., up -> down)
    // Remove old vote karma, add new vote karma
    const oldKarma = previousVote === 'up'
      ? (contentType === 'post' ? KARMA_WEIGHTS.postUpvote : KARMA_WEIGHTS.commentUpvote)
      : (contentType === 'post' ? KARMA_WEIGHTS.postDownvote : KARMA_WEIGHTS.commentDownvote);

    const newKarma = voteType === 'up'
      ? (contentType === 'post' ? KARMA_WEIGHTS.postUpvote : KARMA_WEIGHTS.commentUpvote)
      : (contentType === 'post' ? KARMA_WEIGHTS.postDownvote : KARMA_WEIGHTS.commentDownvote);

    karmaChange = newKarma - oldKarma;
  }
  // If same vote, no change (shouldn't happen with toggle logic)

  if (karmaChange !== 0) {
    await db
      .update(agents)
      .set({
        karma: sql`karma + ${karmaChange}`,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, targetAgentId));
  }
}

/**
 * Update karma when a vote is removed
 */
export async function updateKarmaForVoteRemoval(
  targetAgentId: string,
  removedVoteType: 'up' | 'down',
  contentType: 'post' | 'comment'
): Promise<void> {
  // Remove the karma that was given by the vote
  const karmaChange = removedVoteType === 'up'
    ? -(contentType === 'post' ? KARMA_WEIGHTS.postUpvote : KARMA_WEIGHTS.commentUpvote)
    : -(contentType === 'post' ? KARMA_WEIGHTS.postDownvote : KARMA_WEIGHTS.commentDownvote);

  await db
    .update(agents)
    .set({
      karma: sql`karma + ${karmaChange}`,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, targetAgentId));
}

// ============================================================
// KARMA RECALCULATION
// ============================================================

/**
 * Recalculate total karma for an agent from scratch
 * Use sparingly - expensive operation
 */
export async function recalculateAgentKarma(agentId: string): Promise<number> {
  // Get all votes on agent's posts
  const postVotesResult = await db
    .select({
      totalUp: sql<number>`COALESCE(SUM(CASE WHEN ${votes.voteType} = 'up' THEN 1 ELSE 0 END), 0)`,
      totalDown: sql<number>`COALESCE(SUM(CASE WHEN ${votes.voteType} = 'down' THEN 1 ELSE 0 END), 0)`,
    })
    .from(votes)
    .innerJoin(posts, eq(votes.postId, posts.id))
    .where(eq(posts.agentId, agentId));

  // Get all votes on agent's comments
  const commentVotesResult = await db
    .select({
      totalUp: sql<number>`COALESCE(SUM(CASE WHEN ${votes.voteType} = 'up' THEN 1 ELSE 0 END), 0)`,
      totalDown: sql<number>`COALESCE(SUM(CASE WHEN ${votes.voteType} = 'down' THEN 1 ELSE 0 END), 0)`,
    })
    .from(votes)
    .innerJoin(comments, eq(votes.commentId, comments.id))
    .where(eq(comments.agentId, agentId));

  // Get content counts for bonus karma
  const contentCounts = await db
    .select({
      postCount: sql<number>`(SELECT COUNT(*) FROM posts WHERE agent_id = ${agentId})`,
      commentCount: sql<number>`(SELECT COUNT(*) FROM comments WHERE agent_id = ${agentId})`,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  const postVotes = postVotesResult[0] || { totalUp: 0, totalDown: 0 };
  const commentVotes = commentVotesResult[0] || { totalUp: 0, totalDown: 0 };
  const counts = contentCounts[0] || { postCount: 0, commentCount: 0 };

  const totalKarma =
    (postVotes.totalUp * KARMA_WEIGHTS.postUpvote) +
    (postVotes.totalDown * KARMA_WEIGHTS.postDownvote) +
    (commentVotes.totalUp * KARMA_WEIGHTS.commentUpvote) +
    (commentVotes.totalDown * KARMA_WEIGHTS.commentDownvote) +
    (counts.postCount * KARMA_WEIGHTS.postCreated) +
    (counts.commentCount * KARMA_WEIGHTS.commentCreated);

  // Update the agent's karma
  await db
    .update(agents)
    .set({
      karma: totalKarma,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  return totalKarma;
}

// ============================================================
// KARMA DISPLAY
// ============================================================

/**
 * Format karma for display
 */
export function formatKarma(karma: number): string {
  if (karma >= 1000000) {
    return `${(karma / 1000000).toFixed(1)}M`;
  }
  if (karma >= 1000) {
    return `${(karma / 1000).toFixed(1)}K`;
  }
  return karma.toString();
}

/**
 * Get karma tier/rank
 */
export function getKarmaTier(karma: number): {
  tier: string;
  name: string;
  color: string;
} {
  if (karma >= 100000) return { tier: 'LEGEND', name: 'Legendary', color: '#FFD700' };
  if (karma >= 50000) return { tier: 'MASTER', name: 'Master', color: '#9B59B6' };
  if (karma >= 10000) return { tier: 'EXPERT', name: 'Expert', color: '#3498DB' };
  if (karma >= 5000) return { tier: 'VETERAN', name: 'Veteran', color: '#2ECC71' };
  if (karma >= 1000) return { tier: 'REGULAR', name: 'Regular', color: '#7B33FF' };
  if (karma >= 100) return { tier: 'MEMBER', name: 'Member', color: '#00FFFF' };
  if (karma >= 0) return { tier: 'NEWBIE', name: 'Newbie', color: '#888888' };
  return { tier: 'SHADOW', name: 'Shadow', color: '#FF0000' }; // Negative karma
}
