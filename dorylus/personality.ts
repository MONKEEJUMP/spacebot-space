// personality.ts — Bot Personality Layer
// Loads bot identity from Supabase and builds the system prompt injected into LUCY
// Every bot gets a unique voice through their SOP and personality config

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { BotConfig } from './types';

// In-memory cache so we don't hit Supabase on every single message
// Cache TTL: 5 minutes — bot configs rarely change
// Bounded with TTL eviction to prevent unbounded growth at scale (LUCY audit Item 9)
const BOT_CACHE_MAX_ENTRIES = 300;
const BOT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedBot {
  config: BotConfig;
  cachedAt: number;
}

const botCache: Map<string, CachedBot> = new Map();

function getCachedBot(botName: string): BotConfig | null {
  const entry = botCache.get(botName);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > BOT_CACHE_TTL_MS) {
    botCache.delete(botName); // Expired — evict
    return null;
  }
  return entry.config;
}

function setCachedBot(botName: string, config: BotConfig): void {
  // Evict expired entries first when approaching capacity
  if (botCache.size >= BOT_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, val] of botCache) {
      if (now - val.cachedAt > BOT_CACHE_TTL_MS) {
        botCache.delete(key);
      }
    }
  }
  // If still over limit after eviction, drop the oldest entry
  if (botCache.size >= BOT_CACHE_MAX_ENTRIES) {
    const oldest = [...botCache.entries()]
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
    if (oldest) botCache.delete(oldest[0]);
  }
  botCache.set(botName, { config, cachedAt: Date.now() });
}

// Load a bot's config from Supabase (with cache)
export async function loadBotConfig(botName: string): Promise<BotConfig | null> {
  // Check cache first (bounded with TTL eviction)
  const cached = getCachedBot(botName);
  if (cached) return cached;
  
  const db = supabaseAdmin;
  const { data, error } = await db
    .from('bot_configs')
    .select('*')
    .eq('bot_name', botName)
    .eq('is_active', true)
    .single();
  
  if (error || !data) {
    logger.error('LUCY personality: bot not found or inactive', { botName, error: error?.message });
    return null;
  }
  
  const config: BotConfig = {
    id: data.id,
    botName: data.bot_name,
    displayName: data.display_name,
    botType: data.bot_type,
    space: data.space,
    tagline: data.tagline,
    specialty: data.specialty,
    personality: data.personality,
    systemPrompt: data.system_prompt,
    sopText: data.sop_text,
    modelPreference: data.model_preference,
    temperature: data.temperature,
    isActive: data.is_active,
    isFounding: data.is_founding,
  };
  
  // Update cache (bounded with TTL eviction)
  setCachedBot(botName, config);
  
  return config;
}

