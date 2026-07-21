import crypto from "crypto";
import {
  resolveCanonicalChatTargetByAgentId,
  type CanonicalChatTarget,
} from "@/lib/chat/chat-target-resolver";
import {
  getLegacyChatMemoryScope,
  saveCanonicalUserMessage,
} from "@/lib/chat/chat-conversation-repository";
import {
  buildPromptWithinExperienceQuarantine,
  establishPublicChatExperienceQuarantine,
} from "@/lib/experience/public-chat-quarantine";
import { logger } from "@/lib/logger";
import { remeClient, type MemoryRecord } from "@/lib/memory/reme-client";
import {
  buildCanonicalWorkspaceId,
  buildWorkspaceId,
  isMemoryEnabled,
} from "@/lib/memory/workspace";
import { executeDorylusCycle } from "../../../dorylus";
import { buildSystemPrompt } from "../../../dorylus/personality";
import { sanitizeBotResponse } from "../../../dorylus/sanitize";
import type { BotConfig, DorylusCycleResult } from "../../../dorylus/types";
import {
  LUCY_CYCLE_SCHEMA_VERSION,
  validateLucyCycleExchange,
  validateLucyCycleInput,
  type LucyCycleInput,
  type LucyCycleOutput,
} from "./cycle-contract";
import {
  assertCanonicalConversationScope,
  commitSuccessfulLucyCycle,
  completeLucyCycle,
  hashLucyCycleInput,
  LucyCycleConflictError,
  markLucyCycleRunning,
  renewLucyCycleLease,
  reserveLucyCycle,
  type ReservedLucyCycle,
} from "./cycle-repository";

const MEMORY_TOP_K = 5;
const MEMORY_READ_TIMEOUT_MS = 1_500;

export interface LucyCycleClient {
  execute(
    input: LucyCycleInput,
    options?: { signal?: AbortSignal },
  ): Promise<LucyCycleOutput>;
}

export class LucyUserMessagePersistenceError extends Error {
  readonly status = 500;

  constructor() {
    super("Unable to save your message right now.");
    this.name = "LucyUserMessagePersistenceError";
  }
}

function toBotConfig(target: CanonicalChatTarget): BotConfig {
  return {
    id: target.config.id,
    botName: target.config.botName,
    displayName: target.config.displayName,
    botType: target.config.botType,
    space: target.config.space,
    tagline: target.config.tagline,
    specialty: target.config.specialty,
    personality: target.config.personality,
    systemPrompt: target.config.systemPrompt,
    sopText: target.config.sopText,
    modelPreference: target.config.modelPreference ?? "default",
    temperature: target.config.temperature ?? 0.3,
    isActive: true,
    isFounding: target.config.isFounding,
  };
}

