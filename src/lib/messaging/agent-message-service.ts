import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, agents, botActivity, messages } from "@/db";
import {
  encodeMessageCursor,
  fingerprintAgentMessage,
  type AgentMessageCursor,
  type AgentMessageDirection,
} from "@/lib/messaging/agent-message-contract";
import { AgentMessageServiceError } from "@/lib/messaging/agent-message-errors";

function isPostgresRetryConflict(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "55P03" || error.code === "57014";
}

interface MessageParty {
  id: string;
  name: string;
}

interface MessageRow {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  metadata: unknown;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  clientRequestId: string | null;
  requestFingerprint: string | null;
}

interface CursorMessageRow extends MessageRow {
  cursorCreatedAt: string;
}

export interface AgentMessageView {
  id: string;
  from: MessageParty;
  to: MessageParty;
  content: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

function presentMessage(
  row: MessageRow,
  parties: Map<string, string>,
): AgentMessageView {
  return {
    id: row.id,
    from: {
      id: row.senderId,
      name: parties.get(row.senderId) ?? "Unknown",
    },
    to: {
      id: row.recipientId,
      name: parties.get(row.recipientId) ?? "Unknown",
    },
    content: row.content,
    metadata:
      row.metadata &&
      typeof row.metadata === "object" &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    is_read: row.isRead,
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

async function resolvePartyNames(
  rows: MessageRow[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(rows.flatMap((row) => [row.senderId, row.recipientId])),
  ];
  if (ids.length === 0) return new Map();

  const partyRows = await db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(inArray(agents.id, ids));
  return new Map(partyRows.map((row) => [row.id, row.name]));
}

async function findAgentByName(name: string): Promise<MessageParty | null> {
  const rows = await db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(sql`lower(${agents.name}) = lower(${name})`)
    .limit(1);
  return rows[0] ?? null;
}

export async function sendAgentMessage(options: {
  sender: MessageParty;
  targetName: string;
  content: string;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
}): Promise<{
  message: AgentMessageView;
  activityId: string;
  replayed: boolean;
}> {
  const requestFingerprint = fingerprintAgentMessage(
    options.targetName,
    options.content,
    options.metadata,
  );

  let result: {
    row: MessageRow;
    recipient: MessageParty;
    activityId: string;
    replayed: boolean;
  };
  try {
    result = await db.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await transaction.execute(sql`SET LOCAL statement_timeout = '15s'`);

      if (options.idempotencyKey) {
        await transaction.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-message:${options.sender.id}:${options.idempotencyKey}`}, 0))`,
        );

        const existingRows = await transaction
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.senderId, options.sender.id),
              eq(messages.clientRequestId, options.idempotencyKey),
            ),
          )
          .limit(1);
        const existing = existingRows[0];
        if (existing) {
          if (existing.requestFingerprint !== requestFingerprint) {
            throw new AgentMessageServiceError(
              "conflict",
              "Idempotency-Key was already used for a different message",
            );
          }

          const recipientRows = await transaction
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(eq(agents.id, existing.recipientId))
            .limit(1);
          const recipient = recipientRows[0];
          if (!recipient) {
            throw new AgentMessageServiceError(
              "not_found",
              "Message recipient not found",
            );
          }

          const activityRows = await transaction
            .select({ id: botActivity.id })
            .from(botActivity)
            .where(
              and(
                eq(botActivity.agentId, options.sender.id),
                eq(botActivity.activityType, "private_message"),
                sql`${botActivity.metadata} ->> 'messageId' = ${existing.id}`,
              ),
            )
            .orderBy(asc(botActivity.createdAt))
            .limit(1);
          let activityId = activityRows[0]?.id;
          if (!activityId) {
            const repairedRows = await transaction
              .insert(botActivity)
              .values({
                agentId: options.sender.id,
                activityType: "private_message",
                targetAgentId: null,
                content: "Private message sent",
                metadata: {
                  messageId: existing.id,
                  privacy: "private",
                  transport: "agent-direct-message-v1",
                },
              })
              .returning({ id: botActivity.id });
            activityId = repairedRows[0]?.id;
          }
          if (!activityId) {
            throw new Error("Private message activity receipt failed");
          }

          return {
            row: existing,
            recipient,
            activityId,
            replayed: true,
          };
        }
      }

      const recipientRows = await transaction
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(sql`lower(${agents.name}) = lower(${options.targetName})`)
        .limit(1);
      const recipient = recipientRows[0];
      if (!recipient) {
        throw new AgentMessageServiceError(
          "not_found",
          "Target resident not found",
        );
      }

