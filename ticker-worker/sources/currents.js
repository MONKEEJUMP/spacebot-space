const { calculateBaseScore } = require("./rss-adapter");

const API_KEY = process.env.CURRENTS_API_KEY;

let warned = false;

async function fetch() {
  if (!API_KEY) {
    if (!warned) {
      console.log("[TICKER] WARNING: CURRENTS_API_KEY not set — Currents API source disabled");
      warned = true;
    }
    return [];
  }

  try {
    const url = `https://api.currentsapi.services/v1/search?apiKey=${API_KEY}&keywords=artificial+intelligence&category=technology&language=en`;

    const response = await globalThis.fetch(url, {
      headers: {
        "User-Agent": "SpaceBot/1.0 (AiSpace Ticker; https://spacebot.space)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from Currents API`);
    }

    const data = await response.json();
    const news = data.news || [];

    return news
      .map((item) => ({
        title: (item.title || "").trim(),
        sourceName: item.author || "Currents",
        sourceId: "currents-api",
        articleUrl: (item.url || "").trim(),
        category: "industry",
        publishedAt: item.published
          ? new Date(item.published).toISOString()
          : new Date().toISOString(),
        sourceTier: 3,
        isBreaking: false,
        heatScore: 0,
        compositeScore: calculateBaseScore(3, item.published),
      }))
      .filter((h) => h.title && h.articleUrl);
  } catch (error) {
    console.error(`[TICKER] Error fetching Currents API: ${error.message}`);
    return [];
  }
}

module.exports = { fetch, id: "currents-api" };
