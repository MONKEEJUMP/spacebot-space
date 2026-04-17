import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, chatConversations, chatMessages } from "@/db";
import {
  requireClerkOrBotAuth,
  clerkUnauthorizedResponse,
} from "@/lib/security/clerk-auth";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 20;

interface StreamRouteBody {
  botName?: unknown;
  message?: unknown;
  sessionId?: unknown;
}

interface PersistedHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface BotStreamEvent {
  type?: "token" | "tool_start" | "tool_result" | "done" | "error";
  text?: string;
  tool?: string;
  message?: string;
  full_response?: string;
  latency_ms?: number;
}

function normalizeBotKey(botName: string): string {
  return botName.trim().toLowerCase();
}

async function getOrCreateConversation(
  authUserId: string,
  botName: string,
): Promise<{ id: string; botKey: string }> {
  const botKey = normalizeBotKey(botName);
  const existing = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.authUserId, authUserId),
        eq(chatConversations.botKey, botKey),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id, botKey };
  }

  try {
    const [created] = await db
      .insert(chatConversations)
      .values({
        authUserId,
        botKey,
        botName,
        title: `${botName} Chat`,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: chatConversations.id });

    return { id: created.id, botKey };
  } catch (error) {
    const fallback = await db
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.authUserId, authUserId),
          eq(chatConversations.botKey, botKey),
        ),
      )
      .limit(1);

    if (fallback[0]) {
      return { id: fallback[0].id, botKey };
    }

    throw error;
  }
}

