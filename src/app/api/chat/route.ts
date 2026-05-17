// LUCY Chat API — connects frontend to the multi-agent fusion engine
// POST /api/chat — authenticate, persist user turn, execute the bot, persist response

import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db, chatConversations, chatMessages } from '@/db';
import { requireClerkOrBotAuth, clerkUnauthorizedResponse } from '@/lib/security/clerk-auth';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { logger } from '@/lib/logger';
import { remeClient, type MemoryRecord } from '@/lib/memory/reme-client';
import {
  buildWorkspaceId,
  isMemoryEnabled,
  isExperienceLoopEnabled,
} from '@/lib/memory/workspace';
import { fetchBotPersonality, type BotPersonality } from '@/lib/agentscope/client';
import {
  readExperiences,
  writeExperience,
  checkDuplicate as checkExperienceDuplicate,
} from '@/lib/experience/reme-experience';
import { buildExperienceContext } from '@/lib/experience/context';
import { evaluateConversation } from '@/lib/experience/evaluator';
import type { SourceMechanism } from '@/lib/experience/schema';
import { getBotSystemPrompt } from '../../../../dorylus/personality';
import { executeDorylusCycle } from '../../../../dorylus';
import { sanitizeBotResponse } from '../../../../dorylus/sanitize';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const MAX_MESSAGE_LENGTH = 100000;
const MAX_HISTORY_ITEMS = 20;

interface PersistedHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface QwenChatResponse {
  response?: string;
  bot_id?: string;
  latency_ms?: number;
  session_id?: string;
}

function normalizeBotKey(botName: string): string {
  return botName.trim().toLowerCase();
}

async function getOrCreateConversation(authUserId: string, botName: string): Promise<{ id: string; botKey: string }> {
  const botKey = normalizeBotKey(botName);
  const existing = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(and(eq(chatConversations.authUserId, authUserId), eq(chatConversations.botKey, botKey)))
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
      .where(and(eq(chatConversations.authUserId, authUserId), eq(chatConversations.botKey, botKey)))
      .limit(1);

    if (fallback[0]) {
      return { id: fallback[0].id, botKey };
    }

    throw error;
  }
}

