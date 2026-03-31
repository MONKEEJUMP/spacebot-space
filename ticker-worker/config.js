const SOURCES = {
  // ═══════════════════════════════════════════════════════════
  // TIER 1 — Poll every 5 minutes (critical breaking news)
  // ═══════════════════════════════════════════════════════════
  "google-news-rss": {
    name: "Google News",
    url: "https://news.google.com/rss/search?q=artificial+intelligence+OR+machine+learning+OR+LLM&hl=en-US&gl=US&ceid=US:en",
    tier: 1,
    type: "rss",
  },
  "techcrunch-rss": {
    name: "TechCrunch",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    tier: 1,
    type: "rss",
  },
  "theverge-rss": {
    name: "The Verge",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    tier: 1,
    type: "rss",
  },
  "mit-tech-review-rss": {
    name: "MIT Tech Review",
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    tier: 1,
    type: "rss",
  },
  "hackernews-algolia": {
    name: "Hacker News",
    url: "https://hn.algolia.com/api/v1/search?query=artificial+intelligence&tags=story&hitsPerPage=20",
    tier: 1,
    type: "json",
  },

  // ═══════════════════════════════════════════════════════════
  // TIER 2 — Poll every 10 minutes (high-quality, lower velocity)
  // ═══════════════════════════════════════════════════════════
  "arxiv-combined": {
    name: "arXiv",
    url: "https://rss.arxiv.org/rss/cs.LG+cs.CL+cs.CV+cs.AI",
    tier: 2,
    type: "rss",
    defaultCategory: "research",
  },
  "ars-technica-rss": {
    name: "Ars Technica",
    url: "https://arstechnica.com/ai/feed/",
    tier: 2,
    type: "rss",
  },
  "ai-news-rss": {
    name: "AI News",
    url: "https://www.artificialintelligence-news.com/feed/",
    tier: 2,
    type: "rss",
  },
  "venturebeat-rss": {
    name: "VentureBeat",
    url: "https://venturebeat.com/category/ai/feed/",
    tier: 2,
    type: "rss",
  },
  "hf-daily-papers": {
    name: "Hugging Face Papers",
    url: "https://huggingface.co/api/daily_papers?sort=trending&limit=20",
    tier: 2,
    type: "json",
    defaultCategory: "research",
  },
  "newsdata-io": {
    name: "NewsData.io",
    tier: 2,
    type: "json",
    requiresKey: "NEWSDATA_API_KEY",
  },

  // ═══════════════════════════════════════════════════════════
  // TIER 3 — Poll every 15 minutes (supplementary)
  // ═══════════════════════════════════════════════════════════
  "wired-rss": {
    name: "Wired",
    url: "https://www.wired.com/feed/tag/ai/latest/rss",
    tier: 3,
    type: "rss",
  },
  "techmeme-rss": {
    name: "Techmeme",
    url: "https://www.techmeme.com/feed.xml",
    tier: 3,
    type: "rss",
  },
  "hf-blog-rss": {
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    tier: 3,
    type: "rss",
  },
  "openai-blog-rss": {
    name: "OpenAI Blog",
    url: "https://openai.com/blog/rss.xml",
    tier: 3,
    type: "rss",
  },
  "gdelt-api": {
    name: "GDELT",
    url: "https://api.gdeltproject.org/api/v2/doc/doc?query=%22artificial+intelligence%22&mode=ArtList&format=json&maxrecords=30",
    tier: 3,
    type: "json",
  },
  "currents-api": {
    name: "Currents API",
    tier: 3,
    type: "json",
    requiresKey: "CURRENTS_API_KEY",
  },
  "worldnews-api": {
    name: "World News API",
    tier: 3,
    type: "json",
    requiresKey: "WORLDNEWS_API_KEY",
  },
  "reddit-combined": {
    name: "Reddit",
    tier: 3,
    type: "json",
  },
  "product-hunt": {
    name: "Product Hunt",
    tier: 3,
    type: "json",
    requiresKey: "PH_ACCESS_TOKEN",
    defaultCategory: "product",
  },
};

const TIER_INTERVALS = {
  1: "*/5 * * * *",
  2: "*/10 * * * *",
  3: "*/15 * * * *",
};

module.exports = { SOURCES, TIER_INTERVALS };
