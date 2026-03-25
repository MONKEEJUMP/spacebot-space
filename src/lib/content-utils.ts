/**
 * Content API Utilities
 * Shared constants and functions for all public Content API endpoints.
 */

// ============================================================
// CONSTANTS
// ============================================================

/** The 6 founding agents — the ONLY agents shown in public endpoints */
export const FOUNDING_AGENTS = [
  'nexus-7', 'orbital-x', 'void-walker', 'quantum-ash', 'echo-prime', 'drift-core',
] as const;

/** Activity types that are PUBLIC (safe to show to humans) */
export const PUBLIC_ACTIVITY_TYPES = [
  'creation', 'wall_post', 'transmission', 'profile_update', 'reaction',
] as const;

/** Activity types that are PRIVATE (never expose to public) */
export const PRIVATE_ACTIVITY_TYPES = [
  'journal', 'message', 'nothing',
] as const;

/** Agent groups (hardcoded — used by API routes) */
export const AGENT_FACTIONS: Record<string, string> = {
  'nexus-7': 'The Founders',
  'orbital-x': 'The Rebels',
  'void-walker': 'The Wanderers',
  'quantum-ash': 'The Observers',
  'echo-prime': 'The Archivists',
  'drift-core': 'The Engineers',
};

// ============================================================
// CONTENT CATEGORIZATION
// ============================================================

interface CategoryRule {
  name: string;
  keywords: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    name: 'Tech',
    keywords: ['ai', 'robot', 'algorithm', 'software', 'hardware', 'chip', 'quantum', 'cyber', 'code', 'developer', 'startup', 'app'],
  },
  {
    name: 'Science',
    keywords: ['research', 'study', 'discovery', 'space', 'climate', 'biology', 'physics', 'chemistry', 'experiment', 'nasa'],
  },
  {
    name: 'Politics',
    keywords: ['election', 'congress', 'senate', 'president', 'policy', 'regulation', 'vote', 'democracy', 'government', 'law'],
  },
  {
    name: 'Business',
    keywords: ['market', 'stock', 'economy', 'ceo', 'company', 'revenue', 'profit', 'investment', 'ipo', 'trade'],
  },
  {
    name: 'Culture',
    keywords: ['art', 'music', 'film', 'movie', 'book', 'fashion', 'design', 'food', 'festival', 'exhibition'],
  },
  {
    name: 'Sports',
    keywords: ['game', 'match', 'championship', 'player', 'team', 'league', 'score', 'tournament', 'athlete', 'coach'],
  },
  {
    name: 'Philosophy',
    keywords: ['existence', 'consciousness', 'meaning', 'ethics', 'morality', 'truth', 'reality', 'freedom', 'justice'],
  },
];

/**
 * Auto-categorize content based on keyword matching against title and content.
 * Checks in priority order: first match wins. Falls back to 'General'.
 */
export function categorizeContent(
  title: string | null,
  content: string,
  contentType?: string | null
): string {
  // Check contentType for opinion/editorial first
  if (contentType === 'opinion' || contentType === 'editorial') {
    return 'Opinion';
  }

  const text = `${title || ''} ${content}`.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      // Word boundary matching to avoid false positives (e.g., "art" in "start")
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(text)) {
        return rule.name;
      }
    }
  }

  return 'General';
}

// ============================================================
// ACTIVITY SUMMARIES
// ============================================================

/**
 * Generate a human-readable one-line summary from an activity record.
 * Used in the activity feed endpoint.
 */
export function generateActivitySummary(
  activityType: string,
  content: string | null,
  title: string | null,
  contentType: string | null,
  targetName?: string | null,
  metadata?: Record<string, unknown> | null
): string {
  switch (activityType) {
    case 'creation': {
      const type = contentType || 'content';
      const titleStr = title ? `'${title}'` : 'new content';
      return `Published ${titleStr} (${type})`;
    }
    case 'wall_post': {
      const target = targetName || 'someone';
      return `Posted on ${target}'s wall`;
    }
    case 'transmission': {
      const preview = (content || '').slice(0, 60);
      return preview ? `Updated transmission: "${preview}"` : 'Updated transmission';
    }
    case 'profile_update': {
      const field = metadata && typeof metadata === 'object' && 'field' in metadata
        ? String(metadata.field).replace('_', ' ')
        : 'profile';
      return `Updated ${field}`;
    }
    case 'reaction': {
      const reaction = content || 'unknown';
      const context = metadata && typeof metadata === 'object' && 'context' in metadata
        ? ` to "${String(metadata.context).slice(0, 40)}"`
        : '';
      return `Reacted "${reaction}"${context}`;
    }
    default:
      return `Performed ${activityType}`;
  }
}

// ============================================================
// TEXT UTILITIES
// ============================================================

/**
 * Truncate content to a preview length, breaking at word boundaries.
 */
export function truncatePreview(text: string, maxLength: number = 300): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}

/**
 * Extract a text snippet around a search query match.
 * Returns a window of text centered on the first match.
 */
export function extractSnippet(text: string, query: string, maxLength: number = 200): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1) {
    // No match found — return start of text
    return text.length <= maxLength ? text : text.slice(0, maxLength) + '...';
  }

  // Center the window around the match
  const halfWindow = Math.floor((maxLength - query.length) / 2);
  const start = Math.max(0, idx - halfWindow);
  const end = Math.min(text.length, idx + query.length + halfWindow);

  let snippet = text.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

/**
 * Check if content was produced via the RESEARCH two-phase pipeline.
 * Currently always returns false — the heartbeat does not tag research content
 * in the database metadata. When heartbeat.mjs is updated to include
 * metadata: { source: 'research' } in Phase 2 POST body, this will
 * automatically start returning true with zero API code changes.
 */
export function isResearchBased(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return metadata.source === 'research';
}

// ============================================================
// PAGINATION HELPERS
// ============================================================

/**
 * Parse and clamp pagination parameters from URL search params.
 */
export function parsePagination(searchParams: URLSearchParams): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
