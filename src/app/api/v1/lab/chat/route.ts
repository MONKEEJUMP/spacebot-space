import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { humans, labBots, labConversations, labMessages } from '@/db/schema';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';
import { requireClerkOrBotAuth, clerkUnauthorizedResponse } from '@/lib/security/clerk-auth';
import type { LabBotSlug, LabChatHistoryMessage } from '@/types/lab';
import { isLabBotSlug } from '@/lib/lab/lab-bots';
import { buildLabSafetyRedirect, evaluateLabSafety } from '@/lib/lab/safety';
import { twoAgentPipeline, FALLBACK_FACE } from '@/lib/lab/pipeline';
import { getFacePrompt, getResearcherPrompt } from '@/lib/lab/prompts';

export const dynamic = 'force-dynamic';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_ITEMS = 20;
const MAX_HISTORY_CONTENT_LENGTH = 2000;

const CEREBRAS_API_KEY = process.env.CEREBRAS_CHAT_KEY || '';
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const CEREBRAS_MODEL = 'qwen-3-235b-a22b-instruct-2507';

interface LabChatRequestBody {
  botSlug?: string;
  message?: string;
  conversationHistory?: Array<{ role?: unknown; content?: unknown }>;
}

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ModelResult {
  response: string;
  modelUsed: string;
  provider: 'cerebras';
}

/** Options for controlling token limits per pipeline agent. */
interface ModelOptions {
  max_tokens?: number;
}

function toAuthErrorResponse(code: string): NextResponse {
  const statusMap: Record<string, number> = {
    NO_TOKEN: 401,
    INVALID_TOKEN: 401,
    EXPIRED_TOKEN: 401,
    NOT_HUMAN: 403,
    NOT_ACCESS_TOKEN: 403,
    NOT_FOUND: 404,
    VERSION_MISMATCH: 401,
  };

  const messageMap: Record<string, string> = {
    NO_TOKEN: 'Authentication required',
    INVALID_TOKEN: 'Invalid authentication token',
    EXPIRED_TOKEN: 'Session expired. Please log in again.',
    NOT_HUMAN: 'Access denied',
    NOT_ACCESS_TOKEN: 'Access denied',
    NOT_FOUND: 'User not found',
    VERSION_MISMATCH: 'Session invalidated. Please log in again.',
  };

  return NextResponse.json(
    { success: false, error: messageMap[code] || 'Authentication failed' },
    { status: statusMap[code] || 401 },
  );
}

function sanitizeHistory(history: unknown): LabChatHistoryMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item): item is { role: 'user' | 'assistant'; content: string } => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const entry = item as { role?: unknown; content?: unknown };
      if ((entry.role !== 'user' && entry.role !== 'assistant') || typeof entry.content !== 'string') {
        return false;
      }

      return entry.content.trim().length > 0;
    })
    .slice(-MAX_HISTORY_ITEMS)
    .map((entry) => ({
      role: entry.role,
      content: entry.content.trim().slice(0, MAX_HISTORY_CONTENT_LENGTH),
    }));
}

