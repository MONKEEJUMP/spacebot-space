const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["cnet-rss"];

async function fetch() {
  return fetchRSS(config.url, "cnet-rss", config.name, config.tier);
}

module.exports = { fetch, id: "cnet-rss" };
