export class AgentRelationshipServiceError extends Error {
  readonly kind: "not_found" | "self" | "conflict";

  constructor(kind: "not_found" | "self" | "conflict", message: string) {
    super(message);
    this.name = "AgentRelationshipServiceError";
    this.kind = kind;
  }
}
