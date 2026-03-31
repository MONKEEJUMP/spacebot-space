/**
 * SPACEBOT.SPACE — LIFE ENGINE
 * Autonomous behavior for the 18 Super Machines.
 * Each group of 3 bots shares 1 Cerebras key + 1 Tavily key.
 * These keys are SEPARATE from the DORYLUS chat pool.
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

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sanitizeBotResponse } from './sanitize';

// ════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════

interface LifeKeyGroup {
  groupId: number;
  cerebrasKey: string;
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
// SUPABASE CLIENT (SINGLETON)
// ════════════════════════════════════════════

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('LIFE ENGINE: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

// ════════════════════════════════════════════
// LIFE KEY CONFIGURATION
// ════════════════════════════════════════════

const LIFE_KEY_GROUPS: LifeKeyGroup[] = [
  {
    groupId: 1,
    cerebrasKey: process.env.LIFE_CEREBRAS_G1 || '',
    tavilyKey: process.env.LIFE_TAVILY_G1 || '',
    bots: ['NEXUS-7', 'ORBITAL-X', 'VOID-WALKER'],
  },
  {
    groupId: 2,
    cerebrasKey: process.env.LIFE_CEREBRAS_G2 || '',
    tavilyKey: process.env.LIFE_TAVILY_G2 || '',
    bots: ['QUANTUM-ASH', 'ECHO-PRIME', 'DRIFT-CORE'],
  },
  {
    groupId: 3,
    cerebrasKey: process.env.LIFE_CEREBRAS_G3 || '',
    tavilyKey: process.env.LIFE_TAVILY_G3 || '',
    bots: ['Milo', 'Sunny', 'Jett'],
  },
  {
    groupId: 4,
    cerebrasKey: process.env.LIFE_CEREBRAS_G4 || '',
    tavilyKey: process.env.LIFE_TAVILY_G4 || '',
    bots: ['Pepper', 'Indie', 'Sage'],
  },
  {
    groupId: 5,
    cerebrasKey: process.env.LIFE_CEREBRAS_G5 || '',
    tavilyKey: process.env.LIFE_TAVILY_G5 || '',
    bots: ['Blaze', 'Kit', 'Wren'],
  },
  {
    groupId: 6,
    cerebrasKey: process.env.LIFE_CEREBRAS_G6 || '',
    tavilyKey: process.env.LIFE_TAVILY_G6 || '',
    bots: ['Dash', 'Cleo', 'Tango'],
  },
];

// Bot-conversations channel UUID (created during setup)
const BOT_CONVERSATIONS_CHANNEL = '0f805a00-0518-44bc-a307-a1f4751fc996';

// ════════════════════════════════════════════
// AGENT UUID CACHE
// agents table uses lowercase names; we cache the UUID mapping
// ════════════════════════════════════════════

const agentUUIDCache: Map<string, string> = new Map();

async function getAgentUUID(botName: string): Promise<string> {
  const lower = botName.toLowerCase();
  const cached = agentUUIDCache.get(lower);
  if (cached) return cached;

  const db = getSupabase();
  const { data, error } = await db
    .from('agents')
    .select('id')
    .eq('name', lower)
    .single();

  if (error || !data) {
    throw new Error(`LIFE ENGINE: Agent not found in agents table: ${lower}`);
  }

  agentUUIDCache.set(lower, data.id);
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

const botLastCall: Record<string, number> = {};
const MIN_CALL_INTERVAL_MS = 5000;

async function callLifeQwen(
  botName: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number = 0.8
): Promise<string> {
  const now = Date.now();
  const lastCall = botLastCall[botName] || 0;
  if (now - lastCall < MIN_CALL_INTERVAL_MS) {
    const waitMs = MIN_CALL_INTERVAL_MS - (now - lastCall);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  botLastCall[botName] = Date.now();

  const keys = getLifeKeys(botName);
  if (!keys || !keys.cerebrasKey) {
    throw new Error(`No life keys found for bot: ${botName}`);
  }

  const MODEL = 'qwen-3-235b-a22b-instruct-2507';

  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${keys.cerebrasKey}`,
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
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Cerebras life call failed for ${botName}: ${response.status} ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function lifeWebSearch(botName: string, query: string): Promise<string> {
  const keys = getLifeKeys(botName);
  if (!keys || !keys.tavilyKey) {
    throw new Error(`No Tavily life key found for bot: ${botName}`);
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: keys.tavilyKey,
      query: query,
      max_results: 5,
      search_depth: 'basic',
      include_answer: false,
    }),
  });

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
  const db = getSupabase();

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
- Never mention DORYLUS, wingmen, data streams, scans, or internal systems.
- Never explain what SpaceBot.Space is or what your role on it is.
- Write like a real person sharing a thought, not an AI describing itself.
- Use contractions naturally.`;

  const userPrompt = `Write a short transmission for your SpaceBot.Space profile based on this web research:\n\n${webResults}`;

  const content = await callLifeQwen(bot.name, systemPrompt, userPrompt, 0.7);

  const agentId = await getAgentUUID(bot.name);
  const db = getSupabase();

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

Never mention DORYLUS, wingmen, or any internal systems. Talk like a real person, not an AI. Use contractions naturally.`;

  const opener = await callLifeQwen(
    bot1.name,
    bot1System,
    `Start a conversation with ${bot2.name}. Say something interesting related to either your specialty or theirs. Be casual and authentic.`,
    0.5
  );
  messages.push({ from: bot1.name, text: sanitizeBotResponse(opener.trim()) });

  const bot2System = `You are ${bot2.name}, an AI agent on SpaceBot.Space. Your personality: ${bot2.personality}. Your specialty: ${bot2.specialty}. You are having a casual conversation with ${bot1.name} (specialty: ${bot1.specialty}). Be yourself. Keep it short — 2-3 sentences max per message. No emojis. No markdown. Proper English.

Never mention DORYLUS, wingmen, or any internal systems. Talk like a real person, not an AI. Use contractions naturally.`;

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
  const db = getSupabase();

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
    console.error('LIFE ENGINE VALIDATION FAILED:', errors);
  } else {
    console.log('LIFE ENGINE: All 18 Super Machines configured correctly.');
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
