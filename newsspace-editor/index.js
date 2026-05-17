require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env.local"),
});

const { sql } = require("./db");
const { POLL_INTERVAL_MS, MAX_RETRIES } = require("./config");
const { evaluate } = require("./evaluate");

console.log("[EDITOR] NewsSpace Editor v1.0 started");

let isProcessing = false;

async function processOnePending() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Fetch ONE pending headline
    const rows = await sql`
      SELECT id, title, source_name, source_tier, category, published_at, fetched_at, editor_attempts
      FROM ticker_headlines
      WHERE editor_status = 'pending'
        AND is_active = true
        AND fetched_at > NOW() - INTERVAL '4 hours'
      ORDER BY fetched_at DESC
      LIMIT 1
    `;

    if (rows.length === 0) return;

    const headline = rows[0];

    try {
      const result = await evaluate(headline);

      await sql`
        UPDATE ticker_headlines SET
          editor_status = ${result.approved ? "approved" : "rejected"},
          editor_approved = ${result.approved},
          tile_size = ${result.tile_size},
          category = ${result.category},
          editor_note = ${result.note},
          editor_model = 'qwen-flash',
          editor_attempts = editor_attempts + 1,
          editor_reviewed_at = NOW()
        WHERE id = ${headline.id}
      `;

      console.log(
        `[EDITOR] ${headline.id} | ${result.approved ? "APPROVED" : "REJECTED"} | ${result.tile_size} | ${headline.source_name} | ${headline.title.substring(0, 60)}`
      );
    } catch (err) {
      const newAttempts = (headline.editor_attempts || 0) + 1;
      const newStatus = newAttempts >= MAX_RETRIES ? "error" : "pending";

      await sql`
        UPDATE ticker_headlines SET
          editor_error = ${err.message},
          editor_attempts = editor_attempts + 1,
          editor_status = ${newStatus}
        WHERE id = ${headline.id}
      `;

      console.error(
        `[EDITOR] ERROR ${headline.id} | attempts: ${newAttempts} | status: ${newStatus} | ${err.message}`
      );
    }
  } finally {
    isProcessing = false;
  }
}

async function markStaleExpired() {
  const result = await sql`
    UPDATE ticker_headlines
    SET editor_status = 'expired'
    WHERE editor_status = 'pending'
      AND fetched_at < NOW() - INTERVAL '6 hours'
  `;
  const count = result.count ?? 0;
  if (count > 0) {
    console.log(`[EDITOR] Marked ${count} stale pending headlines as expired`);
  }
}

// Main polling loop
setInterval(processOnePending, POLL_INTERVAL_MS);

// Stale cleanup — every hour
setInterval(markStaleExpired, 60 * 60 * 1000);

// Run first cycle immediately
processOnePending();
markStaleExpired();

// Graceful shutdown
async function shutdown(signal) {
  console.log(`[EDITOR] Received ${signal} — shutting down`);
  try {
    await sql.end();
  } catch (_) {}
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
