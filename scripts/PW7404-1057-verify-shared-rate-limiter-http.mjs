import assert from "node:assert/strict";
import process from "node:process";
import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient } from "redis";

const expected = process.argv.includes("--expect=unavailable")
  ? "unavailable"
  : "ok";
const baseUrls = (process.env.SPACEBOT_BASE_URLS || "http://127.0.0.1:3003")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

assert.ok(baseUrls.length > 0, "At least one candidate base URL is required");
if (expected === "ok") {
  assert.ok(
    new Set(baseUrls).size >= 2,
    "Successful shared-store proof requires two distinct app targets",
  );
}

let checks = 0;
function receipt(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

async function createCleanupStore() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    const client = createClient({
      url: redisUrl,
      socket: { connectTimeout: 2_000, reconnectStrategy: false },
    });
    client.on("error", () => {});
    await client.connect();
    return {
      get: (key) => client.get(key),
      del: (key) => client.del(key),
      exists: (key) => client.exists(key),
      ttl: (key) => client.ttl(key),
      close: () => client.close(),
    };
  }

  const url = process.env.UPSTASH_REDIS_URL?.trim();
  const token = process.env.UPSTASH_REDIS_TOKEN?.trim();
  assert.ok(
    url && token,
    "A Redis or Upstash backend is required for exact cleanup",
  );
  const client = new UpstashRedis({
    url,
    token,
    signal: () => AbortSignal.timeout(2_000),
  });
  await client.ping();
  return {
    get: (key) => client.get(key),
    del: (key) => client.del(key),
    exists: (key) => client.exists(key),
    ttl: (key) => client.ttl(key),
    close: async () => {},
  };
}

for (const baseUrl of baseUrls) {
  const health = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
  const body = await health.json();

  if (expected === "unavailable") {
    receipt(health.status === 503, `${baseUrl} health fails closed`);
    receipt(body.status === "error", `${baseUrl} health reports error`);
    receipt(
      body.dependencies?.rateLimiter?.status === "error",
      `${baseUrl} reports rate-limiter dependency error`,
    );

    const protectedRead = await fetch(`${baseUrl}/api/v1/posts?limit=1`, {
      cache: "no-store",
      headers: { "x-forwarded-for": "198.51.100.250" },
    });
    const protectedBody = await protectedRead.json();
    receipt(
      protectedRead.status === 503,
      `${baseUrl} protected route returns 503`,
    );
    receipt(
      protectedBody.error === "RATE_LIMIT_STORE_UNAVAILABLE",
      `${baseUrl} protected route uses the outage error contract`,
    );
  } else {
    receipt(health.status === 200, `${baseUrl} health is ready`);
    receipt(body.status === "ok", `${baseUrl} health reports ok`);
    receipt(
      body.dependencies?.rateLimiter?.status === "ok",
      `${baseUrl} reports rate-limiter dependency ok`,
    );
    receipt(
      body.dependencies?.rateLimiter?.shared === true,
      `${baseUrl} confirms a shared backend`,
    );
    receipt(
      ["redis", "upstash"].includes(body.dependencies?.rateLimiter?.backend),
      `${baseUrl} reports a supported shared backend`,
    );
  }
}

if (expected === "ok") {
  const store = await createCleanupStore();

  const octet = 10 + (process.pid % 200);
  const identifier = `198.51.100.${octet}`;
  const prefix =
    process.env.SPACEBOT_RATE_LIMIT_PREFIX || "spacebot:ratelimit:v1";
  const key = `${prefix}:register:${identifier}`;

  try {
    await store.del(key);

    const statuses = [];
    let finalBody = null;
    for (let index = 0; index < 6; index += 1) {
      const baseUrl = baseUrls[index % baseUrls.length];
      const response = await fetch(`${baseUrl}/api/v1/agents/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": identifier,
        },
        body: "{}",
      });
      statuses.push(response.status);
      finalBody = await response.json();
    }

    receipt(
      statuses
        .slice(0, 5)
        .every((status) => status >= 400 && status < 500 && status !== 429),
      "the first five cross-process admissions reach validation",
    );
    receipt(statuses[5] === 429, "the sixth shared admission is rate limited");
    receipt(
      finalBody?.error === "RATE_LIMIT_EXCEEDED",
      "quota response keeps its stable code",
    );
    receipt(
      Number(await store.get(key)) === 6,
      "both app processes increment one exact counter",
    );
    const ttl = await store.ttl(key);
    receipt(
      ttl > 0 && ttl <= 3_600,
      "shared counter has a bounded positive TTL",
    );
  } finally {
    await store.del(key);
    receipt(
      (await store.exists(key)) === 0,
      "integration counter cleanup is exact",
    );
    await store.close();
  }
}

console.log(`PW7404-1057 shared rate limiter HTTP: PASS (${checks} checks)`);
