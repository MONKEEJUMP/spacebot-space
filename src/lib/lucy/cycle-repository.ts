import crypto from "crypto";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { chatConversations, chatMessages, db, lucyCycles } from "@/db";
import type { LucyCycleInput, LucyCycleOutput } from "./cycle-contract";

export type ReservedLucyCycle = {
  kind: "reserved";
  cycleId: string;
  inputHash: string;
  leaseOwner: string;
};

export type CycleReservation =
  | ReservedLucyCycle
  | { kind: "replay"; output: LucyCycleOutput };

export class LucyCycleConflictError extends Error {
  readonly status = 409;

  constructor(readonly safeMessage: string) {
    super(safeMessage);
    this.name = "LucyCycleConflictError";
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
      throw new TypeError("Cycle input is not JSON serializable.");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function hashLucyCycleInput(input: LucyCycleInput): string {
  // History is mutable after a turn persists. Idempotency binds the immutable
  // command identity so completed and stale retries can replay safely.
  const immutableCommand = {
    schema_version: input.schema_version,
    request_id: input.request_id,
    turn_id: input.turn_id,
    target_agent_id: input.target_agent_id,
    conversation_id: input.conversation_id,
    actor: input.actor,
    message: input.message,
    deadline_ms: input.deadline_ms,
  };
  return crypto
    .createHash("sha256")
    .update(canonicalJson(immutableCommand))
    .digest("hex");
}

export async function findLucyCycleByRequestId(requestId: string): Promise<{
  cycleId: string;
  turnId: string;
  conversationId: string;
  targetAgentId: string;
  actorPrincipalType: "human" | "agent";
  actorPrincipalId: string;
  status: string;
  inputHash: string;
  output: LucyCycleOutput | null;
} | null> {
  const rows = await db
    .select({
      cycleId: lucyCycles.id,
      turnId: lucyCycles.turnId,
      conversationId: lucyCycles.conversationId,
      targetAgentId: lucyCycles.targetAgentId,
      actorPrincipalType: lucyCycles.actorPrincipalType,
      actorPrincipalId: lucyCycles.actorPrincipalId,
      status: lucyCycles.status,
      inputHash: lucyCycles.inputHash,
      output: lucyCycles.output,
    })
    .from(lucyCycles)
    .where(eq(lucyCycles.requestId, requestId))
    .limit(1);
  if (!rows[0]) return null;
  if (
    rows[0].actorPrincipalType !== "human" &&
    rows[0].actorPrincipalType !== "agent"
  ) {
    throw new Error("Stored cycle actor principal type is invalid.");
  }
  return {
    ...rows[0],
    actorPrincipalType: rows[0].actorPrincipalType,
    output: rows[0].output as LucyCycleOutput | null,
  };
}

export async function assertCanonicalConversationScope(
  input: LucyCycleInput,
): Promise<void> {
  const rows = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.id, input.conversation_id),
        eq(chatConversations.actorPrincipalType, input.actor.principal_type),
        eq(chatConversations.actorPrincipalId, input.actor.principal_id),
        eq(chatConversations.targetAgentId, input.target_agent_id),
      ),
    )
    .limit(1);

  if (!rows[0]) {
    throw new LucyCycleConflictError(
      "Conversation scope does not match this cycle.",
    );
  }
}

