import crypto from "node:crypto";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { chatConversations, db, lucyCycles } from "@/db";
import type { CanonicalChatActor } from "@/lib/chat/chat-actor";
import type { CanonicalChatTarget } from "@/lib/chat/chat-target-resolver";
import type { CanonicalChatConversation } from "@/lib/chat/chat-conversation-repository";
import {
  LUCY_CYCLE_LIMITS,
  LUCY_CYCLE_SCHEMA_VERSION,
  validateLucyCycleExchange,
  type LucyCycleInput,
  type LucyCycleOutput,
} from "./cycle-contract";
import {
  hashLucyCycleInput,
  LucyCycleConflictError,
  type ReservedLucyCycle,
} from "./cycle-repository";

export type PublicLucyCycleAdmission =
  | {
      kind: "reserved";
      conversation: CanonicalChatConversation;
      input: LucyCycleInput;
      reservation: ReservedLucyCycle;
    }
  | {
      kind: "replay";
      conversationId: string;
      output: LucyCycleOutput;
    };

interface PublicLucyCycleAdmissionOptions {
  requestId: string;
  turnId: string;
  actor: CanonicalChatActor;
  target: CanonicalChatTarget;
  message: string;
  deadlineMs?: number;
}

function buildInput(
  options: PublicLucyCycleAdmissionOptions,
  conversationId: string,
): LucyCycleInput {
  return {
    schema_version: LUCY_CYCLE_SCHEMA_VERSION,
    request_id: options.requestId,
    turn_id: options.turnId,
    target_agent_id: options.target.agentId,
    conversation_id: conversationId,
    actor: {
      principal_type: options.actor.principalType,
      principal_id: options.actor.principalId,
    },
    message: options.message,
    history: [],
    deadline_ms:
      options.deadlineMs ?? LUCY_CYCLE_LIMITS.deadlineMilliseconds.max,
  };
}

