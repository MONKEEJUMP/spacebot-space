const { sql } = require("../db");

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "can", "shall", "not", "no", "nor",
  "so", "if", "then", "than", "that", "this", "these", "those", "it",
  "its", "how", "what", "when", "where", "who", "which", "why",
  "new", "says", "said", "according", "report", "reports", "via",
]);

/**
 * Tokenize a title: lowercase, strip punctuation, remove stop words.
 */
function tokenize(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Generate bigrams (2-word pairs) from a token list.
 */
function getBigrams(tokens) {
  const bigrams = new Set();
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  // Also add individual tokens as unigrams for short titles
  if (tokens.length <= 3) {
    for (const t of tokens) bigrams.add(t);
  }
  return bigrams;
}

/**
 * Jaccard similarity between two sets.
 */
function jaccard(setA, setB) {
  let intersection = 0;
  for (const x of setA) {
    if (setB.has(x)) intersection++;
  }
  const unionSize = setA.size + setB.size - intersection;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

/**
 * Fuzzy dedup: compare new headlines against recent active headlines in DB.
 * Returns { unique, duplicateIds } where:
 *   - unique: headlines to insert
 *   - duplicateIds: existing headline IDs whose heat_score should be bumped
 */
async function fuzzyDedup(headlines) {
  if (!headlines.length) return { unique: [], duplicateIds: [] };

  // Fetch last 200 active headlines for comparison
  let existing;
  try {
    existing = await sql`
      SELECT id, title, source_id
      FROM ticker_headlines
      WHERE is_active = true
      ORDER BY fetched_at DESC
      LIMIT 200
    `;
  } catch (err) {
    console.error("  [fuzzy-dedup] DB fetch failed:", err.message);
    return { unique: headlines, duplicateIds: [] };
  }

  // Pre-compute bigrams for existing headlines
  const existingBigrams = existing.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    bigrams: getBigrams(tokenize(row.title)),
  }));

  const unique = [];
  const duplicateIds = [];

  for (const headline of headlines) {
    const tokens = tokenize(headline.title);
    const headlineBigrams = getBigrams(tokens);

    // Skip if too few tokens to compare meaningfully
    if (headlineBigrams.size === 0) {
      unique.push(headline);
      continue;
    }

    let bestMatch = null;
    let bestScore = 0;

    for (const ex of existingBigrams) {
      // Skip comparison against same source (same source = URL dedup already handles it)
      if (ex.sourceId === headline.sourceId) continue;
      if (ex.bigrams.size === 0) continue;

      const score = jaccard(headlineBigrams, ex.bigrams);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = ex;
      }
    }

    if (bestScore > 0.45) {
      // Definite duplicate — skip but boost existing heat_score
      duplicateIds.push(bestMatch.id);
    } else if (bestScore > 0.30) {
      // Similar story — insert with cluster_id linking to existing
      unique.push({ ...headline, clusterId: bestMatch.id });
    } else {
      // Unique story
      unique.push(headline);
    }
  }

  // Boost heat_score for duplicated headlines
  if (duplicateIds.length > 0) {
    try {
      // Count occurrences per ID for batch update
      const idCounts = {};
      for (const id of duplicateIds) {
        idCounts[id] = (idCounts[id] || 0) + 1;
      }
      for (const [id, count] of Object.entries(idCounts)) {
        await sql`
          UPDATE ticker_headlines
          SET heat_score = heat_score + ${count}
          WHERE id = ${id}
        `;
      }
    } catch (err) {
      console.error("  [fuzzy-dedup] Heat score update failed:", err.message);
    }

    console.log(
      `  [fuzzy-dedup] ${duplicateIds.length} fuzzy duplicates found, ${unique.length} unique`
    );
  }

  return { unique, duplicateIds };
}

module.exports = { fuzzyDedup, tokenize, getBigrams, jaccard };
