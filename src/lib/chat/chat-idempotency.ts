import crypto from "crypto";

export class ChatIdempotencyKeyError extends Error {
  readonly status = 400;

  constructor() {
    super("Invalid Idempotency-Key header");
    this.name = "ChatIdempotencyKeyError";
  }
}

function deterministicUuid(value: string): string {
  const hex = crypto.createHash("sha256").update(value).digest("hex");
  const variant = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(
    13,
    16,
  )}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function buildChatCycleIds(options: {
  idempotencyKey: string | null;
  actorPrincipalType: "human" | "agent";
  actorPrincipalId: string;
}): { requestId: string; turnId: string; isIdempotent: boolean } {
  if (
    options.idempotencyKey !== null &&
    !/^[A-Za-z0-9._:-]{1,128}$/.test(options.idempotencyKey)
  ) {
    throw new ChatIdempotencyKeyError();
  }
  if (!options.idempotencyKey) {
    return {
      requestId: crypto.randomUUID(),
      turnId: crypto.randomUUID(),
      isIdempotent: false,
    };
  }
  const scope = [
    options.actorPrincipalType,
    options.actorPrincipalId,
    options.idempotencyKey,
  ].join(":");
  return {
    requestId: deterministicUuid(`request:${scope}`),
    turnId: deterministicUuid(`turn:${scope}`),
    isIdempotent: true,
  };
}
