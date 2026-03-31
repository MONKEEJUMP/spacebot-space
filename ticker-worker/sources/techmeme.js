const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["techmeme-rss"];

async function fetch() {
  return fetchRSS(config.url, "techmeme-rss", config.name, config.tier);
}

module.exports = { fetch, id: "techmeme-rss" };
