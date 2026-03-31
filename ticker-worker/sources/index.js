module.exports = [
  // Tier 1 — RSS
  require("./google-news"),
  require("./techcrunch"),
  require("./theverge"),
  require("./mit-tech-review"),
  // Tier 1 — JSON
  require("./hacker-news"),

  // Tier 2 — RSS
  require("./arxiv"),
  require("./ars-technica"),
  require("./ai-news"),
  require("./venturebeat"),
  // Tier 2 — JSON
  require("./huggingface-papers"),
  require("./newsdata"),

  // Tier 3 — RSS
  require("./wired"),
  require("./techmeme"),
  require("./hf-blog"),
  require("./openai-blog"),
  // Tier 3 — JSON
  require("./gdelt"),
  require("./currents"),
  require("./worldnews"),
  require("./reddit"),
  require("./product-hunt"),
];
