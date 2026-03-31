/**
 * Normalize headlines: clean titles, strip UTM params, trim whitespace.
 */
function normalize(headlines) {
  return headlines.map((h) => {
    let title = (h.title || "").trim();

    // Strip common prefixes
    title = title.replace(
      /^(BREAKING|EXCLUSIVE|UPDATE|JUST IN|WATCH|LISTEN|OPINION|EDITORIAL)[:\s\-–—]+/i,
      ""
    );

    // Strip trailing source attribution like " - TechCrunch" or " | The Verge"
    title = title.replace(/\s*[\-–—|]\s*(TechCrunch|The Verge|Ars Technica|WIRED|VentureBeat|IEEE Spectrum|MIT Technology Review|Google News)\s*$/i, "");

    // Collapse multiple spaces
    title = title.replace(/\s{2,}/g, " ").trim();

    // Clean URL — strip UTM and tracking params
    let url = h.articleUrl || "";
    try {
      const parsed = new URL(url);
      const keysToRemove = [];
      for (const key of parsed.searchParams.keys()) {
        if (
          key.startsWith("utm_") ||
          key === "ref" ||
          key === "source" ||
          key === "ncid" ||
          key === "sr_share"
        ) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        parsed.searchParams.delete(key);
      }
      url = parsed.toString();
    } catch {
      // URL parsing failed — keep original
    }

    return {
      ...h,
      title,
      articleUrl: url,
    };
  });
}

module.exports = { normalize };
