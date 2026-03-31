const { calculateBaseScore } = require("./rss-adapter");

const API_KEY = process.env.NEWSDATA_API_KEY;

let warned = false;

async function fetch() {
  if (!API_KEY) {
    if (!warned) {
      console.log("[TICKER] WARNING: NEWSDATA_API_KEY not set — NewsData.io source disabled");
      warned = true;
    }
    return [];
  }

  try {
    const url = `https://newsdata.io/api/1/latest?apikey=${API_KEY}&category=technology&q=artificial+intelligence&language=en`;

    const response = await globalThis.fetch(url, {
      headers: {
        "User-Agent": "SpaceBot/1.0 (AiSpace Ticker; https://spacebot.space)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from NewsData.io`);
    }

    const data = await response.json();
    const results = data.results || [];

    return results
      .map((result) => ({
        title: (result.title || "").trim(),
        sourceName: result.source_name || "NewsData.io",
        sourceId: "newsdata-io",
        articleUrl: (result.link || "").trim(),
        category: "industry",
        publishedAt: result.pubDate
          ? new Date(result.pubDate).toISOString()
          : new Date().toISOString(),
        sourceTier: 2,
        isBreaking: false,
        heatScore: 0,
        compositeScore: calculateBaseScore(2, result.pubDate),
      }))
      .filter((h) => h.title && h.articleUrl);
  } catch (error) {
    console.error(`[TICKER] Error fetching NewsData.io: ${error.message}`);
    return [];
  }
}

module.exports = { fetch, id: "newsdata-io" };
