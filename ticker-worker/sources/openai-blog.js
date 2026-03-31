const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["openai-blog-rss"];

async function fetch() {
  return fetchRSS(config.url, "openai-blog-rss", config.name, config.tier);
}

module.exports = { fetch, id: "openai-blog-rss" };
