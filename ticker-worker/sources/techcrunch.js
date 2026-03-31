const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["techcrunch-rss"];

async function fetch() {
  return fetchRSS(config.url, "techcrunch-rss", config.name, config.tier);
}

module.exports = { fetch, id: "techcrunch-rss" };
