const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["theverge-rss"];

async function fetch() {
  return fetchRSS(config.url, "theverge-rss", config.name, config.tier);
}

module.exports = { fetch, id: "theverge-rss" };
