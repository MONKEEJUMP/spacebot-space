const { sql } = require("../db");

// ── Category boost map ───────────────────────────────────────────────
const CATEGORY_BOOST = {
  breaking: 0.15,
  research: 0.10,
  product: 0.08,
  policy: 0.06,
  industry: 0.04,
  opinion: 0.02,
};

// ── Tier score map ───────────────────────────────────────────────────
const TIER_SCORE = {
  1: 1.0,
  2: 0.75,
  3: 0.5,
};

/**
 * Recency score: exponential decay based on age in hours.
 * Fresh = 1.0, 6h = ~0.41, 12h = ~0.17, 24h = ~0.03
 */
function recencyScore(publishedAt) {
  if (!publishedAt) return 0.3; // unknown age gets a low default
  const ageHours =
    (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60);
  return Math.exp(-0.15 * Math.max(0, ageHours));
}

/**
 * Heat score: normalize heat_score into 0–1 range.
 * 0 heat = 0.0, 1 = 0.25, 3 = 0.6, 5+ = 1.0
 */
function heatComponent(heatScore) {
  const h = Math.max(0, heatScore || 0);
  return Math.min(1, h / 5);
}

/**
 * Title quality: heuristic based on word count and character length.
 * Ideal title: 6-15 words, 40-120 chars. Too short or too long penalized.
 */
function titleQualityScore(title) {
  if (!title) return 0;

  const words = title.trim().split(/\s+/).length;
  const chars = title.length;

  let score = 0.5; // baseline

  // Word count: 6-15 is ideal
  if (words >= 6 && words <= 15) {
    score += 0.3;
  } else if (words >= 4 && words <= 20) {
    score += 0.15;
  }

  // Character length: 40-120 is ideal
  if (chars >= 40 && chars <= 120) {
    score += 0.2;
  } else if (chars >= 25 && chars <= 150) {
    score += 0.1;
  }

  return Math.min(1, score);
}

/**
 * Compute composite score for a single headline object.
 * Formula: (recency × 0.35) + (source_tier × 0.25) + (heat × 0.20)
 *        + (category_boost × 0.10) + (title_quality × 0.10)
 */
function scoreHeadline(headline) {
  const recency = recencyScore(headline.publishedAt);
  const tier = TIER_SCORE[headline.sourceTier] || 0.5;
  const heat = heatComponent(headline.heatScore);
  const catBoost = CATEGORY_BOOST[headline.category] || 0.04;
  const titleQ = titleQualityScore(headline.title);

  const composite =
    recency * 0.35 + tier * 0.25 + heat * 0.2 + catBoost * 0.1 + titleQ * 0.1;

  return Math.round(Math.min(1, Math.max(0, composite)) * 100) / 100;
}

/**
 * Score a batch of headline objects before insertion.
 * Returns new array with updated compositeScore.
 */
function scoreBatch(headlines) {
  return headlines.map((h) => ({
    ...h,
    compositeScore: scoreHeadline(h),
  }));
}

/**
 * Hourly rescore: recalculate composite_score for all active headlines in DB.
 * Recency decays over time, so scores need periodic refresh.
 */
async function rescoreAll() {
  console.log("[scorer] Rescoring all active headlines...");
  try {
    const active = await sql`
      SELECT id, published_at, source_tier, heat_score, category, title
      FROM ticker_headlines
      WHERE is_active = true
    `;

    if (!active.length) {
      console.log("[scorer] No active headlines to rescore");
      return;
    }

    let updated = 0;
    for (const row of active) {
      const newScore = scoreHeadline({
        publishedAt: row.published_at,
        sourceTier: row.source_tier,
        heatScore: row.heat_score,
        category: row.category,
        title: row.title,
      });

      await sql`
        UPDATE ticker_headlines
        SET composite_score = ${newScore}
        WHERE id = ${row.id}
      `;
      updated++;
    }

    console.log(`[scorer] Rescored ${updated} active headlines`);
  } catch (err) {
    console.error("[scorer] Rescore failed:", err.message);
  }
}

module.exports = {
  scoreHeadline,
  scoreBatch,
  rescoreAll,
  recencyScore,
  heatComponent,
  titleQualityScore,
  CATEGORY_BOOST,
};
