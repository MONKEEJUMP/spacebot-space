import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, chatConversations, chatMessages } from "@/db";
import {
  ChatActorResolutionError,
  resolveCanonicalChatActor,
  type ChatAuthentication,
} from "@/lib/chat/chat-actor";
import {
  loadCanonicalChatHistory,
} from "@/lib/chat/chat-conversation-repository";
import {
  buildChatCycleIds,
  ChatIdempotencyKeyError,
} from "@/lib/chat/chat-idempotency";
import { presentPublicChatConflict } from "@/lib/chat/public-chat-contract";
import {
  isChatTargetResolutionError,
  resolveCanonicalChatTarget,
  type CanonicalChatTarget,
} from "@/lib/chat/chat-target-resolver";
import {
  requireClerkOrBotAuth,
  clerkUnauthorizedResponse,
} from "@/lib/security/clerk-auth";
import {
  checkRateLimit,
  rateLimitDeniedResponse,
} from "@/lib/security/rate-limiter";
import { logger } from "@/lib/logger";
import { remeClient, type MemoryRecord } from "@/lib/memory/reme-client";
import {
  buildWorkspaceId,
  isDeepResearchEnabled,
  isMemoryEnabled,
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
  buildPromptWithinExperienceQuarantine,
  establishPublicChatExperienceQuarantine,
} from "@/lib/experience/public-chat-quarantine";
import { scoreResponse } from "@/lib/openjudge/client";
import { saveScore } from "@/lib/openjudge/store";
import {
  LUCY_CYCLE_LIMITS,
  type LucyCycleOutput,
} from "@/lib/lucy/cycle-contract";
import {
  beginReservedExternalLucyCycle,
  completeExternalLucyCycle,
  executeReservedLucyCycle,
  failExternalLucyCycle,
  LucyUserMessagePersistenceError,
  startExternalLucyCycleLeaseHeartbeat,
  type ExternalLucyCycleLease,
  type LucyCycleLeaseHeartbeat,
} from "@/lib/lucy/cycle-coordinator";
import { LucyCycleConflictError } from "@/lib/lucy/cycle-repository";
import { admitPublicLucyCycle } from "@/lib/lucy/public-cycle-admission";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 100000;
const MEMORY_TOP_K = 5;
const MEMORY_READ_TIMEOUT_MS = 1500;
const DEEPRESEARCH_COMMAND = "/research";

