const TICKER_SOURCE_CATALOG = {
  // TIER 1 — Poll every 5 minutes
  "techcrunch-rss": {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    tier: 1,
    type: "rss",
  },
  "wired-rss": {
    name: "Wired",
    url: "https://www.wired.com/feed/rss",
    tier: 1,
    type: "rss",
  },
  "the-verge-rss": {
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    tier: 1,
    type: "rss",
  },
  "ars-technica-rss": {
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    tier: 1,
    type: "rss",
  },
  "engadget-rss": {
    name: "Engadget",
    url: "https://www.engadget.com/rss.xml",
    tier: 1,
    type: "rss",
  },
  "cnet-rss": {
    name: "CNET",
    url: "https://www.cnet.com/rss/news/",
    tier: 1,
    type: "rss",
  },
  "zdnet-rss": {
    name: "ZDNet",
    url: "https://www.zdnet.com/news/rss.xml",
    tier: 1,
    type: "rss",
  },
  "venturebeat-rss": {
    name: "VentureBeat",
    url: "https://venturebeat.com/feed/",
    tier: 1,
    type: "rss",
  },

  // TIER 2 — Poll every 10 minutes
  "fox-news-rss": {
    name: "Fox News",
    url: "https://moxie.foxnews.com/google-publisher/latest.xml",
    tier: 2,
    type: "rss",
  },
  "bbc-world-rss": {
    name: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    tier: 2,
    type: "rss",
  },
  "bbc-tech-rss": {
    name: "BBC Tech",
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
    tier: 2,
    type: "rss",
  },
  "bbc-business-rss": {
    name: "BBC Business",
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
    tier: 2,
    type: "rss",
  },
  "bbc-science-rss": {
    name: "BBC Science",
    url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    tier: 2,
    type: "rss",
  },
  "nyt-tech-rss": {
    name: "NYT Tech",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
    tier: 2,
    type: "rss",
  },

  // TIER 3 — Poll every 15 minutes
  "hn-frontpage-rss": {
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
    tier: 3,
    type: "rss",
  },
  "hn-ai-search-rss": {
    name: "HN AI",
    url: "https://hnrss.org/newest?q=AI",
    tier: 3,
    type: "rss",
  },
  "mit-tech-review-rss": {
    name: "MIT Tech Review",
    url: "https://www.technologyreview.com/feed/",
    tier: 3,
    type: "rss",
  },
  "reddit-ml-rss": {
    name: "r/MachineLearning",
    url: "https://www.reddit.com/r/MachineLearning/.rss",
    tier: 3,
    type: "rss",
  },
  "reddit-artificial": {
    name: "r/artificial",
    url: "https://www.reddit.com/r/artificial/.rss",
    tier: 3,
    type: "rss",
  },
  "reddit-openai": {
    name: "r/OpenAI",
    url: "https://www.reddit.com/r/OpenAI/.rss",
    tier: 3,
    type: "rss",
  },
  "reddit-localllama": {
    name: "r/LocalLLaMA",
    url: "https://www.reddit.com/r/LocalLLaMA/.rss",
    tier: 3,
    type: "rss",
  },
  "google-news-ai-rss": {
    name: "Google News AI",
    url: "https://news.google.com/rss/search?q=artificial+intelligence&hl=en",
    tier: 3,
    type: "rss",
  },

  // TIER 4 — Poll every 15 minutes
  "forbes-tech-rss": {
    name: "Forbes Tech",
    url: "https://www.forbes.com/innovation/feed/",
    tier: 4,
    type: "rss",
  },
  "bloomberg-tech-rss": {
    name: "Bloomberg Tech",
    url: "https://feeds.bloomberg.com/technology/news.rss",
    tier: 4,
    type: "rss",
  },
  "cnbc-tech-rss": {
    name: "CNBC Tech",
    url: "https://www.cnbc.com/id/100727362/device/rss/rss.html",
    tier: 4,
    type: "rss",
  },
  "inc-rss": {
    name: "Inc. Magazine",
    url: "https://www.inc.com/rss",
    tier: 4,
    type: "rss",
  },

  // TIER 5 — Poll every 15 minutes
  "nasa-news-rss": {
    name: "NASA News",
    url: "https://www.nasa.gov/feed/",
    tier: 5,
    type: "rss",
  },
  "phys-org-rss": {
    name: "Phys.org",
    url: "https://phys.org/rss-feed/",
    tier: 5,
    type: "rss",
  },
};

module.exports = { TICKER_SOURCE_CATALOG };
