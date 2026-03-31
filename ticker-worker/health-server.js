const http = require("http");
const { getAllStatus } = require("./pipeline/circuit-breaker");
const { getHealthReport } = require("./pipeline/health-tracker");
const { getRecentLogs } = require("./pipeline/logger");

const PORT = 3456;

const server = http.createServer(async (req, res) => {
  // CORS headers for local monitoring tools
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/health") {
    try {
      const dbHealth = await getHealthReport();
      const circuitStatus = getAllStatus();
      const mem = process.memoryUsage();

      const report = {
        status: "ok",
        version: "4.0",
        uptime: Math.round(process.uptime()),
        memory: {
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
          rss: Math.round(mem.rss / 1024 / 1024),
        },
        sources: dbHealth.map((s) => {
          const circuit =
            circuitStatus.find((c) => c.sourceId === s.source_id) || null;
          return {
            sourceId: s.source_id,
            name: s.source_name,
            status: s.status,
            circuit: circuit ? circuit.state : "UNKNOWN",
            consecutiveFailures: s.consecutive_failures,
            totalFetches: s.total_fetches,
            totalFailures: s.total_failures,
            lastSuccess: s.last_success_at,
            lastFailure: s.last_failure_at,
            lastError: s.last_error,
          };
        }),
        recentLogs: getRecentLogs().slice(-20),
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(report, null, 2));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "error", message: err.message }));
    }
  } else if (req.url === "/health/simple") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  } else if (req.url === "/health/logs") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getRecentLogs(), null, 2));
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

function startHealthServer() {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(
      `[HEALTH] Status server listening on http://127.0.0.1:${PORT}/health`
    );
  });
  server.on("error", (err) => {
    console.error(
      `[HEALTH] Server error: ${err.message} — health endpoint disabled`
    );
  });
}

module.exports = { startHealthServer };
