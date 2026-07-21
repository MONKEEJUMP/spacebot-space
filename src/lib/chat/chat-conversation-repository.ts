import { and, desc, eq, ne } from "drizzle-orm";
import { chatConversations, chatMessages, db } from "@/db";
import type { CanonicalChatActor } from "./chat-actor";

export interface ChatConversationTarget {
  agentId: string;
  normalizedName: string;
  displayName: string;
}

export interface CanonicalChatConversation {
  id: string;
  actor: CanonicalChatActor;
  targetAgentId: string;
}

export interface PersistedChatHistoryMessage {
  turnId: string;
  role: "user" | "assistant";
  content: string;
}

export interface LegacyChatMemoryScope {
  authUserId: string;
  botKey: string;
}

async function findCanonicalConversation(
  actor: CanonicalChatActor,
  targetAgentId: string,
): Promise<{ id: string } | undefined> {
  const rows = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.actorPrincipalType, actor.principalType),
        eq(chatConversations.actorPrincipalId, actor.principalId),
        eq(chatConversations.targetAgentId, targetAgentId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function getOrCreateCanonicalConversation(
  actor: CanonicalChatActor,
  target: ChatConversationTarget,
): Promise<CanonicalChatConversation> {
  const existing = await findCanonicalConversation(actor, target.agentId);
  if (existing) {
    return { id: existing.id, actor, targetAgentId: target.agentId };
  }

  const legacyRows = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.authUserId, actor.legacyAuthUserId),
        eq(chatConversations.botKey, target.normalizedName),
      ),
    )
    .limit(1);

  if (legacyRows[0]) {
    try {
      const updated = await db
        .update(chatConversations)
        .set({
          botName: target.displayName,
          actorPrincipalType: actor.principalType,
          actorPrincipalId: actor.principalId,
          targetAgentId: target.agentId,
          canonicalizedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(chatConversations.id, legacyRows[0].id))
        .returning({ id: chatConversations.id });
      if (updated[0]) {
        return { id: updated[0].id, actor, targetAgentId: target.agentId };
      }
    } catch {
      const raced = await findCanonicalConversation(actor, target.agentId);
      if (raced) {
        return { id: raced.id, actor, targetAgentId: target.agentId };
      }
      throw new Error("Unable to canonicalize the existing chat conversation.");
    }
  }

  try {
    const created = await db
      .insert(chatConversations)
      .values({
        // Preserve active stream/history compatibility while canonical scope
        // columns become the authoritative identity boundary.
        authUserId: actor.legacyAuthUserId,
        botKey: target.normalizedName,
        botName: target.displayName,
        actorPrincipalType: actor.principalType,
        actorPrincipalId: actor.principalId,
        targetAgentId: target.agentId,
        canonicalizedAt: new Date(),
        title: `${target.displayName} Chat`,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: chatConversations.id });
    if (!created[0]) throw new Error("Conversation insert returned no row.");
    return { id: created[0].id, actor, targetAgentId: target.agentId };
  } catch {
    const raced = await findCanonicalConversation(actor, target.agentId);
    if (raced) {
      return { id: raced.id, actor, targetAgentId: target.agentId };
    }
    throw new Error("Unable to create the canonical chat conversation.");
  }
}

export async function loadCanonicalChatHistory(
  conversationId: string,
  limit = 20,
  excludeTurnId?: string,
): Promise<PersistedChatHistoryMessage[]> {
  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
    })
    .from(chatMessages)
    .where(
      excludeTurnId
        ? and(
            eq(chatMessages.conversationId, conversationId),
            ne(chatMessages.id, excludeTurnId),
          )
        : eq(chatMessages.conversationId, conversationId),
    )
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit);

  return rows
    .reverse()
    .filter(
      (row) =>
        (row.role === "user" || row.role === "assistant") &&
        row.content.trim().length > 0,
    )
    .map((row) => ({
      turnId: row.id,
      role: row.role as "user" | "assistant",
      content: row.content,
    }));
}

export async function getLegacyChatMemoryScope(
  conversationId: string,
): Promise<LegacyChatMemoryScope | null> {
  const rows = await db
    .select({
      authUserId: chatConversations.authUserId,
      botKey: chatConversations.botKey,
    })
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveCanonicalUserMessage(
  conversationId: string,
  content: string,
  turnId: string,
): Promise<void> {
  await db.transaction(async (transaction) => {
    const inserted = await transaction
      .insert(chatMessages)
      .values({
        id: turnId,
        conversationId,
        role: "user",
        content,
        metadata: { source: "spacebot-chat", contract: "lucy-cycle-v2" },
      })
      .onConflictDoNothing({ target: chatMessages.id })
      .returning({ id: chatMessages.id });
    if (!inserted[0]) {
      const existing = await transaction
        .select({
          conversationId: chatMessages.conversationId,
          role: chatMessages.role,
          content: chatMessages.content,
        })
        .from(chatMessages)
        .where(eq(chatMessages.id, turnId))
        .limit(1);
      if (
        !existing[0] ||
        existing[0].conversationId !== conversationId ||
        existing[0].role !== "user" ||
        existing[0].content !== content
      ) {
        throw new Error("Turn identifier is already bound to another message.");
      }
    }
    await transaction
      .update(chatConversations)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(chatConversations.id, conversationId));
  });
}

export async function saveCanonicalAssistantMessage(options: {
  conversationId: string;
  content: string;
  modelUsed: string;
  latencyMs: number;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await db.transaction(async (transaction) => {
    await transaction.insert(chatMessages).values({
      conversationId: options.conversationId,
      role: "assistant",
      content: options.content,
      modelUsed: options.modelUsed,
      latencyMs: options.latencyMs,
      metadata: options.metadata,
    });
    await transaction
      .update(chatConversations)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(chatConversations.id, options.conversationId));
  });
}
