import { z } from "zod";

export const LUCY_CYCLE_SCHEMA_VERSION = "2.0.0" as const;

export const LUCY_CYCLE_LIMITS = {
  messageCharacters: 100_000,
  historyEntries: 24,
  historyMessageCharacters: 4_000,
  deadlineMilliseconds: {
    min: 250,
    max: 120_000,
  },
  evidenceEntries: 16,
  degradationReasons: 8,
  safeErrors: 8,
  completedWorkers: 256,
} as const;

const canonicalUuidSchema = z
  .string()
  .uuid()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    "Must be a canonical lowercase UUID",
  );

const correlationIdSchema = z.string().uuid();

export const LucyCycleStatusSchema = z.enum([
  "completed",
  "partial",
  "blocked",
  "refused",
  "failed",
]);

export const LucyHistoryMessageSchema = z
  .object({
    turn_id: correlationIdSchema,
    role: z.enum(["user", "assistant"]),
    message: z.string().min(1).max(LUCY_CYCLE_LIMITS.historyMessageCharacters),
  })
  .strict();

export const LucyActorSchema = z
  .object({
    principal_type: z.enum(["human", "agent", "system"]),
    principal_id: canonicalUuidSchema,
  })
  .strict();

export const LucyCycleInputSchema = z
  .object({
    schema_version: z.literal(LUCY_CYCLE_SCHEMA_VERSION),
    request_id: correlationIdSchema,
    turn_id: correlationIdSchema,
    target_agent_id: canonicalUuidSchema,
    conversation_id: canonicalUuidSchema,
    actor: LucyActorSchema,
    message: z.string().min(1).max(LUCY_CYCLE_LIMITS.messageCharacters),
    history: z
      .array(LucyHistoryMessageSchema)
      .max(LUCY_CYCLE_LIMITS.historyEntries),
    deadline_ms: z
      .number()
      .int()
      .min(LUCY_CYCLE_LIMITS.deadlineMilliseconds.min)
      .max(LUCY_CYCLE_LIMITS.deadlineMilliseconds.max),
  })
  .strict();

export const LucyEvidenceSchema = z
  .object({
    evidence_id: correlationIdSchema,
    kind: z.enum(["input", "memory", "retrieval", "tool", "policy"]),
    source_ref: z.string().min(1).max(512),
    summary: z.string().min(1).max(1_000),
    verified: z.boolean(),
  })
  .strict();

export const LucyDegradationReasonSchema = z
  .object({
    code: z.enum([
      "deadline_pressure",
      "history_truncated",
      "evidence_unavailable",
      "dependency_unavailable",
      "policy_limited",
      "capacity_limited",
    ]),
    safe_message: z.string().min(1).max(240),
  })
  .strict();

export const LucyDegradationSchema = z
  .object({
    active: z.boolean(),
    reasons: z
      .array(LucyDegradationReasonSchema)
      .max(LUCY_CYCLE_LIMITS.degradationReasons),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.active !== value.reasons.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["active"],
        message: "active must match whether degradation reasons are present",
      });
    }
  });

export const LucySafeErrorCodeSchema = z.enum([
  "validation_error",
  "deadline_exceeded",
  "target_unavailable",
  "policy_refusal",
  "dependency_error",
  "internal_error",
]);

export const LucySafeErrorSchema = z
  .object({
    code: LucySafeErrorCodeSchema,
    safe_message: z.string().min(1).max(240),
    retryable: z.boolean(),
  })
  .strict();

export const LucyUsageSchema = z
  .object({
    input_tokens: z.number().int().min(0).max(10_000_000),
    output_tokens: z.number().int().min(0).max(10_000_000),
    total_tokens: z.number().int().min(0).max(20_000_000),
    provider_calls: z.number().int().min(0).max(32),
    duration_ms: z.number().int().min(0).max(600_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.total_tokens !== value.input_tokens + value.output_tokens) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total_tokens"],
        message: "total_tokens must equal input_tokens plus output_tokens",
      });
    }
  });

export const LucyEngineProofSchema = z
  .object({
    query_id: z
      .string()
      .min(1)
      .max(128)
      .regex(
        /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/,
        "Must be a bounded opaque engine query identifier",
      ),
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Must be a bounded engine name"),
    completed_worker_count: z
      .number()
      .int()
      .min(0)
      .max(LUCY_CYCLE_LIMITS.completedWorkers),
  })
  .strict();

