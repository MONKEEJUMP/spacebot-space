import type { DorylusCycleResult } from "../../../dorylus/types";

export const PUBLIC_CHAT_MAX_MESSAGE_LENGTH = 100_000 as const;

export type PublicChatStatus = 200 | 400 | 401 | 404 | 409 | 429 | 500;

export interface PublicChatHttpResponse<Status extends PublicChatStatus, Body> {
  readonly status: Status;
  readonly body: Body;
}

export interface PublicChatErrorBody {
  readonly success: false;
  readonly error: string;
}

export interface PublicChatRateLimitBody extends PublicChatErrorBody {
  readonly retryAfter: number;
}

export interface PublicChatMetrics {
  readonly totalCycleMs: number;
  readonly totalTokens: number;
  readonly wingmenCompleted: number;
}

export interface PublicChatSuccessBody {
  readonly success: true;
  readonly message_id: string;
  readonly response: string;
  readonly botName: string;
  readonly conversationId: string;
  readonly queryId: string;
  readonly metrics: PublicChatMetrics;
}

export interface PublicChatDorylusErrorBody {
  readonly success: false;
  readonly response: string;
  readonly error: string;
  readonly botName: string;
  readonly conversationId: string;
  readonly queryId: string;
  readonly metrics: PublicChatMetrics;
}

export type PublicChatStaticErrorCode =
  | "invalid_json"
  | "missing_bot_name"
  | "missing_message"
  | "authentication_required"
  | "bot_not_found_or_inactive"
  | "user_message_persistence_failed"
  | "unexpected_error";

const STATIC_ERROR_DEFINITIONS = {
  invalid_json: { status: 400, error: "Invalid JSON body" },
  missing_bot_name: { status: 400, error: "Missing botName" },
  missing_message: { status: 400, error: "Missing message" },
  authentication_required: {
    status: 401,
    error: "Authentication required. Please sign in.",
  },
  bot_not_found_or_inactive: {
    status: 404,
    error: "Bot not found or inactive",
  },
  user_message_persistence_failed: {
    status: 500,
    error: "Unable to save your message right now.",
  },
  unexpected_error: {
    status: 500,
    error: "An unexpected error occurred. Please try again.",
  },
} as const satisfies Record<
  PublicChatStaticErrorCode,
  { readonly status: PublicChatStatus; readonly error: string }
>;

type StaticErrorDefinitions = typeof STATIC_ERROR_DEFINITIONS;

export type PublicChatStaticErrorResponse<
  Code extends PublicChatStaticErrorCode = PublicChatStaticErrorCode,
> = Code extends PublicChatStaticErrorCode
  ? PublicChatHttpResponse<
      StaticErrorDefinitions[Code]["status"],
      {
        readonly success: false;
        readonly error: StaticErrorDefinitions[Code]["error"];
      }
    >
  : never;

export function presentPublicChatStaticError<
  Code extends PublicChatStaticErrorCode,
>(code: Code): PublicChatStaticErrorResponse<Code> {
  const definition = STATIC_ERROR_DEFINITIONS[code];
  return {
    status: definition.status,
    body: {
      success: false,
      error: definition.error,
    },
  } as PublicChatStaticErrorResponse<Code>;
}

export function presentPublicChatRateLimit(
  retryAfter: number,
): PublicChatHttpResponse<429, PublicChatRateLimitBody> {
  return {
    status: 429,
    body: {
      success: false,
      error: `Rate limited. Please wait ${retryAfter} seconds before sending another message.`,
      retryAfter,
    },
  };
}

export function presentPublicChatConflict(
  error: string,
): PublicChatHttpResponse<409, PublicChatErrorBody> {
  return { status: 409, body: { success: false, error } };
}

export interface PublicChatBodyFields {
  readonly botName?: unknown;
  readonly message?: unknown;
}

