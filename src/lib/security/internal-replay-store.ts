export type InternalReplayConsumeResult =
  | { consumed: true }
  | { consumed: false; reason: "replay" | "capacity" };

export interface InternalReplayConsumeInput {
  nonce: string;
  expiresAtUnixSeconds: number;
  nowUnixSeconds: number;
}

/**
 * The consume operation must be atomic across all callers. A distributed
 * implementation should use an insert-if-absent primitive with a TTL (for
 * example, Redis SET NX EX) and must fail closed when its backend is down.
 */
export interface InternalReplayStore {
  consume(
    input: InternalReplayConsumeInput,
  ): Promise<InternalReplayConsumeResult>;
}

export interface ProcessLocalInternalReplayStoreOptions {
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 10_000;

/**
 * Bounded, process-local replay protection for a single application instance.
 * It does not coordinate across processes and loses state on restart, so a
 * distributed InternalReplayStore is required for multi-instance deployment.
 * The store never evicts a live nonce: it fails closed when capacity is full.
 */
export class ProcessLocalInternalReplayStore implements InternalReplayStore {
  private readonly entries = new Map<string, number>();

  private readonly maxEntries: number;

  constructor(options: ProcessLocalInternalReplayStoreOptions = {}) {
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new TypeError("maxEntries must be a positive safe integer");
    }
    this.maxEntries = maxEntries;
  }

  get size(): number {
    return this.entries.size;
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

    this.removeExpired(nowUnixSeconds);

    if (this.entries.has(nonce)) {
      return { consumed: false, reason: "replay" };
    }
    if (this.entries.size >= this.maxEntries) {
      return { consumed: false, reason: "capacity" };
    }

    this.entries.set(nonce, expiresAtUnixSeconds);
    return { consumed: true };
  }

  private removeExpired(nowUnixSeconds: number): void {
    for (const [nonce, expiresAtUnixSeconds] of this.entries) {
      if (expiresAtUnixSeconds <= nowUnixSeconds) {
        this.entries.delete(nonce);
      }
    }
  }
}
