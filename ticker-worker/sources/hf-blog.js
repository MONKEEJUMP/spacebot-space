const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["hf-blog-rss"];

async function fetch() {
  return fetchRSS(config.url, "hf-blog-rss", config.name, config.tier);
}

module.exports = { fetch, id: "hf-blog-rss" };
