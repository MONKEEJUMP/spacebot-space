const { calculateBaseScore } = require("./rss-adapter");

const ENDPOINT = "https://api.producthunt.com/v2/api/graphql";
const PH_ACCESS_TOKEN = process.env.PH_ACCESS_TOKEN;

const QUERY = `{
  posts(first: 15, topic: "artificial-intelligence") {
    edges {
      node {
        name
        tagline
        url
        createdAt
        votesCount
      }
    }
  }
}`;

let warned = false;

async function fetch() {
  if (!PH_ACCESS_TOKEN) {
    if (!warned) {
      console.log("[TICKER] WARNING: PH_ACCESS_TOKEN not set — Product Hunt source disabled");
      warned = true;
    }
    return [];
  }

  try {
    const response = await globalThis.fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PH_ACCESS_TOKEN}`,
        "User-Agent": "SpaceBot/1.0 (AiSpace Ticker; https://spacebot.space)",
      },
      body: JSON.stringify({ query: QUERY }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from Product Hunt`);
    }

    const data = await response.json();
    const edges =
      (data.data &&
        data.data.posts &&
        data.data.posts.edges) ||
      [];

    return edges
      .filter((edge) => edge.node && edge.node.votesCount >= 5)
      .map((edge) => {
        const node = edge.node;
        const title = node.tagline
          ? `${node.name} \u2014 ${node.tagline}`
          : node.name || "";

        return {
          title: title.trim(),
          sourceName: "Product Hunt",
          sourceId: "product-hunt",
          articleUrl: (node.url || "").trim(),
          category: "product",
          publishedAt: node.createdAt
            ? new Date(node.createdAt).toISOString()
            : new Date().toISOString(),
          sourceTier: 3,
          isBreaking: false,
          heatScore: 0,
          compositeScore: calculateBaseScore(3, node.createdAt),
        };
      })
      .filter((h) => h.title && h.articleUrl);
  } catch (error) {
    console.error(`[TICKER] Error fetching Product Hunt: ${error.message}`);
    return [];
  }
}

module.exports = { fetch, id: "product-hunt" };
