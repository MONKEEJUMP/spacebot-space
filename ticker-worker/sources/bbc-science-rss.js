const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["bbc-science-rss"];

async function fetch() {
  return fetchRSS(config.url, "bbc-science-rss", config.name, config.tier);
}

module.exports = { fetch, id: "bbc-science-rss" };
