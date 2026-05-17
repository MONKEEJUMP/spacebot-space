const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["hn-frontpage-rss"];

async function fetch() {
  return fetchRSS(config.url, "hn-frontpage-rss", config.name, config.tier);
}

module.exports = { fetch, id: "hn-frontpage-rss" };
