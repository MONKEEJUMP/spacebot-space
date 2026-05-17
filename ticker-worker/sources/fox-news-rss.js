const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["fox-news-rss"];

async function fetch() {
  return fetchRSS(config.url, "fox-news-rss", config.name, config.tier);
}

module.exports = { fetch, id: "fox-news-rss" };
