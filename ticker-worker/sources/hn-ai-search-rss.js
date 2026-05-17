const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["hn-ai-search-rss"];

async function fetch() {
  return fetchRSS(config.url, "hn-ai-search-rss", config.name, config.tier);
}

module.exports = { fetch, id: "hn-ai-search-rss" };
