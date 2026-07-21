import { LUCY_CYCLE_LIMITS, LUCY_CYCLE_SCHEMA_VERSION } from "./cycle-contract";

function withoutKey<T extends object, K extends keyof T>(
  source: T,
  key: K,
): Omit<T, K> {
  const result = { ...source };
  Reflect.deleteProperty(result, key);
  return result;
}

const ids = {
  request_id: "11111111-1111-4111-8111-111111111111",
  turn_id: "33333333-3333-4333-8333-333333333333",
  target_agent_id: "44444444-4444-4444-8444-444444444444",
  conversation_id: "77777777-7777-4777-8777-777777777777",
} as const;

const cycleId = "22222222-2222-4222-8222-222222222222";
const engineQueryId = "99999999-9999-4999-8999-999999999999";

export const passingInputFixture = {
  schema_version: LUCY_CYCLE_SCHEMA_VERSION,
  ...ids,
  actor: {
    principal_type: "human",
    principal_id: "88888888-8888-4888-8888-888888888888",
  },
  message: "Assess the next safe cognition step.",
  history: [
    {
      turn_id: "55555555-5555-4555-8555-555555555555",
      role: "user",
      message: "Use only the supplied context.",
    },
  ],
  deadline_ms: 15_000,
};

export const successfulOutputFixture = {
  schema_version: LUCY_CYCLE_SCHEMA_VERSION,
  ...ids,
  cycle_id: cycleId,
  status: "completed",
  message: "The contract-only cognition cycle completed.",
  evidence: [
    {
      evidence_id: "66666666-6666-4666-8666-666666666666",
      kind: "input",
      source_ref: "request.message",
      summary: "The requested bounded input was available.",
      verified: true,
    },
  ],
  degradation: {
    active: false,
    reasons: [],
  },
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    provider_calls: 0,
    duration_ms: 3,
  },
  engine: {
    query_id: engineQueryId,
    name: "dorylus",
    completed_worker_count: 1,
  },
  version: {
    contract: LUCY_CYCLE_SCHEMA_VERSION,
    cognition: "route-first-foundation",
    provider: null,
  },
  errors: [],
};

export const passingOutputFixture = successfulOutputFixture;

export const errorOutputFixture = {
  ...successfulOutputFixture,
  status: "failed",
  message: "The cognition cycle could not complete safely.",
  evidence: [],
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    provider_calls: 0,
    duration_ms: 7,
  },
  engine: {
    query_id: "unknown",
    name: "dorylus",
    completed_worker_count: 0,
  },
  errors: [
    {
      code: "internal_error",
      safe_message: "The cognition cycle could not complete safely.",
      retryable: true,
    },
  ],
};

export const malformedInputFixture = {
  ...passingInputFixture,
  message: 42,
};

export const unknownEnumOutputFixture = {
  ...successfulOutputFixture,
  status: "unknown",
};

export const legacyTopLevelKeysOutputFixture = {
  ...successfulOutputFixture,
  queryId: engineQueryId,
  botName: "dorylus",
  metrics: {
    totalCycleMs: 3,
    totalTokens: 0,
    wingmenCompleted: 1,
  },
};

const missingEngineOutputFixture = withoutKey(
  successfulOutputFixture,
  "engine",
);

export { missingEngineOutputFixture };

export const malformedEngineOutputFixture = {
  ...successfulOutputFixture,
  engine: {
    ...successfulOutputFixture.engine,
    completed_worker_count: -1,
  },
};

export const oversizeInputFixture = {
  ...passingInputFixture,
  message: "S".repeat(LUCY_CYCLE_LIMITS.messageCharacters + 1),
};

const missingCanonicalTargetAgentIdFixture = withoutKey(
  passingInputFixture,
  "target_agent_id",
);

export { missingCanonicalTargetAgentIdFixture };

const missingActorFixture = withoutKey(passingInputFixture, "actor");

export { missingActorFixture };

const missingConversationIdFixture = withoutKey(
  passingInputFixture,
  "conversation_id",
);

export { missingConversationIdFixture };

export const clientAssignedCycleIdFixture = {
  ...passingInputFixture,
  cycle_id: cycleId,
};

export const nonCanonicalTargetAgentIdFixture = {
  ...passingInputFixture,
  target_agent_id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
};

export const mismatchedRequestIdOutputFixture = {
  ...successfulOutputFixture,
  request_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

export const mismatchedTurnIdOutputFixture = {
  ...successfulOutputFixture,
  turn_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

export const mismatchedTargetAgentIdOutputFixture = {
  ...successfulOutputFixture,
  target_agent_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

export const mismatchedConversationIdOutputFixture = {
  ...successfulOutputFixture,
  conversation_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};