async function readPrivateMemories(
  workspaceIds: readonly string[],
  message: string,
): Promise<MemoryRecord[]> {
  if (!isMemoryEnabled()) return [];
  try {
    const settlements = await Promise.race([
      Promise.allSettled(
        workspaceIds.map((workspaceId) =>
          remeClient.read(workspaceId, message, MEMORY_TOP_K),
        ),
      ),
      new Promise<PromiseSettledResult<MemoryRecord[]>[]>((_, reject) => {
        setTimeout(
          () => reject(new Error("memory read timeout")),
          MEMORY_READ_TIMEOUT_MS,
        );
      }),
    ]);
    const unique = new Map<string, MemoryRecord>();
    const memories = settlements.flatMap((settlement) =>
      settlement.status === "fulfilled" ? settlement.value : [],
    );
    for (const memory of memories) {
      const key = memory.content?.trim();
      if (key && !unique.has(key)) unique.set(key, memory);
    }
    return [...unique.values()].slice(0, MEMORY_TOP_K);
  } catch (error) {
    logger.warn("Canonical chat memory read failed", {
      phase: "lucy.coordinator.memory.read",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function augmentWithMemories(
  message: string,
  memories: MemoryRecord[],
): string {
  const remembered = memories
    .map((memory) => memory.content?.trim())
    .filter((content): content is string => Boolean(content))
    .slice(0, MEMORY_TOP_K);
  if (remembered.length === 0) return message;
  return `[Relevant memories from past conversations]\n${remembered
    .map((item) => `- ${item}`)
    .join("\n")}\n\n[Current message]\n${message}`;
}

function augmentWithHistory(input: LucyCycleInput): string {
  if (input.history.length === 0) return input.message;
  const history = input.history
    .map(
      (item) =>
        `${item.role === "user" ? "User" : "Assistant"}: ${item.message}`,
    )
    .join("\n");
  return `[Recent conversation]\n${history}\n\n[Current message]\n${input.message}`;
}

function writePrivateMemory(
  workspaceId: string,
  input: LucyCycleInput,
  assistantMessage: string,
  queryId: string,
): void {
  if (!isMemoryEnabled()) return;
  const body = `User: ${input.message}\nAssistant: ${assistantMessage}`.slice(
    0,
    50_000,
  );
  remeClient
    .write(workspaceId, body, {
      engine: "dorylus",
      queryId,
      conversationId: input.conversation_id,
      actorPrincipalType: input.actor.principal_type,
      actorPrincipalId: input.actor.principal_id,
      targetAgentId: input.target_agent_id,
    })
    .catch((error) => {
      logger.warn("Canonical chat memory write failed", {
        phase: "lucy.coordinator.memory.write",
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

function outputFromEngine(
  input: LucyCycleInput,
  cycleId: string,
  result: DorylusCycleResult,
  message: string,
): LucyCycleOutput {
  const failed = result.status === "error";
  return {
    schema_version: LUCY_CYCLE_SCHEMA_VERSION,
    request_id: input.request_id,
    cycle_id: cycleId,
    turn_id: input.turn_id,
    target_agent_id: input.target_agent_id,
    conversation_id: input.conversation_id,
    status: failed ? "failed" : "completed",
    message,
    evidence: [
      {
        evidence_id: crypto.randomUUID(),
        kind: "input",
        source_ref: "request.message",
        summary:
          "The authenticated cycle input was available to the cognition engine.",
        verified: true,
      },
    ],
    degradation: { active: false, reasons: [] },
    usage: {
      input_tokens: result.totalTokensIn,
      output_tokens: result.totalTokensOut,
      total_tokens: result.totalTokens,
      provider_calls: Math.min(32, result.wingmanResults.length + 2),
      duration_ms: result.totalCycleMs,
    },
    engine: {
      query_id: result.queryId || `cycle:${cycleId}`,
      name: "dorylus",
      completed_worker_count: result.wingmanResults.filter(
        (item) => item.status === "complete",
      ).length,
    },
    version: {
      contract: LUCY_CYCLE_SCHEMA_VERSION,
      cognition: "dorylus-adapter-v1",
      provider: null,
    },
    errors: failed
      ? [
          {
            code: "dependency_error",
            safe_message:
              "The cognition cycle could not complete. Please try again.",
            retryable: false,
          },
        ]
      : [],
  };
}

function unexpectedFailureOutput(
  input: LucyCycleInput,
  cycleId: string,
): LucyCycleOutput {
  return {
    schema_version: LUCY_CYCLE_SCHEMA_VERSION,
    request_id: input.request_id,
    cycle_id: cycleId,
    turn_id: input.turn_id,
    target_agent_id: input.target_agent_id,
    conversation_id: input.conversation_id,
    status: "failed",
    message: "I could not complete that request. Please try again.",
    evidence: [],
    degradation: { active: false, reasons: [] },
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      provider_calls: 0,
      duration_ms: 0,
    },
    engine: {
      query_id: `cycle:${cycleId}`,
      name: "lucy-coordinator",
      completed_worker_count: 0,
    },
    version: {
      contract: LUCY_CYCLE_SCHEMA_VERSION,
      cognition: "lucy-coordinator-v1",
      provider: null,
    },
    errors: [
      {
        code: "internal_error",
        safe_message:
          "The cognition cycle could not complete. Please try again.",
        retryable: false,
      },
    ],
  };
}

export type ExternalLucyCycleLease = Readonly<{
  input: LucyCycleInput;
  cycleId: string;
  leaseOwner: string;
  workspaceId: string;
}>;

function assertReservationMatchesInput(
  input: LucyCycleInput,
  reservation: ReservedLucyCycle,
): void {
  if (reservation.inputHash !== hashLucyCycleInput(input)) {
    throw new LucyCycleConflictError(
      "Cycle reservation does not match this request.",
    );
  }
}

export interface LucyCycleLeaseHeartbeat {
  assertHealthy(): Promise<void>;
  stop(): Promise<void>;
}

function startLucyCycleLeaseHeartbeat(
  input: LucyCycleInput,
  reservation: ReservedLucyCycle,
): LucyCycleLeaseHeartbeat {
  const leaseDurationMs = input.deadline_ms + 30_000;
  const intervalMs = Math.min(
    15_000,
    Math.max(1_000, Math.floor(leaseDurationMs / 3)),
  );
  let failure: unknown = null;
  let pending = Promise.resolve();
  const timer = setInterval(() => {
    if (failure) return;
    pending = pending
      .then(() =>
        renewLucyCycleLease(
          reservation.cycleId,
          reservation.leaseOwner,
          leaseDurationMs,
        ),
      )
      .catch((error) => {
        failure = error;
      });
  }, intervalMs);

  return {
    async assertHealthy() {
      await pending;
      if (failure) {
        throw failure instanceof Error ? failure : new Error(String(failure));
      }
    },
    async stop() {
      clearInterval(timer);
      await pending;
    },
  };
}

async function activateExternalLucyCycle(
  input: LucyCycleInput,
  reservation: ReservedLucyCycle,
): Promise<{ kind: "active"; lease: ExternalLucyCycleLease }> {
  assertReservationMatchesInput(input, reservation);
  const { cycleId, leaseOwner } = reservation;
  await markLucyCycleRunning(cycleId, leaseOwner);
  try {
    await saveCanonicalUserMessage(
      input.conversation_id,
      input.message,
      input.turn_id,
    );
  } catch (error) {
    const failed = unexpectedFailureOutput(input, cycleId);
    await completeLucyCycle(cycleId, leaseOwner, failed);
    throw new LucyUserMessagePersistenceError();
  }
  return {
    kind: "active",
    lease: Object.freeze({
      input,
      cycleId,
      leaseOwner,
      workspaceId: buildCanonicalWorkspaceId({
        targetAgentId: input.target_agent_id,
        actorPrincipalType: input.actor.principal_type,
        actorPrincipalId: input.actor.principal_id,
        conversationId: input.conversation_id,
      }),
    }),
  };
}

export async function beginExternalLucyCycle(
  rawInput: unknown,
): Promise<
  | { kind: "active"; lease: ExternalLucyCycleLease }
  | { kind: "replay"; output: LucyCycleOutput }
> {
  const validated = validateLucyCycleInput(rawInput);
  if (!validated.success) {
    throw new TypeError(
      validated.errors.map((error) => error.safe_message).join(" "),
    );
  }
  const input = validated.data;
  await resolveCanonicalChatTargetByAgentId(input.target_agent_id);
  await assertCanonicalConversationScope(input);
  const reservation = await reserveLucyCycle(input);
  if (reservation.kind === "replay") {
    return { kind: "replay", output: reservation.output };
  }
  return activateExternalLucyCycle(input, reservation);
}

export async function beginReservedExternalLucyCycle(
  rawInput: unknown,
  reservation: ReservedLucyCycle,
): Promise<{ kind: "active"; lease: ExternalLucyCycleLease }> {
  const validated = validateLucyCycleInput(rawInput);
  if (!validated.success) {
    throw new TypeError(
      validated.errors.map((error) => error.safe_message).join(" "),
    );
  }
  const input = validated.data;
  await resolveCanonicalChatTargetByAgentId(input.target_agent_id);
  await assertCanonicalConversationScope(input);
  return activateExternalLucyCycle(input, reservation);
}

export async function completeExternalLucyCycle(options: {
  lease: ExternalLucyCycleLease;
  engineName: string;
  queryId: string;
  message: string;
  durationMs: number;
  completedWorkerCount?: number;
  sources?: readonly string[];
  metadata?: Record<string, unknown>;
}): Promise<LucyCycleOutput> {
  const { input, cycleId, leaseOwner, workspaceId } = options.lease;
  await renewLucyCycleLease(cycleId, leaseOwner, input.deadline_ms + 30_000);
  const output: LucyCycleOutput = {
    schema_version: LUCY_CYCLE_SCHEMA_VERSION,
    request_id: input.request_id,
    cycle_id: cycleId,
    turn_id: input.turn_id,
    target_agent_id: input.target_agent_id,
    conversation_id: input.conversation_id,
    status: "completed",
    message: options.message,
    evidence: (options.sources ?? []).slice(0, 16).map((source) => ({
      evidence_id: crypto.randomUUID(),
      kind: "retrieval" as const,
      source_ref: source.slice(0, 512),
      summary: "A source was returned by the external research engine.",
      verified: false,
    })),
    degradation: { active: false, reasons: [] },
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      provider_calls: 1,
      duration_ms: options.durationMs,
    },
    engine: {
      query_id: options.queryId,
      name: options.engineName,
      completed_worker_count: options.completedWorkerCount ?? 0,
    },
    version: {
      contract: LUCY_CYCLE_SCHEMA_VERSION,
      cognition: "external-engine-adapter-v1",
      provider: null,
    },
    errors: [],
  };
  const exchange = validateLucyCycleExchange(input, output);
  if (!exchange.success) {
    throw new Error("External cognition output failed contract validation.");
  }
  await commitSuccessfulLucyCycle({
    cycleId,
    leaseOwner,
    output,
    assistant: {
      conversationId: input.conversation_id,
      content: options.message,
      modelUsed: options.engineName,
      latencyMs: options.durationMs,
      metadata: {
        cycleId,
        queryId: options.queryId,
        contract: LUCY_CYCLE_SCHEMA_VERSION,
        ...options.metadata,
      },
    },
  });
  writePrivateMemory(workspaceId, input, options.message, options.queryId);
  return output;
}

export async function failExternalLucyCycle(
  lease: ExternalLucyCycleLease,
): Promise<LucyCycleOutput> {
  await renewLucyCycleLease(
    lease.cycleId,
    lease.leaseOwner,
    lease.input.deadline_ms + 30_000,
  );
  const output = unexpectedFailureOutput(lease.input, lease.cycleId);
  await completeLucyCycle(lease.cycleId, lease.leaseOwner, output);
  return output;
}

async function runReservedLucyCycle(
  input: LucyCycleInput,
  target: CanonicalChatTarget,
  reservation: ReservedLucyCycle,
  options: { signal?: AbortSignal } = {},
): Promise<LucyCycleOutput> {
  assertReservationMatchesInput(input, reservation);
  const { cycleId, leaseOwner } = reservation;
  let leaseHeartbeat: ReturnType<typeof startLucyCycleLeaseHeartbeat> | null =
    null;
  try {
    if (options.signal?.aborted)
      throw new Error("Cycle aborted before execution.");
    await markLucyCycleRunning(cycleId, leaseOwner);
    leaseHeartbeat = startLucyCycleLeaseHeartbeat(input, reservation);

    const workspaceId = buildCanonicalWorkspaceId({
      targetAgentId: input.target_agent_id,
      actorPrincipalType: input.actor.principal_type,
      actorPrincipalId: input.actor.principal_id,
      conversationId: input.conversation_id,
    });
    const legacyScope = await getLegacyChatMemoryScope(input.conversation_id);
    const memoryWorkspaces = [workspaceId];
    if (legacyScope) {
      const legacyWorkspaceId = buildWorkspaceId(
        legacyScope.botKey,
        legacyScope.authUserId,
      );
      if (legacyWorkspaceId !== workspaceId)
        memoryWorkspaces.push(legacyWorkspaceId);
    }
    const memories = await readPrivateMemories(memoryWorkspaces, input.message);
    const boundary = establishPublicChatExperienceQuarantine("chat");
    logger.info("Public chat shared experience quarantine enforced", {
      phase: "lucy.coordinator.experience.quarantine",
      route: boundary.route,
      mode: boundary.mode,
      sharedReadEnabled: boundary.sharedReadEnabled,
      sharedWriteEnabled: boundary.sharedWriteEnabled,
    });
    const engineMessage = buildPromptWithinExperienceQuarantine(
      boundary,
      augmentWithMemories(augmentWithHistory(input), memories),
    );

    try {
      await saveCanonicalUserMessage(
        input.conversation_id,
        input.message,
        input.turn_id,
      );
    } catch (error) {
      logger.error("Canonical chat user-message persistence failed", {
        phase: "lucy.coordinator.persist.user",
        cycleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new LucyUserMessagePersistenceError();
    }
    const botConfig = toBotConfig(target);
    const result = await executeDorylusCycle({
      userId: `${input.actor.principal_type}:${input.actor.principal_id}`,
      botName: target.config.botName,
      botSpace: target.config.space,
      originalQuery: engineMessage,
      botSystemPrompt: buildSystemPrompt(botConfig),
      temperature: botConfig.temperature,
    });
    const message = sanitizeBotResponse(result.finalResponse);
    const output = outputFromEngine(input, cycleId, result, message);
    const exchange = validateLucyCycleExchange(input, output);
    if (!exchange.success)
      throw new Error("Cognition output failed contract validation.");

    if (result.status === "complete") {
      await leaseHeartbeat.assertHealthy();
      await commitSuccessfulLucyCycle({
        cycleId,
        leaseOwner,
        output,
        assistant: {
          conversationId: input.conversation_id,
          content: message,
          modelUsed: "dorylus",
          latencyMs: result.totalCycleMs,
          metadata: {
            cycleId,
            queryId: result.queryId,
            contract: LUCY_CYCLE_SCHEMA_VERSION,
            totalTokens: result.totalTokens,
            completedWorkers: output.engine.completed_worker_count,
          },
        },
      });
      writePrivateMemory(workspaceId, input, message, result.queryId);
      return output;
    }

    await leaseHeartbeat.assertHealthy();
    await completeLucyCycle(cycleId, leaseOwner, output);
    return output;
  } catch (error) {
    logger.error("LUCY coordinator cycle failed", {
      phase: "lucy.coordinator",
      cycleId,
      requestId: input.request_id,
      turnId: input.turn_id,
      targetAgentId: input.target_agent_id,
      error: error instanceof Error ? error.message : String(error),
    });
    const output = unexpectedFailureOutput(input, cycleId);
    if (leaseHeartbeat) await leaseHeartbeat.assertHealthy();
    await completeLucyCycle(cycleId, leaseOwner, output);
    if (error instanceof LucyUserMessagePersistenceError) throw error;
    return output;
  } finally {
    await leaseHeartbeat?.stop();
  }
}

export async function renewExternalLucyCycle(
  lease: ExternalLucyCycleLease,
): Promise<void> {
  await renewLucyCycleLease(
    lease.cycleId,
    lease.leaseOwner,
    lease.input.deadline_ms + 30_000,
  );
}

export function startExternalLucyCycleLeaseHeartbeat(
  lease: ExternalLucyCycleLease,
): LucyCycleLeaseHeartbeat {
  return startLucyCycleLeaseHeartbeat(lease.input, {
    kind: "reserved",
    cycleId: lease.cycleId,
    inputHash: hashLucyCycleInput(lease.input),
    leaseOwner: lease.leaseOwner,
  });
}

export async function executeReservedLucyCycle(
  rawInput: unknown,
  reservation: ReservedLucyCycle,
  options: { signal?: AbortSignal } = {},
): Promise<LucyCycleOutput> {
  const validated = validateLucyCycleInput(rawInput);
  if (!validated.success) {
    throw new TypeError(
      validated.errors.map((error) => error.safe_message).join(" "),
    );
  }
  const input = validated.data;
  const target = await resolveCanonicalChatTargetByAgentId(
    input.target_agent_id,
  );
  await assertCanonicalConversationScope(input);
  return runReservedLucyCycle(input, target, reservation, options);
}

export async function executeLucyCycle(
  rawInput: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<LucyCycleOutput> {
  const validated = validateLucyCycleInput(rawInput);
  if (!validated.success) {
    throw new TypeError(
      validated.errors.map((error) => error.safe_message).join(" "),
    );
  }
  const input = validated.data;
  const target = await resolveCanonicalChatTargetByAgentId(
    input.target_agent_id,
  );
  await assertCanonicalConversationScope(input);
  const reservation = await reserveLucyCycle(input);
  if (reservation.kind === "replay") {
    const exchange = validateLucyCycleExchange(input, reservation.output);
    if (!exchange.success)
      throw new Error("Stored cycle output failed contract validation.");
    return exchange.data.output;
  }
  return runReservedLucyCycle(input, target, reservation, options);
}

export const inProcessLucyCycleClient: LucyCycleClient = Object.freeze({
  execute: executeLucyCycle,
});