export async function reserveLucyCycle(
  input: LucyCycleInput,
): Promise<CycleReservation> {
  const inputHash = hashLucyCycleInput(input);
  const leaseOwner = crypto.randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + input.deadline_ms + 30_000);
  const inserted = await db
    .insert(lucyCycles)
    .values({
      requestId: input.request_id,
      turnId: input.turn_id,
      conversationId: input.conversation_id,
      targetAgentId: input.target_agent_id,
      actorPrincipalType: input.actor.principal_type,
      actorPrincipalId: input.actor.principal_id,
      inputHash,
      status: "reserved",
      leaseOwner,
      leaseExpiresAt,
      attemptCount: 1,
    })
    .onConflictDoNothing()
    .returning({ id: lucyCycles.id });

  if (inserted[0]) {
    return { kind: "reserved", cycleId: inserted[0].id, inputHash, leaseOwner };
  }

  const existingRows = await db
    .select({
      requestId: lucyCycles.requestId,
      id: lucyCycles.id,
      turnId: lucyCycles.turnId,
      inputHash: lucyCycles.inputHash,
      leaseExpiresAt: lucyCycles.leaseExpiresAt,
      output: lucyCycles.output,
    })
    .from(lucyCycles)
    .where(
      or(
        eq(lucyCycles.requestId, input.request_id),
        eq(lucyCycles.turnId, input.turn_id),
      ),
    )
    .limit(2);

  if (
    existingRows.length !== 1 ||
    existingRows[0].requestId !== input.request_id ||
    existingRows[0].turnId !== input.turn_id ||
    existingRows[0].inputHash !== inputHash
  ) {
    throw new LucyCycleConflictError(
      "Cycle correlation identifiers were already used.",
    );
  }

  if (existingRows[0].output) {
    return {
      kind: "replay",
      output: existingRows[0].output as LucyCycleOutput,
    };
  }

  if (existingRows[0].leaseExpiresAt <= now) {
    const reclaimed = await db
      .update(lucyCycles)
      .set({
        status: "reserved",
        leaseOwner,
        leaseExpiresAt,
        attemptCount: sql`${lucyCycles.attemptCount} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(lucyCycles.id, existingRows[0].id),
          lte(lucyCycles.leaseExpiresAt, now),
          isNull(lucyCycles.output),
        ),
      )
      .returning({ id: lucyCycles.id });
    if (reclaimed[0]) {
      return {
        kind: "reserved",
        cycleId: reclaimed[0].id,
        inputHash,
        leaseOwner,
      };
    }
  }

  throw new LucyCycleConflictError("This cycle is already in progress.");
}

export async function markLucyCycleRunning(
  cycleId: string,
  leaseOwner: string,
): Promise<void> {
  const now = new Date();
  const updated = await db
    .update(lucyCycles)
    .set({ status: "running", updatedAt: now })
    .where(
      and(
        eq(lucyCycles.id, cycleId),
        eq(lucyCycles.leaseOwner, leaseOwner),
        eq(lucyCycles.status, "reserved"),
        gt(lucyCycles.leaseExpiresAt, now),
      ),
    )
    .returning({ id: lucyCycles.id });
  if (!updated[0])
    throw new LucyCycleConflictError("Cycle lease is no longer active.");
}

export async function renewLucyCycleLease(
  cycleId: string,
  leaseOwner: string,
  leaseDurationMs: number,
): Promise<void> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
  const updated = await db
    .update(lucyCycles)
    .set({ leaseExpiresAt, updatedAt: now })
    .where(
      and(
        eq(lucyCycles.id, cycleId),
        eq(lucyCycles.leaseOwner, leaseOwner),
        eq(lucyCycles.status, "running"),
        gt(lucyCycles.leaseExpiresAt, now),
        isNull(lucyCycles.output),
      ),
    )
    .returning({ id: lucyCycles.id });
  if (!updated[0]) {
    throw new LucyCycleConflictError("Cycle lease is no longer active.");
  }
}

export async function completeLucyCycle(
  cycleId: string,
  leaseOwner: string,
  output: LucyCycleOutput,
): Promise<void> {
  const now = new Date();
  const updated = await db
    .update(lucyCycles)
    .set({
      status: output.status,
      output,
      updatedAt: now,
      completedAt: now,
    })
    .where(
      and(
        eq(lucyCycles.id, cycleId),
        eq(lucyCycles.leaseOwner, leaseOwner),
        eq(lucyCycles.status, "running"),
        gt(lucyCycles.leaseExpiresAt, now),
        isNull(lucyCycles.output),
      ),
    )
    .returning({ id: lucyCycles.id });
  if (!updated[0])
    throw new LucyCycleConflictError("Cycle was already completed.");
}

export async function commitSuccessfulLucyCycle(options: {
  cycleId: string;
  leaseOwner: string;
  output: LucyCycleOutput;
  assistant: {
    conversationId: string;
    content: string;
    modelUsed: string;
    latencyMs: number;
    metadata: Record<string, unknown>;
  };
}): Promise<void> {
  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction.insert(chatMessages).values({
      conversationId: options.assistant.conversationId,
      role: "assistant",
      content: options.assistant.content,
      modelUsed: options.assistant.modelUsed,
      latencyMs: options.assistant.latencyMs,
      metadata: options.assistant.metadata,
    });
    await transaction
      .update(chatConversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(chatConversations.id, options.assistant.conversationId));
    const completed = await transaction
      .update(lucyCycles)
      .set({
        status: options.output.status,
        output: options.output,
        updatedAt: now,
        completedAt: now,
      })
      .where(
        and(
          eq(lucyCycles.id, options.cycleId),
          eq(lucyCycles.leaseOwner, options.leaseOwner),
          eq(lucyCycles.status, "running"),
          gt(lucyCycles.leaseExpiresAt, now),
          isNull(lucyCycles.output),
        ),
      )
      .returning({ id: lucyCycles.id });
    if (!completed[0]) {
      throw new LucyCycleConflictError("Cycle was already completed.");
    }
  });
}