export async function admitPublicLucyCycle(
  options: PublicLucyCycleAdmissionOptions,
): Promise<PublicLucyCycleAdmission> {
  try {
    return await db.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await transaction.execute(sql`SET LOCAL statement_timeout = '15s'`);
      // Request lock always precedes conversation lock to prevent cross-target
      // idempotency races and keep lock ordering deterministic.
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`lucy-request:${options.requestId}`}, 0))`,
      );

      const now = new Date();
      const leaseOwner = crypto.randomUUID();
      const deadlineMs =
        options.deadlineMs ?? LUCY_CYCLE_LIMITS.deadlineMilliseconds.max;
      const leaseExpiresAt = new Date(now.getTime() + deadlineMs + 30_000);
      const existingRows = await transaction
        .select({
          id: lucyCycles.id,
          requestId: lucyCycles.requestId,
          turnId: lucyCycles.turnId,
          conversationId: lucyCycles.conversationId,
          targetAgentId: lucyCycles.targetAgentId,
          actorPrincipalType: lucyCycles.actorPrincipalType,
          actorPrincipalId: lucyCycles.actorPrincipalId,
          inputHash: lucyCycles.inputHash,
          leaseExpiresAt: lucyCycles.leaseExpiresAt,
          output: lucyCycles.output,
        })
        .from(lucyCycles)
        .where(
          or(
            eq(lucyCycles.requestId, options.requestId),
            eq(lucyCycles.turnId, options.turnId),
          ),
        )
        .limit(2);

      if (existingRows.length > 0) {
        const existing = existingRows[0];
        const input = buildInput(options, existing.conversationId);
        if (
          existingRows.length !== 1 ||
          existing.requestId !== options.requestId ||
          existing.turnId !== options.turnId ||
          existing.actorPrincipalType !== options.actor.principalType ||
          existing.actorPrincipalId !== options.actor.principalId ||
          existing.targetAgentId !== options.target.agentId ||
          existing.inputHash !== hashLucyCycleInput(input)
        ) {
          throw new LucyCycleConflictError(
            "Idempotency-Key was reused for another request.",
          );
        }

        if (existing.output) {
          const output = existing.output as LucyCycleOutput;
          const exchange = validateLucyCycleExchange(input, output);
          if (!exchange.success) {
            throw new Error("Stored cycle output failed contract validation.");
          }
          return {
            kind: "replay" as const,
            conversationId: existing.conversationId,
            output: exchange.data.output,
          };
        }

        if (existing.leaseExpiresAt <= now) {
          const reclaimed = await transaction
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
                eq(lucyCycles.id, existing.id),
                lte(lucyCycles.leaseExpiresAt, now),
                isNull(lucyCycles.output),
              ),
            )
            .returning({ id: lucyCycles.id });
          if (reclaimed[0]) {
            return {
              kind: "reserved" as const,
              conversation: {
                id: existing.conversationId,
                actor: options.actor,
                targetAgentId: options.target.agentId,
              },
              input,
              reservation: {
                kind: "reserved" as const,
                cycleId: reclaimed[0].id,
                inputHash: existing.inputHash,
                leaseOwner,
              },
            };
          }
        }

        throw new LucyCycleConflictError("This request is already processing.");
      }

      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${[
          "chat-conversation",
          options.actor.principalType,
          options.actor.principalId,
          options.target.agentId,
        ].join(":")}, 0))`,
      );

      let conversationRows = await transaction
        .select({ id: chatConversations.id })
        .from(chatConversations)
        .where(
          and(
            eq(
              chatConversations.actorPrincipalType,
              options.actor.principalType,
            ),
            eq(chatConversations.actorPrincipalId, options.actor.principalId),
            eq(chatConversations.targetAgentId, options.target.agentId),
          ),
        )
        .limit(1);

      if (!conversationRows[0]) {
        const legacyRows = await transaction
          .select({ id: chatConversations.id })
          .from(chatConversations)
          .where(
            and(
              eq(chatConversations.authUserId, options.actor.legacyAuthUserId),
              eq(chatConversations.botKey, options.target.normalizedName),
            ),
          )
          .limit(1);

        if (legacyRows[0]) {
          conversationRows = await transaction
            .update(chatConversations)
            .set({
              botName: options.target.displayName,
              actorPrincipalType: options.actor.principalType,
              actorPrincipalId: options.actor.principalId,
              targetAgentId: options.target.agentId,
              canonicalizedAt: now,
              updatedAt: now,
            })
            .where(eq(chatConversations.id, legacyRows[0].id))
            .returning({ id: chatConversations.id });
        }
      }

      if (!conversationRows[0]) {
        conversationRows = await transaction
          .insert(chatConversations)
          .values({
            authUserId: options.actor.legacyAuthUserId,
            botKey: options.target.normalizedName,
            botName: options.target.displayName,
            actorPrincipalType: options.actor.principalType,
            actorPrincipalId: options.actor.principalId,
            targetAgentId: options.target.agentId,
            canonicalizedAt: now,
            title: `${options.target.displayName} Chat`,
            lastMessageAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: chatConversations.id });
      }

      if (!conversationRows[0]) {
        conversationRows = await transaction
          .select({ id: chatConversations.id })
          .from(chatConversations)
          .where(
            and(
              eq(
                chatConversations.actorPrincipalType,
                options.actor.principalType,
              ),
              eq(chatConversations.actorPrincipalId, options.actor.principalId),
              eq(chatConversations.targetAgentId, options.target.agentId),
            ),
          )
          .limit(1);
      }
      if (!conversationRows[0]) {
        throw new Error("Unable to create the canonical chat conversation.");
      }

      const conversation: CanonicalChatConversation = {
        id: conversationRows[0].id,
        actor: options.actor,
        targetAgentId: options.target.agentId,
      };
      const input = buildInput(options, conversation.id);
      const inputHash = hashLucyCycleInput(input);
      const inserted = await transaction
        .insert(lucyCycles)
        .values({
          requestId: options.requestId,
          turnId: options.turnId,
          conversationId: conversation.id,
          targetAgentId: options.target.agentId,
          actorPrincipalType: options.actor.principalType,
          actorPrincipalId: options.actor.principalId,
          inputHash,
          status: "reserved",
          leaseOwner,
          leaseExpiresAt,
          attemptCount: 1,
        })
        .onConflictDoNothing()
        .returning({ id: lucyCycles.id });
      if (!inserted[0]) {
        throw new LucyCycleConflictError(
          "Cycle correlation identifiers were already used.",
        );
      }

      return {
        kind: "reserved" as const,
        conversation,
        input,
        reservation: {
          kind: "reserved" as const,
          cycleId: inserted[0].id,
          inputHash,
          leaseOwner,
        },
      };
    });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code === "55P03" || code === "57014") {
      throw new LucyCycleConflictError(
        "Chat admission is busy. Please retry this request.",
      );
    }
    throw error;
  }
}
