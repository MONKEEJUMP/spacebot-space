const { fetchRSS, calculateBaseScore } = require("./rss-adapter");

/**
 * Reddit adapter — fetches 3 subreddits via RSS (Atom format).
 * The JSON .json endpoint returns 403 from server IPs, but .rss works.
 * Fetches sequentially with 2-second delay between subs.
 */

const SUBREDDITS = [
  {
    name: "MachineLearning",
    url: "https://www.reddit.com/r/MachineLearning/.rss?limit=15",
    sourceId: "reddit-machinelearning",
  },
  {
    name: "artificial",
    url: "https://www.reddit.com/r/artificial/.rss?limit=15",
    sourceId: "reddit-artificial",
  },
  {
    name: "LocalLLaMA",
    url: "https://www.reddit.com/r/LocalLLaMA/.rss?limit=15",
    sourceId: "reddit-localllama",
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetch() {
  const allHeadlines = [];

  for (let i = 0; i < SUBREDDITS.length; i++) {
    const sub = SUBREDDITS[i];
    try {
      const headlines = await fetchRSS(
        sub.url,
        sub.sourceId,
        `Reddit r/${sub.name}`,
        3
      );
      allHeadlines.push(...headlines);
    } catch (error) {
      console.error(
        `[TICKER] Error fetching r/${sub.name}: ${error.message}`
      );
    }

    // 2-second delay between subreddits
    if (i < SUBREDDITS.length - 1) {
      await sleep(2000);
    }
  }

  return allHeadlines;
}

module.exports = { fetch, id: "reddit-combined" };
