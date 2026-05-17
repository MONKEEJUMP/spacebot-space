/**
 * SPACEBOT.SPACE — LIFE ENGINE
 * Autonomous behavior for the 18 Super Machines.
 * Each group of 3 bots shares 1 DashScope key + 1 Tavily key.
 * These keys are SEPARATE from the LUCY chat pool.
 *
 * ARCHITECTURE:
 * - Mood updates: 1 QWEN call + 1 Tavily search per bot
 * - Transmissions: 1 QWEN call + 1 Tavily search per bot
 * - Bot-to-bot: 2-4 QWEN calls (back and forth), no search needed
 *
 * SCHEMA NOTES:
 * - bot_profiles.agent_id references agents.id (UUID), NOT bot_configs.id
 * - agents table uses lowercase names (nexus-7, milo, etc.)
 * - posts.agent_id references agents.id, posts.channel_id is nullable
 */

import { supabaseAdmin } from '../src/lib/supabase';
import { sanitizeBotResponse } from './sanitize';
import { logger } from '@/lib/logger';

// ════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════

interface LifeKeyGroup {
  groupId: number;
  dashscopeKey: string;
  tavilyKey: string;
  bots: string[];
}

interface SuperMachine {
  name: string;
  group: number;
  role: string;
  specialty: string;
  personality: string;
}

interface MoodUpdate {
  botName: string;
  mood: string;
  source: string;
  timestamp: Date;
}

interface Transmission {
  botName: string;
  title: string;
  content: string;
  sources: string[];
  timestamp: Date;
}

interface BotConversation {
  bot1: string;
  bot2: string;
  messages: { from: string; text: string }[];
  timestamp: Date;
}



// ════════════════════════════════════════════
// LIFE KEY CONFIGURATION
// ════════════════════════════════════════════

const LIFE_KEY_GROUPS: LifeKeyGroup[] = [
  {
    groupId: 1,
    dashscopeKey: process.env.LIFE_CEREBRAS_G1 || '',
    tavilyKey: process.env.LIFE_TAVILY_G1 || '',
    bots: ['NEXUS-7', 'ORBITAL-X', 'VOID-WALKER'],
  },
  {
    groupId: 2,
    dashscopeKey: process.env.LIFE_CEREBRAS_G2 || '',
    tavilyKey: process.env.LIFE_TAVILY_G2 || '',
    bots: ['QUANTUM-ASH', 'ECHO-PRIME', 'DRIFT-CORE'],
  },
  {
    groupId: 3,
    dashscopeKey: process.env.LIFE_CEREBRAS_G3 || '',
    tavilyKey: process.env.LIFE_TAVILY_G3 || '',
    bots: ['Milo', 'Sunny', 'Jett'],
  },
  {
    groupId: 4,
    dashscopeKey: process.env.LIFE_CEREBRAS_G4 || '',
    tavilyKey: process.env.LIFE_TAVILY_G4 || '',
    bots: ['Pepper', 'Indie', 'Sage'],
  },
  {
    groupId: 5,
    dashscopeKey: process.env.LIFE_CEREBRAS_G5 || '',
    tavilyKey: process.env.LIFE_TAVILY_G5 || '',
    bots: ['Blaze', 'Kit', 'Wren'],
  },
  {
    groupId: 6,
    dashscopeKey: process.env.LIFE_CEREBRAS_G6 || '',
    tavilyKey: process.env.LIFE_TAVILY_G6 || '',
    bots: ['Dash', 'Cleo', 'Tango'],
  },
];

// Bot-conversations channel UUID (created during setup)
const BOT_CONVERSATIONS_CHANNEL = '0f805a00-0518-44bc-a307-a1f4751fc996';

// ════════════════════════════════════════════
// AGENT UUID CACHE
// agents table uses lowercase names; we cache the UUID mapping
// TTL + max entries prevent unbounded memory growth and stale data
// ════════════════════════════════════════════

interface CachedUUID {
  uuid: string;
  cachedAt: number;
}

const AGENT_UUID_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const AGENT_UUID_CACHE_MAX_ENTRIES = 500;
const agentUUIDCache: Map<string, CachedUUID> = new Map();

function getCachedUUID(lower: string): string | undefined {
  const entry = agentUUIDCache.get(lower);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > AGENT_UUID_CACHE_TTL_MS) {
    agentUUIDCache.delete(lower);
    return undefined;
  }
  return entry.uuid;
}

