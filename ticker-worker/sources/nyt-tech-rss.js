const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["nyt-tech-rss"];

async function fetch() {
  return fetchRSS(config.url, "nyt-tech-rss", config.name, config.tier);
}

module.exports = { fetch, id: "nyt-tech-rss" };
