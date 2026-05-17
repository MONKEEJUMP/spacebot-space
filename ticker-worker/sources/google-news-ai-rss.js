const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["google-news-ai-rss"];

async function fetch() {
  return fetchRSS(config.url, "google-news-ai-rss", config.name, config.tier);
}

module.exports = { fetch, id: "google-news-ai-rss" };