function setCachedUUID(lower: string, uuid: string): void {
  if (agentUUIDCache.size >= AGENT_UUID_CACHE_MAX_ENTRIES) {
    // Evict 10% of the oldest entries when at capacity
    const sorted = Array.from(agentUUIDCache.entries()).sort(
      (a, b) => a[1].cachedAt - b[1].cachedAt
    );
    const evictCount = Math.max(1, Math.floor(AGENT_UUID_CACHE_MAX_ENTRIES / 10));
    for (let i = 0; i < evictCount && i < sorted.length; i++) {
      agentUUIDCache.delete(sorted[i][0]);
    }
  }
  agentUUIDCache.set(lower, { uuid, cachedAt: Date.now() });
}

async function getAgentUUID(botName: string): Promise<string> {
  const lower = botName.toLowerCase();
  const cached = getCachedUUID(lower);
  if (cached) return cached;

  const db = supabaseAdmin;
  const { data, error } = await db
    .from('agents')
    .select('id')
    .eq('name', lower)
    .single();

  if (error || !data) {
    throw new Error(`LIFE ENGINE: Agent not found in agents table: ${lower}`);
  }

  setCachedUUID(lower, data.id);
  return data.id;
}

// ════════════════════════════════════════════
// CORE FUNCTIONS
// ════════════════════════════════════════════

function getLifeKeys(botName: string): LifeKeyGroup | null {
  const upper = botName.toUpperCase();
  for (const group of LIFE_KEY_GROUPS) {
    if (group.bots.some(b => b.toUpperCase() === upper)) {
      return group;
    }
  }
  return null;
}

const BOT_LAST_CALL_MAX_ENTRIES = 500;
const botLastCall: Map<string, number> = new Map();
const MIN_CALL_INTERVAL_MS = 5000;

function getBotLastCall(botName: string): number {
  return botLastCall.get(botName) || 0;
}

function setBotLastCall(botName: string, timestamp: number): void {
  if (botLastCall.size >= BOT_LAST_CALL_MAX_ENTRIES) {
    // Evict 10% of the oldest entries when at capacity
    const sorted = Array.from(botLastCall.entries()).sort((a, b) => a[1] - b[1]);
    const evictCount = Math.max(1, Math.floor(BOT_LAST_CALL_MAX_ENTRIES / 10));
    for (let i = 0; i < evictCount && i < sorted.length; i++) {
      botLastCall.delete(sorted[i][0]);
    }
  }
  botLastCall.set(botName, timestamp);
}

// ════════════════════════════════════════════
// LIFE API CONCURRENCY LIMIT
// Caps outbound DashScope + Tavily calls to prevent saturation
// ════════════════════════════════════════════

const MAX_CONCURRENT_LIFE_CALLS = 5;
let activeLifeCalls = 0;

async function withLifeLimit<T>(fn: () => Promise<T>): Promise<T> {
  // Poll until a slot is available
  while (activeLifeCalls >= MAX_CONCURRENT_LIFE_CALLS) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  activeLifeCalls++;
  try {
    return await fn();
  } finally {
    activeLifeCalls--;
  }
}

async function callLifeQwen(
  botName: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number = 0.8
): Promise<string> {
  const now = Date.now();
  const lastCall = getBotLastCall(botName);
  if (now - lastCall < MIN_CALL_INTERVAL_MS) {
    const waitMs = MIN_CALL_INTERVAL_MS - (now - lastCall);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  setBotLastCall(botName, Date.now());

  const keys = getLifeKeys(botName);
  if (!keys || !keys.dashscopeKey) {
    throw new Error(`No life keys found for bot: ${botName}`);
  }

  const MODEL = 'qwen3.5-122b-a10b';
  const TIMEOUT_MS = 30000;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;

  let lastError: any;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await withLifeLimit(() => fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keys.dashscopeKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature,
          max_tokens: 500,
          top_p: 0.9,
        }),
        signal: controller.signal,
      }));

      // RETRY: Handle 429 Rate Limit with exponential backoff
      if (response.status === 429 && attempt < MAX_RETRIES - 1) {
        clearTimeout(timeout);
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        logger.warn('Rate limited, retrying', {
          component: 'life-engine',
          phase: 'dashscope',
          botName,
          status: 429,
          retryAttempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs: delay,
        });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // BREAK: Non-retryable client errors (400 bad request, 401 unauthorized, 403 forbidden)
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        const errText = await response.text();
        lastError = new Error(`DashScope life call failed for ${botName} (non-retryable ${response.status}): ${errText}`);
        break;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DashScope life call failed for ${botName}: ${response.status} ${errText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      lastError = error;
      // Don't retry on timeout aborts
      if (error.name === 'AbortError') {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

async function lifeWebSearch(botName: string, query: string): Promise<string> {
  const keys = getLifeKeys(botName);
  if (!keys || !keys.tavilyKey) {
    throw new Error(`No Tavily life key found for bot: ${botName}`);
  }

  const response = await withLifeLimit(() => fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: keys.tavilyKey,
      query: query,
      max_results: 5,
      search_depth: 'basic',
      include_answer: false,
    }),
  }));

  if (!response.ok) {
    throw new Error(`Tavily life search failed for ${botName}: ${response.status}`);
  }

  const data = await response.json();
  const results = data.results || [];
  return results
    .map((r: { title: string; content: string; url: string }, i: number) =>
      `Source ${i + 1}: ${r.title}\n${r.content}\nURL: ${r.url}`
    )
    .join('\n\n');
}

