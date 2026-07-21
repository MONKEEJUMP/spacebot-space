const {
  TICKER_SOURCE_CATALOG: SOURCES,
} = require("../src/lib/ticker/source-catalog.js");

const TIER_INTERVALS = {
  1: "*/5 * * * *",
  2: "*/10 * * * *",
  3: "*/15 * * * *",
  4: "*/15 * * * *",
  5: "*/15 * * * *",
};

module.exports = { SOURCES, TIER_INTERVALS };