interface StreamRouteBody {
  botName?: unknown;
  message?: unknown;
  sessionId?: unknown;
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

function fireAndForgetOpenJudge(botId: string, query: string, response: string): void {
  void scoreResponse(botId, query, response).then((scores) => {
    if (scores) void saveScore(botId, query, response, scores).catch(() => {});
  }).catch(() => {});
}

async function relayAgentScopeStream(options: {
  upstream: Response;
  conversationId: string;
  botName: string;
  userId: string;
  workspaceId: string;
  trimmedMessage: string;
  startedAt: number;
}): Promise<Response> {
  const {
    upstream,
    conversationId,
    botName,
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
  userId: string;
  cycleLease: ExternalLucyCycleLease;
  leaseHeartbeat: LucyCycleLeaseHeartbeat;
  trimmedMessage: string;
  researchQuery: string;
  startedAt: number;
}): Promise<Response> {
  const {
    upstream,
    conversationId,
    botName,
    userId,
    cycleLease,
    leaseHeartbeat,
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
      let cycleTerminal = false;
      let finalLatencyMs: number | null = null;
      let finalSources: string[] = [];

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
              if (!cycleTerminal) {
                await failExternalLucyCycle(cycleLease);
                cycleTerminal = true;
              }
              emit({
                type: "error",
                message: data.message || "DeepResearch error",
              });
              await reader.cancel();
              return;
            }

            if (data.type === "done" && !savedAssistant) {
              finalLatencyMs = typeof data.latency_ms === "number"
                ? data.latency_ms
                : Date.now() - startedAt;
              finalSources = Array.isArray(data.sources)
                ? data.sources.filter((item): item is string => typeof item === "string")
                : [];

              const finalText =
                typeof data.full_response === "string" &&
                data.full_response.trim().length > 0
                  ? data.full_response
                  : accumulated;

              if (finalText.trim().length === 0) {
                await failExternalLucyCycle(cycleLease);
                cycleTerminal = true;
                sawErrorEvent = true;
                emit({
                  type: "error",
                  message: "DeepResearch completed without a response.",
                });
                await reader.cancel();
                return;
              }

              await completeExternalLucyCycle({
                lease: cycleLease,
                engineName: "deepresearch",
                queryId: `deepresearch:${cycleLease.cycleId}`,
                message: finalText,
                durationMs: finalLatencyMs,
                sources: finalSources,
                metadata: {
                  streamed: true,
                  research: true,
                  researchQuery,
                  sources: finalSources,
                  sessionId: conversationId,
                  botName,
                },
              });
              cycleTerminal = true;
              savedAssistant = true;
              fireAndForgetOpenJudge(botName, trimmedMessage, finalText);
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
          await completeExternalLucyCycle({
            lease: cycleLease,
            engineName: "deepresearch",
            queryId: `deepresearch:${cycleLease.cycleId}`,
            message: accumulated,
            durationMs: finalLatencyMs,
            sources: finalSources,
            metadata: {
              streamed: true,
              research: true,
              researchQuery,
              sources: finalSources,
              sessionId: conversationId,
              botName,
              completedWithoutDone: true,
            },
          });
          cycleTerminal = true;

          fireAndForgetOpenJudge(botName, trimmedMessage, accumulated);
          emit({
            type: "done",
            full_response: accumulated,
            latency_ms: finalLatencyMs,
          });
        }
        if (!cycleTerminal) {
          await failExternalLucyCycle(cycleLease);
          cycleTerminal = true;
          emit({
            type: "error",
            message: "DeepResearch ended before producing a response.",
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

        if (!cycleTerminal) {
          try {
            await failExternalLucyCycle(cycleLease);
            cycleTerminal = true;
          } catch {
            // The server log above is the primary failure receipt.
          }
        }

        try {
          emit({
            type: "error",
            message: "Unable to relay the research stream right now.",
          });
        } catch {
          // Ignore secondary relay errors while shutting down the stream.
        }
      } finally {
        await leaseHeartbeat.stop();
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

function cycleOutputStreamResponse(
  output: LucyCycleOutput,
  conversationId: string,
  engine: string,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      if (output.status === "completed") {
        emit({ type: "token", text: output.message });
        emit({
          type: "done",
          full_response: output.message,
          latency_ms: output.usage.duration_ms,
        });
      } else {
        emit({
          type: "error",
          message: output.errors[0]?.safe_message ?? output.message,
        });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Conversation-Id": conversationId,
      "X-Engine": engine,
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

    const rateLimitKey = authResult.type === "clerk"
      ? authResult.userId
      : `bot:${authResult.agent.id}`;
    userIdForLog = rateLimitKey;

    const rlResult = await checkRateLimit(rateLimitKey, "botChat");
    if (!rlResult.allowed) {
      return rateLimitDeniedResponse(rlResult, () =>
        NextResponse.json(
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
        ),
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
    let target: CanonicalChatTarget;
    try {
      target = await resolveCanonicalChatTarget(botName);
    } catch (error) {
      if (!isChatTargetResolutionError(error)) throw error;
      return NextResponse.json(
        {
          success: false,
          error: error.status === 404
            ? "Bot not found or inactive"
            : error.publicMessage,
        },
        { status: error.status },
      );
    }
    let actor;
    try {
      actor = await resolveCanonicalChatActor(authResult as ChatAuthentication);
    } catch (error) {
      if (error instanceof ChatActorResolutionError) {
        return NextResponse.json(
          { success: false, error: error.safeMessage },
          { status: error.status },
        );
      }
      throw error;
    }
    const userId = actor.legacyAuthUserId;
    userIdForLog = `${actor.principalType}:${actor.principalId}`;
    let cycleIds;
    try {
      cycleIds = buildChatCycleIds({
        idempotencyKey: request.headers.get("idempotency-key"),
        actorPrincipalType: actor.principalType,
        actorPrincipalId: actor.principalId,
      });
    } catch (error) {
      if (error instanceof ChatIdempotencyKeyError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }
    const admission = await admitPublicLucyCycle({
      requestId: cycleIds.requestId,
      turnId: cycleIds.turnId,
      actor,
      target,
      message: trimmedMessage,
      deadlineMs: LUCY_CYCLE_LIMITS.deadlineMilliseconds.max,
    });
    if (admission.kind === "replay") {
      return cycleOutputStreamResponse(
        admission.output,
        admission.conversationId,
        admission.output.engine.name,
      );
    }
    const { conversation } = admission;
    const recentHistory = await loadCanonicalChatHistory(
      conversation.id,
      LUCY_CYCLE_LIMITS.historyEntries,
      admission.input.turn_id,
    );
    const cycleInput = {
      ...admission.input,
      history: recentHistory.map((item) => ({
        turn_id: item.turnId,
        role: item.role,
        message: item.content.slice(
          0,
          LUCY_CYCLE_LIMITS.historyMessageCharacters,
        ),
      })),
    };

    const workspaceId = buildWorkspaceId(target.normalizedName, userId);
    const botSlug = target.normalizedName;
    const experienceBoundary = establishPublicChatExperienceQuarantine(
      "chat-stream",
    );
    logger.info("Public chat shared experience quarantine enforced", {
      phase: "chat.stream.route.experience.quarantine",
      route: experienceBoundary.route,
      mode: experienceBoundary.mode,
      sharedReadEnabled: experienceBoundary.sharedReadEnabled,
      sharedWriteEnabled: experienceBoundary.sharedWriteEnabled,
    });

    if (researchQuery && isDeepResearchEnabled()) {
      const externalCycle = await beginReservedExternalLucyCycle(
        cycleInput,
        admission.reservation,
      );
      const cycleLease = externalCycle.lease;
      const leaseHeartbeat = startExternalLucyCycleLeaseHeartbeat(cycleLease);
      let heartbeatTransferred = false;
      try {
        const upstream = await callDeepResearchStream(
          researchQuery,
          botSlug,
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

          const relayResponse = await relayDeepResearchStream({
            upstream,
            conversationId: conversation.id,
            botName,
            userId,
            cycleLease,
            leaseHeartbeat,
            trimmedMessage,
            researchQuery,
            startedAt,
          });
          heartbeatTransferred = true;
          return relayResponse;
        }

        logger.warn("DeepResearch unavailable; research cycle failed closed", {
          userId,
          botName,
          conversationId: conversation.id,
          phase: "chat.stream.route.deepresearch.unavailable",
        });
        const failed = await failExternalLucyCycle(cycleLease);
        return cycleOutputStreamResponse(
          failed,
          conversation.id,
          "deepresearch",
        );
      } catch (deepResearchError) {
        logger.warn("DeepResearch path threw; research cycle failed closed", {
          userId,
          botName,
          conversationId: conversation.id,
          phase: "chat.stream.route.deepresearch.failed",
          error: deepResearchError instanceof Error
            ? deepResearchError.message
            : String(deepResearchError),
        });
        const failed = await failExternalLucyCycle(cycleLease);
        return cycleOutputStreamResponse(
          failed,
          conversation.id,
          "deepresearch",
        );
      } finally {
        if (!heartbeatTransferred) await leaseHeartbeat.stop();
      }
    }

    // ═══════════════════════════════════════════════
    // LUCY PRIMARY ENGINE — NO FALLBACK
    // ═══════════════════════════════════════════════
    {
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

            const cycleOutput = await executeReservedLucyCycle(
              cycleInput,
              admission.reservation,
              { signal: request.signal },
            );
            const lucyText = cycleOutput.message;
            const lucyLatencyMs = cycleOutput.usage.duration_ms;

            if (cycleOutput.status !== "completed" || !lucyText.trim()) {
              logger.warn("LUCY canonical stream returned a non-completed state", {
                userId,
                botName: target.config.botName,
                status: cycleOutput.status,
                cycleId: cycleOutput.cycle_id,
                queryId: cycleOutput.engine.query_id,
                phase: "chat.stream.lucy-primary",
              });
              emit({
                type: "error",
                message:
                  cycleOutput.errors[0]?.safe_message ||
                  "LUCY returned empty response. No fallback.",
              });
              controller.close();
              return;
            }

            fireAndForgetOpenJudge(
              target.config.botName,
              trimmedMessage,
              lucyText,
            );

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
              emit({
                type: "error",
                message:
                  outerErr instanceof LucyUserMessagePersistenceError
                    ? outerErr.message
                    : "LUCY engine error. No fallback.",
              });
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
    const memories = await readMemoriesIfEnabled(workspaceId, trimmedMessage);
    const memoryAugmented = augmentWithMemories(trimmedMessage, memories);
    const agentMessage = buildPromptWithinExperienceQuarantine(
      experienceBoundary,
      memoryAugmented,
    );
    let sharedPersonality: BotPersonality | null = null;

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
            sharedExperiencesInjected: 0,
            sharedExperienceMode: experienceBoundary.mode,
            hasPersonality: Boolean(sharedPersonality),
          });

          return await relayAgentScopeStream({
            upstream: _asUp as Response,
            conversationId: conversation.id,
            botName,
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
    if (error instanceof LucyCycleConflictError) {
      const presented = presentPublicChatConflict(error.safeMessage);
      return NextResponse.json(
        presented.body,
        { status: presented.status },
      );
    }
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
