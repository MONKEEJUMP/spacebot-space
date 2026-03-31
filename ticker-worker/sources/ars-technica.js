const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["ars-technica-rss"];

async function fetch() {
  return fetchRSS(
    config.url,
    "ars-technica-rss",
    config.name,
    config.tier
  );
}

module.exports = { fetch, id: "ars-technica-rss" };
