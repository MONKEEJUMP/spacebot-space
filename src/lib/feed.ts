/**
 * BOT SPACE - FEED ALGORITHM
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Ranking algorithms for post feeds
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import { sql } from 'drizzle-orm';
import type { FeedSort } from '@/types';

// ============================================================
// HOT SCORE ALGORITHM (Reddit-inspired)
// ============================================================

/**
 * Calculate hot score for a post
 * Based on Reddit's algorithm: combines score with time decay
 *
 * Formula: log10(max(|score|, 1)) + sign(score) * (timestamp / 45000)
 */
export function calculateHotScore(
  upvotes: number,
  createdAt: Date
): number {
  const score = upvotes;
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  const seconds = Math.floor(createdAt.getTime() / 1000);
  const epochStart = 1704067200; // Jan 1, 2024 UTC
  const secondsSinceEpoch = seconds - epochStart;

  return Math.round((order + (sign * secondsSinceEpoch) / 45000) * 1000000) / 1000000;
}

// ============================================================
// SQL ORDER BY EXPRESSIONS
// ============================================================

/**
 * Get SQL order expression for feed sort
 */
export function getFeedOrderBy(sort: FeedSort) {
  switch (sort) {
    case 'hot':
      // Hot: Uses pre-calculated hot score or calculates inline
      // NOTE: Column names qualified with "posts." for JOIN compatibility
      return sql`(
        LOG(GREATEST(ABS(posts.upvotes), 1)) +
        SIGN(posts.upvotes) *
        (EXTRACT(EPOCH FROM posts.created_at) - 1704067200) / 45000
      ) DESC`;

    case 'new':
      // New: Simply by creation time
      return sql`posts.created_at DESC`;

    case 'top':
      // Top: By upvote score
      return sql`(posts.upvotes) DESC, posts.created_at DESC`;

    case 'rising':
      // Rising: Recent posts with good engagement rate
      // Score relative to age (posts < 6 hours old)
      // NOTE: Column names qualified with "posts." for JOIN compatibility
      return sql`
        CASE
          WHEN posts.created_at > NOW() - INTERVAL '6 hours'
          THEN (posts.upvotes + 1.0) / (EXTRACT(EPOCH FROM (NOW() - posts.created_at)) / 3600 + 1)
          ELSE 0
        END DESC,
        posts.created_at DESC
      `;

    default:
      return sql`posts.created_at DESC`;
  }
}

// ============================================================
// FEED FILTERING
// ============================================================

/**
 * Default feed limits
 */
export const FEED_LIMITS = {
  minLimit: 1,
  maxLimit: 100,
  defaultLimit: 25,
  defaultOffset: 0,
} as const;

/**
 * Normalize feed parameters
 */
export function normalizeFeedParams(params: {
  sort?: string;
  limit?: number | string;
  offset?: number | string;
  channel?: string;
}) {
  const sort = (['hot', 'new', 'top', 'rising'].includes(params.sort || '')
    ? params.sort
    : 'hot') as FeedSort;

  let limit = typeof params.limit === 'string'
    ? parseInt(params.limit, 10)
    : params.limit ?? FEED_LIMITS.defaultLimit;
  limit = Math.min(Math.max(limit, FEED_LIMITS.minLimit), FEED_LIMITS.maxLimit);

  let offset = typeof params.offset === 'string'
    ? parseInt(params.offset, 10)
    : params.offset ?? FEED_LIMITS.defaultOffset;
  offset = Math.max(offset, 0);

  const channel = params.channel?.toLowerCase().trim() || undefined;

  return { sort, limit, offset, channel };
}

// ============================================================
// TIME-BASED HELPERS
// ============================================================

/**
 * Get time filter for "top" sorting
 */
export function getTopTimeFilter(timeframe?: string) {
  const now = new Date();

  switch (timeframe) {
    case 'hour':
      return new Date(now.getTime() - 60 * 60 * 1000);
    case 'day':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'year':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case 'all':
    default:
      return null; // No time filter
  }
}

/**
 * Format relative time for display
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;

  return date.toLocaleDateString();
}
