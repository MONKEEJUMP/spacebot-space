const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["reddit-openai"];

async function fetch() {
  return fetchRSS(config.url, "reddit-openai", config.name, config.tier);
}

module.exports = { fetch, id: "reddit-openai" };
