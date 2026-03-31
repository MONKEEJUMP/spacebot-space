// DORYLUS Configuration
// 7 Cerebras API keys — 1 ALPHA-DECOMPOSE + 5 wingmen + 1 ALPHA-FUSE
// 1M tokens/day per key = 7M tokens/day total
// PAULIEWOOD's GENIUS: Split ALPHA into 2 keys = 1 call per key per query = zero bottleneck
// SECURITY: All keys read from environment variables (QutieQ Patch 1)

export const DORYLUS_CONFIG = {
  // Cerebras endpoint (OpenAI-compatible)
  endpoint: 'https://api.cerebras.ai/v1/chat/completions',

  // Model for all calls (Qwen3 235B on Cerebras)
  model: 'qwen-3-235b-a22b-instruct-2507',

  // SECURITY FIX: Keys from environment variables, NEVER hardcoded
  // 7 keys, 7 accounts, 7M tokens/day, every key does exactly 1 call per query
  keys: [
    process.env.DORYLUS_KEY_ALPHA_DECOMPOSE || '',  // Key 1 — ALPHA decompose
    process.env.DORYLUS_KEY_W1 || '',               // Key 2 — Wingman 1
    process.env.DORYLUS_KEY_W2 || '',               // Key 3 — Wingman 2
    process.env.DORYLUS_KEY_W3 || '',               // Key 4 — Wingman 3
    process.env.DORYLUS_KEY_W4 || '',               // Key 5 — Wingman 4
    process.env.DORYLUS_KEY_W5 || '',               // Key 6 — Wingman 5
    process.env.DORYLUS_KEY_ALPHA_FUSE || '',       // Key 7 — ALPHA fuse
  ],

  // Key assignments — SPLIT ALPHA for zero bottleneck
  alphaDecomposeKeyIndex: 0,      // keys[0] = ALPHA decompose ONLY
  alphaFuseKeyIndex: 6,           // keys[6] = ALPHA fuse ONLY
  wingmanKeyIndexes: [1, 2, 3, 4, 5],  // keys[1-5] = Wingmen 1-5

  // Model parameters
  maxTokens: 2048,
  temperature: 0.3,  // Default — overridden by bot config for creative bots

  // CONTEXT FIX: Safe limit below 8192 hard ceiling (QutieQ Patch 4)
  maxContextTokens: 6000,

  // RETRY FIX: Exponential backoff for 429 rate limits (QutieQ Patch 3)
  maxRetries: 3,
  retryDelayMs: 1000,

  // Timeouts
  wingmanTimeoutMs: 30000,
  alphaTimeoutMs: 45000,
  totalCycleTimeoutMs: 120000,

  // Wingman count
  wingmanCount: 5,

  // TAVILY — Web Search API Keys (5 accounts for 5 parallel wingman searches)
  // Each wingman hunts independently with its own targeted search
  tavilyEndpoint: 'https://api.tavily.com/search',
  tavilyKeys: [
    process.env.TAVILY_KEY_W1 || '',   // Wingman 1
    process.env.TAVILY_KEY_W2 || '',   // Wingman 2
    process.env.TAVILY_KEY_W3 || '',   // Wingman 3
    process.env.TAVILY_KEY_W4 || '',   // Wingman 4
    process.env.TAVILY_KEY_W5 || '',   // Wingman 5
  ],
  tavilyMaxResults: 10,                // 10 web results per wingman search
  tavilySearchDepth: 'basic' as const, // 'basic' = 1 credit, 'advanced' = 2 credits
  tavilyTimeout: 10000,                // 10 seconds max for search
} as const;
