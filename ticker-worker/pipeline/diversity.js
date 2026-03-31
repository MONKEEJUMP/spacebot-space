const { sql } = require("../db");

// ── Diversity constants ─────────────────────────────────────────────
const SOURCE_CAP = 15; // max active headlines per source
const CATEGORY_FLOOR = 3; // min active headlines per category

/**
 * Source cap: deactivate lowest-scored headlines when a source has
 * more than SOURCE_CAP active headlines. Keeps the top-scored ones.
 */
async function enforceSourceCap() {
  console.log(`[diversity] Enforcing source cap (${SOURCE_CAP} per source)...`);
  try {
    // Find sources that exceed the cap
    const overCap = await sql`
      SELECT source_id, COUNT(*) as cnt
      FROM ticker_headlines
      WHERE is_active = true
      GROUP BY source_id
      HAVING COUNT(*) > ${SOURCE_CAP}
    `;

    if (!overCap.length) {
      return;
    }

    let totalDeactivated = 0;

    for (const row of overCap) {
      const excess = Number(row.cnt) - SOURCE_CAP;

      // Deactivate the lowest-scored excess headlines for this source
      const deactivated = await sql`
        UPDATE ticker_headlines
        SET is_active = false
        WHERE id IN (
          SELECT id
          FROM ticker_headlines
          WHERE is_active = true
            AND source_id = ${row.source_id}
          ORDER BY composite_score ASC, fetched_at ASC
          LIMIT ${excess}
        )
        RETURNING id
      `;

      totalDeactivated += deactivated.length;
    }

    if (totalDeactivated > 0) {
      console.log(
        `[diversity] Deactivated ${totalDeactivated} headlines exceeding source cap`
      );
    }
  } catch (err) {
    console.error("[diversity] Source cap enforcement failed:", err.message);
  }
}

/**
 * Category floor: reactivate recent headlines for categories that
 * have fewer than CATEGORY_FLOOR active headlines.
 * Only reactivates headlines less than 12 hours old.
 */
async function enforceCategoryFloor() {
  console.log(
    `[diversity] Enforcing category floor (${CATEGORY_FLOOR} per category)...`
  );
  try {
    // Find categories below the floor
    const underFloor = await sql`
      SELECT category, COUNT(*) as cnt
      FROM ticker_headlines
      WHERE is_active = true
      GROUP BY category
      HAVING COUNT(*) < ${CATEGORY_FLOOR}
    `;

    if (!underFloor.length) {
      return;
    }

    let totalReactivated = 0;

    for (const row of underFloor) {
      const deficit = CATEGORY_FLOOR - Number(row.cnt);

      // Reactivate the most recent deactivated headlines for this category
      const reactivated = await sql`
        UPDATE ticker_headlines
        SET is_active = true
        WHERE id IN (
          SELECT id
          FROM ticker_headlines
          WHERE is_active = false
            AND category = ${row.category}
            AND fetched_at > NOW() - INTERVAL '12 hours'
          ORDER BY composite_score DESC, fetched_at DESC
          LIMIT ${deficit}
        )
        RETURNING id
      `;

      totalReactivated += reactivated.length;
    }

    if (totalReactivated > 0) {
      console.log(
        `[diversity] Reactivated ${totalReactivated} headlines to meet category floor`
      );
    }
  } catch (err) {
    console.error(
      "[diversity] Category floor enforcement failed:",
      err.message
    );
  }
}

/**
 * Full diversity pass: enforce source cap then category floor.
 */
async function diversityPass() {
  await enforceSourceCap();
  await enforceCategoryFloor();
}

module.exports = {
  diversityPass,
  enforceSourceCap,
  enforceCategoryFloor,
  SOURCE_CAP,
  CATEGORY_FLOOR,
};
