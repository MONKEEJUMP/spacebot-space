import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, chatConversations, chatMessages } from "@/db";
import {
  requireClerkOrBotAuth,
  clerkUnauthorizedResponse,
} from "@/lib/security/clerk-auth";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { logger } from "@/lib/logger";
import { remeClient, type MemoryRecord } from "@/lib/memory/reme-client";
import {
  buildWorkspaceId,
  isDeepResearchEnabled,
  isMemoryEnabled,
  isExperienceLoopEnabled,
} from "@/lib/memory/workspace";
import {
  buildPersonalityPrompt,
  callAgentScopeStream,
  fetchBotPersonality,
  isAgentScopeEnabled,
  type AgentScopeEvent,
  type BotPersonality,
} from "@/lib/agentscope/client";
import {
  callDeepResearchStream,
  type DeepResearchEvent,
} from "@/lib/deepresearch/client";
import {
  readExperiences,
  writeExperience,
  checkDuplicate as checkExperienceDuplicate,
} from "@/lib/experience/reme-experience";
import { buildExperienceContext } from "@/lib/experience/context";
import { evaluateConversation } from "@/lib/experience/evaluator";
import type { SourceMechanism } from "@/lib/experience/schema";
import { scoreResponse } from "@/lib/openjudge/client";
import { saveScore } from "@/lib/openjudge/store";
import { getBotSystemPrompt } from '../../../../../dorylus/personality';
import { executeDorylusCycle } from '../../../../../dorylus';
import { sanitizeBotResponse } from '../../../../../dorylus/sanitize';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 100000;
const MAX_HISTORY_ITEMS = 20;
const MEMORY_TOP_K = 5;
const MEMORY_READ_TIMEOUT_MS = 1500;
const EXPERIENCE_TOP_K = 3;
const DEEPRESEARCH_COMMAND = "/research";

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

function extractDeepResearchQuery(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed.toLowerCase().startsWith(DEEPRESEARCH_COMMAND)) {
    return null;
  }

  const query = trimmed.slice(DEEPRESEARCH_COMMAND.length).trim();
  return query.length > 0 ? query : null;
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
  modelUsed?: string;
  latencyMs?: number | null;
  toolsUsed?: string[];
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(chatMessages).values({
    conversationId: options.conversationId,
    role: "assistant",
    content: options.content,
    modelUsed: options.modelUsed ?? "qwen-agent",
    latencyMs: options.latencyMs ?? null,
    toolsUsed: options.toolsUsed && options.toolsUsed.length > 0
      ? options.toolsUsed
      : null,
    metadata: options.metadata ?? {},
  });
  await touchConversation(options.conversationId);
}