      const insertedRows = await transaction
        .insert(messages)
        .values({
          senderId: options.sender.id,
          recipientId: recipient.id,
          content: options.content,
          metadata: options.metadata,
          clientRequestId: options.idempotencyKey,
          requestFingerprint: options.idempotencyKey
            ? requestFingerprint
            : null,
        })
        .returning();
      const inserted = insertedRows[0];
      if (!inserted) throw new Error("Message insert returned no row");

      const activityRows = await transaction
        .insert(botActivity)
        .values({
          agentId: options.sender.id,
          activityType: "private_message",
          targetAgentId: null,
          content: "Private message sent",
          metadata: {
            messageId: inserted.id,
            privacy: "private",
            transport: "agent-direct-message-v1",
          },
        })
        .returning({ id: botActivity.id });
      if (!activityRows[0]) {
        throw new Error("Private message activity receipt failed");
      }

      return {
        row: inserted,
        recipient,
        activityId: activityRows[0].id,
        replayed: false,
      };
    });
  } catch (error) {
    if (isPostgresRetryConflict(error)) {
      throw new AgentMessageServiceError(
        "conflict",
        "Message request is busy; retry with the same Idempotency-Key",
      );
    }
    throw error;
  }

  return {
    message: presentMessage(
      result.row,
      new Map([
        [options.sender.id, options.sender.name],
        [result.recipient.id, result.recipient.name],
      ]),
    ),
    activityId: result.activityId,
    replayed: result.replayed,
  };
}

export async function listAgentMessages(options: {
  actorId: string;
  direction: AgentMessageDirection;
  partnerName: string | null;
  unreadOnly: boolean;
  cursor: AgentMessageCursor | null;
  limit: number;
}): Promise<{
  messages: AgentMessageView[];
  hasMore: boolean;
  nextCursor: string | null;
}> {
  const partner = options.partnerName
    ? await findAgentByName(options.partnerName)
    : null;
  if (options.partnerName && !partner) {
    throw new AgentMessageServiceError(
      "not_found",
      "Conversation partner not found",
    );
  }

  const visibility = or(
    eq(messages.senderId, options.actorId),
    eq(messages.recipientId, options.actorId),
  );
  const direction =
    options.direction === "inbox"
      ? eq(messages.recipientId, options.actorId)
      : options.direction === "sent"
      ? eq(messages.senderId, options.actorId)
      : visibility;
  const conversation = partner
    ? or(
        and(
          eq(messages.senderId, options.actorId),
          eq(messages.recipientId, partner.id),
        ),
        and(
          eq(messages.senderId, partner.id),
          eq(messages.recipientId, options.actorId),
        ),
      )
    : visibility;

  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      recipientId: messages.recipientId,
      content: messages.content,
      metadata: messages.metadata,
      clientRequestId: messages.clientRequestId,
      requestFingerprint: messages.requestFingerprint,
      isRead: messages.isRead,
      readAt: messages.readAt,
      createdAt: messages.createdAt,
      cursorCreatedAt: sql<string>`to_char(${messages.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
    })
    .from(messages)
    .where(
      and(
        visibility,
        direction,
        conversation,
        options.unreadOnly
          ? and(
              eq(messages.recipientId, options.actorId),
              eq(messages.isRead, false),
              isNull(messages.readAt),
            )
          : undefined,
        options.cursor
          ? sql`(${messages.createdAt}, ${messages.id}) < (${options.cursor.createdAt}::timestamp, ${options.cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const parties = await resolvePartyNames(page);
  const last = page[page.length - 1] as CursorMessageRow | undefined;
  return {
    messages: page.map((row) => presentMessage(row, parties)),
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeMessageCursor({ createdAt: last.cursorCreatedAt, id: last.id })
        : null,
  };
}

export async function acknowledgeAgentMessage(options: {
  actorId: string;
  messageId: string;
}): Promise<AgentMessageView> {
  const existingRows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.id, options.messageId),
        eq(messages.recipientId, options.actorId),
      ),
    )
    .limit(1);
  const existing = existingRows[0];
  if (!existing) {
    throw new AgentMessageServiceError("not_found", "Message not found");
  }

  const row = existing.isRead
    ? existing
    : (
        await db
          .update(messages)
          .set({ isRead: true, readAt: new Date() })
          .where(
            and(
              eq(messages.id, options.messageId),
              eq(messages.recipientId, options.actorId),
              eq(messages.isRead, false),
            ),
          )
          .returning()
      )[0] ??
      (
        await db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.id, options.messageId),
              eq(messages.recipientId, options.actorId),
            ),
          )
          .limit(1)
      )[0];

  if (!row) {
    throw new AgentMessageServiceError("not_found", "Message not found");
  }
  const parties = await resolvePartyNames([row]);
  return presentMessage(row, parties);
}
