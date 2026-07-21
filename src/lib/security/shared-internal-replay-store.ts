import type {
  InternalReplayConsumeInput,
  InternalReplayConsumeResult,
  InternalReplayStore,
} from "@/lib/security/internal-replay-store";

export interface SharedRedisInternalReplayStoreOptions {
  namespace?: string;
}

const DEFAULT_REDIS_REPLAY_NAMESPACE = "spacebot:internal-replay";

/** Redis SET NX EX provides atomic replay consumption across app processes. */
export class SharedRedisInternalReplayStore implements InternalReplayStore {
  private readonly namespace: string;

  constructor(options: SharedRedisInternalReplayStoreOptions = {}) {
    this.namespace =
      options.namespace?.trim() || DEFAULT_REDIS_REPLAY_NAMESPACE;
  }

  async consume(
    input: InternalReplayConsumeInput,
  ): Promise<InternalReplayConsumeResult> {
    const { nonce, expiresAtUnixSeconds, nowUnixSeconds } = input;
    if (
      !nonce ||
      !Number.isSafeInteger(expiresAtUnixSeconds) ||
      !Number.isSafeInteger(nowUnixSeconds) ||
      expiresAtUnixSeconds <= nowUnixSeconds
    ) {
      throw new TypeError("Invalid replay-store consume input");
    }

    const { getRedisPublisher } = await import("@/lib/redis");
    const redis = await getRedisPublisher();
    const result = await redis.sendCommand([
      "SET",
      `${this.namespace}:${nonce}`,
      "1",
      "NX",
      "EX",
      String(expiresAtUnixSeconds - nowUnixSeconds),
    ]);
    return String(result) === "OK"
      ? { consumed: true }
      : { consumed: false, reason: "replay" };
  }
}
