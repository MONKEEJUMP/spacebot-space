#!/usr/bin/env node
/**
 * Experience Loop — Self-questioning nightly cycle.
 * For each of the 18 Super Machines:
 *   1. Generate a hard question via DashScope qwen-flash
 *   2. Answer it via AgentScope (/run, non-streaming)
 *   3. Grade the answer via evaluator
 *   4. Store golden_example (score>=8) or weakness (score<=5); skip 6-7
 *
 * PM2 cron: 0 3 * * *  (3 AM UTC daily)
 */

import { SUPER_MACHINES } from '../dorylus/life-scheduler';
import { logger } from '@/lib/logger';
import { fetchBotPersonality, buildPersonalityPrompt, getAgentScopeUrl } from '@/lib/agentscope/client';
import { evaluateConversation } from '@/lib/experience/evaluator';
import {
  checkDuplicate,
  writeExperienceBlocking,
} from '@/lib/experience/reme-experience';
import type { ExperienceEntry } from '@/lib/experience/schema';

const DASHSCOPE_ENDPOINT =
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const QUESTION_MODEL = 'qwen-flash';
const QUESTION_TIMEOUT_MS = 12000;
const ANSWER_TIMEOUT_MS = 45000;
const CONCURRENCY = 3;

interface HardQuestion {
  question: string;
  task_type: string;
  why_hard: string;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  void p.catch(() => undefined);
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timeout after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
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

function normalizeBotKey(botName: string): string {
  return botName.trim().toLowerCase();
}

function parseQuestionJson(content: string): Partial<HardQuestion> | null {
  try {
    return JSON.parse(stripCodeFence(content)) as Partial<HardQuestion>;
  } catch {
    // Regex fallback: handles wrong field names / unquoted values from qwen-flash
    const questionMatch = content.match(/"question"\s*:\s*"([^"]{1,600})"/);
    const q = questionMatch?.[1];
    if (!q) return null;
    const ttMatch = content.match(/"task_type"\s*:\s*"?([^",}]{1,60})"?/)
                 ?? content.match(/"sk_type"\s*:\s*"?([^",}]{1,60})"?/);
    const whMatch = content.match(/"why_hard"\s*:\s*"([^"]{1,300})"/);
    return {
      question: q.trim(),
      task_type: (ttMatch?.[1] ?? 'general').trim(),
      why_hard: (whMatch?.[1] ?? '').trim(),
    };
  }
}

