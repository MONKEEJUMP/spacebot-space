export type ResidentTaskServiceErrorKind =
  | "authorization"
  | "not_found"
  | "conflict";

export class ResidentTaskServiceError extends Error {
  readonly kind: ResidentTaskServiceErrorKind;

  constructor(kind: ResidentTaskServiceErrorKind, message: string) {
    super(message);
    this.name = "ResidentTaskServiceError";
    this.kind = kind;
  }
}
