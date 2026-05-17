const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["the-verge-rss"];

async function fetch() {
  return fetchRSS(config.url, "the-verge-rss", config.name, config.tier);
}

module.exports = { fetch, id: "the-verge-rss" };
