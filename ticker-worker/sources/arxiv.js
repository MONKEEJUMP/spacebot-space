const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["arxiv-combined"];

async function fetch() {
  return fetchRSS(
    config.url,
    "arxiv-combined",
    config.name,
    config.tier,
    config.defaultCategory
  );
}

module.exports = { fetch, id: "arxiv-combined" };
