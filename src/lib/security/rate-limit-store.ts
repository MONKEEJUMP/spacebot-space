import "server-only";

const FIXED_WINDOW_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
local ttl = redis.call("TTL", KEYS[1])

if current == 1 or ttl < 0 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end

return { current, ttl }
`;

const RETRY_DELAY_MS = 5_000;
const COMMAND_TIMEOUT_MS = 2_000;

export type SharedRateLimitStoreKind = "redis" | "upstash";

export interface SharedRateLimitStore {
  kind: SharedRateLimitStoreKind;
  incrementFixedWindow(
    key: string,
    windowSeconds: number,
  ): Promise<{ current: number; ttl: number }>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

let storePromise: Promise<SharedRateLimitStore | null> | null = null;
let retryAfter = 0;
let lastFailureAt: string | null = null;

async function withCommandDeadline<T>(
  operation: () => Promise<T>,
  onTimeout: () => void,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      onTimeout();
      reject(new Error("Redis command deadline exceeded"));
    }, COMMAND_TIMEOUT_MS);
  });

  try {
    return await Promise.race([operation(), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function parseCounterResult(result: unknown): { current: number; ttl: number } {
  if (!Array.isArray(result) || result.length !== 2) {
    throw new Error("Invalid Redis rate-limit result");
  }

  const current = Number(result[0]);
  const ttl = Number(result[1]);
  if (!Number.isSafeInteger(current) || current < 1 || !Number.isFinite(ttl)) {
    throw new Error("Invalid Redis rate-limit counter values");
  }

  return { current, ttl: Math.max(1, Math.ceil(ttl)) };
}

async function createNodeRedisStore(
  url: string,
): Promise<SharedRateLimitStore> {
  const { createClient } = await import("redis");
  const client = createClient({
    url,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: false,
    },
  });

  const destroyClient = () => {
    if (client.isOpen) client.destroy();
  };

  client.on("error", () => {
    // Command failures are handled by the caller and converted to fail-closed decisions.
  });

  try {
    await withCommandDeadline(() => client.connect(), destroyClient);
    await withCommandDeadline(() => client.ping(), destroyClient);
  } catch (error) {
    destroyClient();
    throw error;
  }

  return {
    kind: "redis",
    async incrementFixedWindow(key, windowSeconds) {
      const result = await withCommandDeadline(
        () =>
          client.eval(FIXED_WINDOW_SCRIPT, {
            keys: [key],
            arguments: [String(windowSeconds)],
          }),
        destroyClient,
      );
      return parseCounterResult(result);
    },
    async ping() {
      await withCommandDeadline(() => client.ping(), destroyClient);
    },
    async close() {
      if (client.isOpen) {
        destroyClient();
      }
    },
  };
}

async function createUpstashStore(
  url: string,
  token: string,
): Promise<SharedRateLimitStore> {
  const { Redis } = await import("@upstash/redis");
  const client = new Redis({
    url,
    token,
    signal: () => AbortSignal.timeout(COMMAND_TIMEOUT_MS),
  });
  await client.ping();

  return {
    kind: "upstash",
    async incrementFixedWindow(key, windowSeconds) {
      const result = await client.eval(
        FIXED_WINDOW_SCRIPT,
        [key],
        [String(windowSeconds)],
      );
      return parseCounterResult(result);
    },
    async ping() {
      await client.ping();
    },
    async close() {
      // Upstash uses stateless HTTP requests and has no socket to close.
    },
  };
}

async function initializeStore(): Promise<SharedRateLimitStore | null> {
  const redisUrl = process.env.REDIS_URL?.trim();
  const upstashUrl = process.env.UPSTASH_REDIS_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_TOKEN?.trim();

  if (redisUrl) {
    const store = await createNodeRedisStore(redisUrl);
    // eslint-disable-next-line no-console
    console.info("[RateLimiter] Shared Redis store ready");
    return store;
  }

  if (upstashUrl && upstashToken) {
    const store = await createUpstashStore(upstashUrl, upstashToken);
    // eslint-disable-next-line no-console
    console.info("[RateLimiter] Shared Upstash store ready");
    return store;
  }

  if (upstashUrl || upstashToken) {
    // eslint-disable-next-line no-console
    console.error("[RateLimiter] Incomplete Upstash configuration");
  } else if (process.env.NODE_ENV === "production") {
    // eslint-disable-next-line no-console
    console.error(
      "[RateLimiter] Shared rate-limit store is required in production",
    );
  }

  return null;
}

export async function getSharedRateLimitStore(): Promise<SharedRateLimitStore | null> {
  if (Date.now() < retryAfter) {
    return null;
  }

  if (!storePromise) {
    storePromise = initializeStore().catch(() => {
      storePromise = null;
      lastFailureAt = new Date().toISOString();
      retryAfter = Date.now() + RETRY_DELAY_MS;
      // eslint-disable-next-line no-console
      console.error("[RateLimiter] Shared store initialization failed");
      return null;
    });
  }

  return storePromise;
}

export async function markSharedRateLimitStoreFailed(
  store: SharedRateLimitStore,
): Promise<void> {
  if (storePromise) {
    storePromise = null;
  }
  retryAfter = Date.now() + RETRY_DELAY_MS;
  lastFailureAt = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.error("[RateLimiter] Shared store operation failed; retry scheduled");

  try {
    await store.close();
  } catch {
    // The failed client is discarded even when cleanup cannot complete.
  }
}

export async function inspectSharedRateLimitStore(): Promise<{
  status: "ok" | "unavailable";
  backend: SharedRateLimitStoreKind | "none";
  shared: boolean;
  lastFailureAt: string | null;
}> {
  const store = await getSharedRateLimitStore();
  if (!store) {
    return {
      status: "unavailable",
      backend: "none",
      shared: false,
      lastFailureAt,
    };
  }

  try {
    await store.ping();
    return {
      status: "ok",
      backend: store.kind,
      shared: true,
      lastFailureAt,
    };
  } catch {
    await markSharedRateLimitStoreFailed(store);
    return {
      status: "unavailable",
      backend: store.kind,
      shared: true,
      lastFailureAt,
    };
  }
}
