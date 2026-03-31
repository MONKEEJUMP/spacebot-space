const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
});

/**
 * Fetch and parse an RSS feed into normalized headline objects.
 * @param {string} url - The RSS feed URL
 * @param {string} sourceId - Internal source identifier
 * @param {string} sourceName - Display name
 * @param {number} sourceTier - 1, 2, or 3
 * @param {string|null} defaultCategory - Override category (e.g., "research" for arXiv)
 * @returns {Promise<Array>} Normalized headlines
 */
async function fetchRSS(
  url,
  sourceId,
  sourceName,
  sourceTier,
  defaultCategory = null
) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "SpaceBot/1.0 (AiSpace Ticker; https://spacebot.space)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${sourceName}`);
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);

    // Handle RSS 2.0, Atom, and RDF/RSS 1.0 (arXiv) formats
    let items = [];

    if (parsed.rss && parsed.rss.channel && parsed.rss.channel.item) {
      const raw = parsed.rss.channel.item;
      items = Array.isArray(raw) ? raw : [raw];
    } else if (parsed.feed && parsed.feed.entry) {
      const raw = parsed.feed.entry;
      items = Array.isArray(raw) ? raw : [raw];
    } else if (parsed["rdf:RDF"] && parsed["rdf:RDF"].item) {
      const raw = parsed["rdf:RDF"].item;
      items = Array.isArray(raw) ? raw : [raw];
    } else if (parsed.rdf && parsed.rdf.item) {
      const raw = parsed.rdf.item;
      items = Array.isArray(raw) ? raw : [raw];
    }

    // Cap items to prevent memory bloat from large archive feeds
    items = items.slice(0, 30);

    return items
      .map((item) => {
        // Extract title
        const title = (
          typeof item.title === "string"
            ? item.title
            : item.title && item.title["#text"]
              ? item.title["#text"]
              : ""
        ).trim();

        // Extract URL — handle Atom link objects
        let articleUrl = "";
        if (typeof item.link === "string") {
          articleUrl = item.link;
        } else if (item.link && item.link["@_href"]) {
          articleUrl = item.link["@_href"];
        } else if (Array.isArray(item.link)) {
          const alt = item.link.find(
            (l) => l["@_rel"] === "alternate" || !l["@_rel"]
          );
          articleUrl = alt ? alt["@_href"] || "" : item.link[0]["@_href"] || "";
        } else if (item.guid && typeof item.guid === "string") {
          articleUrl = item.guid;
        } else if (item.guid && item.guid["#text"]) {
          articleUrl = item.guid["#text"];
        }

        // Extract published date
        const publishedAt =
          item.pubDate ||
          item.published ||
          item.updated ||
          item["dc:date"] ||
          null;

        return {
          title,
          sourceName,
          sourceId,
          articleUrl: typeof articleUrl === "string" ? articleUrl.trim() : "",
          category: defaultCategory || "industry",
          publishedAt: publishedAt
            ? new Date(publishedAt).toISOString()
            : new Date().toISOString(),
          sourceTier,
          isBreaking: false,
          heatScore: 0,
          compositeScore: calculateBaseScore(sourceTier, publishedAt),
          isActive: true,
        };
      })
      .filter((h) => h.title && h.articleUrl);
  } catch (error) {
    console.error(`[TICKER] Error fetching ${sourceName}: ${error.message}`);
    return [];
  }
}

function calculateBaseScore(tier, publishedAt) {
  const ageHours = publishedAt
    ? (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60)
    : 6;
  const recencyScore = Math.exp(-0.15 * Math.max(0, ageHours));
  const sourceScore = tier === 1 ? 1.0 : tier === 2 ? 0.75 : 0.5;
  return Math.round((recencyScore * 0.6 + sourceScore * 0.4) * 100) / 100;
}

module.exports = { fetchRSS, calculateBaseScore };