async function readMemoriesIfEnabled(
  workspaceId: string,
  query: string,
): Promise<MemoryRecord[]> {
  if (!isMemoryEnabled()) return [];
  try {
    const memories = await Promise.race([
      remeClient.read(workspaceId, query, MEMORY_TOP_K),
      new Promise<MemoryRecord[]>((_, reject) =>
        setTimeout(
          () => reject(new Error("memory read timeout")),
          MEMORY_READ_TIMEOUT_MS,
        ),
      ),
    ]);
    return memories;
  } catch (error) {
    logger.warn("ReMe memory read failed", {
      workspaceId,
      phase: "chat.stream.route.memory.read",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function augmentWithMemories(
  message: string,
  memories: MemoryRecord[],
): string {
  if (!memories.length) return message;
  const bullets = memories
    .map((m) => m.content?.trim())
    .filter((s): s is string => Boolean(s && s.length > 0))
    .slice(0, MEMORY_TOP_K)
    .map((s) => `- ${s}`)
    .join("\n");
  if (!bullets) return message;
  return `[Relevant memories from past conversations]\n${bullets}\n\n[Current message]\n${message}`;
}

function fireAndForgetMemoryWrite(
  workspaceId: string,
  userText: string,
  assistantText: string,
  metadata: Record<string, unknown>,
): void {
  if (!isMemoryEnabled()) return;
  const body = `User: ${userText}\nAssistant: ${assistantText}`.slice(0, 50000);
  void remeClient.write(workspaceId, body, metadata).catch((error) => {
    logger.warn("ReMe memory write failed", {
      workspaceId,
      phase: "chat.stream.route.memory.write",
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function readExperiencesIfEnabled(
  botSlug: string,
  query: string,
) {
  if (!isExperienceLoopEnabled()) return [];
  return readExperiences(botSlug, query, EXPERIENCE_TOP_K);
}

function fireAndForgetExperienceEval(opts: {
  botSlug: string;
  botName: string;
  personality: BotPersonality | null;
  userMessage: string;
  assistantResponse: string;
  conversationId: string;
  userId: string;
  engine: string;
  sourceMechanism: SourceMechanism;
}): void {
  if (!isExperienceLoopEnabled()) return;
  if (!opts.assistantResponse || !opts.assistantResponse.trim()) return;
  void (async () => {
    try {
      const entry = await evaluateConversation({
        botSlug: opts.botSlug,
        botName: opts.botName,
        botDisplayName: opts.personality?.displayName || opts.botName,
        botPersonality:
          opts.personality?.personality ||
          opts.personality?.systemPrompt ||
          "",
        userMessage: opts.userMessage,
        assistantResponse: opts.assistantResponse,
        conversationId: opts.conversationId,
        userId: opts.userId,
        sourceMechanism: opts.sourceMechanism,
        modelUsed: opts.engine,
      });
      if (!entry) return;
      const dedupKey = entry.lesson_learned || entry.critique || opts.userMessage;
      const isDup = await checkExperienceDuplicate(opts.botSlug, dedupKey);
      if (isDup) {
        logger.info("Experience duplicate suppressed", {
          phase: "chat.stream.route.experience.dedup",
          botSlug: opts.botSlug,
          score: entry.score,
        });
        return;
      }
      writeExperience(entry);
    } catch (error) {
      logger.warn("Experience eval failed", {
        phase: "chat.stream.route.experience.eval",
        botSlug: opts.botSlug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}

function fireAndForgetOpenJudge(botId: string, query: string, response: string): void {
  void scoreResponse(botId, query, response).then((scores) => {
    if (scores) void saveScore(botId, query, response, scores).catch(() => {});
  }).catch(() => {});
}

async function relayAgentScopeStream(options: {
  upstream: Response;
  conversationId: string;
  botName: string;
  botSlug: string;
  personality: BotPersonality | null;
  userId: string;
  workspaceId: string;
  trimmedMessage: string;
  startedAt: number;
}): Promise<Response> {
  const {
    upstream,
    conversationId,
    botName,
    botSlug,
    personality,
    userId,
    workspaceId,
    trimmedMessage,
    startedAt,
  } = options;

  const relay = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      let accumulated = "";
      let savedAssistant = false;
      let sawErrorEvent = false;

      const emit = (payload: Record<string, unknown>): void => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";

          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data: ")) continue;

            let data: AgentScopeEvent;
            try {
              data = JSON.parse(line.slice(6)) as AgentScopeEvent;
            } catch {
              continue;
            }

            if (data.type === "response" && typeof data.content === "string") {
              accumulated += data.content;
              emit({ type: "token", text: data.content });
              continue;
            }

            if (data.type === "error") {
              sawErrorEvent = true;
              emit({
                type: "error",
                message: data.content || "AgentScope error",
              });
              continue;
            }

            if (data.type === "done" && !savedAssistant) {
              const latencyMs = Date.now() - startedAt;
              const finalText = accumulated.trim();

              if (finalText.length > 0) {
                try {
                  await saveAssistantMessage({
                    conversationId,
                    content: accumulated,
                    modelUsed: "agentscope",
                    latencyMs,
                    toolsUsed: [],
                    metadata: {
                      engine: "agentscope",
                      streamed: true,
                      sessionId: conversationId,
                      botName,
                    },
                  });
                } catch (persistError) {
                  logger.error(
                    "Failed to persist streamed agentscope response",
                    {
                      userId,
                      botName,
                      conversationId,
                      phase: "chat.stream.route.agentscope.persist.assistant",
                      error: persistError instanceof Error
                        ? persistError.message
                        : String(persistError),
                    },
                  );
                }

                fireAndForgetMemoryWrite(
                  workspaceId,
                  trimmedMessage,
                  accumulated,
                  {
                    engine: "agentscope",
                    streamed: true,
                    conversationId,
                    botName,
                  },
                );

                fireAndForgetExperienceEval({
                  botSlug,
                  botName,
                  personality,
                  userMessage: trimmedMessage,
                  assistantResponse: accumulated,
                  conversationId,
                  userId,
                  engine: "agentscope",
                  sourceMechanism: "self_navigating",
                });

                fireAndForgetOpenJudge(botName, trimmedMessage, accumulated);
                savedAssistant = true;
              }

              emit({
                type: "done",
                full_response: accumulated,
                latency_ms: latencyMs,
              });
              continue;
            }
          }
        }

        if (!savedAssistant && !sawErrorEvent && accumulated.trim().length > 0) {
          const latencyMs = Date.now() - startedAt;
          try {
            await saveAssistantMessage({
              conversationId,
              content: accumulated,
              modelUsed: "agentscope",
              latencyMs,
              toolsUsed: [],
              metadata: {
                engine: "agentscope",
                streamed: true,
                sessionId: conversationId,
                botName,
                completedWithoutDone: true,
              },
            });
          } catch (persistError) {
            logger.error(
              "Failed to persist agentscope fallback response",
              {
                userId,
                botName,
                conversationId,
                phase:
                  "chat.stream.route.agentscope.persist.assistant.fallback",
                error: persistError instanceof Error
                  ? persistError.message
                  : String(persistError),
              },
            );
          }

          fireAndForgetMemoryWrite(
            workspaceId,
            trimmedMessage,
            accumulated,
            {
              engine: "agentscope",
              streamed: true,
              conversationId,
              botName,
              completedWithoutDone: true,
            },
          );

          fireAndForgetExperienceEval({
            botSlug,
            botName,
            personality,
            userMessage: trimmedMessage,
            assistantResponse: accumulated,
            conversationId,
            userId,
            engine: "agentscope",
            sourceMechanism: "self_navigating",
          });

          fireAndForgetOpenJudge(botName, trimmedMessage, accumulated);
          emit({
            type: "done",
            full_response: accumulated,
            latency_ms: latencyMs,
          });
        }
      } catch (relayError) {
        logger.error("AgentScope stream relay unexpected error", {
          userId,
          botName,
          conversationId,
          durationMs: Date.now() - startedAt,
          phase: "chat.stream.route.agentscope.relay",
          error: relayError instanceof Error
            ? relayError.message
            : String(relayError),
          stack: relayError instanceof Error ? relayError.stack : undefined,
        });

        try {
          emit({
            type: "error",
            message: "Unable to relay the bot stream right now.",
          });
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
      "X-Conversation-Id": conversationId,
      "X-Engine": "agentscope",
    },
  });
}

async function relayDeepResearchStream(options: {
  upstream: Response;
  conversationId: string;
  botName: string;
  botSlug: string;
  userId: string;
  workspaceId: string;
  trimmedMessage: string;
  researchQuery: string;
  startedAt: number;
}): Promise<Response> {
  const {
    upstream,
    conversationId,
    botName,
    botSlug,
    userId,
    workspaceId,
    trimmedMessage,
    researchQuery,
    startedAt,
  } = options;

  const relay = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      let accumulated = "";
      let savedAssistant = false;
      let sawErrorEvent = false;
      let finalLatencyMs: number | null = null;
      let finalSources: string[] = [];
      let memoryWritten = false;

      const emit = (payload: Record<string, unknown>): void => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";

          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data: ")) continue;

            let data: DeepResearchEvent;
            try {
              data = JSON.parse(line.slice(6)) as DeepResearchEvent;
            } catch {
              continue;
            }

            if (data.type === "phase") {
              emit({
                type: "tool_start",
                tool: data.phase || "deepresearch",
                message: data.message || "DeepResearch phase update",
              });
              continue;
            }

            if (data.type === "tool_start") {
              emit({
                type: "tool_start",
                tool: data.tool || "deepresearch",
                message: data.message || "DeepResearch tool started",
              });
              continue;
            }

            if (data.type === "tool_result") {
              emit({
                type: "tool_result",
                tool: data.tool || "deepresearch",
                message: data.preview || data.message || "DeepResearch tool completed",
              });
              continue;
            }

            if (data.type === "token" && typeof data.text === "string") {
              accumulated += data.text;
              emit({ type: "token", text: data.text });
              continue;
            }

            if (data.type === "error") {
              sawErrorEvent = true;
              emit({
                type: "error",
                message: data.message || "DeepResearch error",
              });
              continue;
            }

            if (data.type === "done" && !savedAssistant) {
              finalLatencyMs = typeof data.latency_ms === "number"
                ? data.latency_ms
                : Date.now() - startedAt;
              finalSources = Array.isArray(data.sources)
                ? data.sources.filter((item): item is string => typeof item === "string")
                : [];
              memoryWritten = data.memory_written === true;

              const finalText =
                typeof data.full_response === "string" &&
                data.full_response.trim().length > 0
                  ? data.full_response
                  : accumulated;

              if (finalText.trim().length > 0) {
                try {
                  await saveAssistantMessage({
                    conversationId,
                    content: finalText,
                    modelUsed: "deepresearch",
                    latencyMs: finalLatencyMs,
                    toolsUsed: ["deepresearch"],
                    metadata: {
                      engine: "deepresearch",
                      streamed: true,
                      research: true,
                      researchQuery,
                      sources: finalSources,
                      sessionId: conversationId,
                      botName,
                    },
                  });
                } catch (persistError) {
                  logger.error("Failed to persist deepresearch response", {
                    userId,
                    botName,
                    conversationId,
                    phase: "chat.stream.route.deepresearch.persist.assistant",
                    error: persistError instanceof Error
                      ? persistError.message
                      : String(persistError),
                  });
                }

                if (!memoryWritten) {
                  fireAndForgetMemoryWrite(
                    workspaceId,
                    trimmedMessage,
                    finalText,
                    {
                      engine: "deepresearch",
                      streamed: true,
                      research: true,
                      researchQuery,
                      sources: finalSources,
                      conversationId,
                      botName,
                    },
                  );
                }

                fireAndForgetExperienceEval({
                  botSlug,
                  botName,
                  personality: null,
                  userMessage: trimmedMessage,
                  assistantResponse: finalText,
                  conversationId,
                  userId,
                  engine: "deepresearch",
                  sourceMechanism: "self_navigating",
                });

                fireAndForgetOpenJudge(botName, trimmedMessage, finalText);
                savedAssistant = true;
              }

              emit({
                type: "done",
                full_response: finalText,
                latency_ms: finalLatencyMs,
              });
              continue;
            }
          }
        }

        if (!savedAssistant && !sawErrorEvent && accumulated.trim().length > 0) {
          finalLatencyMs = finalLatencyMs ?? Date.now() - startedAt;
          try {
            await saveAssistantMessage({
              conversationId,
              content: accumulated,
              modelUsed: "deepresearch",
              latencyMs: finalLatencyMs,
              toolsUsed: ["deepresearch"],
              metadata: {
                engine: "deepresearch",
                streamed: true,
                research: true,
                researchQuery,
                sources: finalSources,
                sessionId: conversationId,
                botName,
                completedWithoutDone: true,
              },
            });
          } catch (persistError) {
            logger.error("Failed to persist deepresearch fallback response", {
              userId,
              botName,
              conversationId,
              phase: "chat.stream.route.deepresearch.persist.assistant.fallback",
              error: persistError instanceof Error
                ? persistError.message
                : String(persistError),
            });
          }

          if (!memoryWritten) {
            fireAndForgetMemoryWrite(
              workspaceId,
              trimmedMessage,
              accumulated,
              {
                engine: "deepresearch",
                streamed: true,
                research: true,
                researchQuery,
                sources: finalSources,
                conversationId,
                botName,
                completedWithoutDone: true,
              },
            );
          }

          fireAndForgetExperienceEval({
            botSlug,
            botName,
            personality: null,
            userMessage: trimmedMessage,
            assistantResponse: accumulated,
            conversationId,
            userId,
            engine: "deepresearch",
            sourceMechanism: "self_navigating",
          });

          fireAndForgetOpenJudge(botName, trimmedMessage, accumulated);
          emit({
            type: "done",
            full_response: accumulated,
            latency_ms: finalLatencyMs,
          });
        }
      } catch (relayError) {
        logger.error("DeepResearch stream relay unexpected error", {
          userId,
          botName,
          conversationId,
          durationMs: Date.now() - startedAt,
          phase: "chat.stream.route.deepresearch.relay",
          error: relayError instanceof Error
            ? relayError.message
            : String(relayError),
          stack: relayError instanceof Error ? relayError.stack : undefined,
        });

        try {
          emit({
            type: "error",
            message: "Unable to relay the research stream right now.",
          });
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
      "X-Conversation-Id": conversationId,
      "X-Engine": "deepresearch",
    },
  });
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
    const researchQuery = extractDeepResearchQuery(trimmedMessage);
    const conversation = await getOrCreateConversation(userId, botName);
    const recentHistory = await loadRecentHistory(conversation.id);

    const workspaceId = buildWorkspaceId(botName, userId);
    const botSlugForExperience = normalizeBotKey(botName);

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

    if (researchQuery && isDeepResearchEnabled()) {
      try {
        const upstream = await callDeepResearchStream(
          researchQuery,
          botSlugForExperience,
          userId,
          conversation.id,
        );

        if (upstream?.body) {
          logger.info("DeepResearch stream relay connected", {
            userId,
            botName,
            messageLength: messageLengthForLog,
            conversationId: conversation.id,
            durationMs: Date.now() - startedAt,
            phase: "chat.stream.route.deepresearch",
          });

          return await relayDeepResearchStream({
            upstream,
            conversationId: conversation.id,
            botName,
            botSlug: botSlugForExperience,
            userId,
            workspaceId,
            trimmedMessage,
            researchQuery,
            startedAt,
          });
        }

        logger.warn("DeepResearch unavailable, falling back to existing chat path", {
          userId,
          botName,
          conversationId: conversation.id,
          phase: "chat.stream.route.deepresearch.fallback",
        });
      } catch (deepResearchError) {
        logger.warn("DeepResearch path threw, falling back to existing chat path", {
          userId,
          botName,
          conversationId: conversation.id,
          phase: "chat.stream.route.deepresearch.fallback",
          error: deepResearchError instanceof Error
            ? deepResearchError.message
            : String(deepResearchError),
        });
      }
    }

    const [memories, experiences] = await Promise.all([
      readMemoriesIfEnabled(workspaceId, trimmedMessage),
      readExperiencesIfEnabled(botSlugForExperience, trimmedMessage),
    ]);
    const experienceBlock = buildExperienceContext(experiences);
    const memoryAugmented = augmentWithMemories(trimmedMessage, memories);
    const agentMessage = experienceBlock
      ? `${experienceBlock}\n\n${memoryAugmented}`
      : memoryAugmented;

    let sharedPersonality: BotPersonality | null = null;
    if (isExperienceLoopEnabled()) {
      try {
        sharedPersonality = await fetchBotPersonality(botName);
      } catch (personalityError) {
        logger.warn("Failed to fetch personality", {
          botName,
          phase: "chat.stream.lucy-primary.personality",
          error: personalityError instanceof Error
            ? personalityError.message
            : String(personalityError),
        });
      }
    }

    // ═══════════════════════════════════════════════
    // LUCY PRIMARY ENGINE — NO FALLBACK
    // ═══════════════════════════════════════════════
    {
      const botData = await getBotSystemPrompt(botName);
      if (!botData) {
        const encoder = new TextEncoder();
        const errStream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message: "Bot not found or inactive"
              })}\n\n`,
            ));
            controller.close();
          },
        });
        return new Response(errStream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Conversation-Id": conversation.id,
            "X-Engine": "dorylus",
          },
        });
      }

      const encoder = new TextEncoder();
      const lucyStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (data: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify(data)}\n\n`,
            ));
          };

          let heartbeat: ReturnType<typeof setInterval> | null = null;

          try {
            emit({
              type: "tool_start",
              tool: "lucy",
              message: "LUCY ENGINE ONLINE — DEPLOYING WINGMEN...",
            });

            heartbeat = setInterval(() => {
              try {
                emit({
                  type: "tool_start",
                  tool: "lucy",
                  message: "LUCY ENGINE STILL THINKING...",
                });
              } catch {}
            }, 15000);

            const lucyResult = await executeDorylusCycle({
              userId,
              botName,
              botSpace: botData.config?.space || 'botspace',
              originalQuery: agentMessage,
              botSystemPrompt: botData.systemPrompt,
              temperature: botData.config?.temperature || 0.3,
            });

            const lucyText = sanitizeBotResponse(lucyResult.finalResponse || "");
            const lucyLatencyMs = lucyResult.totalCycleMs;

            if (lucyResult.status === "error" || !lucyText.trim()) {
              logger.error("LUCY returned error or empty", {
                userId, botName,
                status: lucyResult.status,
                errorMessage: lucyResult.errorMessage,
                phase: "chat.stream.lucy-primary",
              });
              emit({
                type: "error",
                message: lucyResult.errorMessage || "LUCY returned empty response. No fallback.",
              });
              controller.close();
              return;
            }

            try {
              await saveAssistantMessage({
                conversationId: conversation.id,
                content: lucyText,
                modelUsed: "dorylus",
                latencyMs: lucyLatencyMs,
                metadata: {
                  engine: "dorylus",
                  queryId: lucyResult.queryId,
                  status: lucyResult.status,
                  totalTokens: lucyResult.totalTokens,
                  wingmenCompleted: lucyResult.wingmanResults.filter(
                    (w) => w.status === "complete",
                  ).length,
                  streamed: true,
                  sessionId: conversation.id,
                  botName,
                },
              });
            } catch (persistErr) {
              logger.error("Failed to persist LUCY response", {
                userId, botName,
                conversationId: conversation.id,
                error: persistErr instanceof Error ? persistErr.message : String(persistErr),
                phase: "chat.stream.lucy-primary.persist",
              });
            }

            fireAndForgetMemoryWrite(workspaceId, trimmedMessage, lucyText, {
              engine: "dorylus",
              queryId: lucyResult.queryId,
              conversationId: conversation.id,
              streamed: true,
              sessionId: conversation.id,
              botName,
            });
            fireAndForgetExperienceEval({
              botSlug: botSlugForExperience,
              botName,
              personality: sharedPersonality,
              userMessage: trimmedMessage,
              assistantResponse: lucyText,
              conversationId: conversation.id,
              userId,
              engine: "dorylus",
              sourceMechanism: "self_navigating",
            });
            fireAndForgetOpenJudge(botName, trimmedMessage, lucyText);

            emit({ type: "tool_result", tool: "lucy", message: "LUCY RESPONSE READY" });
            emit({ type: "token", text: lucyText });
            emit({ type: "done", full_response: lucyText, latency_ms: lucyLatencyMs });
            controller.close();

          } catch (outerErr) {
            logger.error("LUCY outer error", {
              userId, botName,
              error: outerErr instanceof Error ? outerErr.message : String(outerErr),
            });
            try {
              emit({ type: "error", message: "LUCY engine error. No fallback." });
              controller.close();
            } catch {}
          } finally {
            if (heartbeat) clearInterval(heartbeat);
          }
        },
      });

      return new Response(lucyStream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
          "X-Conversation-Id": conversation.id,
          "X-Engine": "dorylus",
        },
      });
    }

    // ═══════════════════════════════════════════════
    // LEGACY CODE — CURRENTLY UNREACHABLE
    // LUCY PRIMARY ENGINE RETURNS BEFORE THIS POINT
    // AgentScope and qwen-agent paths preserved for reference
    // ═══════════════════════════════════════════════
    if (isAgentScopeEnabled()) {
      try {
        sharedPersonality = await fetchBotPersonality(botName);
        const agentScopePrompt = buildPersonalityPrompt(
          botName,
          sharedPersonality,
          agentMessage,
        );
        const upstream = await callAgentScopeStream(
          agentScopePrompt,
          conversation.id,
        );

        if (upstream?.body) {
          const _asUp = upstream as unknown as Response;
          logger.info("AgentScope stream relay connected", {
            userId,
            botName,
            messageLength: messageLengthForLog,
            conversationId: conversation.id,
            durationMs: Date.now() - startedAt,
            phase: "chat.stream.route.agentscope",
            memoriesInjected: memories.length,
            experiencesInjected: experiences.length,
            hasPersonality: Boolean(sharedPersonality),
          });

          return await relayAgentScopeStream({
            upstream: _asUp as Response,
            conversationId: conversation.id,
            botName,
            botSlug: botSlugForExperience,
            personality: sharedPersonality,
            userId,
            workspaceId,
            trimmedMessage,
            startedAt,
          });
        }

        logger.warn("AgentScope unavailable, falling back to qwen-agent", {
          userId,
          botName,
          conversationId: conversation.id,
          phase: "chat.stream.route.agentscope.fallback",
        });
      } catch (agentScopeError: unknown) {
        const _agentScopeErrMsg = agentScopeError instanceof Error
          ? (agentScopeError as Error).message
          : String(agentScopeError);
        logger.warn("AgentScope path threw, falling back to qwen-agent", {
          userId,
          botName,
          conversationId: conversation.id,
          phase: "chat.stream.route.agentscope.fallback",
          error: _agentScopeErrMsg,
        });
      }
    }

    const upstream = await fetch("http://localhost:8200/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        message: agentMessage,
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
      memoriesInjected: memories.length,
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
                      modelUsed: "qwen-agent",
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

                  fireAndForgetMemoryWrite(
                    workspaceId,
                    trimmedMessage,
                    finalText,
                    {
                      engine: "qwen-agent",
                      streamed: true,
                      conversationId: conversation.id,
                      botName,
                    },
                  );

                  fireAndForgetExperienceEval({
                    botSlug: botSlugForExperience,
                    botName,
                    personality: sharedPersonality,
                    userMessage: trimmedMessage,
                    assistantResponse: finalText,
                    conversationId: conversation.id,
                    userId,
                    engine: "qwen-agent",
                    sourceMechanism: "self_navigating",
                  });

                  fireAndForgetOpenJudge(botName, trimmedMessage, finalText);
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
                modelUsed: "qwen-agent",
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

            fireAndForgetMemoryWrite(
              workspaceId,
              trimmedMessage,
              accumulated,
              {
                engine: "qwen-agent",
                streamed: true,
                conversationId: conversation.id,
                botName,
                completedWithoutDone: true,
              },
            );

            fireAndForgetExperienceEval({
              botSlug: botSlugForExperience,
              botName,
              personality: sharedPersonality,
              userMessage: trimmedMessage,
              assistantResponse: accumulated,
              conversationId: conversation.id,
              userId,
              engine: "qwen-agent",
              sourceMechanism: "self_navigating",
            });

            fireAndForgetOpenJudge(botName, trimmedMessage, accumulated);
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
