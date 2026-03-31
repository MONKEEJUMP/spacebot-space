const { sql } = require("../db");

/**
 * Record a successful source fetch to ticker_source_health.
 */
async function recordSuccess(sourceId, sourceName) {
  await sql`
    INSERT INTO ticker_source_health (
      source_id, source_name, status,
      last_success_at, consecutive_failures,
      total_fetches, total_failures, last_error, updated_at
    ) VALUES (
      ${sourceId}, ${sourceName}, 'healthy',
      NOW(), 0, 1, 0, NULL, NOW()
    )
    ON CONFLICT (source_id) DO UPDATE SET
      status = 'healthy',
      last_success_at = NOW(),
      consecutive_failures = 0,
      total_fetches = ticker_source_health.total_fetches + 1,
      last_error = NULL,
      updated_at = NOW()
  `;
}

/**
 * Record a failed source fetch to ticker_source_health.
 * Status: 'degraded' for 1-2 failures, 'down' for 3+.
 */
async function recordFailure(sourceId, sourceName, errorMessage) {
  await sql`
    INSERT INTO ticker_source_health (
      source_id, source_name, status,
      last_failure_at, consecutive_failures,
      total_fetches, total_failures, last_error, updated_at
    ) VALUES (
      ${sourceId}, ${sourceName}, 'degraded',
      NOW(), 1, 1, 1, ${errorMessage}, NOW()
    )
    ON CONFLICT (source_id) DO UPDATE SET
      status = CASE
        WHEN ticker_source_health.consecutive_failures + 1 >= 3 THEN 'down'
        ELSE 'degraded'
      END,
      last_failure_at = NOW(),
      consecutive_failures = ticker_source_health.consecutive_failures + 1,
      total_fetches = ticker_source_health.total_fetches + 1,
      total_failures = ticker_source_health.total_failures + 1,
      last_error = ${errorMessage},
      updated_at = NOW()
  `;
}

/**
 * Get full health report for all tracked sources.
 */
async function getHealthReport() {
  return await sql`
    SELECT source_id, source_name, status,
           last_success_at, last_failure_at,
           consecutive_failures, total_fetches, total_failures,
           last_error, updated_at
    FROM ticker_source_health
    ORDER BY source_name
  `;
}

module.exports = { recordSuccess, recordFailure, getHealthReport };
