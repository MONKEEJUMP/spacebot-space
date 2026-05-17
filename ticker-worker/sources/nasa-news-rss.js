const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["nasa-news-rss"];

async function fetch() {
  return fetchRSS(config.url, "nasa-news-rss", config.name, config.tier);
}

module.exports = { fetch, id: "nasa-news-rss" };
