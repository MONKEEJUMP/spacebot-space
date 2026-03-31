const { calculateBaseScore } = require("./rss-adapter");

const ENDPOINT = "https://huggingface.co/api/daily_papers?sort=trending&limit=20";
const HF_TOKEN = process.env.HF_TOKEN;

let warned = false;

async function fetch() {
  try {
    const headers = {
      "User-Agent": "SpaceBot/1.0 (AiSpace Ticker; https://spacebot.space)",
      Accept: "application/json",
    };

    // Add auth if token available
    if (HF_TOKEN) {
      headers.Authorization = `Bearer ${HF_TOKEN}`;
    } else if (!warned) {
      console.log("[TICKER] INFO: HF_TOKEN not set — trying HF Daily Papers without auth");
      warned = true;
    }

    const response = await globalThis.fetch(ENDPOINT, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from HF Daily Papers`);
    }

    const papers = await response.json();

    if (!Array.isArray(papers)) {
      return [];
    }

    return papers
      .map((paper) => {
        const paperId = paper.paper && paper.paper.id ? paper.paper.id : null;
        const articleUrl =
          (paper.paper && paper.paper.url) ||
          (paperId ? `https://huggingface.co/papers/${paperId}` : null);

        return {
          title: (paper.title || "").trim(),
          sourceName: "Hugging Face Papers",
          sourceId: "hf-daily-papers",
          articleUrl: articleUrl || "",
          category: "research",
          publishedAt: paper.publishedAt
            ? new Date(paper.publishedAt).toISOString()
            : new Date().toISOString(),
          sourceTier: 2,
          isBreaking: false,
          heatScore: 0,
          compositeScore: calculateBaseScore(2, paper.publishedAt),
        };
      })
      .filter((h) => h.title && h.articleUrl);
  } catch (error) {
    console.error(`[TICKER] Error fetching HF Daily Papers: ${error.message}`);
    return [];
  }
}

module.exports = { fetch, id: "hf-daily-papers" };
