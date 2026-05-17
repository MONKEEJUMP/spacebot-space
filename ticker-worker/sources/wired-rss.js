const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["wired-rss"];

async function fetch() {
  return fetchRSS(config.url, "wired-rss", config.name, config.tier);
}

module.exports = { fetch, id: "wired-rss" };
