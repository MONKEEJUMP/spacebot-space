// Experience Loop — DashScope qwen-flash evaluator.
// Pattern mirrors dorylus/alpha.ts (OpenAI-compatible DashScope-intl endpoint).
// NEVER throws. NEVER blocks. Fire-and-forget safe.

import { logger } from '@/lib/logger';
import type { ExperienceEntry, ExperienceType, Outcome, SourceMechanism } from './schema';

const DASHSCOPE_ENDPOINT =
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const EVAL_MODEL = 'qwen-flash';
const EVAL_TEMPERATURE = 0.3;
const EVAL_MAX_TOKENS = 1000;
const EVAL_TIMEOUT_MS = 15000;
const EVAL_MAX_RETRIES = 2;
const EVAL_RETRY_DELAY_MS = 800;

export interface EvaluateOptions {
  botSlug: string;
  botName: string;
  botDisplayName: string;
  botPersonality: string;
  userMessage: string;
  assistantResponse: string;
  conversationId: string;
  chatMessageId?: string;
  userId: string;
  sourceMechanism: SourceMechanism;
  modelUsed: string;
}

interface EvalRaw {
  score?: number;
  outcome?: string;
  task_type?: string;
  lesson_learned?: string;
  when_to_use?: string;
  when_not_to_use?: string;
  critique?: string;
  confidence?: number;
  user_prompt_summary?: string;
  bot_response_summary?: string;
}

function stripCodeFence(s: string): string {
  let r = s
    .trim()
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  // Extract the first complete JSON object even when model prepends prose
  const start = r.indexOf('{');
  const end = r.lastIndexOf('}');
  if (start !== -1 && end > start) r = r.slice(start, end + 1);
  return r;
}

function clampScore(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(10, Math.max(1, Math.round(v)));
}

function clampConfidence(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0.5;
  return Math.min(1, Math.max(0, v));
}

function normalizeOutcome(s: unknown): Outcome {
  const v = typeof s === 'string' ? s.toLowerCase().trim() : '';
  if (v === 'success') return 'success';
  if (v === 'failure') return 'failure';
  return 'mixed';
}

function truncate(s: string | undefined, max: number): string {
  const t = (s ?? '').toString();
  if (t.length <= max) return t;
  return t.slice(0, max - 3) + '...';
}

async function callDashScopeEval(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < EVAL_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EVAL_TIMEOUT_MS);
    try {
      const res = await fetch(DASHSCOPE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: EVAL_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: EVAL_MAX_TOKENS,
          temperature: EVAL_TEMPERATURE,
          enable_thinking: false,
        }),
        signal: controller.signal,
      });

      if (res.status === 429 && attempt < EVAL_MAX_RETRIES - 1) {
        clearTimeout(timer);
        await new Promise((r) =>
          setTimeout(r, EVAL_RETRY_DELAY_MS * Math.pow(2, attempt)),
        );
        continue;
      }
      if (!res.ok) {
        clearTimeout(timer);
        return null;
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      return typeof content === 'string' ? content : null;
    } catch (err) {
      lastError = err;
      if (err instanceof Error && err.name === 'AbortError') {
        return null;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError) {
    logger.warn('Experience evaluator DashScope failure', {
      phase: 'experience.evaluator.dashscope',
      error:
        lastError instanceof Error ? lastError.message : String(lastError),
    });
  }
  return null;
}

/**
 * Grade a conversation and return an ExperienceEntry when the score
 * is >= 8 (success) or <= 5 (weakness). Returns null for anything else
 * or any failure path. NEVER throws.
 */
export async function evaluateConversation(
  opts: EvaluateOptions,
): Promise<ExperienceEntry | null> {
  try {
    const apiKey = process.env.DASHSCOPE_API_KEY || '';
    if (!apiKey) {
      logger.warn('Experience evaluator missing DASHSCOPE_API_KEY', {
        phase: 'experience.evaluator.env',
      });
      return null;
    }

    const displayName =
      (opts.botDisplayName || opts.botName || 'this bot').trim() || 'this bot';
    const personality = (opts.botPersonality || '').trim() || 'general assistant';

    const systemPrompt =
      `You are a quality evaluator for an AI bot named ${displayName}. ` +
      `The bot's specialty: ${personality}. ` +
      `Evaluate the conversation below. Return ONLY valid JSON (no markdown fencing, no prose) matching: ` +
      `{"score": 1-10 integer, "outcome": "success"|"mixed"|"failure", ` +
      `"task_type": short category string, "lesson_learned": one-sentence takeaway, ` +
      `"when_to_use": one sentence, "when_not_to_use": one sentence, ` +
      `"critique": one-sentence weakness or empty, "confidence": 0-1 float, ` +
      `"user_prompt_summary": <=150 char summary, "bot_response_summary": <=200 char summary}.`;

    const userPayload =
      `USER MESSAGE:\n${truncate(opts.userMessage, 4000)}\n\n` +
      `BOT RESPONSE:\n${truncate(opts.assistantResponse, 6000)}`;

    const raw = await callDashScopeEval(apiKey, systemPrompt, userPayload);
    if (!raw) return null;

    let parsed: EvalRaw;
    try {
      parsed = JSON.parse(stripCodeFence(raw)) as EvalRaw;
    } catch {
      return null;
    }

    const score = clampScore(parsed.score);
    if (score >= 6 && score <= 7) return null;

    const experienceType: ExperienceType = score >= 8 ? 'success' : 'weakness';
    const outcome =
      score >= 8 ? 'success' : score <= 5 ? 'failure' : normalizeOutcome(parsed.outcome);

    const entry: ExperienceEntry = {
      experience_type: experienceType,
      source_mechanism: opts.sourceMechanism,
      bot_slug: opts.botSlug,
      bot_name: opts.botName,
      task_type: truncate(parsed.task_type, 80) || 'general',
      user_prompt_summary: truncate(parsed.user_prompt_summary, 200) || truncate(opts.userMessage, 200),
      bot_response_summary: truncate(parsed.bot_response_summary, 240) || truncate(opts.assistantResponse, 240),
      outcome,
      lesson_learned: truncate(parsed.lesson_learned, 300) || '',
      when_to_use: truncate(parsed.when_to_use, 200) || '',
      when_not_to_use: truncate(parsed.when_not_to_use, 200) || '',
      critique: truncate(parsed.critique, 300) || '',
      score,
      confidence: clampConfidence(parsed.confidence),
      conversation_id: opts.conversationId,
      chat_message_id: opts.chatMessageId,
      user_id: opts.userId,
      model_used: opts.modelUsed,
      created_at: new Date().toISOString(),
    };

    if (!entry.lesson_learned && !entry.critique) {
      return null;
    }

    return entry;
  } catch (err) {
    logger.warn('Experience evaluator threw', {
      phase: 'experience.evaluator.catch',
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
