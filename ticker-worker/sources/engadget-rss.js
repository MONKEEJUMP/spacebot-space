const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["engadget-rss"];

async function fetch() {
  return fetchRSS(config.url, "engadget-rss", config.name, config.tier);
}

module.exports = { fetch, id: "engadget-rss" };