export type PublicChatBodyDecision =
  | {
      readonly accepted: true;
      readonly value: {
        readonly botName: string;
        readonly message: string;
      };
    }
  | {
      readonly accepted: false;
      readonly response: PublicChatStaticErrorResponse;
    };

/** Mirrors the route's field-check order after JSON parsing succeeds. */
export function characterizePublicChatBody(
  body: PublicChatBodyFields,
): PublicChatBodyDecision {
  if (typeof body.botName !== "string" || !body.botName.trim()) {
    return {
      accepted: false,
      response: presentPublicChatStaticError("missing_bot_name"),
    };
  }

  if (typeof body.message !== "string" || !body.message.trim()) {
    return {
      accepted: false,
      response: presentPublicChatStaticError("missing_message"),
    };
  }

  return {
    accepted: true,
    value: {
      botName: body.botName.trim(),
      message: body.message.trim().slice(0, PUBLIC_CHAT_MAX_MESSAGE_LENGTH),
    },
  };
}

export type PublicChatTargetResolution<Target> =
  | { readonly availability: "active"; readonly target: Target }
  | { readonly availability: "unknown" | "inactive" };

export type PublicChatTargetDecision<Target> =
  | {
      readonly accepted: true;
      readonly next: "begin_side_effects";
      readonly target: Target;
    }
  | {
      readonly accepted: false;
      readonly next: "respond";
      readonly response: PublicChatStaticErrorResponse<"bot_not_found_or_inactive">;
    };

/**
 * Security admission boundary: callers must obtain this decision before
 * conversation, memory, persistence, or Dorylus work begins.
 */
export function decidePublicChatTarget<Target>(
  resolution: PublicChatTargetResolution<Target>,
): PublicChatTargetDecision<Target> {
  if (resolution.availability === "active") {
    return {
      accepted: true,
      next: "begin_side_effects",
      target: resolution.target,
    };
  }

  return {
    accepted: false,
    next: "respond",
    response: presentPublicChatStaticError("bot_not_found_or_inactive"),
  };
}

type DorylusPresentationFields = Omit<
  Pick<
    DorylusCycleResult,
    | "queryId"
    | "botName"
    | "totalCycleMs"
    | "totalTokens"
    | "status"
    | "errorMessage"
    | "wingmanResults"
  >,
  "wingmanResults"
>;

export type PublicChatDorylusPresentationSource = DorylusPresentationFields & {
  readonly wingmanResults: ReadonlyArray<
    Pick<DorylusCycleResult["wingmanResults"][number], "status">
  >;
};

function presentMetrics(
  result: PublicChatDorylusPresentationSource,
): PublicChatMetrics {
  return {
    totalCycleMs: result.totalCycleMs,
    totalTokens: result.totalTokens,
    wingmenCompleted: result.wingmanResults.filter(
      (wingman) => wingman.status === "complete",
    ).length,
  };
}

export function presentPublicChatSuccess(input: {
  readonly messageId: string;
  readonly response: string;
  readonly conversationId: string;
  readonly result: PublicChatDorylusPresentationSource & {
    readonly status: "complete";
  };
}): PublicChatHttpResponse<200, PublicChatSuccessBody> {
  return {
    status: 200,
    body: {
      success: true,
      message_id: input.messageId,
      response: input.response,
      botName: input.result.botName,
      conversationId: input.conversationId,
      queryId: input.result.queryId,
      metrics: presentMetrics(input.result),
    },
  };
}

export function presentPublicChatDorylusError(input: {
  readonly response: string;
  readonly conversationId: string;
  readonly result: PublicChatDorylusPresentationSource & {
    readonly status: "error";
  };
}): PublicChatHttpResponse<200, PublicChatDorylusErrorBody> {
  return {
    status: 200,
    body: {
      success: false,
      response: input.response,
      error: input.result.errorMessage || "LUCY cycle encountered an error",
      botName: input.result.botName,
      conversationId: input.conversationId,
      queryId: input.result.queryId,
      metrics: presentMetrics(input.result),
    },
  };
}