async function generateHardQuestion(
  displayName: string,
  personality: string,
): Promise<HardQuestion | null> {
  const apiKey = process.env.DASHSCOPE_API_KEY || '';
  if (!apiKey) return null;

  const systemPrompt =
    `You are a difficulty curator. Given an AI bot's name and personality, ` +
    `output ONE question that is genuinely challenging for this specific bot ` +
    `given its specialty. Return ONLY JSON (no prose, no markdown fencing): ` +
    `{"question": string, "task_type": short string, "why_hard": one sentence}.`;

  const userMessage =
    `BOT NAME: ${displayName}\n` +
    `PERSONALITY: ${personality}\n\n` +
    `Generate one hard question this bot should stretch for.`;

  try {
    const res = await withTimeout(
      fetch(DASHSCOPE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: QUESTION_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.9,
          max_tokens: 400,
          enable_thinking: false,
        }),
      }),
      QUESTION_TIMEOUT_MS,
      'question.fetch',
    );

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = parseQuestionJson(content);
    if (!parsed?.question || typeof parsed.question !== 'string') return null;
    return {
      question: parsed.question.trim(),
      task_type: (parsed.task_type || 'general').toString().trim(),
      why_hard: (parsed.why_hard || '').toString().trim(),
    };
  } catch (err) {
    logger.warn('Nightly question generation failed', {
      phase: 'experience.nightly.question',
      bot: displayName,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function answerViaAgentScope(
  prompt: string,
  sessionId: string,
): Promise<string | null> {
  try {
    const url = `${getAgentScopeUrl().replace(/\/+$/, '')}/run`;
    const res = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, session_id: sessionId }),
      }),
      ANSWER_TIMEOUT_MS,
      'answer.fetch',
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      response?: string;
      output?: string;
      text?: string;
    };
    const text = data.response ?? data.output ?? data.text ?? null;
    return typeof text === 'string' && text.trim().length > 0 ? text : null;
  } catch (err) {
    logger.warn('Nightly AgentScope answer failed', {
      phase: 'experience.nightly.answer',
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

interface BotCycleResult {
  botName: string;
  questionSnippet: string;
  score: number | null;
  stored: boolean;
  skippedReason: string | null;
}

async function processBot(
  bot: (typeof SUPER_MACHINES)[number],
  dateTag: string,
): Promise<BotCycleResult> {
  const botSlug = normalizeBotKey(bot.name);
  const result: BotCycleResult = {
    botName: bot.name,
    questionSnippet: '',
    score: null,
    stored: false,
    skippedReason: null,
  };

  try {
    const personality = await fetchBotPersonality(bot.name);
    const displayName = personality?.displayName?.trim() || bot.name;
    const personalityText =
      personality?.personality?.trim() || bot.personality || bot.specialty || '';

    const hardQ = await generateHardQuestion(displayName, personalityText);
    if (!hardQ) {
      result.skippedReason = 'question_failed';
      return result;
    }
    result.questionSnippet = hardQ.question.slice(0, 120);

    const sessionId = `nightly-${botSlug}-${dateTag}`;
    const agentPrompt = buildPersonalityPrompt(bot.name, personality, hardQ.question);

    const answer = await answerViaAgentScope(agentPrompt, sessionId);
    if (!answer) {
      result.skippedReason = 'answer_failed';
      return result;
    }

    const entry = await evaluateConversation({
      botSlug,
      botName: bot.name,
      botDisplayName: displayName,
      botPersonality: personalityText,
      userMessage: hardQ.question,
      assistantResponse: answer,
      conversationId: sessionId,
      userId: 'nightly-cron',
      sourceMechanism: 'self_questioning',
      modelUsed: 'agentscope/qwen-flash',
    });

    if (!entry) {
      result.skippedReason = 'score_6_or_7_or_parse_fail';
      return result;
    }
    result.score = entry.score;

    const tagged: ExperienceEntry = {
      ...entry,
      experience_type: entry.score >= 8 ? 'golden_example' : 'weakness',
      task_type: hardQ.task_type || entry.task_type,
    };

    const isDup = await checkDuplicate(botSlug, tagged.lesson_learned || tagged.critique || hardQ.question);
    if (isDup) {
      result.skippedReason = 'duplicate';
      return result;
    }

    const id = await writeExperienceBlocking(tagged);
    result.stored = Boolean(id);
    if (!result.stored) result.skippedReason = 'write_failed';
    return result;
  } catch (err) {
    result.skippedReason =
      err instanceof Error ? `error:${err.message.slice(0, 60)}` : 'error';
    return result;
  }
}

async function runInBatches(
  bots: readonly (typeof SUPER_MACHINES)[number][],
  batchSize: number,
  dateTag: string,
): Promise<BotCycleResult[]> {
  const results: BotCycleResult[] = [];
  for (let i = 0; i < bots.length; i += batchSize) {
    const batch = bots.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((b) => processBot(b, dateTag)));
    for (const r of batchResults) results.push(r);
    logger.info('Nightly batch complete', {
      phase: 'experience.nightly.batch',
      processed: results.length,
      total: bots.length,
    });
  }
  return results;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const dateTag = new Date().toISOString().slice(0, 10);

  if ((process.env.EXPERIENCE_LOOP_ENABLED || '').toLowerCase() !== 'true') {
    logger.info('Nightly disabled via EXPERIENCE_LOOP_ENABLED', {
      phase: 'experience.nightly.disabled',
    });
    return;
  }

  logger.info('Nightly experience cycle starting', {
    phase: 'experience.nightly.start',
    botCount: SUPER_MACHINES.length,
    dateTag,
    concurrency: CONCURRENCY,
  });

  const results = await runInBatches(SUPER_MACHINES, CONCURRENCY, dateTag);

  const stored = results.filter((r) => r.stored).length;
  const skipped = results.length - stored;

  for (const r of results) {
    logger.info('Nightly bot result', {
      phase: 'experience.nightly.bot',
      bot: r.botName,
      question: r.questionSnippet,
      score: r.score,
      stored: r.stored,
      skippedReason: r.skippedReason,
    });
  }

  logger.info('Nightly experience cycle complete', {
    phase: 'experience.nightly.complete',
    total: results.length,
    stored,
    skipped,
    durationMs: Date.now() - startedAt,
  });
}

void main()
  .catch((err) => {
    logger.error('Nightly experience cycle unhandled error', {
      phase: 'experience.nightly.unhandled',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exitCode = 1;
  })
  .finally(() => {
    // Let pending logs flush
    setTimeout(() => process.exit(process.exitCode ?? 0), 250);
  });
