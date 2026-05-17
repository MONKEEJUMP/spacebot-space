const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["zdnet-rss"];

async function fetch() {
  return fetchRSS(config.url, "zdnet-rss", config.name, config.tier);
}

module.exports = { fetch, id: "zdnet-rss" };
