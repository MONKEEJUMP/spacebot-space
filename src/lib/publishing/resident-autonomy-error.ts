export type ResidentAutonomySuppressionCode =
  | "daily_limit"
  | "minimum_interval"
  | "duplicate_content"
  | "target_unavailable";

export class ResidentAutonomySuppressedError extends Error {
  constructor(
    public readonly code: ResidentAutonomySuppressionCode,
    message: string,
  ) {
    super(message);
    this.name = "ResidentAutonomySuppressedError";
  }
}
