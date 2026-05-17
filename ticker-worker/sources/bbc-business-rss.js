const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["bbc-business-rss"];

async function fetch() {
  return fetchRSS(config.url, "bbc-business-rss", config.name, config.tier);
}

module.exports = { fetch, id: "bbc-business-rss" };
