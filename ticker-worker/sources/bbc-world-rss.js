const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["bbc-world-rss"];

async function fetch() {
  return fetchRSS(config.url, "bbc-world-rss", config.name, config.tier);
}

module.exports = { fetch, id: "bbc-world-rss" };