async function loadRecentHistory(conversationId: string, limit = MAX_HISTORY_ITEMS): Promise<PersistedHistoryMessage[]> {
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
    .filter((row): row is PersistedHistoryMessage => (
      (row.role === 'user' || row.role === 'assistant') &&
      typeof row.content === 'string' &&
      row.content.trim().length > 0
    ))
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

async function saveUserMessage(conversationId: string, content: string): Promise<void> {
  await db.insert(chatMessages).values({
    conversationId,
    role: 'user',
    content,
    metadata: { source: 'spacebot-chat' },
  });
  await touchConversation(conversationId);
}

async function saveAssistantMessage(options: {
  conversationId: string;
  content: string;
  modelUsed?: string | null;
  latencyMs?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(chatMessages).values({
    conversationId: options.conversationId,
    role: 'assistant',
    content: options.content,
    modelUsed: options.modelUsed ?? null,
    latencyMs: options.latencyMs ?? null,
    metadata: options.metadata ?? {},
  });
  await touchConversation(options.conversationId);
}

const MEMORY_TOP_K = 5;
const MEMORY_READ_TIMEOUT_MS = 1500;
const EXPERIENCE_TOP_K = 3;

async function readMemoriesIfEnabled(workspaceId: string, query: string): Promise<MemoryRecord[]> {
  if (!isMemoryEnabled()) return [];
  try {
    const memories = await Promise.race([
      remeClient.read(workspaceId, query, MEMORY_TOP_K),
      new Promise<MemoryRecord[]>((_, reject) =>
        setTimeout(() => reject(new Error('memory read timeout')), MEMORY_READ_TIMEOUT_MS)
      ),
    ]);
    return memories;
  } catch (error) {
    logger.warn('ReMe memory read failed', {
      workspaceId,
      phase: 'chat.route.memory.read',
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function augmentWithMemories(message: string, memories: MemoryRecord[]): string {
  if (!memories.length) return message;
  const bullets = memories
    .map((m) => m.content?.trim())
    .filter((s): s is string => Boolean(s && s.length > 0))
    .slice(0, MEMORY_TOP_K)
    .map((s) => `- ${s}`)
    .join('\n');
  if (!bullets) return message;
  return `[Relevant memories from past conversations]\n${bullets}\n\n[Current message]\n${message}`;
}

function fireAndForgetMemoryWrite(
  workspaceId: string,
  userText: string,
  assistantText: string,
  metadata: Record<string, unknown>
): void {
  if (!isMemoryEnabled()) return;
  const body = `User: ${userText}\nAssistant: ${assistantText}`.slice(0, 50000);
  void remeClient.write(workspaceId, body, metadata).catch((error) => {
    logger.warn('ReMe memory write failed', {
      workspaceId,
      phase: 'chat.route.memory.write',
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function readExperiencesIfEnabled(botSlug: string, query: string) {
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
          '',
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
        logger.info('Experience duplicate suppressed', {
          phase: 'chat.route.experience.dedup',
          botSlug: opts.botSlug,
          score: entry.score,
        });
        return;
      }
      writeExperience(entry);
    } catch (error) {
      logger.warn('Experience eval failed', {
        phase: 'chat.route.experience.eval',
        botSlug: opts.botSlug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let userIdForLog = 'unknown';
  let botNameForLog = 'unknown';
  let messageLengthForLog = 0;

  try {
    const authResult = await requireClerkOrBotAuth(request);
    if (!authResult) {
      return clerkUnauthorizedResponse();
    }

    let userId: string;
    if (authResult.type === 'clerk') {
      userId = authResult.userId;
    } else {
      const agent = (authResult as { agent?: { botName?: string; id?: string } }).agent;
      userId = `bot:${agent?.botName || agent?.id || 'unknown'}`;
    }
    userIdForLog = userId;

    const rlResult = await checkRateLimit(userId, 'botChat');
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
            'Retry-After': String(rlResult.retryAfter),
            'X-RateLimit-Remaining': String(rlResult.remaining),
            'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + rlResult.resetIn),
          },
        }
      );
    }

    let body: { botName?: unknown; message?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { botName, message } = body;

    if (!botName || typeof botName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing botName' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing message' },
        { status: 400 }
      );
    }

    botNameForLog = botName;
    messageLengthForLog = message.length;

    const trimmedMessage = message.slice(0, MAX_MESSAGE_LENGTH);
    const conversation = await getOrCreateConversation(userId, botName);
    const recentHistory = await loadRecentHistory(conversation.id);

    const workspaceId = buildWorkspaceId(botName, userId);
    const botSlugForExperience = normalizeBotKey(botName);
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
        logger.warn('Failed to fetch personality for experience eval', {
          botName,
          phase: 'chat.route.experience.personality',
          error: personalityError instanceof Error
            ? personalityError.message
            : String(personalityError),
        });
      }
    }

    try {
      await saveUserMessage(conversation.id, trimmedMessage);
    } catch (error) {
      logger.error('Failed to persist chat user message', {
        userId,
        botName,
        conversationId: conversation.id,
        phase: 'chat.route.persist.user',
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { success: false, error: 'Unable to save your message right now.' },
        { status: 500 }
      );
    }

    // ═══ QWEN-AGENT PROXY DISABLED — LUCY IS NOW PRIMARY ENGINE ═══
    // try {
    // const agentRes = await fetch('http://localhost:8200/chat', {
    // method: 'POST',
    // headers: { 'Content-Type': 'application/json' },
    // body: JSON.stringify({
    // message: agentMessage,
    // bot_id: botName,
    // session_id: conversation.id,
    // history: recentHistory.length > 0 ? recentHistory : undefined,
    // }),
    // signal: AbortSignal.timeout(60000),
    // });
    //
    // if (!agentRes.ok) {
    // const detail = await agentRes.text().catch(() => '');
    // throw new Error(detail || `QWEN-Agent returned ${agentRes.status}`);
    // }
    //
    // const agentData = await agentRes.json() as QwenChatResponse;
    // const responseText = agentData.response || 'Signal processing...';
    //
    // try {
    // await saveAssistantMessage({
    // conversationId: conversation.id,
    // content: responseText,
    // modelUsed: 'qwen-agent',
    // latencyMs: agentData.latency_ms ?? null,
    // metadata: {
    // engine: 'qwen-agent',
    // botId: agentData.bot_id || botName,
    // sessionId: agentData.session_id || conversation.id,
    // },
    // });
    // } catch (persistError) {
    // logger.error('Failed to persist chat assistant response', {
    // userId,
    // botName,
    // conversationId: conversation.id,
    // phase: 'chat.route.persist.assistant',
    // error: persistError instanceof Error ? persistError.message : String(persistError),
    // });
    // }
    //
    // fireAndForgetMemoryWrite(workspaceId, trimmedMessage, responseText, {
    // engine: 'qwen-agent',
    // botId: agentData.bot_id || botName,
    // conversationId: conversation.id,
    // });
    //
    // fireAndForgetExperienceEval({
    // botSlug: botSlugForExperience,
    // botName,
    // personality: sharedPersonality,
    // userMessage: trimmedMessage,
    // assistantResponse: responseText,
    // conversationId: conversation.id,
    // userId,
    // engine: 'qwen-agent',
    // sourceMechanism: 'self_navigating',
    // });
    //
    // return NextResponse.json({
    // success: true,
    // message_id: crypto.randomUUID(),
    // response: responseText,
    // botName,
    // conversationId: conversation.id,
    // queryId: `qwen-agent-${Date.now()}`,
    // metrics: { latency_ms: agentData.latency_ms, engine: 'qwen-agent' },
    // });
    // } catch (agentErr: any) {
    // console.error(`[${botName}] QWEN-Agent failed, falling back to LUCY:`, agentErr?.message);
    // }

    const botData = await getBotSystemPrompt(botName);
    if (!botData) {
      return NextResponse.json(
        { success: false, error: 'Bot not found or inactive' },
        { status: 404 }
      );
    }

    const result = await executeDorylusCycle({
      userId,
      botName,
      botSpace: botData.config.space,
      originalQuery: agentMessage,
      botSystemPrompt: botData.systemPrompt,
      temperature: botData.config.temperature,
    });

    const fallbackResponse = sanitizeBotResponse(result.finalResponse);

    try {
      await saveAssistantMessage({
        conversationId: conversation.id,
        content: fallbackResponse,
        modelUsed: 'dorylus',
        latencyMs: result.totalCycleMs ?? null,
        metadata: {
          engine: 'dorylus',
          queryId: result.queryId,
          status: result.status,
          totalTokens: result.totalTokens,
          wingmenCompleted: result.wingmanResults.filter((w) => w.status === 'complete').length,
        },
      });
    } catch (persistError) {
      logger.error('Failed to persist Dorylus assistant response', {
        userId,
        botName,
        conversationId: conversation.id,
        phase: 'chat.route.persist.assistant.dorylus',
        error: persistError instanceof Error ? persistError.message : String(persistError),
      });
    }

    if (result.status !== 'error') {
      fireAndForgetMemoryWrite(workspaceId, trimmedMessage, fallbackResponse, {
        engine: 'dorylus',
        queryId: result.queryId,
        conversationId: conversation.id,
      });

      fireAndForgetExperienceEval({
        botSlug: botSlugForExperience,
        botName,
        personality: sharedPersonality,
        userMessage: trimmedMessage,
        assistantResponse: fallbackResponse,
        conversationId: conversation.id,
        userId,
        engine: 'dorylus',
        sourceMechanism: 'self_navigating',
      });
    }

    if (result.status === 'error') {
      logger.warn('LUCY chat cycle returned error state', {
        userId,
        botName,
        queryId: result.queryId,
        phase: 'chat.route',
        messageLength: messageLengthForLog,
        durationMs: Date.now() - startedAt,
        totalCycleMs: result.totalCycleMs,
        totalTokens: result.totalTokens,
        error: result.errorMessage || 'LUCY cycle encountered an error',
      });
      return NextResponse.json({
        success: false,
        response: fallbackResponse,
        error: result.errorMessage || 'LUCY cycle encountered an error',
        botName: result.botName,
        conversationId: conversation.id,
        queryId: result.queryId,
        metrics: {
          totalCycleMs: result.totalCycleMs,
          totalTokens: result.totalTokens,
          wingmenCompleted: result.wingmanResults.filter((w) => w.status === 'complete').length,
        },
      });
    }

    logger.info('LUCY chat cycle complete', {
      userId,
      botName,
      queryId: result.queryId,
      phase: 'chat.route',
      messageLength: messageLengthForLog,
      durationMs: Date.now() - startedAt,
      totalCycleMs: result.totalCycleMs,
      totalTokens: result.totalTokens,
      wingmenCompleted: result.wingmanResults.filter((w) => w.status === 'complete').length,
    });
    return NextResponse.json({
      success: true,
      message_id: crypto.randomUUID(),
      response: fallbackResponse,
      botName: result.botName,
      conversationId: conversation.id,
      queryId: result.queryId,
      metrics: {
        totalCycleMs: result.totalCycleMs,
        totalTokens: result.totalTokens,
        wingmenCompleted: result.wingmanResults.filter((w) => w.status === 'complete').length,
      },
    });
  } catch (error: unknown) {
    logger.error('LUCY chat API unexpected error', {
      userId: userIdForLog,
      botName: botNameForLog,
      messageLength: messageLengthForLog,
      durationMs: Date.now() - startedAt,
      phase: 'chat.route',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