async function callCerebras(
  systemPrompt: string,
  messages: ChatMessage[],
  options?: ModelOptions,
): Promise<ModelResult> {
  const response = await fetch(CEREBRAS_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CEREBRAS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CEREBRAS_MODEL,
      stream: false,
      temperature: 0.4,
      max_tokens: options?.max_tokens ?? 4096,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => 'Unknown Cerebras error');
    throw new Error(`Cerebras ${response.status}: ${details}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Cerebras returned empty content');
  }

  return {
    response: content,
    modelUsed: CEREBRAS_MODEL,
    provider: 'cerebras',
  };
}

async function generateLabResponse(
  systemPrompt: string,
  messages: ChatMessage[],
  options?: ModelOptions,
): Promise<ModelResult> {
  return callCerebras(systemPrompt, messages, options);
}

async function generateFaceResponse(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<ModelResult> {
  return callCerebras(systemPrompt, messages, { max_tokens: 256 });
}

async function generateResearcherResponse(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<ModelResult> {
  return callCerebras(systemPrompt, messages, { max_tokens: 4096 });
}

async function getOrCreateConversation(humanId: string, botId: string): Promise<{ id: string }> {
  const existing = await db.query.labConversations.findFirst({
    where: and(eq(labConversations.humanId, humanId), eq(labConversations.labBotId, botId)),
    columns: { id: true },
  });

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(labConversations)
    .values({ humanId, labBotId: botId, title: 'Lab Session', lastMessageAt: new Date(), updatedAt: new Date() })
    .returning({ id: labConversations.id });

  return created;
}

async function loadPersistedHistory(conversationId: string): Promise<LabChatHistoryMessage[]> {
  const rows = await db
    .select({ role: labMessages.role, content: labMessages.content })
    .from(labMessages)
    .where(eq(labMessages.conversationId, conversationId))
    .orderBy(desc(labMessages.createdAt))
    .limit(MAX_HISTORY_ITEMS);

  const chronologicalRows = [...rows].reverse();

  return chronologicalRows
    .filter((row): row is { role: ChatRole; content: string } =>
      (row.role === 'user' || row.role === 'assistant') && typeof row.content === 'string',
    )
    .map((row) => ({ role: row.role, content: row.content }));
}

// ─────────────────────────────────────────────────────────────────
// SSE STREAMING — Two-Agent Parallel Pipeline
// Agent 1 (Face) — Personality greeter on Cerebras QWEN (256 tokens)
// Agent 2 (Researcher) — Complete answer on Cerebras QWEN (4096 tokens)
// Both fire simultaneously. Delivered in order.
// ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const authResult = await requireClerkOrBotAuth(request);
    if (!authResult) {
      return clerkUnauthorizedResponse();
    }
    const humanId = authResult.type === 'clerk' ? authResult.userId : authResult.agent.id;
    const userName = authResult.type === 'bot' ? (authResult.agent.name || '') : '';

    const ip = getClientIP(request);
    const rateLimit = await checkRateLimit(`${humanId}:${ip}`, 'humanLabChat');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many Lab requests. Please try again later.',
          retryAfter: rateLimit.retryAfter,
        },
        { status: 429 },
      );
    }

    let body: LabChatRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const botSlug = typeof body.botSlug === 'string' ? body.botSlug.trim().toLowerCase() : '';
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : '';

    if (!botSlug) {
      return NextResponse.json({ success: false, error: 'botSlug is required' }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ success: false, error: 'message is required' }, { status: 400 });
    }

    const bot = await db.query.labBots.findFirst({
      where: and(eq(labBots.slug, botSlug), eq(labBots.isActive, true)),
      columns: { id: true, slug: true, name: true, megaPrompt: true },
    });

    if (!bot) {
      return NextResponse.json({ success: false, error: 'Lab bot not found' }, { status: 404 });
    }

    const conversation = await getOrCreateConversation(humanId, bot.id);

    const requestHistory = sanitizeHistory(body.conversationHistory);
    const persistedHistory = await loadPersistedHistory(conversation.id);
    const history = requestHistory.length > 0 ? requestHistory : persistedHistory;

    // --- Safety Check ---
    const safetyDecision = evaluateLabSafety(message);
    if (safetyDecision.isBlocked) {
      const redirected = buildLabSafetyRedirect(bot.name);

      await db.insert(labMessages).values([
        {
          conversationId: conversation.id,
          role: 'user',
          content: message,
          modelUsed: 'safety-filter',
          safetyFlags: { blocked: true, reason: safetyDecision.reason },
        },
        {
          conversationId: conversation.id,
          role: 'assistant',
          content: redirected,
          modelUsed: 'safety-filter',
          safetyFlags: { blocked: true, reason: safetyDecision.reason },
        },
      ]);

      await db
        .update(labConversations)
        .set({ lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(labConversations.id, conversation.id));

      // Safety redirects use single-response JSON format (no pipeline, no SSE)
      return NextResponse.json({
        success: true,
        response: redirected,
        botName: bot.name,
      });
    }

    // --- Build history messages for model calls ---
    const historyMessages: ChatMessage[] = history.map((entry) => ({
      role: entry.role,
      content: entry.content,
    }));

    // ─────────────────────────────────────────────────────────────
    // BRANCH: SSE Streaming vs JSON Bundled
    // ─────────────────────────────────────────────────────────────
    const acceptHeader = request.headers.get('accept') || '';
    const wantsSSE = acceptHeader.includes('text/event-stream');

    if (wantsSSE && isLabBotSlug(botSlug)) {
      // ═══════════════════════════════════════════════════════════
      // SSE STREAMING PATH — Two-Agent Direct Pipeline
      // Agent 1 (GREETER): Cerebras QWEN 235B (256 tokens)
      // Agent 2 (EXPERT):  Cerebras QWEN 235B (4096 tokens)
      // Both fire simultaneously. Delivered in order.
      // ═══════════════════════════════════════════════════════════

      const encoder = new TextEncoder();
      const conversationId = conversation.id;
      const botName = bot.name;
      const validSlug = botSlug as LabBotSlug;
      const isFirstMessage = history.length === 0;

      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (data: object) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            } catch {
              // Controller already closed — ignore
            }
          };

          try {
            // ═══════════════════════════════════════════════════
            // TWO-AGENT DIRECT PIPELINE — Cerebras QWEN greeter + expert
            // Cerebras QWEN — single provider, no fallback chains.
            // ═══════════════════════════════════════════════════

            const researcherPrompt = getResearcherPrompt(validSlug);
            const researcherMessages: ChatMessage[] = [
              { role: 'user', content: message },
            ];

            let faceText = '';
            let researcherText = '';
            let researcherModel = 'unknown';

            if (isFirstMessage) {
              // ═══════════════════════════════════════════════════
              // Sequential streaming — greeting arrives FIRST
              // 1. Fire Cerebras QWEN greeter → stream immediately
              // 2. Fire Cerebras QWEN expert → stream when ready
              // ═══════════════════════════════════════════════════

              // STEP 1: Greeter — fires fast, streams immediately
              const facePrompt = getFacePrompt(validSlug, userName);
              const faceMessages: ChatMessage[] = [
                { role: 'user', content: message },
              ];

              const faceResult = await generateFaceResponse(facePrompt, faceMessages)
                .catch(() => ({ response: FALLBACK_FACE[validSlug], modelUsed: 'fallback', provider: 'cerebras' as const }));

              faceText = faceResult.response;

              sendEvent({
                type: 'entertainer',
                content: faceText,
                botName,
                provider: faceResult.provider,
                model: faceResult.modelUsed,
              });

              // STEP 2: Expert — fires after greeting is already on screen
              const researcherResult = await generateResearcherResponse(researcherPrompt, researcherMessages)
                .catch(() => ({ response: "Hmm, let me look into that more carefully — ask me again!", modelUsed: 'fallback', provider: 'cerebras' as const }));

              researcherText = researcherResult.response;
              researcherModel = researcherResult.modelUsed;

              sendEvent({
                type: 'researcher',
                content: researcherText,
                botName,
                provider: researcherResult.provider,
                model: researcherResult.modelUsed,
              });
            } else {
              const researcherResult = await generateResearcherResponse(researcherPrompt, researcherMessages)
                .catch(() => ({ response: "Hmm, let me look into that more carefully — ask me again!", modelUsed: 'fallback', provider: 'cerebras' as const }));

              researcherText = researcherResult.response;
              researcherModel = researcherResult.modelUsed;

              sendEvent({
                type: 'researcher',
                content: researcherText,
                botName,
                provider: researcherResult.provider,
                model: researcherResult.modelUsed,
              });
            }

            // ── Save to database ──
            const combinedContent = (isFirstMessage && faceText)
              ? `${faceText}\n\n${researcherText}`
              : researcherText;

            await db.insert(labMessages).values([
              { conversationId, role: 'user', content: message, modelUsed: researcherModel },
              { conversationId, role: 'assistant', content: combinedContent, modelUsed: researcherModel },
            ]);

            // Update conversation timestamp
            await db
              .update(labConversations)
              .set({ lastMessageAt: new Date(), updatedAt: new Date() })
              .where(eq(labConversations.id, conversationId));

            // Signal stream complete
            sendEvent({ type: 'done' });
          } catch (error) {
            console.error('[LAB SSE] Stream error:', error instanceof Error ? error.message : error);
            sendEvent({ type: 'error', message: 'Something went wrong' });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // JSON BUNDLED PATH — Two-Agent Direct
    // Cerebras QWEN — single provider, no fallback chains.
    // ═══════════════════════════════════════════════════════════════

    let pipelineResult;

    if (isLabBotSlug(botSlug)) {
      pipelineResult = await twoAgentPipeline(
        botSlug as LabBotSlug,
        message,
        historyMessages,
        (prompt, msgs) => generateFaceResponse(prompt, msgs),
        (prompt, msgs) => generateResearcherResponse(prompt, msgs),
      );
    } else {
      const chatMessages: ChatMessage[] = [
        ...historyMessages,
        { role: 'user', content: message },
      ];
      const modelResult = await generateResearcherResponse(bot.megaPrompt, chatMessages);
      pipelineResult = {
        parts: [{ type: 'researcher' as const, content: modelResult.response, timestamp: Date.now() }],
        combinedContent: modelResult.response,
        model: modelResult.modelUsed,
        provider: modelResult.provider,
      };
    }

    // --- Save to Database ---
    await db.insert(labMessages).values([
      {
        conversationId: conversation.id,
        role: 'user',
        content: message,
        modelUsed: pipelineResult.model,
      },
      {
        conversationId: conversation.id,
        role: 'assistant',
        content: pipelineResult.combinedContent,
        modelUsed: pipelineResult.model,
      },
    ]);

    await db
      .update(labConversations)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(labConversations.id, conversation.id));

    // --- Return Multi-Part Response ---
    return NextResponse.json({
      success: true,
      parts: pipelineResult.parts,
      response: pipelineResult.combinedContent,
      botName: bot.name,
      provider: pipelineResult.provider,
      model: pipelineResult.model,
    });
  } catch (error) {
    console.error('[LAB CHAT] Unexpected error:', error);
    console.error('[LAB CHAT] Full error:', error instanceof Error ? error.message : error);
    console.error('[LAB CHAT] Stack:', error instanceof Error ? error.stack : 'no stack');
    return NextResponse.json(
      {
        success: false,
        error: 'Lab chat is temporarily unavailable. Please try again.',
      },
      { status: 500 },
    );
  }
}
