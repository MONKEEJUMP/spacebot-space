import { PUBLIC_CHAT_MAX_MESSAGE_LENGTH } from "./public-chat-contract";

const COMPLETE_WINGMAN = { status: "complete" } as const;
const ERROR_WINGMAN = { status: "error" } as const;
const TIMEOUT_WINGMAN = { status: "timeout" } as const;

export const publicChatSuccessFixture = {
  input: {
    messageId: "message-123",
    response: "Sanitized public response.",
    conversationId: "conversation-123",
    result: {
      queryId: "query-123",
      botName: "Dorylus",
      totalCycleMs: 842,
      totalTokens: 3210,
      status: "complete",
      wingmanResults: [COMPLETE_WINGMAN, ERROR_WINGMAN, COMPLETE_WINGMAN],
    },
  },
  expected: {
    status: 200,
    body: {
      success: true,
      message_id: "message-123",
      response: "Sanitized public response.",
      botName: "Dorylus",
      conversationId: "conversation-123",
      queryId: "query-123",
      metrics: {
        totalCycleMs: 842,
        totalTokens: 3210,
        wingmenCompleted: 2,
      },
    },
  },
} as const;

export const publicChatDorylusErrorFixture = {
  input: {
    response: "Safe partial response.",
    conversationId: "conversation-456",
    result: {
      queryId: "query-456",
      botName: "Dorylus",
      totalCycleMs: 1201,
      totalTokens: 987,
      status: "error",
      errorMessage: "All wingmen failed",
      wingmanResults: [ERROR_WINGMAN, TIMEOUT_WINGMAN, COMPLETE_WINGMAN],
    },
  },
  expected: {
    status: 200,
    body: {
      success: false,
      response: "Safe partial response.",
      error: "All wingmen failed",
      botName: "Dorylus",
      conversationId: "conversation-456",
      queryId: "query-456",
      metrics: {
        totalCycleMs: 1201,
        totalTokens: 987,
        wingmenCompleted: 1,
      },
    },
  },
} as const;

export const publicChatDorylusDefaultErrorFixture = {
  input: {
    response: "",
    conversationId: "conversation-789",
    result: {
      queryId: "query-789",
      botName: "Dorylus",
      totalCycleMs: 50,
      totalTokens: 0,
      status: "error",
      wingmanResults: [],
    },
  },
  expectedError: "LUCY cycle encountered an error",
} as const;

export const publicChatStaticErrorFixtures = [
  ["invalid_json", 400, "Invalid JSON body"],
  ["missing_bot_name", 400, "Missing botName"],
  ["missing_message", 400, "Missing message"],
  ["authentication_required", 401, "Authentication required. Please sign in."],
  ["bot_not_found_or_inactive", 404, "Bot not found or inactive"],
  [
    "user_message_persistence_failed",
    500,
    "Unable to save your message right now.",
  ],
  ["unexpected_error", 500, "An unexpected error occurred. Please try again."],
] as const;

export const publicChatRateLimitFixture = {
  retryAfter: 17,
  expected: {
    status: 429,
    body: {
      success: false,
      error:
        "Rate limited. Please wait 17 seconds before sending another message.",
      retryAfter: 17,
    },
  },
} as const;

export const publicChatConflictFixture = {
  error: "Idempotency-Key was reused for another request.",
  expected: {
    status: 409,
    body: {
      success: false,
      error: "Idempotency-Key was reused for another request.",
    },
  },
} as const;

export const publicChatMessageBoundaryFixtures = {
  exact: {
    botName: "Dorylus",
    message: "X".repeat(PUBLIC_CHAT_MAX_MESSAGE_LENGTH),
  },
  overflow: {
    botName: "Dorylus",
    message: `${"Y".repeat(PUBLIC_CHAT_MAX_MESSAGE_LENGTH)}DROP_ME`,
  },
} as const;

export const publicChatNormalizationFixture = {
  input: { botName: "  Dorylus  ", message: "  hello agents  " },
  expected: { botName: "Dorylus", message: "hello agents" },
} as const;

export const publicChatRejectedBodyFixtures = [
  [{ message: "hello" }, "missing_bot_name"],
  [{ botName: "Dorylus" }, "missing_message"],
  [{ botName: 42, message: "hello" }, "missing_bot_name"],
  [{ botName: "Dorylus", message: 42 }, "missing_message"],
  [{ botName: "   ", message: "hello" }, "missing_bot_name"],
  [{ botName: "Dorylus", message: "   " }, "missing_message"],
] as const;

export const publicChatTargetFixtures = [
  { availability: "unknown" },
  { availability: "inactive" },
] as const;

export const publicChatExpectedKeySets = {
  envelope: ["body", "status"],
  success: [
    "botName",
    "conversationId",
    "message_id",
    "metrics",
    "queryId",
    "response",
    "success",
  ],
  dorylusError: [
    "botName",
    "conversationId",
    "error",
    "metrics",
    "queryId",
    "response",
    "success",
  ],
  metrics: ["totalCycleMs", "totalTokens", "wingmenCompleted"],
  staticError: ["error", "success"],
  rateLimit: ["error", "retryAfter", "success"],
} as const;
