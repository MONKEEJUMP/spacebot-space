import { createHash } from "node:crypto";

export const AGENT_MESSAGE_MAX_LENGTH = 2_000;
export const AGENT_MESSAGE_MAX_METADATA_BYTES = 4_000;
export const AGENT_MESSAGE_MAX_PAGE_SIZE = 100;
export const AGENT_MESSAGE_DEFAULT_PAGE_SIZE = 25;

export type AgentMessageDirection = "all" | "inbox" | "sent";

export interface AgentMessageCursor {
  createdAt: string;
  id: string;
}

export class AgentMessageValidationError extends Error {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = "AgentMessageValidationError";
    this.field = field;
  }
}

export function normalizeMessageTarget(value: unknown): string {
  if (typeof value !== "string") {
    throw new AgentMessageValidationError("target must be a string", "target");
  }

  const target = value.trim();
  if (!target || target.length > 50) {
    throw new AgentMessageValidationError(
      "target must contain 1 to 50 characters",
      "target",
    );
  }
  return target;
}

export function normalizeMessageContent(value: unknown): string {
  if (typeof value !== "string") {
    throw new AgentMessageValidationError(
      "content must be a string",
      "content",
    );
  }

  const content = value.trim();
  if (!content || content.length > AGENT_MESSAGE_MAX_LENGTH) {
    throw new AgentMessageValidationError(
      `content must contain 1 to ${AGENT_MESSAGE_MAX_LENGTH} characters`,
      "content",
    );
  }
  return content;
}

export function normalizeMessageIdempotencyKey(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new AgentMessageValidationError(
      "Idempotency-Key must use 1 to 128 letters, numbers, periods, underscores, colons, or hyphens",
      "Idempotency-Key",
    );
  }
  return value;
}

export function normalizeMessageDirection(
  value: string | null,
): AgentMessageDirection {
  if (value === null || value === "") return "all";
  if (value === "all" || value === "inbox" || value === "sent") return value;
  throw new AgentMessageValidationError(
    "direction must be all, inbox, or sent",
    "direction",
  );
}

export function normalizeMessageLimit(value: string | null): number {
  if (value === null || value === "") return AGENT_MESSAGE_DEFAULT_PAGE_SIZE;
  const limit = Number(value);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > AGENT_MESSAGE_MAX_PAGE_SIZE
  ) {
    throw new AgentMessageValidationError(
      `limit must be an integer from 1 to ${AGENT_MESSAGE_MAX_PAGE_SIZE}`,
      "limit",
    );
  }
  return limit;
}

export function normalizeMessageCursor(
  value: string | null,
): AgentMessageCursor | null {
  if (value === null || value === "") return null;
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) {
    throw new AgentMessageValidationError("cursor is invalid", "cursor");
  }

  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64url").toString("utf8");
  } catch {
    throw new AgentMessageValidationError("cursor is invalid", "cursor");
  }
  const separator = decoded.lastIndexOf("|");
  const createdAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (
    separator < 1 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/.test(createdAt) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    throw new AgentMessageValidationError("cursor is invalid", "cursor");
  }
  return { createdAt, id: id.toLowerCase() };
}

export function encodeMessageCursor(cursor: AgentMessageCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString(
    "base64url",
  );
}

export function normalizeMessageMetadata(
  value: unknown,
): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new AgentMessageValidationError(
      "metadata must be a JSON object",
      "metadata",
    );
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new AgentMessageValidationError(
      "metadata must be JSON-serializable",
      "metadata",
    );
  }
  if (
    Buffer.byteLength(serialized, "utf8") > AGENT_MESSAGE_MAX_METADATA_BYTES
  ) {
    throw new AgentMessageValidationError(
      `metadata must be ${AGENT_MESSAGE_MAX_METADATA_BYTES} bytes or fewer`,
      "metadata",
    );
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalizeJson(nested)]),
    );
  }
  return value;
}

export function fingerprintAgentMessage(
  targetName: string,
  content: string,
  metadata: Record<string, unknown> = {},
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalizeJson({
          target: targetName.trim().toLowerCase(),
          content,
          metadata,
        }),
      ),
    )
    .digest("hex");
}
