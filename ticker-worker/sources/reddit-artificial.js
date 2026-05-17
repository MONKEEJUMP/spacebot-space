const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["reddit-artificial"];

async function fetch() {
  return fetchRSS(config.url, "reddit-artificial", config.name, config.tier);
}

module.exports = { fetch, id: "reddit-artificial" };
