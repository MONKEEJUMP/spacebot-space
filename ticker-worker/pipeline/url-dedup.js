const { sql } = require("../db");

/**
 * Filter out headlines whose articleUrl already exists in the database.
 * Uses a single query with ANY() for efficiency.
 */
async function dedup(headlines) {
  if (!headlines.length) return [];

  const urls = headlines.map((h) => h.articleUrl);

  const existing = await sql`
    SELECT article_url FROM ticker_headlines
    WHERE article_url = ANY(${urls})
  `;

  const existingSet = new Set(existing.map((r) => r.article_url));

  const fresh = headlines.filter((h) => !existingSet.has(h.articleUrl));

  if (fresh.length < headlines.length) {
    console.log(
      `  [dedup] ${headlines.length - fresh.length} duplicates removed, ${fresh.length} new`
    );
  }

  return fresh;
}

module.exports = { dedup };
