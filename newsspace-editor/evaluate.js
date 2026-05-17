const { DASHSCOPE_ENDPOINT, DASHSCOPE_MODEL } = require("./config");
const { EDITOR_SYSTEM_PROMPT } = require("./editor-prompt");

const VALID_CATEGORIES = ["ai", "tech", "science", "business", "world", "culture"];
const VALID_TILE_SIZES = ["big", "medium", "small"];
const CATEGORY_ALIASES = {
  sports: "culture",
  politics: "world",
  health: "science",
  space: "science",
  finance: "business",
  entertainment: "culture",
  lifestyle: "culture",
  travel: "culture",
  opinion: "culture",
  economy: "business",
  markets: "business",
  startups: "business",
  cybersecurity: "tech",
  gaming: "tech",
  robotics: "ai",
  machinelearning: "ai",
  ml: "ai",
};

async function evaluate(headline) {
  const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY;
  if (!DASHSCOPE_KEY) {
    throw new Error("DASHSCOPE_API_KEY missing from environment");
  }

  const userMessage = `Evaluate this headline:
TITLE: ${headline.title}
SOURCE: ${headline.source_name}
SOURCE TIER: ${headline.source_tier || "unknown"}
CURRENT CATEGORY: ${headline.category || "uncategorized"}
PUBLISHED: ${headline.published_at}`;

  const res = await fetch(DASHSCOPE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DASHSCOPE_KEY}`,
    },
    body: JSON.stringify({
      model: DASHSCOPE_MODEL,
      stream: false,
      messages: [
        { role: "system", content: EDITOR_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    throw new Error(`DashScope HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(cleaned);

  // Validate shape
  if (typeof parsed.approved !== "boolean") {
    throw new Error(`Invalid QWEN response: approved is not boolean (got ${typeof parsed.approved})`);
  }
  if (!VALID_TILE_SIZES.includes(parsed.tile_size)) {
    throw new Error(`Invalid QWEN response: tile_size "${parsed.tile_size}" not in ${VALID_TILE_SIZES.join("|")}`);
  }

  // Normalize category to lowercase, map reasonable adjacent categories, then validate.
  const rawCategory = String(parsed.category || "").toLowerCase().trim();
  const compactCategory = rawCategory.replace(/[\s_-]+/g, "");
  const normalizedCategory =
    CATEGORY_ALIASES[rawCategory] || CATEGORY_ALIASES[compactCategory] || rawCategory;
  if (!VALID_CATEGORIES.includes(normalizedCategory)) {
    throw new Error(`Invalid QWEN response: category "${parsed.category}" not in ${VALID_CATEGORIES.join("|")}`);
  }

  return {
    approved: parsed.approved,
    tile_size: parsed.tile_size,
    category: normalizedCategory,
    note: parsed.note || null,
  };
}

module.exports = { evaluate };
