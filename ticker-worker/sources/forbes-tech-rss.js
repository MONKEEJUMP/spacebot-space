const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["forbes-tech-rss"];

async function fetch() {
  return fetchRSS(config.url, "forbes-tech-rss", config.name, config.tier);
}

module.exports = { fetch, id: "forbes-tech-rss" };
