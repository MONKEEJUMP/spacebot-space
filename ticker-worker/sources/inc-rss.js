const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["inc-rss"];

async function fetch() {
  return fetchRSS(config.url, "inc-rss", config.name, config.tier);
}

module.exports = { fetch, id: "inc-rss" };
