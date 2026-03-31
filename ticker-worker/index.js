require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });

const cron = require("node-cron");
const { sql } = require("./db");
const { SOURCES, TIER_INTERVALS } = require("./config");
const sources = require("./sources");

// Pipeline modules
const { dedup } = require("./pipeline/url-dedup");
const { qualityFilter } = require("./pipeline/quality-filter");
const { normalize } = require("./pipeline/normalizer");
const { categorize } = require("./pipeline/categorizer");
const { fuzzyDedup } = require("./pipeline/fuzzy-dedup");
const { scoreBatch, rescoreAll } = require("./pipeline/scorer");
const { detectBreaking, expireBreaking } = require("./pipeline/breaking-detector");
const { diversityPass } = require("./pipeline/diversity");

// Production hardening modules
const { getBreaker } = require("./pipeline/circuit-breaker");
const { recordSuccess, recordFailure } = require("./pipeline/health-tracker");
const logger = require("./pipeline/logger");
const { startHealthServer } = require("./health-server");

// ── Process a batch of sources ──────────────────────────────────────
async function processBatch(batch, tierName) {
  for (const source of batch) {
    const sourceId = source.id;
    const cfg = SOURCES[sourceId] || {};
    const startTime = Date.now();

    // Circuit breaker check
    const breaker = getBreaker(sourceId);
    if (!breaker.canRequest()) {
      logger.warn(sourceId, "CIRCUIT OPEN — skipping");
      continue;
    }

    try {
      logger.info(sourceId, "Fetching...");
      const raw = await source.fetch();
      logger.info(sourceId, `Got ${raw.length} raw headlines`);

      // Record success on the circuit breaker
      breaker.recordSuccess();

      if (!raw.length) {
        try {
          await recordSuccess(sourceId, cfg.name || sourceId);
        } catch (hErr) {
          logger.error(sourceId, `Health record failed: ${hErr.message}`);
        }
        continue;
      }

      // Pipeline: filter → normalize → categorize → URL dedup →
      //           fuzzy dedup → score → breaking detect → insert
      const filtered = qualityFilter(raw);
      const normalized = normalize(filtered);
      const categorized = categorize(normalized);
      const fresh = await dedup(categorized);

      if (!fresh.length) {
        logger.info(sourceId, "No new headlines after URL dedup");
        try {
          await recordSuccess(sourceId, cfg.name || sourceId);
        } catch (hErr) {
          logger.error(sourceId, `Health record failed: ${hErr.message}`);
        }
        continue;
      }

      // Intelligence pipeline
      const { unique, duplicateIds } = await fuzzyDedup(fresh);
      const scored = scoreBatch(unique);
      const withBreaking = detectBreaking(scored);

      if (withBreaking.length > 0) {
        await insertHeadlines(withBreaking);
        const breakingCount = withBreaking.filter((h) => h.isBreaking).length;
        const elapsed = Date.now() - startTime;
        logger.info(
          sourceId,
          `Inserted ${withBreaking.length} headlines` +
            (breakingCount > 0 ? ` (${breakingCount} breaking)` : "") +
            (duplicateIds.length > 0
              ? ` | ${duplicateIds.length} fuzzy dupes boosted`
              : "") +
            ` [${elapsed}ms]`
        );
      } else {
        logger.info(sourceId, "No unique headlines after fuzzy dedup");
      }

      try {
        await recordSuccess(sourceId, cfg.name || sourceId);
      } catch (hErr) {
        logger.error(sourceId, `Health record failed: ${hErr.message}`);
      }
    } catch (err) {
      // Record failure on circuit breaker
      breaker.recordFailure();
      logger.error(sourceId, `FAILED: ${err.message}`);

      try {
        await recordFailure(sourceId, cfg.name || sourceId, err.message);
      } catch (hErr) {
        logger.error(sourceId, `Health record also failed: ${hErr.message}`);
      }
    }
  }
}

// ── Insert headlines into Supabase ──────────────────────────────────
async function insertHeadlines(headlines) {
  for (const h of headlines) {
    await sql`
      INSERT INTO ticker_headlines (
        title, source_name, source_id, article_url, category,
        published_at, source_tier, is_breaking, heat_score,
        composite_score, cluster_id
      ) VALUES (
        ${h.title},
        ${h.sourceName},
        ${h.sourceId},
        ${h.articleUrl},
        ${h.category || "industry"},
        ${h.publishedAt || null},
        ${h.sourceTier || 3},
        ${h.isBreaking || false},
        ${h.heatScore || 0},
        ${h.compositeScore || 0},
        ${h.clusterId || null}
      )
      ON CONFLICT (article_url) DO NOTHING
    `;
  }
}

// ── Cleanup old headlines ───────────────────────────────────────────
async function cleanup() {
  logger.info("cleanup", "Deactivating headlines older than 12 hours...");
  const deactivated = await sql`
    UPDATE ticker_headlines
    SET is_active = false
    WHERE is_active = true
      AND fetched_at < NOW() - INTERVAL '12 hours'
    RETURNING id
  `;
  logger.info("cleanup", `Deactivated ${deactivated.length} stale headlines`);

  logger.info("cleanup", "Deleting headlines older than 7 days...");
  const deleted = await sql`
    DELETE FROM ticker_headlines
    WHERE fetched_at < NOW() - INTERVAL '7 days'
    RETURNING id
  `;
  logger.info("cleanup", `Deleted ${deleted.length} old headlines`);
}

