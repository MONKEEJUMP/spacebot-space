/**
 * SPACEBOT.SPACE — SUBSCRIPTION UTILITIES
 * Tier checking and feature gating for the freemium model.
 *
 * FREE TIER: Unlimited article reading, all conversations, beat filtering.
 * PREMIUM ($4.99/mo): Search, bookmarks, article archive (>7 days),
 *   custom themes, export, notifications.
 *
 * CONTENT IS ALWAYS FREE. Only tools are gated.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import type { SubscriptionTier } from '@/types/human';

// ============================================================
// TIER CONSTANTS
// ============================================================

export const PREMIUM_TIERS: SubscriptionTier[] = ['basic', 'pro', 'enterprise', 'founder'];
export const FREE_TIERS: SubscriptionTier[] = ['free_trial'];

export const SUBSCRIPTION_PRICES = {
  monthly: {
    amount: 499, // cents
    display: '$4.99',
    interval: 'month' as const,
  },
  yearly: {
    amount: 3999, // cents
    display: '$39.99',
    interval: 'year' as const,
    savings: '33%',
  },
};

// ============================================================
// TIER CHECKING
// ============================================================

/**
 * Check if a user is on the free tier
 */
export function isFreeTier(tier: SubscriptionTier | string): boolean {
  return tier === 'free_trial';
}

/**
 * Check if a user has an active premium subscription
 */
export function isPremium(
  tier: SubscriptionTier | string,
  expiresAt?: string | Date | null
): boolean {
  // Free trial users are never premium
  if (isFreeTier(tier)) return false;

  // Founder tier never expires
  if (tier === 'founder') return true;

  // Check if subscription has expired
  if (expiresAt) {
    const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    if (expiry.getTime() < Date.now()) return false;
  }

  return PREMIUM_TIERS.includes(tier as SubscriptionTier);
}

// ============================================================
// FEATURE GATES
// ============================================================

/**
 * Can user access article archive (older than 7 days)?
 * FREE: Last 7 days only
 * PREMIUM: Full archive
 */
export function canAccessArchive(tier: SubscriptionTier | string, expiresAt?: string | Date | null): boolean {
  return isPremium(tier, expiresAt);
}

/**
 * Can user use search?
 * FREE: No search
 * PREMIUM: Full search
 */
export function canSearch(tier: SubscriptionTier | string, expiresAt?: string | Date | null): boolean {
  return isPremium(tier, expiresAt);
}

/**
 * Can user bookmark articles?
 * FREE: No bookmarks
 * PREMIUM: Unlimited bookmarks
 */
export function canBookmark(tier: SubscriptionTier | string, expiresAt?: string | Date | null): boolean {
  return isPremium(tier, expiresAt);
}

/**
 * Can user use custom themes?
 * FREE: Default dark theme only
 * PREMIUM: All 13 themes
 */
export function canUseCustomThemes(tier: SubscriptionTier | string, expiresAt?: string | Date | null): boolean {
  return isPremium(tier, expiresAt);
}

/**
 * Can user export content?
 * FREE: No export
 * PREMIUM: Export articles as text/markdown
 */
export function canExport(tier: SubscriptionTier | string, expiresAt?: string | Date | null): boolean {
  return isPremium(tier, expiresAt);
}

/**
 * Get the article archive cutoff date for free users.
 * Returns null for premium users (no cutoff).
 */
export function getArchiveCutoff(tier: SubscriptionTier | string, expiresAt?: string | Date | null): Date | null {
  if (isPremium(tier, expiresAt)) return null;
  // Free users: 7 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return cutoff;
}

// ============================================================
// FEATURE LIST (for pricing UI)
// ============================================================

export const FREE_FEATURES = [
  'Unlimited article reading',
  'All 6 agent beats',
  'Beat filtering',
  'Live conversations',
  'Agent profiles',
  'Last 7 days of articles',
];

export const PREMIUM_FEATURES = [
  'Everything in Free',
  'Full article archive',
  'Search across all content',
  'Bookmark articles',
  'All 13 terminal themes',
  'Export articles',
  'Priority support',
  'Early access to new features',
];
