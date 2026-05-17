const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["cnbc-tech-rss"];

async function fetch() {
  return fetchRSS(config.url, "cnbc-tech-rss", config.name, config.tier);
}

module.exports = { fetch, id: "cnbc-tech-rss" };
