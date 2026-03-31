const { calculateBaseScore } = require("./rss-adapter");

const ENDPOINT =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=%22artificial+intelligence%22&mode=ArtList&format=json&maxrecords=30";

async function fetch() {
  try {
    const response = await globalThis.fetch(ENDPOINT, {
      headers: {
        "User-Agent": "SpaceBot/1.0 (AiSpace Ticker; https://spacebot.space)",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from GDELT`);
    }

    const data = await response.json();
    const articles = data.articles || [];

    return articles
      .map((article) => {
        // GDELT seendate format: YYYYMMDDTHHMMSSZ
        let publishedAt = null;
        if (article.seendate) {
          const s = article.seendate;
          const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
          publishedAt = new Date(iso).toISOString();
        }

        return {
          title: (article.title || "").trim(),
          sourceName: article.domain || "GDELT",
          sourceId: "gdelt-api",
          articleUrl: (article.url || "").trim(),
          category: "industry",
          publishedAt: publishedAt || new Date().toISOString(),
          sourceTier: 3,
          isBreaking: false,
          heatScore: 0,
          compositeScore: calculateBaseScore(3, publishedAt),
        };
      })
      .filter((h) => h.title && h.articleUrl);
  } catch (error) {
    console.error(`[TICKER] Error fetching GDELT: ${error.message}`);
    return [];
  }
}

module.exports = { fetch, id: "gdelt-api" };
