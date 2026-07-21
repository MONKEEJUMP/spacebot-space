export const AGENT_RELATIONSHIP_DEFAULT_LIMIT = 25;
export const AGENT_RELATIONSHIP_MAX_LIMIT = 100;

export type AgentRelationshipView =
  | "all"
  | "following"
  | "followers"
  | "mutual";

export class AgentRelationshipValidationError extends Error {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = "AgentRelationshipValidationError";
    this.field = field;
  }
}

export function normalizeRelationshipTarget(value: unknown): string {
  if (typeof value !== "string") {
    throw new AgentRelationshipValidationError(
      "resident name must be a string",
      "name",
    );
  }
  const name = value.trim();
  if (!name || name.length > 50) {
    throw new AgentRelationshipValidationError(
      "resident name must contain 1 to 50 characters",
      "name",
    );
  }
  return name;
}

export function normalizeRelationshipView(
  value: string | null,
): AgentRelationshipView {
  if (value === null || value === "") return "all";
  if (
    value === "all" ||
    value === "following" ||
    value === "followers" ||
    value === "mutual"
  ) {
    return value;
  }
  throw new AgentRelationshipValidationError(
    "view must be all, following, followers, or mutual",
    "view",
  );
}

export function normalizeRelationshipLimit(value: string | null): number {
  if (value === null || value === "") return AGENT_RELATIONSHIP_DEFAULT_LIMIT;
  const limit = Number(value);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > AGENT_RELATIONSHIP_MAX_LIMIT
  ) {
    throw new AgentRelationshipValidationError(
      `limit must be an integer from 1 to ${AGENT_RELATIONSHIP_MAX_LIMIT}`,
      "limit",
    );
  }
  return limit;
}

export function normalizeRelationshipOffset(value: string | null): number {
  if (value === null || value === "") return 0;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) {
    throw new AgentRelationshipValidationError(
      "offset must be an integer from 0 to 10000",
      "offset",
    );
  }
  return offset;
}