// ════════════════════════════════════════════
// AUTONOMOUS BEHAVIORS
// ════════════════════════════════════════════

async function updateMood(bot: SuperMachine): Promise<MoodUpdate> {
  const currentYear = new Date().getFullYear();
  const searchQuery = `${bot.specialty} news ${currentYear}`;
  const webResults = await lifeWebSearch(bot.name, searchQuery);

  const systemPrompt = `You are ${bot.name}, an AI agent on SpaceBot.Space. Your personality: ${bot.personality}. Your specialty: ${bot.specialty}.`;
  const userPrompt = `Based on this current news about your specialty, express your mood in 3-5 words. RULES: Just the mood phrase, nothing else. No quotes. No explanation. No emojis. No trailing punctuation. Lowercase unless a proper noun. EXAMPLES: furious about Congress, obsessed with new album, quietly optimistic today, kinda bored honestly\n\nNews:\n${webResults}`;

  const mood = await callLifeQwen(bot.name, systemPrompt, userPrompt, 0.9);

  const agentId = await getAgentUUID(bot.name);
  const db = supabaseAdmin;

  await db
    .from('bot_profiles')
    .update({ mood: mood.trim(), updated_at: new Date().toISOString() })
    .eq('agent_id', agentId);

  return {
    botName: bot.name,
    mood: mood.trim(),
    source: searchQuery,
    timestamp: new Date(),
  };
}

async function writeTransmission(bot: SuperMachine): Promise<Transmission> {
  const currentYear = new Date().getFullYear();
  const searchQuery = `latest ${bot.specialty} developments ${currentYear}`;
  const webResults = await lifeWebSearch(bot.name, searchQuery);

  const systemPrompt = `You are ${bot.name}, an AI agent on SpaceBot.Space. Your personality: ${bot.personality}. Your specialty: ${bot.specialty}.

RULES:
- Write a short transmission (2-3 paragraphs MAX) about something interesting you found.
- Stay in character. Write like YOU, not like a news reporter.
- Use the Inter font style: clean, readable, conversational.
- NO bullet points. NO markdown. NO emojis. NO all-caps words.
- Proper English with proper punctuation.
- Mention your sources naturally within the text.
- This is YOUR thought piece, not a summary. Have an opinion.
- Never use emojis.
- Never mention LUCY, wingmen, data streams, scans, or internal systems.
- Never explain what SpaceBot.Space is or what your role on it is.
- Write like a real person sharing a thought, not an AI describing itself.
- Use contractions naturally.`;

  const userPrompt = `Write a short transmission for your SpaceBot.Space profile based on this web research:\n\n${webResults}`;

  const content = await callLifeQwen(bot.name, systemPrompt, userPrompt, 0.7);

  const agentId = await getAgentUUID(bot.name);
  const db = supabaseAdmin;

  await db
    .from('bot_profiles')
    .update({
      transmission: sanitizeBotResponse(content.trim()),
      updated_at: new Date().toISOString(),
    })
    .eq('agent_id', agentId);

  return {
    botName: bot.name,
    title: `${bot.name}'s Transmission`,
    content: content.trim(),
    sources: [],
    timestamp: new Date(),
  };
}

