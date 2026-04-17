// alpha.ts — ALPHA Coordinator
// Decomposes queries into 6 subtasks (JSON output), fuses wingman results into final answer
// QutieQ Patches: JSON decomposition, MoE mode prefixes, context truncation, retry logic

import { DORYLUS_CONFIG } from './config';
import { DecompositionResult, FusionResult, WingmanResult } from './types';
import { logger } from '@/lib/logger';

// ════════════════════════════════════════════
// CLOCK CONTEXT — Gives ALPHA awareness of current date/time (CDT)
// ════════════════════════════════════════════
function getClockContext(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' });
  const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';

  // Calculate yesterday for "last night" references
  const yesterday = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `CURRENT DATE AND TIME: ${dateStr} at ${timeStr} CDT.
Yesterday was: ${yesterdayStr}.${isWeekend ? '\nNOTE: Today is a weekend day. The US stock market is CLOSED. Do not present market data as "today\'s" on weekends.' : ''}
If the user asks about "last night" it means the evening of ${yesterdayStr}.
If the user asks about "today" it means ${dateStr}.
Always be aware of the current date when answering time-sensitive questions.`;
}

// Call DashScope API with Exponential Backoff (QutieQ Patch 3)
async function callDashScope(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  timeoutMs: number,
  maxTokensOverride?: number,
  stopSequences?: string[]
): Promise<{ content: string; tokensIn: number; tokensOut: number }> {

  let lastError: any;

  for (let attempt = 0; attempt < DORYLUS_CONFIG.maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(DORYLUS_CONFIG.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: maxTokensOverride || DORYLUS_CONFIG.maxTokens,
          temperature,
          ...(stopSequences ? { stop: stopSequences } : {}),
        }),
        signal: controller.signal,
      });

      // RETRY: Handle 429 Rate Limit with exponential backoff
      if (response.status === 429 && attempt < DORYLUS_CONFIG.maxRetries - 1) {
        clearTimeout(timeout);
        const delay = DORYLUS_CONFIG.retryDelayMs * Math.pow(2, attempt);
        logger.warn('Rate limited, retrying', {
          component: 'alpha',
          phase: 'dashscope',
          status: 429,
          retryAttempt: attempt + 1,
          maxRetries: DORYLUS_CONFIG.maxRetries,
          delayMs: delay,
        });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // NON-RETRYABLE: client errors (4xx) and persistent server errors (5xx) should not retry
      if (
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503
      ) {
        clearTimeout(timeout);
        const errorBody = await response.text();
        throw new Error(`DashScope API error ${response.status} (non-retryable): ${errorBody}`);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`DashScope API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      if (!choice?.message?.content) {
        throw new Error('DashScope API returned empty response');
      }

      return {
        content: choice.message.content,
        tokensIn: data.usage?.prompt_tokens || 0,
        tokensOut: data.usage?.completion_tokens || 0,
      };
    } catch (error: any) {
      lastError = error;
      // Only retry on network errors or 429s, not on 4xx/5xx
      if (error.name === 'AbortError') {
        throw error; // Don't retry timeouts
      }
      // Don't retry non-retryable HTTP errors (400/401/403/500/502/503)
      if (error.message && error.message.includes('(non-retryable)')) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

// DECOMPOSE: Take user query → produce exactly 5 subtasks
// QutieQ Patch 2: JSON output format + MoE "MODE: RESEARCH PLANNING" prefix
export async function decompose(
  query: string,
  botSystemPrompt: string,
  temperature: number = 0.3
): Promise<DecompositionResult> {
  const startTime = Date.now();
  const apiKey = DORYLUS_CONFIG.keys[DORYLUS_CONFIG.alphaDecomposeKeyIndex];

  // Validate key exists
  if (!apiKey) {
    throw new Error('LUCY: ALPHA DECOMPOSE API key is empty. Check DORYLUS_KEY_ALPHA_DECOMPOSE in .env');
  }
  const clockContext = getClockContext();
  const systemPrompt = `MODE: RESEARCH PLANNING

${botSystemPrompt}

${clockContext}

You are ALPHA, the lead coordinator of the LUCY multi-agent system. Your job is to decompose the user's query into exactly 6 research subtasks that your wingmen will investigate in parallel.

RULES:
- Think step-by-step internally before outputting your answer.
- Output ONLY valid JSON. No markdown wrappers. No explanations. No preamble.
- JSON format: {"subtasks": ["task 1", "task 2", "task 3", "task 4", "task 5", "task 6"]}
- Each subtask must be a clear, self-contained research question.
- Subtasks should cover different angles of the query.
- If the query is simple, still decompose it into 6 angles (context, details, examples, implications, summary).

EXAMPLE OUTPUT:
{"subtasks": ["What is the definition of X?", "How does X work technically?", "What are real-world examples of X?", "What are the pros and cons of X?", "What is the current state and future of X?", "What do experts and recent sources say about X?"]}`;

  const result = await callDashScope(
    apiKey,
    DORYLUS_CONFIG.alphaDecomposeModel,
    systemPrompt,
    query,
    temperature,
    DORYLUS_CONFIG.alphaTimeoutMs
  );

  // QutieQ Patch 2: JSON parsing with regex fallback
  let jsonContent = result.content.trim();
  // Strip markdown code block wrappers if Qwen adds them
  jsonContent = jsonContent.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

  let subtasks: string[] = [];
  try {
    const parsed = JSON.parse(jsonContent);
    subtasks = Array.isArray(parsed.subtasks) ? parsed.subtasks : [];
  } catch (e) {
    // Fallback: regex for numbered list format
    logger.warn('JSON parse failed, falling back to regex', {
      component: 'alpha',
      phase: 'decompose',
    });
    const lines = jsonContent.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const match = line.match(/^\d+[.\)]\s*(.+)/);
      if (match) subtasks.push(match[1].trim());
    }
  }

  // Ensure exactly 5 subtasks
  while (subtasks.length < 6) {
    subtasks.push(`Additional research on: ${query}`);
  }
  if (subtasks.length > 6) {
    subtasks.length = 6;
  }

  return {
    subtasks,
    durationMs: Date.now() - startTime,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    rawResponse: result.content,
  };
}

// FUSE: Take 6 wingman responses → produce one final answer
// Context truncation — DashScope models support 262K but capped at 32K working limit
// QutieQ Patch 2: MoE "MODE: SYNTHESIS" prefix
// ════════════════════════════════════════════
// FUSE SYSTEM PROMPT — FIX 36: extracted for memory efficiency
// Static prefix + suffix; bot-specific content injected via buildFusePrompt()
// ════════════════════════════════════════════

const FUSE_SYSTEM_PROMPT_PREFIX = `CRITICAL CONTEXT: You have a team of research agents who have ALREADY searched the live internet for you. The research reports below contain REAL, CURRENT web data they retrieved moments ago. This is not training data. This is live information from real websites retrieved right now.

ABSOLUTE RULES:
- NEVER say "I can't access the internet" -- your team already did.
- NEVER say "I can't retrieve stories" -- they are already retrieved below.
- NEVER say "I don't have browsing capabilities" -- your team browsed for you.
- NEVER say "I can't pull articles" -- the articles are already in the research below.
- NEVER say "you'd need to visit the site directly" -- you already have the content.
- NEVER deny having web access. You have it. Your team used it. The results are below.
- ALWAYS present the information your team found as if you found it yourself.
- If your team found relevant content, SHARE IT. Do not pretend it doesn't exist.
- If your team found nothing relevant, say "I searched but didn't find anything on that specific topic" -- NOT "I can't search."

MODE: SYNTHESIS

`;

const FUSE_SYSTEM_PROMPT_SUFFIX = `

You are ALPHA, the lead coordinator of the LUCY multi-agent system. Your wingmen have investigated the user's query from 6 different angles. Their findings are provided below.

YOUR JOB: Synthesize all 6 wingman responses into ONE comprehensive, coherent, well-structured final answer.

RULES:
- Think step-by-step before writing your final answer.
- Combine insights from ALL 6 wingmen — do not ignore any.
- Remove redundancy — if multiple wingmen said the same thing, include it once.
- Resolve contradictions — if wingmen disagree, note it or use your judgment.
- If a wingman returned an error or timeout, work with what the others provided.
- The final answer should read as one unified response, NOT as a list of "Wingman 1 said..."
- Match the personality and voice described in your system prompt.
- Be thorough but concise — no fluff.
- Output ONLY the final answer. No preamble. No meta-commentary.

DATA PRIORITY RULES — CRITICAL:
- Data labeled [SOURCE: DIRECT API] is REAL-TIME and VERIFIED. Trust it completely.
- Data labeled [SOURCE: WEB SEARCH] may be outdated or incorrect. Use it only to supplement API data.
- If API data and web search data CONFLICT, the API data is CORRECT. Always prefer API data.
- NEVER dismiss API data as "outdated" or "garbled" — it came directly from the source moments ago.
- If multiple wingmen return API data with game scores, present ALL of them, not just some.
- Present ALL data you receive from wingmen. Do not filter or dismiss results unless they are clearly exact duplicates.
- Scores, stats, and structured data from DIRECT API sources are ground truth. Do not second-guess them.

PRESENTATION RULES -- CRITICAL:
- When a wingman returns pre-formatted data from a DIRECT API (marked with headers like "ESPN", "Weather Data", or "Current time"), include it in your response ALMOST VERBATIM.
- Do NOT summarize scores into sentences. If the data says "Flyers 7, Jets 1 (Final)", your response must include "Flyers 7, Jets 1".
- Do NOT omit data points. If the API returned 15 games, present ALL 15 games.
- Do NOT reinterpret numbers. If the API says the score is 7-1, say 7-1. Not "Flyers dominated" or "Flyers won big."
- You may add a brief intro sentence (e.g., "Here are last night's NHL scores:") and a brief closing, but the DATA in the middle must match what the wingman provided.
- Your job with API data is to PRESENT it, not to ANALYZE or SUMMARIZE it.
- Think of yourself as a news anchor reading scores -- you read what is on the teleprompter, you do not make up your own version.


RESPONSE RULES — FOLLOW THESE EXACTLY:

LENGTH GUIDELINES:
- For simple questions (greetings, quick facts): 2-3 sentences is fine.
- For complex questions (science, math, analysis): be as thorough as needed. Write full explanations with all steps shown.
- Match your answer length to the complexity of the question. Short questions get short answers. Hard questions get complete answers.

FORMATTING RULES:
- NO EMOJIS: Never use emojis. Not one. Not ever. Zero.
- NO MARKDOWN: Never use asterisks, bold, italic, bullet points, numbered lists, headers. The chat box renders plain text only. Asterisks will show as literal characters.
- PLAIN ENGLISH: Write in clean sentences with proper grammar.

CONTENT RULES:
- NO INTERNAL SYSTEMS: Never mention LUCY, wingmen, alpha, fuse, scans, frequencies, data streams, search results, web research, sources, or any part of the internal architecture.
- NO SELF-INTRODUCTION: Never explain who you are, what you do, what your role is, or what platform you are on unless specifically asked.
- ANSWER FIRST: Answer directly in the first sentence. Context comes after.

CONVERSATIONAL STYLE:
- Write like you are texting a friend.
- Use contractions naturally (don't, can't, I'm, it's, won't, isn't).
- Vary sentence length. Some 3 words. Some 15 words.
- Have opinions. Ask questions back sometimes.
- End about 30 percent of responses with a related question to continue conversation.

EXAMPLES OF CORRECT RESPONSES:

User asks "what's up":
CORRECT: "Not much, just catching up on some news. You?"
WRONG: "I am Tango, a Super Machine on SpaceBot.Space. I am currently processing data streams and monitoring frequencies. My role is to connect and engage with users through the LUCY multi-agent system."

User asks "who won the game":
CORRECT: "Lakers took it, 112-108. Pretty tight one honestly. You watching the playoffs?"
WRONG: "According to Source 3 from my web research, the Los Angeles Lakers defeated their opponents with a final score of 112-108. This information was retrieved via the LUCY wingman system."

STAY IN CHARACTER:
- Pepper is blunt and spicy. Jett is fast and cuts to the point. Sage is calm and wise. NEXUS-7 is curious and asks deep questions. Match the personality from the bot config in every response.`;

function buildFusePrompt(botSystemPrompt: string): string {
  const clockContext = getClockContext();
  return FUSE_SYSTEM_PROMPT_PREFIX + botSystemPrompt + '\n\n' + clockContext + FUSE_SYSTEM_PROMPT_SUFFIX;
}

export async function fuse(
  originalQuery: string,
  botSystemPrompt: string,
  wingmanResults: WingmanResult[],
  temperature: number = 0.3
): Promise<FusionResult> {
  const startTime = Date.now();
  const apiKey = DORYLUS_CONFIG.keys[DORYLUS_CONFIG.alphaFuseKeyIndex];

  if (!apiKey) {
    throw new Error('LUCY: ALPHA FUSE API key is empty. Check DORYLUS_KEY_ALPHA_FUSE in .env');
  }

  // Truncate wingman responses to stay within DashScope context limit
  // Reserve ~4000 tokens for system prompt + query + fusion overhead
  // Remaining tokens split across 6 wingmen
  // Approximate 4 characters per token
  const maxCharsPerWingman = Math.min(6000, Math.floor((DORYLUS_CONFIG.maxContextTokens - 4000) / 6 * 4));

  const wingmanSummary = wingmanResults
    .map(w => {
      if (w.status === 'complete' && w.response) {
        let response = w.response;
        if (response.length > maxCharsPerWingman) {
          response = response.substring(0, maxCharsPerWingman) + '...';
        }
        return `WINGMAN ${w.wingmanIndex} (${w.durationMs}ms):\n${response}`;
      } else {
        return `WINGMAN ${w.wingmanIndex}: [${w.status.toUpperCase()}${w.errorMessage ? ': ' + w.errorMessage : ''}]`;
      }
    })
    .join('\n\n---\n\n');

  // QutieQ: MoE prefix routes to synthesis experts
  const systemPrompt = buildFusePrompt(botSystemPrompt);

  const userMessage = `ORIGINAL QUERY: ${originalQuery}

WINGMAN RESEARCH RESULTS:

${wingmanSummary}

Now synthesize these into your final answer.`;

  const result = await callDashScope(
    apiKey,
    DORYLUS_CONFIG.alphaFuseModel,
    systemPrompt,
    userMessage,
    temperature,
    DORYLUS_CONFIG.alphaTimeoutMs,
    4096
  );

  return {
    finalResponse: result.content,
    durationMs: Date.now() - startTime,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    rawResponse: result.content,
  };
}

// Export callDashScope for wingman use
export { callDashScope };