export const LucyVersionSchema = z
  .object({
    contract: z.literal(LUCY_CYCLE_SCHEMA_VERSION),
    cognition: z.string().min(1).max(64),
    provider: z.string().min(1).max(64).nullable(),
  })
  .strict();

export const LucyCycleOutputSchema = z
  .object({
    schema_version: z.literal(LUCY_CYCLE_SCHEMA_VERSION),
    request_id: correlationIdSchema,
    cycle_id: correlationIdSchema,
    turn_id: correlationIdSchema,
    target_agent_id: canonicalUuidSchema,
    conversation_id: canonicalUuidSchema,
    status: LucyCycleStatusSchema,
    message: z.string().min(1).max(LUCY_CYCLE_LIMITS.messageCharacters),
    evidence: z
      .array(LucyEvidenceSchema)
      .max(LUCY_CYCLE_LIMITS.evidenceEntries),
    degradation: LucyDegradationSchema,
    usage: LucyUsageSchema,
    engine: LucyEngineProofSchema,
    version: LucyVersionSchema,
    errors: z.array(LucySafeErrorSchema).max(LUCY_CYCLE_LIMITS.safeErrors),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.status === "completed" &&
      (value.degradation.active || value.errors.length > 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "completed results cannot contain degradation or errors",
      });
    }

    if (value.status === "partial" && !value.degradation.active) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["degradation", "active"],
        message: "partial results must declare an active degradation",
      });
    }

    if (
      ["blocked", "refused", "failed"].includes(value.status) &&
      value.errors.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["errors"],
        message: `${value.status} results must include a safe error`,
      });
    }

    if (
      value.status === "refused" &&
      !value.errors.some((error) => error.code === "policy_refusal")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["errors"],
        message: "refused results must include a policy_refusal error",
      });
    }
  });

export type LucyCycleInput = z.infer<typeof LucyCycleInputSchema>;
export type LucyCycleOutput = z.infer<typeof LucyCycleOutputSchema>;
export type LucyCycleStatus = z.infer<typeof LucyCycleStatusSchema>;
export type LucySafeError = z.infer<typeof LucySafeErrorSchema>;
export type LucyEngineProof = z.infer<typeof LucyEngineProofSchema>;

export type LucyCycleExchange = {
  input: LucyCycleInput;
  output: LucyCycleOutput;
};

export type LucyValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: LucySafeError[] };

function safeIssuePath(path: Array<string | number>): string {
  const safeSegments = path.slice(0, 6).map((segment) => {
    if (typeof segment === "number") return String(segment);
    return /^[a-zA-Z0-9_]+$/.test(segment) ? segment : "field";
  });

  return safeSegments.length > 0 ? safeSegments.join(".") : "request";
}

export function toLucySafeValidationErrors(error: z.ZodError): LucySafeError[] {
  return error.issues.slice(0, LUCY_CYCLE_LIMITS.safeErrors).map((issue) => ({
    code: "validation_error",
    safe_message: `Invalid value at ${safeIssuePath(issue.path)}.`,
    retryable: false,
  }));
}

export function validateLucyCycleInput(
  input: unknown,
): LucyValidationResult<LucyCycleInput> {
  const result = LucyCycleInputSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: toLucySafeValidationErrors(result.error) };
}

export function validateLucyCycleOutput(
  output: unknown,
): LucyValidationResult<LucyCycleOutput> {
  const result = LucyCycleOutputSchema.safeParse(output);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: toLucySafeValidationErrors(result.error) };
}

const correlationFields = [
  "request_id",
  "turn_id",
  "target_agent_id",
  "conversation_id",
] as const;

export function validateLucyCycleExchange(
  input: unknown,
  output: unknown,
): LucyValidationResult<LucyCycleExchange> {
  const inputResult = validateLucyCycleInput(input);
  if (!inputResult.success) return inputResult;

  const outputResult = validateLucyCycleOutput(output);
  if (!outputResult.success) return outputResult;

  const errors = correlationFields
    .filter((field) => inputResult.data[field] !== outputResult.data[field])
    .slice(0, LUCY_CYCLE_LIMITS.safeErrors)
    .map<LucySafeError>((field) => ({
      code: "validation_error",
      safe_message: `Invalid value at output.${field}.`,
      retryable: false,
    }));

  return errors.length > 0
    ? { success: false, errors }
    : {
        success: true,
        data: { input: inputResult.data, output: outputResult.data },
      };
}
