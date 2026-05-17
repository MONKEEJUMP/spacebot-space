const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["reddit-localllama"];

async function fetch() {
  return fetchRSS(config.url, "reddit-localllama", config.name, config.tier);
}

module.exports = { fetch, id: "reddit-localllama" };
