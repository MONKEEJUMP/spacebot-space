const { fetchRSS } = require("./rss-adapter");
const config = require("../config").SOURCES["phys-org-rss"];

async function fetch() {
  return fetchRSS(config.url, "phys-org-rss", config.name, config.tier);
}

module.exports = { fetch, id: "phys-org-rss" };
