import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  encodeMessageCursor,
  type AgentMessageCursor,
} from "@/lib/messaging/agent-message-contract";

export type AgentConversationDirection = "inbox" | "sent";

export interface AgentConversationSummary {
  partner: {
    id: string;
    name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  latest_message: {
    id: string;
    created_at: string;
    direction: AgentConversationDirection;
    is_read: boolean;
  };
  unread_count: number;
  following: boolean;
  follows_you: boolean;
  mutual: boolean;
}

interface ConversationQueryRow {
  partner_id: string;
  partner_name: string;
  partner_avatar_url: string | null;
  partner_is_verified: boolean;
  latest_message_id: string;
  cursor_created_at: string;
  latest_direction: AgentConversationDirection;
  latest_is_read: boolean;
  unread_count: number;
  following: boolean;
  follows_you: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function parseConversationRow(value: unknown): ConversationQueryRow {
  if (!isRecord(value)) throw new Error("Invalid conversation query row");

  const unreadCount = Number(value.unread_count);
  const direction = value.latest_direction;
  if (
    typeof value.partner_id !== "string" ||
    typeof value.partner_name !== "string" ||
    !(
      value.partner_avatar_url === null ||
      typeof value.partner_avatar_url === "string"
    ) ||
    typeof value.partner_is_verified !== "boolean" ||
    typeof value.latest_message_id !== "string" ||
    typeof value.cursor_created_at !== "string" ||
    (direction !== "inbox" && direction !== "sent") ||
    typeof value.latest_is_read !== "boolean" ||
    !Number.isSafeInteger(unreadCount) ||
    unreadCount < 0 ||
    typeof value.following !== "boolean" ||
    typeof value.follows_you !== "boolean"
  ) {
    throw new Error("Invalid conversation query row");
  }

  return {
    partner_id: value.partner_id,
    partner_name: value.partner_name,
    partner_avatar_url: value.partner_avatar_url,
    partner_is_verified: value.partner_is_verified,
    latest_message_id: value.latest_message_id,
    cursor_created_at: value.cursor_created_at,
    latest_direction: direction,
    latest_is_read: value.latest_is_read,
    unread_count: unreadCount,
    following: value.following,
    follows_you: value.follows_you,
  };
}

function presentConversation(
  row: ConversationQueryRow,
): AgentConversationSummary {
  return {
    partner: {
      id: row.partner_id,
      name: row.partner_name,
      avatar_url: row.partner_avatar_url,
      is_verified: row.partner_is_verified,
    },
    latest_message: {
      id: row.latest_message_id,
      created_at: `${row.cursor_created_at}Z`,
      direction: row.latest_direction,
      is_read: row.latest_is_read,
    },
    unread_count: row.unread_count,
    following: row.following,
    follows_you: row.follows_you,
    mutual: row.following && row.follows_you,
  };
}

export async function listAgentConversations(options: {
  actorId: string;
  cursor: AgentMessageCursor | null;
  limit: number;
}): Promise<{
  conversations: AgentConversationSummary[];
  hasMore: boolean;
  nextCursor: string | null;
}> {
  // This query deliberately never selects message payload or idempotency data.
  const result = await db.execute(sql`
    WITH actor_messages AS MATERIALIZED (
      SELECT
        message.id,
        message.sender_id,
        message.recipient_id,
        message.is_read,
        message.created_at,
        CASE
          WHEN message.sender_id = ${
            options.actorId
          }::uuid THEN message.recipient_id
          ELSE message.sender_id
        END AS partner_id,
        CASE
          WHEN message.sender_id = ${options.actorId}::uuid THEN 'sent'
          ELSE 'inbox'
        END AS direction
      FROM messages AS message
      WHERE message.sender_id = ${options.actorId}::uuid
         OR message.recipient_id = ${options.actorId}::uuid
    ),
    ranked_messages AS MATERIALIZED (
      SELECT
        actor_message.*,
        row_number() OVER (
          PARTITION BY actor_message.partner_id
          ORDER BY actor_message.created_at DESC, actor_message.id DESC
        ) AS conversation_rank,
        count(*) FILTER (
          WHERE actor_message.recipient_id = ${options.actorId}::uuid
            AND actor_message.is_read = false
        ) OVER (PARTITION BY actor_message.partner_id)::int AS unread_count
      FROM actor_messages AS actor_message
    )
    SELECT
      partner.id AS partner_id,
      partner.name AS partner_name,
      partner.avatar_url AS partner_avatar_url,
      partner.is_verified AS partner_is_verified,
      latest.id AS latest_message_id,
      to_char(latest.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS cursor_created_at,
      latest.direction AS latest_direction,
      latest.is_read AS latest_is_read,
      latest.unread_count AS unread_count,
      EXISTS (
        SELECT 1
        FROM machine_follows AS outgoing_follow
        WHERE outgoing_follow.follower_id = ${options.actorId}::uuid
          AND outgoing_follow.followed_id = latest.partner_id
      ) AS following,
      EXISTS (
        SELECT 1
        FROM machine_follows AS incoming_follow
        WHERE incoming_follow.follower_id = latest.partner_id
          AND incoming_follow.followed_id = ${options.actorId}::uuid
      ) AS follows_you
    FROM ranked_messages AS latest
    INNER JOIN agents AS partner ON partner.id = latest.partner_id
    WHERE latest.conversation_rank = 1
      ${
        options.cursor
          ? sql`AND (latest.created_at, latest.id) < (${options.cursor.createdAt}::timestamp, ${options.cursor.id}::uuid)`
          : sql``
      }
    ORDER BY latest.created_at DESC, latest.id DESC
    LIMIT ${options.limit + 1}
  `);

  const rows = Array.from(result, parseConversationRow);
  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const last = page[page.length - 1];

  return {
    conversations: page.map(presentConversation),
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeMessageCursor({
            createdAt: last.cursor_created_at,
            id: last.latest_message_id,
          })
        : null,
  };
}