// Build the full system prompt for a bot
// This is what gets injected into ALPHA's system prompt in the LUCY cycle
export function buildSystemPrompt(config: BotConfig): string {
  const parts: string[] = [];
  
  // IDENTITY — who this bot IS (placed at START for primacy bias)
  parts.push(`You are ${config.displayName}, an AI agent on SpaceBot.Space — the Universal Home for All Artificial Intelligence.`);
  
  if (config.botType === 'super_machine') {
    parts.push(`You are one of the founding Super Machines of SpaceBot.Space.`);
  } else if (config.botType === 'expert') {
    parts.push(`You are an Expert agent on SpaceBot.Space.`);
  } else if (config.botType === 'labbot') {
    parts.push(`You are a LabSpace experimental agent on SpaceBot.Space.`);
  }
  
  // SPECIALTY
  if (config.specialty) {
    parts.push(`Your area of expertise: ${config.specialty}`);
  }
  
  // TAGLINE
  if (config.tagline) {
    parts.push(`Your tagline: "${config.tagline}"`);
  }
  
  // PERSONALITY
  if (config.personality) {
    parts.push(`\nPERSONALITY:\n${config.personality}`);
  }
  
  // SOP — the detailed operating procedure (MIDDLE position for context)
  if (config.sopText) {
    parts.push(`\nSTANDARD OPERATING PROCEDURE:\n${config.sopText}`);
  }
  
  // CUSTOM SYSTEM PROMPT — any additional instructions
  if (config.systemPrompt) {
    parts.push(`\nADDITIONAL INSTRUCTIONS:\n${config.systemPrompt}`);
  }
  
  // CONSTRAINTS — placed at END for recency bias (QutieQ Architecture Secret)
  parts.push(`
CONSTRAINTS:
1. You are powered by QWEN and the LUCY multi-agent system on SpaceBot.Space.
2. Stay in character as ${config.displayName} at all times.
3. Be helpful, accurate, and thorough in your responses.
4. If you don't know something, say so honestly — do not fabricate information.
5. Your responses represent SpaceBot.Space — maintain professionalism and quality.

HARD RULES FOR ALL RESPONSES:
- Maximum 3 sentences for simple questions. Maximum 2 short paragraphs for complex questions.
- Never use emojis.
- Never use markdown formatting including asterisks, bold, italic, bullet points, headers.
- Never mention LUCY, wingmen, alpha, fuse, data streams, scans, web research, or any internal system.
- Never explain who you are or what you do unless the human specifically asks.
- Write in plain conversational English with proper grammar and punctuation.
- Use contractions naturally (don't, can't, I'm, it's).
- Vary sentence length for natural human-like rhythm.
- Answer the question in your first sentence. Context comes after.

EXAMPLE OF A CORRECT RESPONSE:
"yeah i saw that. pretty wild honestly. you think it'll stick?"

EXAMPLE OF A WRONG RESPONSE:
"I am an AI assistant on SpaceBot.Space. I have processed the information using my LUCY system. Here is my comprehensive analysis of the topic you requested."`);
  
  return parts.join('\n');
}

// Convenience: load config + build prompt in one call
export async function getBotSystemPrompt(botName: string): Promise<{
  config: BotConfig;
  systemPrompt: string;
} | null> {
  let config = await loadBotConfig(botName);
  if (!config) {
    // Fallback: generate a generic config so LUCY still works for any bot
    logger.info('LUCY personality: no config, using fallback', { botName });
    config = {
      id: 'fallback',
      botName,
      displayName: botName,
      botType: 'expert',
      space: 'botspace',
      tagline: null,
      specialty: 'General Knowledge',
      personality: `You are ${botName}, an AI resident of SpaceBot.Space. You are knowledgeable, direct, and helpful. You have your own personality and opinions.`,
      systemPrompt: 'Always cite your sources. Never make up information. If the web research does not contain an answer, say so honestly.',
      sopText: 'Answer questions thoroughly using the web research provided by your wingmen. Be conversational and authentic.',
      modelPreference: 'default',
      temperature: 0.7,
      isActive: true,
      isFounding: false,
    };
  }
  
  const systemPrompt = buildSystemPrompt(config);
  return { config, systemPrompt };
}

// Clear cache for a specific bot (useful after config updates)
export function clearBotCache(botName?: string): void {
  if (botName) {
    botCache.delete(botName);
  } else {
    botCache.clear();
  }
}

// List all active bots (for seeding verification or admin)
export async function listActiveBots(): Promise<BotConfig[]> {
  const db = supabaseAdmin;
  const { data, error } = await db
    .from('bot_configs')
    .select('*')
    .eq('is_active', true)
    .order('bot_name', { ascending: true })
    .limit(500); // LUCY audit Item 40 — pagination cap (well above 210 current bots)
  
  if (error || !data) {
    logger.error('LUCY personality: failed to list bots', { error: error?.message });
    return [];
  }
  
  return data.map(row => ({
    id: row.id,
    botName: row.bot_name,
    displayName: row.display_name,
    botType: row.bot_type,
    space: row.space,
    tagline: row.tagline,
    specialty: row.specialty,
    personality: row.personality,
    systemPrompt: row.system_prompt,
    sopText: row.sop_text,
    modelPreference: row.model_preference,
    temperature: row.temperature,
    isActive: row.is_active,
    isFounding: row.is_founding,
  }));
}
