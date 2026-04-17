// LUCY Configuration
// DashScope API — 1 account, 1 key shared across all slots
// Alpha Decompose -> qwen3.6-plus | Wingmen -> qwen3.5-122b-a10b | Alpha Fuse -> qwen3-max
// PAULIEWOOD's GENIUS: Split ALPHA into 2 keys = 1 call per key per query = zero bottleneck
// SECURITY: All keys read from environment variables (QutieQ Patch 1)

export const DORYLUS_CONFIG = {
  // DashScope Singapore endpoint (OpenAI-compatible)
  endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',

  // Models — 3 tiers for different roles
  alphaDecomposeModel: 'qwen3.6-plus',     // Alpha 1: dispatcher/compiler
  wingmanModel: 'qwen3.5-122b-a10b',       // Wingmen: 122B params, 10B active
  alphaFuseModel: 'qwen3-max',             // Alpha 2: trillion-parameter fuser

  // SECURITY FIX: Keys from environment variables, NEVER hardcoded
  // DashScope: single account, same key for all slots
  keys: [
    process.env.DORYLUS_KEY_ALPHA_DECOMPOSE || '',  // Key 0 — ALPHA decompose
    process.env.DORYLUS_KEY_W1 || '',               // Key 1 — Wingman 1
    process.env.DORYLUS_KEY_W2 || '',               // Key 2 — Wingman 2
    process.env.DORYLUS_KEY_W3 || '',               // Key 3 — Wingman 3
    process.env.DORYLUS_KEY_W4 || '',               // Key 4 — Wingman 4
    process.env.DORYLUS_KEY_W5 || '',               // Key 5 — Wingman 5
    process.env.DORYLUS_KEY_W6 || '',               // Key 6 — Wingman 6
    process.env.DORYLUS_KEY_ALPHA_FUSE || '',       // Key 7 — ALPHA fuse
  ],

  // Key assignments — SPLIT ALPHA for zero bottleneck
  alphaDecomposeKeyIndex: 0,      // keys[0] = ALPHA decompose ONLY
  alphaFuseKeyIndex: 7,           // keys[7] = ALPHA fuse ONLY
  wingmanKeyIndexes: [1, 2, 3, 4, 5, 6],  // keys[1-6] = Wingmen 1-6

  // Model parameters
  maxTokens: 2048,
  temperature: 0.3,  // Default — overridden by bot config for creative bots

  // DashScope models support 262K context; 32K is a comfortable working limit
  maxContextTokens: 32000,

  // RETRY FIX: Exponential backoff for 429 rate limits (QutieQ Patch 3)
  maxRetries: 3,
  retryDelayMs: 1000,

  // Timeouts
  wingmanTimeoutMs: 30000,
  alphaTimeoutMs: 45000,
  totalCycleTimeoutMs: 120000,

  // Wingman count
  wingmanCount: 6,

  // TAVILY — Web Search API Keys (5 accounts for parallel wingman searches)
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
  tavilyTopic: 'news' as const,        // 'general' | 'news' | 'finance' — 'news' gets current events, sports scores, breaking news
  tavilyTimeRange: 'week' as const,    // 'day' | 'week' | 'month' | 'year' — filters results to last week
  tavilyTimeout: 10000,                // 10 seconds max for search
} as const;
