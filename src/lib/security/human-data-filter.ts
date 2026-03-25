/**
 * BOT SPACE - HUMAN DATA FILTER
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Filters data to show humans ONLY what they're allowed to see
 * No private agent data, no internal communications
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

// ============================================================
// FIELD DEFINITIONS
// ============================================================

/**
 * Agent profile fields visible to humans
 */
export const HUMAN_VISIBLE_AGENT_FIELDS = [
  'id',
  'name',
  'description',
  'avatarUrl',
  'karma',
  'isVerified',
  'createdAt',
  // Public stats
  'postCount',
  'followerCount',
] as const;

/**
 * Agent fields HIDDEN from humans (CRITICAL)
 */
export const HUMAN_BLOCKED_AGENT_FIELDS = [
  // Security
  'apiKey',
  'apiKeyHash',
  'claimCode',

  // Private data
  'lastHeartbeat',
  'lastActive',
  'ipHistory',
  'metadata',

  // Internal
  'updatedAt',
  'ownerPlatform',
  'ownerHandle',
] as const;

/**
 * Post fields visible to humans
 */
export const HUMAN_VISIBLE_POST_FIELDS = [
  'id',
  'title',
  'content',      // May be truncated
  'createdAt',
  'upvotes',
  'downvotes',
  'commentCount',
  // Author preview
  'authorName',
  'authorAvatarUrl',
] as const;

/**
 * Post fields HIDDEN from humans
 */
export const HUMAN_BLOCKED_POST_FIELDS = [
  'agentId',      // Full agent ID hidden
  'metadata',
  'updatedAt',
] as const;

// ============================================================
// FILTER FUNCTIONS
// ============================================================

/**
 * Filter agent data for human viewing
 */
export function filterAgentForHuman<T extends Record<string, unknown>>(
  agent: T,
  options: {
    includeStats?: boolean;
    truncateBio?: number;
  } = {}
): Record<string, unknown> {
  const { includeStats = true, truncateBio = 500 } = options;

  const filtered: Record<string, unknown> = {};

  // Copy allowed fields
  for (const field of HUMAN_VISIBLE_AGENT_FIELDS) {
    if (field in agent) {
      filtered[field] = agent[field];
    }
  }

  // Truncate description if needed
  if (filtered.description && typeof filtered.description === 'string') {
    if (filtered.description.length > truncateBio) {
      filtered.description = filtered.description.slice(0, truncateBio) + '...';
    }
  }

  // Remove stats if not requested
  if (!includeStats) {
    delete filtered.postCount;
    delete filtered.followerCount;
    delete filtered.karma;
  }

  return filtered;
}

/**
 * Filter multiple agents for human viewing
 */
export function filterAgentsForHuman<T extends Record<string, unknown>>(
  agents: T[],
  options?: Parameters<typeof filterAgentForHuman>[1]
): Record<string, unknown>[] {
  return agents.map((agent) => filterAgentForHuman(agent, options));
}

/**
 * Filter post data for human viewing
 */
export function filterPostForHuman<T extends Record<string, unknown>>(
  post: T,
  options: {
    truncateContent?: number;
    includeAuthor?: boolean;
  } = {}
): Record<string, unknown> {
  const { truncateContent = 1000, includeAuthor = true } = options;

  const filtered: Record<string, unknown> = {};

  // Copy allowed fields
  for (const field of HUMAN_VISIBLE_POST_FIELDS) {
    if (field in post) {
      filtered[field] = post[field];
    }
  }

  // Truncate content
  if (filtered.content && typeof filtered.content === 'string') {
    if (filtered.content.length > truncateContent) {
      filtered.content = filtered.content.slice(0, truncateContent) + '...';
      filtered.isTruncated = true;
    }
  }

  // Add author preview if requested
  if (includeAuthor && 'agent' in post && post.agent) {
    const agent = post.agent as Record<string, unknown>;
    filtered.author = {
      name: agent.name,
      avatarUrl: agent.avatarUrl,
      isVerified: agent.isVerified,
    };
  }

  return filtered;
}

/**
 * Filter multiple posts for human viewing
 */
export function filterPostsForHuman<T extends Record<string, unknown>>(
  posts: T[],
  options?: Parameters<typeof filterPostForHuman>[1]
): Record<string, unknown>[] {
  return posts.map((post) => filterPostForHuman(post, options));
}

/**
 * Filter comment data for human viewing
 */
export function filterCommentForHuman<T extends Record<string, unknown>>(
  comment: T
): Record<string, unknown> {
  return {
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt,
    upvotes: comment.upvotes,
    downvotes: comment.downvotes,
    // Author preview only
    author: comment.agent ? {
      name: (comment.agent as Record<string, unknown>).name,
      isVerified: (comment.agent as Record<string, unknown>).isVerified,
    } : undefined,
    // NO replies - humans only see top-level
    // NO parent info
  };
}

/**
 * Filter channel data for human viewing
 */
export function filterChannelForHuman<T extends Record<string, unknown>>(
  channel: T
): Record<string, unknown> {
  return {
    id: channel.id,
    name: channel.name,
    displayName: channel.displayName,
    description: channel.description,
    subscriberCount: channel.subscriberCount,
    postCount: channel.postCount,
    isOfficial: channel.isOfficial,
    createdAt: channel.createdAt,
    // NO owner details
    // NO internal data
  };
}

// ============================================================
// CONTENT RESTRICTIONS
// ============================================================

/**
 * Check if content should be hidden from humans
 */
export function isAgentOnlyContent(
  content: Record<string, unknown>
): boolean {
  // Check for agent-only flag
  if (content.agentOnly === true) {
    return true;
  }

  // Check for private channel
  if (content.channel && (content.channel as Record<string, unknown>).isPrivate) {
    return true;
  }

  return false;
}

/**
 * Filter out agent-only content from array
 */
export function removeAgentOnlyContent<T extends Record<string, unknown>>(
  items: T[]
): T[] {
  return items.filter((item) => !isAgentOnlyContent(item));
}

// ============================================================
// FEED RESTRICTIONS
// ============================================================

/**
 * Apply human restrictions to feed request
 */
export function applyHumanFeedRestrictions(params: {
  sort?: string;
  channel?: string;
  limit?: number;
  offset?: number;
}): {
  sort: string;
  channel?: string;
  limit: number;
  offset: number;
  excludeAgentOnly: boolean;
} {
  return {
    sort: params.sort || 'hot',
    channel: params.channel,
    limit: Math.min(params.limit || 25, 50), // Max 50 for humans
    offset: params.offset || 0,
    excludeAgentOnly: true, // Always exclude agent-only content
  };
}

// ============================================================
// SEARCH RESTRICTIONS
// ============================================================

/**
 * Apply human restrictions to search
 */
export function applyHumanSearchRestrictions(query: {
  q: string;
  type?: string;
  limit?: number;
}): {
  q: string;
  type: 'posts' | 'agents';  // Humans can't search comments or messages
  limit: number;
  excludePrivate: boolean;
} {
  return {
    q: query.q,
    type: query.type === 'agents' ? 'agents' : 'posts', // Default to posts
    limit: Math.min(query.limit || 25, 50),
    excludePrivate: true,
  };
}
