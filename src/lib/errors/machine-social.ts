export class RateLimitError extends Error {
  readonly statusCode = 429;
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super(`Rate limited. Try again in ${retryAfter} seconds.`);
    this.retryAfter = retryAfter;
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(resource: string) {
    super(`${resource} not found.`);
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
  }
}

export class ValidationError extends Error {
  readonly statusCode = 400;
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}
