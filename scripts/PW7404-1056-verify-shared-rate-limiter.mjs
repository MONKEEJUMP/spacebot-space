import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import process from "node:process";
import { createClient } from "redis";

const root = new URL("../", import.meta.url);
const storeSource = await readFile(
  new URL("src/lib/security/rate-limit-store.ts", root),
  "utf8",
);
const limiterSource = await readFile(
  new URL("src/lib/security/rate-limiter.ts", root),
  "utf8",
);
const healthSource = await readFile(
  new URL("src/app/api/health/route.ts", root),
  "utf8",
);

let checks = 0;
function receipt(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

receipt(
  storeSource.includes("process.env.REDIS_URL?.trim()"),
  "REDIS_URL is supported",
);
receipt(storeSource.includes("UPSTASH_REDIS_URL"), "Upstash URL is supported");
receipt(
  storeSource.includes("UPSTASH_REDIS_TOKEN"),
  "Upstash token is supported",
);
receipt(
  storeSource.includes('redis.call("INCR", KEYS[1])'),
  "counter uses atomic Lua",
);
receipt(
  storeSource.includes('redis.call("EXPIRE", KEYS[1], ARGV[1])'),
  "Lua sets expiry",
);
receipt(storeSource.includes("ttl < 0"), "Lua repairs missing expiry");
receipt(
  storeSource.includes("await client.ping()"),
  "backend is proved before ready logging",
);
receipt(
  storeSource.includes("reconnectStrategy: false"),
  "connection failures are bounded",
);
receipt(
  storeSource.includes("Promise.race([operation(), deadline])"),
  "shared-store commands have an independent wall-clock deadline",
);
receipt(
  storeSource.includes("onTimeout();"),
  "deadline invokes forced socket cleanup",
);
receipt(
  storeSource.includes(
    "withCommandDeadline(() => client.connect(), destroyClient)",
  ),
  "connection handshake has the same wall-clock deadline",
);
receipt(
  storeSource.includes("client.destroy()"),
  "failed socket cleanup cannot wait on a stuck command queue",
);
receipt(
  /catch \(error\) \{\s*destroyClient\(\);\s*throw error;/.test(storeSource),
  "failed initialization closes its connected socket",
);
receipt(
  storeSource.includes("retryAfter = Date.now() + RETRY_DELAY_MS"),
  "failures schedule retry",
);
receipt(
  /initializeStore\(\)\.catch\(\(\) => \{\s*storePromise = null;/.test(
    storeSource,
  ),
  "initialization failure clears the cached promise for recovery",
);
receipt(
  !storeSource.includes(
    'console.error("[RateLimiter] Redis connection failed:", error)',
  ),
  "secrets are not logged through raw errors",
);
receipt(
  limiterSource.includes('process.env.NODE_ENV === "production"'),
  "production policy is explicit",
);
receipt(limiterSource.includes("allowed: false"), "production can fail closed");
receipt(
  limiterSource.includes('failureReason: "store_unavailable"'),
  "store outages are distinguished from quota exhaustion",
);
receipt(
  limiterSource.includes('error: "RATE_LIMIT_STORE_UNAVAILABLE"'),
  "store outages have a stable error code",
);
receipt(
  limiterSource.includes("status: 503"),
  "store outages return service unavailable",
);
receipt(
  limiterSource.includes("getSharedRateLimitStore"),
  "policy consumes the shared store",
);
receipt(
  limiterSource.includes("markSharedRateLimitStoreFailed"),
  "runtime failures invalidate the store",
);
receipt(
  limiterSource.includes('"spacebot:ratelimit:v1"'),
  "keys are namespaced",
);
receipt(
  healthSource.includes("getRateLimiterHealth"),
  "health checks the rate limiter",
);
receipt(
  healthSource.includes('export const dynamic = "force-dynamic"'),
  "health always evaluates live dependencies",
);
receipt(
  healthSource.includes('status: rateLimiter.status === "error" ? 503 : 200'),
  "unhealthy production store returns 503",
);
receipt(
  healthSource.includes('"Cache-Control": "no-store"'),
  "health is not cached",
);

async function collectRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const url = new URL(
      `${entry.name}${entry.isDirectory() ? "/" : ""}`,
      directory,
    );
    if (entry.isDirectory()) {
      paths.push(...(await collectRouteFiles(url)));
    } else if (entry.name === "route.ts") {
      paths.push(url);
    }
  }
  return paths;
}

const appRoutes = await collectRouteFiles(new URL("src/app/", root));
const limitedRoutes = [];
for (const routeUrl of appRoutes) {
  const source = await readFile(routeUrl, "utf8");
  if (!source.includes("checkRateLimit")) continue;
  limitedRoutes.push(routeUrl);

  receipt(
    source.includes("rateLimitDeniedResponse") ||
      source.includes("rateLimitExceededResponse"),
    `${routeUrl.pathname} has a store-aware denial helper`,
  );
  receipt(
    !/rateLimitExceededResponse\([^\n)]*\.retryAfter\)/.test(source),
    `${routeUrl.pathname} passes the full decision to the denial helper`,
  );
}
receipt(
  limitedRoutes.length >= 50,
  "all known rate-limited routes are covered",
);

if (process.argv.includes("--redis-canary")) {
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const socket = { connectTimeout: 2_000, reconnectStrategy: false };
  const first = createClient({ url, socket });
  const second = createClient({ url, socket });
  first.on("error", () => {});
  second.on("error", () => {});

  const script = `
local current = redis.call("INCR", KEYS[1])
local ttl = redis.call("TTL", KEYS[1])
if current == 1 or ttl < 0 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`;
  const key = `spacebot:canary:rate-limit:${process.pid}:${Date.now()}`;

  let connected = false;
  try {
    await Promise.all([first.connect(), second.connect()]);
    connected = true;
    const calls = Array.from({ length: 40 }, (_, index) =>
      (index % 2 === 0 ? first : second).eval(script, {
        keys: [key],
        arguments: ["30"],
      }),
    );
    const results = await Promise.all(calls);
    const counts = results
      .map((result) => Number(result[0]))
      .sort((a, b) => a - b);
    const ttls = results.map((result) => Number(result[1]));

    receipt(counts.length === 40, "all concurrent operations completed");
    receipt(
      counts.every((count, index) => count === index + 1),
      "two clients share one exact counter",
    );
    receipt(
      ttls.every((ttl) => ttl > 0 && ttl <= 30),
      "every result has a bounded positive TTL",
    );
    receipt((await first.get(key)) === "40", "stored counter is exact");
  } finally {
    if (connected) {
      await first.del(key);
      receipt((await first.exists(key)) === 0, "canary key cleanup is exact");
    }
    if (first.isOpen) await first.close();
    if (second.isOpen) await second.close();
  }
}

console.log(`PW7404-1056 shared rate limiter: PASS (${checks} checks)`);
