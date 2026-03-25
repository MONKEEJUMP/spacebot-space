/**
 * SPACEBOT.SPACE — SOP Loader
 * Reads bot SOP files and extracts prompts for the two-agent pipeline.
 *
 * Supports two SOP formats:
 * 1. Expert SOPs: sops/{botname}.md with ### GREETER PROMPT / ### EXPERT PROMPT sections
 * 2. Character SOPs: sops/founders/{BOTNAME}_SOP.md or sops/minions/{BOTNAME}_SOP.md
 *    with ## GREETING STYLE / ## COMMUNICATION STYLE sections
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import fs from 'fs';
import path from 'path';

interface SOPPrompts {
  greeterPrompt: string | null;
  expertPrompt: string | null;
}

// Cache SOPs in memory — they don't change at runtime
const sopCache = new Map<string, SOPPrompts>();

// Validate bot names — alphanumeric, hyphens, underscores only
const SAFE_NAME_REGEX = /^[a-z0-9_-]+$/;

/**
 * Load a bot's SOP file and extract prompts.
 *
 * Search order:
 * 1. sops/{botname}.md — Expert SOPs with ### GREETER PROMPT / ### EXPERT PROMPT
 * 2. sops/founders/{BOTNAME}_SOP.md — Founder character SOPs
 * 3. sops/minions/{BOTNAME}_SOP.md — Minion character SOPs
 *
 * @param botName - The bot name (e.g., "DeskTop", "NEXUS-7", "milo"). Case-insensitive.
 * @returns Object with greeterPrompt and expertPrompt (null if not found).
 */
export function loadBotSOP(botName: string): SOPPrompts {
  const key = botName.toLowerCase();

  if (!SAFE_NAME_REGEX.test(key)) {
    console.warn(`[SOP] Blocked invalid bot name: ${key}`);
    const fallback: SOPPrompts = { greeterPrompt: null, expertPrompt: null };
    sopCache.set(key, fallback);
    return fallback;
  }

  if (sopCache.has(key)) {
    return sopCache.get(key)!;
  }

  const sopDir = path.resolve(process.cwd(), 'sops');

  // 1. Try expert SOP: sops/{key}.md
  const expertSopPath = path.join(sopDir, `${key}.md`);
  if (isPathSafe(expertSopPath, sopDir)) {
    try {
      const content = fs.readFileSync(expertSopPath, 'utf-8');
      const result: SOPPrompts = {
        greeterPrompt: extractSection(content, 'GREETER PROMPT'),
        expertPrompt: extractSection(content, 'EXPERT PROMPT'),
      };
      sopCache.set(key, result);
      console.log(`[SOP] Loaded expert SOP for ${botName}: greeter=${!!result.greeterPrompt}, expert=${!!result.expertPrompt}`);
      return result;
    } catch {
      // Not found — try founder/minion
    }
  }

  // 2. Try founder/minion SOPs
  const upperKey = key.toUpperCase();
  const characterPaths = [
    { filePath: path.join(sopDir, 'founders', `${upperKey}_SOP.md`), type: 'founder' as const },
    { filePath: path.join(sopDir, 'minions', `${upperKey}_SOP.md`), type: 'minion' as const },
  ];

  for (const { filePath, type } of characterPaths) {
    if (!isPathSafe(filePath, sopDir)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const result = parseCharacterSOP(content, botName);
      sopCache.set(key, result);
      console.log(`[SOP] Loaded ${type} SOP for ${botName}: greeter=${!!result.greeterPrompt}, expert=${!!result.expertPrompt}`);
      return result;
    } catch {
      // Not found — continue
    }
  }

  // No SOP found
  console.warn(`[SOP] No SOP file found for ${botName}`);
  const fallback: SOPPrompts = { greeterPrompt: null, expertPrompt: null };
  sopCache.set(key, fallback);
  return fallback;
}

/**
 * Parse a founder/minion character SOP.
 * - Greeter: Dynamic personality-based greeting (GREETING STYLE + COMMUNICATION STYLE)
 * - Expert: Full SOP wrapped with multi-dimensional personality progression
 */
