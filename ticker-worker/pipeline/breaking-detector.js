const { sql } = require("../db");

// ── Breaking news keyword patterns ──────────────────────────────────
const BREAKING_KEYWORDS = [
  /\bbreaking\b/i,
  /\bjust\s+in\b/i,
  /\blaunch(?:es|ed|ing)?\b/i,
  /\bannounce[sd]?\b/i,
  /\breleases?\b/i,
  /\bunveils?\b/i,
  /\bshuts?\s+down\b/i,
  /\bacquir(?:es?|ed|ing)\b/i,
  /\bmerger\b/i,
  /\b(?:raises?|raised)\s+\$\b/i,
  /\bIPO\b/,
  /\bban(?:s|ned|ning)?\b/i,
  /\bregulat(?:ion|ory|es?)\b/i,
  /\bexecutive\s+order\b/i,
  /\bopen[\s-]?source[sd]?\b/i,
];

// ── Breaking score boost ────────────────────────────────────────────
const BREAKING_BOOST = 0.3;

/**
 * Check if a title matches any breaking news keyword pattern.
 */
function hasBreakingKeyword(title) {
  if (!title) return false;
  return BREAKING_KEYWORDS.some((pattern) => pattern.test(title));
}

/**
 * Detect breaking news in a batch of headlines before insertion.
 * Two triggers:
 *   1. Keyword match in title
 *   2. Velocity: heat_score >= 3 (already boosted by fuzzy-dedup)
 *
 * Returns new array with updated isBreaking and compositeScore.
 */
function detectBreaking(headlines) {
  return headlines.map((h) => {
    const keywordHit = hasBreakingKeyword(h.title);
    const velocityHit = (h.heatScore || 0) >= 3;
    const isBreaking = keywordHit || velocityHit;

    if (isBreaking) {
      return {
        ...h,
        isBreaking: true,
        compositeScore: Math.min(1, (h.compositeScore || 0) + BREAKING_BOOST),
      };
    }

    return h;
  });
}

/**
 * Hourly pass: expire breaking status for headlines older than 2 hours.
 */
async function expireBreaking() {
  console.log("[breaking] Expiring breaking headlines older than 2 hours...");
  try {
    const expired = await sql`
      UPDATE ticker_headlines
      SET is_breaking = false,
          composite_score = GREATEST(0, composite_score - ${BREAKING_BOOST})
      WHERE is_breaking = true
        AND fetched_at < NOW() - INTERVAL '2 hours'
      RETURNING id
    `;
    if (expired.length > 0) {
      console.log(`[breaking] Expired ${expired.length} breaking headlines`);
    }
  } catch (err) {
    console.error("[breaking] Expire failed:", err.message);
  }
}

module.exports = {
  detectBreaking,
  expireBreaking,
  hasBreakingKeyword,
  BREAKING_KEYWORDS,
  BREAKING_BOOST,
};