async function loadRecentHistory(
  conversationId: string,
  limit = MAX_HISTORY_ITEMS,
): Promise<PersistedHistoryMessage[]> {
  const rows = await db
    .select({
      role: chatMessages.role,
      content: chatMessages.content,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  return [...rows]
    .reverse()
    .filter(
      (row): row is PersistedHistoryMessage =>
        (row.role === "user" || row.role === "assistant") &&
        typeof row.content === "string" &&
        row.content.trim().length > 0,
    )
    .map((row) => ({
      role: row.role,
      content: row.content,
    }));
}

async function touchConversation(conversationId: string): Promise<void> {
  await db
    .update(chatConversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(chatConversations.id, conversationId));
}

async function saveUserMessage(
  conversationId: string,
  content: string,
): Promise<void> {
  await db.insert(chatMessages).values({
    conversationId,
    role: "user",
    content,
    metadata: { source: "spacebot-chat", streamed: true },
  });
  await touchConversation(conversationId);
}

async function saveAssistantMessage(options: {
  conversationId: string;
  content: string;
  latencyMs?: number | null;
  toolsUsed?: string[];
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(chatMessages).values({
    conversationId: options.conversationId,
    role: "assistant",
    content: options.content,
    modelUsed: "qwen-agent",
    latencyMs: options.latencyMs ?? null,
    toolsUsed: options.toolsUsed && options.toolsUsed.length > 0
      ? options.toolsUsed
      : null,
    metadata: options.metadata ?? {},
  });
  await touchConversation(options.conversationId);
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let userIdForLog = "unknown";
  let messageLengthForLog = 0;

  try {
    const authResult = await requireClerkOrBotAuth(request);
    if (!authResult) {
      return clerkUnauthorizedResponse();
    }

    let userId: string;
    if (authResult.type === "clerk") {
      userId = authResult.userId;
    } else {
      const agent = (authResult as {
        agent?: { botName?: string; id?: string };
      }).agent;
      userId = `bot:${agent?.botName || agent?.id || "unknown"}`;
    }
    userIdForLog = userId;

    const rlResult = await checkRateLimit(userId, "botChat");
    if (!rlResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limited. Please wait ${rlResult.retryAfter} seconds before sending another message.`,
          retryAfter: rlResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rlResult.retryAfter),
            "X-RateLimit-Remaining": String(rlResult.remaining),
            "X-RateLimit-Reset": String(
              Math.ceil(Date.now() / 1000) + rlResult.resetIn,
            ),
          },
        },
      );
    }

    let body: StreamRouteBody;
    try {
      body = (await request.json()) as StreamRouteBody;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const botName =
      typeof body.botName === "string" ? body.botName.trim() : "";
    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (!botName) {
      return NextResponse.json(
        { success: false, error: "Missing botName" },
        { status: 400 },
      );
    }

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Missing message" },
        { status: 400 },
      );
    }

    messageLengthForLog = message.length;
    const trimmedMessage = message.slice(0, MAX_MESSAGE_LENGTH);
    const conversation = await getOrCreateConversation(userId, botName);
    const recentHistory = await loadRecentHistory(conversation.id);

    try {
      await saveUserMessage(conversation.id, trimmedMessage);
    } catch (error) {
      logger.error("Failed to persist streaming chat user message", {
        userId,
        botName,
        conversationId: conversation.id,
        phase: "chat.stream.route.persist.user",
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { success: false, error: "Unable to save your message right now." },
        { status: 500 },
      );
    }

    const upstream = await fetch("http://localhost:8200/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        message: trimmedMessage,
        bot_id: botName,
        session_id: conversation.id,
        history: recentHistory.length > 0 ? recentHistory : undefined,
      }),
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      logger.warn("Bot stream proxy failed upstream", {
        userId,
        botName,
        messageLength: messageLengthForLog,
        conversationId: conversation.id,
        durationMs: Date.now() - startedAt,
        status: upstream.status,
        detail: detail || "Unknown upstream stream error",
        phase: "chat.stream.route",
      });
      return NextResponse.json(
        {
          success: false,
          error:
            detail ||
            `${botName} streaming request failed with ${upstream.status}`,
        },
        { status: upstream.status || 502 },
      );
    }

    logger.info("Bot stream relay connected", {
      userId,
      botName,
      messageLength: messageLengthForLog,
      conversationId: conversation.id,
      durationMs: Date.now() - startedAt,
      phase: "chat.stream.route",
    });

    const relay = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const toolsUsed = new Set<string>();
        let buffer = "";
        let accumulated = "";
        let sawErrorEvent = false;
        let savedAssistant = false;
        let finalLatencyMs: number | null = null;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (!value) continue;

            controller.enqueue(value);
            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() || "";

            for (const chunk of chunks) {
              const line = chunk.trim();
              if (!line.startsWith("data: ")) continue;

              let data: BotStreamEvent;
              try {
                data = JSON.parse(line.slice(6)) as BotStreamEvent;
              } catch {
                continue;
              }

              if ((data.type === "tool_start" || data.type === "tool_result") && data.tool) {
                toolsUsed.add(data.tool);
              }

              if (data.type === "token" && data.text) {
                accumulated += data.text;
              }

              if (typeof data.latency_ms === "number") {
                finalLatencyMs = data.latency_ms;
              }

              if (data.type === "error") {
                sawErrorEvent = true;
              }

              if (data.type === "done" && !savedAssistant) {
                const finalText =
                  typeof data.full_response === "string" &&
                  data.full_response.trim().length > 0
                    ? data.full_response
                    : accumulated;

                if (finalText.trim().length > 0) {
                  try {
                    await saveAssistantMessage({
                      conversationId: conversation.id,
                      content: finalText,
                      latencyMs: finalLatencyMs,
                      toolsUsed: [...toolsUsed],
                      metadata: {
                        engine: "qwen-agent",
                        streamed: true,
                        sessionId: conversation.id,
                        botName,
                      },
                    });
                  } catch (persistError) {
                    logger.error("Failed to persist streamed assistant response", {
                      userId,
                      botName,
                      conversationId: conversation.id,
                      phase: "chat.stream.route.persist.assistant",
                      error: persistError instanceof Error
                        ? persistError.message
                        : String(persistError),
                    });
                  }
                  savedAssistant = true;
                }
              }
            }
          }

          if (!savedAssistant && !sawErrorEvent && accumulated.trim().length > 0) {
            try {
              await saveAssistantMessage({
                conversationId: conversation.id,
                content: accumulated,
                latencyMs: finalLatencyMs,
                toolsUsed: [...toolsUsed],
                metadata: {
                  engine: "qwen-agent",
                  streamed: true,
                  sessionId: conversation.id,
                  botName,
                  completedWithoutDone: true,
                },
              });
            } catch (persistError) {
              logger.error("Failed to persist fallback streamed assistant response", {
                userId,
                botName,
                conversationId: conversation.id,
                phase: "chat.stream.route.persist.assistant.fallback",
                error: persistError instanceof Error
                  ? persistError.message
                  : String(persistError),
              });
            }
          }
        } catch (relayError) {
          logger.error("Bot stream relay unexpected error", {
            userId,
            botName,
            conversationId: conversation.id,
            messageLength: messageLengthForLog,
            durationMs: Date.now() - startedAt,
            phase: "chat.stream.route.relay",
            error: relayError instanceof Error ? relayError.message : String(relayError),
            stack: relayError instanceof Error ? relayError.stack : undefined,
          });

          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message: "Unable to relay the bot stream right now.",
                })}\n\n`,
              ),
            );
          } catch {
            // Ignore secondary relay errors while shutting down the stream.
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(relay, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Conversation-Id": conversation.id,
      },
    });
  } catch (error) {
    logger.error("Bot stream proxy unexpected error", {
      userId: userIdForLog,
      messageLength: messageLengthForLog,
      durationMs: Date.now() - startedAt,
      phase: "chat.stream.route",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        success: false,
        error: "Unable to connect to the bot stream right now.",
      },
      { status: 502 },
    );
  }
}
