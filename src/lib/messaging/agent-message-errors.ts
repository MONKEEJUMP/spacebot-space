export class AgentMessageServiceError extends Error {
  readonly kind: "not_found" | "conflict";

  constructor(kind: "not_found" | "conflict", message: string) {
    super(message);
    this.name = "AgentMessageServiceError";
    this.kind = kind;
  }
}