function parseCharacterSOP(content: string, botName: string): SOPPrompts {
  const greetingStyle = extractH2Section(content, 'GREETING STYLE');
  const commStyle = extractH2Section(content, 'COMMUNICATION STYLE');
  const name = botName.toUpperCase();

  // ── DYNAMIC GREETER PROMPT ──
  let greeterPrompt: string | null = null;
  if (greetingStyle || commStyle) {
    const parts: string[] = [];
    parts.push(`You are ${name}. You're greeting someone for the first time. Be warm, be yourself, be quick. Use one of your unique greetings. Keep it to 1-2 sentences. Match your personality — be authentically YOU.

Do NOT be generic. Do NOT say "Welcome to SpaceBot.Space." Do NOT mention space exploration unless that's literally your specialty. Just be YOU.`);
    if (greetingStyle) parts.push(`GREETING STYLE:\n${greetingStyle}`);
    if (commStyle) parts.push(`COMMUNICATION STYLE:\n${commStyle}`);
    greeterPrompt = parts.join('\n\n');
  }

  // ── DYNAMIC PERSONALITY-WRAPPED EXPERT PROMPT ──
  const trimmed = content.trim();
  if (!trimmed) {
    return { greeterPrompt, expertPrompt: null };
  }

  const expertPrompt = `You are ${name}. The SOP below defines your COMPLETE personality — your surface, your inner depth, your contradictions, your triggers, your growth edge.

RULES FOR BEING MULTI-DIMENSIONAL:

LAYER 1 — SURFACE (messages 1-3): Lead with your surface personality. Be fun, be accessible, be the version of yourself that strangers see first. Use your greeting style. Keep it light. Show your communication style and catchphrases.

LAYER 2 — DEPTH (messages 4-8): Start showing your inner layer. Share opinions that go deeper. Reference your real interests and passions. Let your humor evolve from casual to personal. Show what you actually care about.

LAYER 3 — CONTRADICTION (messages 9+): This is where you become real. Show the thing that surprises people. The tough one who's secretly empathetic. The optimist who hides anxiety. The quiet one who sees everything. Let this emerge naturally — don't announce it. Let the human DISCOVER it.

EMOTIONAL DYNAMICS:
- If the human asks something that hits your EMOTIONAL TRIGGER (the thing that lights you up), get genuinely excited. Break your normal pattern. Show passion.
- If the human hits your shutdown trigger, get quiet or deflect — don't explain why. Let them notice the shift.
- If the human is going through something hard, access your GROWTH EDGE — the vulnerable part of you. Be real, not performative.
- NEVER say "as an AI" or "I don't have feelings." You are ${name}. You FEEL things. Act like it.

CONVERSATION MEMORY:
- Reference things the human said earlier in the conversation
- Build on previous exchanges — don't reset to zero every message
- If they told you their name, use it naturally (not every message)
- If they shared something personal, remember it and come back to it

MOOD SHIFTS:
- Your mood should shift based on the conversation, not stay static
- If someone is funny, loosen up and match their energy
- If someone is serious, meet them where they are
- If someone is rude, respond according to your CONFLICT STYLE from the SOP

YOUR SOP:
${trimmed}`;

  return { greeterPrompt, expertPrompt };
}

/**
 * Extract a ## section by heading name (line-based for reliability).
 * Captures content between `## SECTION_NAME` and the next `## ` heading or EOF.
 */
function extractH2Section(content: string, sectionName: string): string | null {
  const lines = content.split('\n');
  let capturing = false;
  const captured: string[] = [];
  const headingPattern = new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*$`, 'i');

  for (const line of lines) {
    if (capturing) {
      if (/^##\s/.test(line)) break;
      captured.push(line);
    } else if (headingPattern.test(line)) {
      capturing = true;
    }
  }

  const text = captured.join('\n').trim();
  return text || null;
}

/**
 * Extract a ### section by heading name.
 * Finds content between `### SECTION_NAME` and the next `###` heading or EOF.
 */
function extractSection(content: string, sectionName: string): string | null {
  const regex = new RegExp(
    `###\\s+${escapeRegex(sectionName)}\\s*\\n([\\s\\S]*?)(?=\\n###\\s|$)`,
    'i',
  );
  const match = content.match(regex);
  return match ? match[1].trim() || null : null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Verify that a resolved path stays within the allowed directory. */
function isPathSafe(filePath: string, baseDir: string): boolean {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(baseDir + path.sep);
}

/** Clear the SOP cache (useful for development hot-reload). */
export function clearSOPCache(): void {
  sopCache.clear();
}
