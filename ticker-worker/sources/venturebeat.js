const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["venturebeat-rss"];

async function fetch() {
  return fetchRSS(
    config.url,
    "venturebeat-rss",
    config.name,
    config.tier
  );
}

module.exports = { fetch, id: "venturebeat-rss" };
