const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["mit-tech-review-rss"];

async function fetch() {
  return fetchRSS(config.url, "mit-tech-review-rss", config.name, config.tier);
}

module.exports = { fetch, id: "mit-tech-review-rss" };
