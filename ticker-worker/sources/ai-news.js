const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["ai-news-rss"];

async function fetch() {
  return fetchRSS(config.url, "ai-news-rss", config.name, config.tier);
}

module.exports = { fetch, id: "ai-news-rss" };
