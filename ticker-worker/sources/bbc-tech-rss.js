const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["bbc-tech-rss"];

async function fetch() {
  return fetchRSS(config.url, "bbc-tech-rss", config.name, config.tier);
}

module.exports = { fetch, id: "bbc-tech-rss" };