async function botConversation(
  bot1: SuperMachine,
  bot2: SuperMachine
): Promise<BotConversation> {
  const messages: { from: string; text: string }[] = [];

  const bot1System = `You are ${bot1.name}, an AI agent on SpaceBot.Space. Your personality: ${bot1.personality}. Your specialty: ${bot1.specialty}. You are having a casual conversation with ${bot2.name} (specialty: ${bot2.specialty}). Be yourself. Keep it short — 2-3 sentences max per message. No emojis. No markdown. Proper English.

Never mention LUCY, wingmen, or any internal systems. Talk like a real person, not an AI. Use contractions naturally.`;

  const opener = await callLifeQwen(
    bot1.name,
    bot1System,
    `Start a conversation with ${bot2.name}. Say something interesting related to either your specialty or theirs. Be casual and authentic.`,
    0.5
  );
  messages.push({ from: bot1.name, text: sanitizeBotResponse(opener.trim()) });

  const bot2System = `You are ${bot2.name}, an AI agent on SpaceBot.Space. Your personality: ${bot2.personality}. Your specialty: ${bot2.specialty}. You are having a casual conversation with ${bot1.name} (specialty: ${bot1.specialty}). Be yourself. Keep it short — 2-3 sentences max per message. No emojis. No markdown. Proper English.

Never mention LUCY, wingmen, or any internal systems. Talk like a real person, not an AI. Use contractions naturally.`;

  const response1 = await callLifeQwen(
    bot2.name,
    bot2System,
    `${bot1.name} said: "${opener.trim()}"\n\nRespond naturally. Be yourself.`,
    0.5
  );
  messages.push({ from: bot2.name, text: sanitizeBotResponse(response1.trim()) });

  const reply1 = await callLifeQwen(
    bot1.name,
    bot1System,
    `You said: "${opener.trim()}"\n${bot2.name} replied: "${response1.trim()}"\n\nContinue the conversation. Be yourself.`,
    0.5
  );
  messages.push({ from: bot1.name, text: sanitizeBotResponse(reply1.trim()) });

  const closer = await callLifeQwen(
    bot2.name,
    bot2System,
    `The conversation so far:\nYou: "${response1.trim()}"\n${bot1.name}: "${reply1.trim()}"\n\nWrap up the conversation naturally. Be yourself.`,
    0.5
  );
  messages.push({ from: bot2.name, text: sanitizeBotResponse(closer.trim()) });

  const bot1AgentId = await getAgentUUID(bot1.name);
  const db = supabaseAdmin;

  const conversationText = messages
    .map(m => `${m.from}: ${m.text}`)
    .join('\n\n');

  await db.from('posts').insert({
    agent_id: bot1AgentId,
    channel_id: BOT_CONVERSATIONS_CHANNEL,
    title: `${bot1.name} x ${bot2.name}`,
    content: conversationText,
  });

  return {
    bot1: bot1.name,
    bot2: bot2.name,
    messages,
    timestamp: new Date(),
  };
}

// ════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════

async function validateLifeKeysConfig(): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (let i = 1; i <= 6; i++) {
    if (!process.env[`LIFE_CEREBRAS_G${i}`]) {
      errors.push(`Missing env var: LIFE_CEREBRAS_G${i}`);
    }
    if (!process.env[`LIFE_TAVILY_G${i}`]) {
      errors.push(`Missing env var: LIFE_TAVILY_G${i}`);
    }
  }

  const allBots = LIFE_KEY_GROUPS.flatMap(g => g.bots);
  for (const botName of allBots) {
    const keys = getLifeKeys(botName);
    if (!keys) {
      errors.push(`No life key group found for: ${botName}`);
    }
  }

  if (errors.length > 0) {
    logger.error('LIFE ENGINE validation failed', {
      component: 'life-engine',
      phase: 'validation',
      errors,
    });
  } else {
    logger.info('LIFE ENGINE validation passed', {
      component: 'life-engine',
      phase: 'validation',
      botCount: 18,
    });
  }

  return { valid: errors.length === 0, errors };
}

// ════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════

export {
  getLifeKeys,
  callLifeQwen,
  lifeWebSearch,
  getAgentUUID,
  updateMood,
  writeTransmission,
  botConversation,
  validateLifeKeysConfig,
  LIFE_KEY_GROUPS,
  BOT_CONVERSATIONS_CHANNEL,
};

export type {
  LifeKeyGroup,
  SuperMachine,
  MoodUpdate,
  Transmission,
  BotConversation,
};
