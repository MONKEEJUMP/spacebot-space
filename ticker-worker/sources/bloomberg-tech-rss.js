const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["bloomberg-tech-rss"];

async function fetch() {
  return fetchRSS(config.url, "bloomberg-tech-rss", config.name, config.tier);
}

module.exports = { fetch, id: "bloomberg-tech-rss" };
