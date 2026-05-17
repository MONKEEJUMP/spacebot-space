// Qwen-plus via Alibaba DashScope (OpenAI-compatible mode)
// Sets CATEGORY ONLY — composite_score is handled by the hourly rescoreAll pass.

const DASHSCOPE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
const MODEL = "qwen-plus";
const CATEGORIES = ["ai", "tech", "world", "business", "science", "culture"];

const SYSTEM_PROMPT =
  "You are a news headline categorization engine. " +
  "Respond ONLY with valid JSON. No markdown. No explanation. " +
  'Schema: {"category": "<one of: ai|tech|world|business|science|culture>"}. ' +
  "Choose the single best category for the headline. If uncertain, choose \"tech\".";

// Module-scoped circuit breaker
let consecutiveFailures = 0;
let cooldownUntil = 0;
const FAILURE_THRESHOLD = 10;
const COOLDOWN_MS = 5 * 60 * 1000;

// Module-scoped URL cache — prevents re-categorizing same article across poll cycles
const cache = new Map();
const CACHE_MAX = 5000;

async function categorize(headline) {
  if (!headline || !headline.articleUrl) return applyDefault(headline);

  // Cache hit
  if (cache.has(headline.articleUrl)) {
    return { ...headline, category: cache.get(headline.articleUrl) };
  }

  // Circuit breaker open
  if (Date.now() < cooldownUntil) {
    return applyDefault(headline);
  }

  const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY;
  if (!DASHSCOPE_KEY) {
    console.warn("[qwen-categorize] DASHSCOPE_API_KEY missing — using default category");
    return applyDefault(headline);
  }

  try {
    const res = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DASHSCOPE_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Source: ${headline.sourceName}\nTitle: ${headline.title}` },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned);
    const cat = String(parsed.category || "").toLowerCase();
    const final = CATEGORIES.includes(cat) ? cat : "tech";

    // Success — reset breaker, cache result
    consecutiveFailures = 0;
    if (cache.size >= CACHE_MAX) {
      const keys = Array.from(cache.keys()).slice(0, 500);
      keys.forEach((k) => cache.delete(k));
    }
    cache.set(headline.articleUrl, final);

    return { ...headline, category: final };
  } catch (err) {
    consecutiveFailures++;
    if (consecutiveFailures >= FAILURE_THRESHOLD) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      console.error(
        `[qwen-categorize] circuit breaker OPEN for ${COOLDOWN_MS / 1000}s after ${consecutiveFailures} consecutive failures (last: ${err.message})`
      );
    } else {
      console.error(`[qwen-categorize] error (${consecutiveFailures}/${FAILURE_THRESHOLD}): ${err.message}`);
    }
    return applyDefault(headline);
  }
}

function applyDefault(h) {
  return { ...(h || {}), category: (h && h.category) || "tech" };
}

module.exports = { categorize };
