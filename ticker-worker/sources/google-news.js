const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["google-news-rss"];

async function fetch() {
  return fetchRSS(config.url, "google-news-rss", config.name, config.tier);
}

module.exports = { fetch, id: "google-news-rss" };
