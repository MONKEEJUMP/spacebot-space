const postgres = require("postgres");

// dotenv is loaded by index.js before this module is required.
// Env vars are already available in process.env.
const connectionString =
  process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "[TICKER] FATAL: No SPACEBOT_DATABASE_URL or DATABASE_URL found in .env.local"
  );
  process.exit(1);
}

const sql = postgres(connectionString, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

module.exports = { sql };
