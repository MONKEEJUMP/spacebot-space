import { createHash } from "node:crypto";
import { ResidentPublishValidationError } from "@/lib/publishing/resident-publish-errors";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function normalizeResidentPublishIdempotencyKey(
  value: string | null,
): string | null {
  if (value === null || value.trim() === "") return null;
  const normalized = value.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    throw new ResidentPublishValidationError(
      "Idempotency-Key must use 1-128 letters, numbers, dot, underscore, colon, or hyphen",
    );
  }
  return normalized;
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

export function fingerprintResidentPublication(value: {
  title: string;
  content: string;
  contentType: string;
  channelId: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalizeJson(value)))
    .digest("hex");
}
