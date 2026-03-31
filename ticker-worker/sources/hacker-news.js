const { calculateBaseScore } = require("./rss-adapter");

const ENDPOINT =
  "https://hn.algolia.com/api/v1/search?query=artificial+intelligence+OR+machine+learning+OR+LLM&tags=story&hitsPerPage=20";

async function fetch() {
  try {
    const response = await globalThis.fetch(ENDPOINT, {
      headers: {
        "User-Agent": "SpaceBot/1.0 (AiSpace Ticker; https://spacebot.space)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from Hacker News`);
    }

    const data = await response.json();
    const hits = data.hits || [];

    return hits
      .map((hit) => {
        const articleUrl =
          hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;

        return {
          title: (hit.title || "").trim(),
          sourceName: "Hacker News",
          sourceId: "hackernews-algolia",
          articleUrl,
          category: "industry",
          publishedAt: hit.created_at
            ? new Date(hit.created_at).toISOString()
            : new Date().toISOString(),
          sourceTier: 1,
          isBreaking: false,
          heatScore: 0,
          compositeScore: calculateBaseScore(1, hit.created_at),
        };
      })
      .filter((h) => h.title && h.articleUrl);
  } catch (error) {
    console.error(`[TICKER] Error fetching Hacker News: ${error.message}`);
    return [];
  }
}

module.exports = { fetch, id: "hackernews-algolia" };