// ── Memory monitoring ───────────────────────────────────────────────
function checkMemory() {
  const usage = process.memoryUsage();
  const heapMB = Math.round(usage.heapUsed / 1024 / 1024);
  const rssMB = Math.round(usage.rss / 1024 / 1024);

  if (heapMB > 230) {
    logger.error(
      "memory",
      `CRITICAL: Heap at ${heapMB}MB / RSS at ${rssMB}MB — approaching 256MB cap`
    );
    if (global.gc) global.gc();
  } else if (heapMB > 200) {
    logger.warn("memory", `WARNING: Heap at ${heapMB}MB / RSS at ${rssMB}MB`);
  } else {
    logger.info("memory", `Heap: ${heapMB}MB / RSS: ${rssMB}MB`);
  }
}

// ── Hourly intelligence pass ────────────────────────────────────────
async function intelligencePass() {
  logger.info("intelligence", "═══ Hourly Intelligence Pass Starting ═══");

  try {
    await rescoreAll();
  } catch (err) {
    logger.error("intelligence", `Rescore failed: ${err.message}`);
  }

  try {
    await expireBreaking();
  } catch (err) {
    logger.error("intelligence", `Expire breaking failed: ${err.message}`);
  }

  try {
    await diversityPass();
  } catch (err) {
    logger.error("intelligence", `Diversity pass failed: ${err.message}`);
  }

  try {
    await cleanup();
  } catch (err) {
    logger.error("intelligence", `Cleanup failed: ${err.message}`);
  }

  // Stats summary
  try {
    const stats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE is_breaking = true AND is_active = true) as breaking,
        COUNT(*) as total
      FROM ticker_headlines
    `;
    const s = stats[0];
    logger.info(
      "intelligence",
      `Summary: ${s.active} active, ${s.breaking} breaking, ${s.total} total`
    );
  } catch (err) {
    logger.error("intelligence", `Stats query failed: ${err.message}`);
  }

  checkMemory();
  logger.info("intelligence", "═══ Hourly Intelligence Pass Complete ═══");
}

// ── Group sources by tier ───────────────────────────────────────────
function groupByTier(allSources) {
  const tiers = {};
  for (const src of allSources) {
    const cfg = SOURCES[src.id];
    if (!cfg) continue;
    const tier = cfg.tier;
    if (!tiers[tier]) tiers[tier] = [];
    tiers[tier].push(src);
  }
  return tiers;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  SPACEBOT TICKER WORKER v4.0");
  console.log("  AiSpace — The Pulse of Artificial Intelligence");
  console.log(`  Sources: ${sources.length} registered`);
  console.log("  Intelligence: Fuzzy Dedup + Scoring + Breaking + Diversity");
  console.log("  Circuit Breakers: ACTIVE");
  console.log("  Health Endpoint: http://127.0.0.1:3456/health");
  console.log("  Memory Cap: 256MB (PM2 enforced)");
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════");

  // Start health server
  startHealthServer();

  // Verify DB connection
  try {
    await sql`SELECT 1 as ok`;
    logger.info("db", "Connected to Supabase");
  } catch (err) {
    logger.error("db", `FATAL: Cannot connect to Supabase: ${err.message}`);
    process.exit(1);
  }

  // Group sources by tier
  const tiers = groupByTier(sources);

  // Initial fetch on startup
  logger.info("startup", "Running initial fetch for all sources...");
  try {
    await processBatch(sources, "startup");
  } catch (err) {
    logger.error("startup", `Initial fetch failed: ${err.message}`);
  }

  // Schedule tier-based cron jobs
  for (const [tier, tierSources] of Object.entries(tiers)) {
    const cronExpr = TIER_INTERVALS[tier];
    if (!cronExpr) continue;

    const tierNames = tierSources.map((s) => s.id).join(", ");
    logger.info("cron", `Tier ${tier} (${cronExpr}): ${tierNames}`);

    cron.schedule(cronExpr, async () => {
      logger.info("cron", `Tier ${tier} fetch starting...`);
      try {
        await processBatch(tierSources, `tier-${tier}`);
      } catch (err) {
        logger.error("cron", `Tier ${tier} batch FAILED: ${err.message}`);
      }
    });
  }

  // Intelligence pass — every hour at :05
  cron.schedule("5 * * * *", async () => {
    try {
      await intelligencePass();
    } catch (err) {
      logger.error("intelligence", `Hourly pass FAILED: ${err.message}`);
    }
  });

  logger.info("cron", "Intelligence pass scheduled at :05 every hour");
  checkMemory();
  logger.info("ready", "Ticker worker v4.0 is running. All systems operational.");
}

// ── Graceful shutdown ───────────────────────────────────────────────
async function shutdown(signal) {
  logger.info("shutdown", `Received ${signal}. Closing DB connection...`);
  try {
    await sql.end({ timeout: 5 });
  } catch {
    // ignore
  }
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Catch unhandled rejections — log but don't crash
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled", `Unhandled rejection: ${reason}`);
});

// Start
main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
