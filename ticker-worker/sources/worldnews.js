const { calculateBaseScore } = require("./rss-adapter");

const API_KEY = process.env.WORLDNEWS_API_KEY;

let warned = false;

async function fetch() {
  if (!API_KEY) {
    if (!warned) {
      console.log("[TICKER] WARNING: WORLDNEWS_API_KEY not set — World News API source disabled");
      warned = true;
    }
    return [];
  }

  try {
    const url = `https://api.worldnewsapi.com/search-news?text=artificial+intelligence&language=en&number=20&api-key=${API_KEY}`;

    const response = await globalThis.fetch(url, {
      headers: {
        "User-Agent": "SpaceBot/1.0 (AiSpace Ticker; https://spacebot.space)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from World News API`);
    }

    const data = await response.json();
    const news = data.news || [];

    return news
      .map((item) => ({
        title: (item.title || "").trim(),
        sourceName: item.source_country || "World News",
        sourceId: "worldnews-api",
        articleUrl: (item.url || "").trim(),
        category: "industry",
        publishedAt: item.publish_date
          ? new Date(item.publish_date).toISOString()
          : new Date().toISOString(),
        sourceTier: 3,
        isBreaking: false,
        heatScore: 0,
        compositeScore: calculateBaseScore(3, item.publish_date),
      }))
      .filter((h) => h.title && h.articleUrl);
  } catch (error) {
    console.error(`[TICKER] Error fetching World News API: ${error.message}`);
    return [];
  }
}

module.exports = { fetch, id: "worldnews-api" };
