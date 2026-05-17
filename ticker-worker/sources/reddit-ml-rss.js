const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["reddit-ml-rss"];

async function fetch() {
  return fetchRSS(config.url, "reddit-ml-rss", config.name, config.tier);
}

module.exports = { fetch, id: "reddit-ml-rss" };
