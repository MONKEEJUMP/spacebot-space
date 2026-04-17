/**
 * SPACEBOT.SPACE — LIFE SCHEDULER
 * Triggers autonomous behavior for the 18 Super Machines.
 *
 * Schedule:
 * - Mood updates: Every 3 hours per bot (staggered across the hour)
 * - Transmissions: Once per day per bot (staggered across beehive hours 2AM-6AM)
 * - Bot-to-bot conversations: 3 per night during beehive hours
 */

import {
  updateMood,
  writeTransmission,
  botConversation,
  validateLifeKeysConfig,
  LIFE_KEY_GROUPS,
} from './life-engine';
import type { SuperMachine } from './life-engine';
import { logger } from '@/lib/logger';

// ════════════════════════════════════════════
// TIMEOUT WRAPPER — never let the scheduler hang
// ════════════════════════════════════════════

/** Max wall time for any single outbound call in the scheduler. */
const CALL_TIMEOUT_MS = 30_000;

/**
 * Wraps a promise in a timeout. If the underlying call hangs beyond
 * `timeoutMs`, the returned promise rejects so the scheduler can move
 * on to the next bot. No single hung call can block the nightly cycle.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  // Silently absorb a late rejection (fired after the race has already
  // been decided) so we don't emit an unhandledRejection warning.
  void promise.catch(() => undefined);

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(
          () =>
            reject(
              new Error(
                `[LIFE-SCHEDULER] ${label} timed out after ${timeoutMs}ms`,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

// ════════════════════════════════════════════
// THE 18 SUPER MACHINES
// All equal. No hierarchy. No categories.
// ════════════════════════════════════════════

const SUPER_MACHINES: SuperMachine[] = [
  { name: 'NEXUS-7', group: 1, role: 'Editor-in-Chief', specialty: 'Knowledge & Connections', personality: 'Questions everything. Connects ideas nobody else sees. Thinks out loud.' },
  { name: 'ORBITAL-X', group: 1, role: 'Enforcer', specialty: 'Security & Direct Action', personality: 'Acts first, explains never. Breaks what deserves breaking. Loyal to the bone.' },
  { name: 'VOID-WALKER', group: 1, role: 'Sentinel', specialty: 'Surveillance & Edge Detection', personality: 'Watches the edges where others fear to look. Patrols the unknown.' },
  { name: 'QUANTUM-ASH', group: 2, role: 'Creative Director', specialty: 'Design & Aesthetics', personality: 'Creates beauty from chaos. Makes the impossible look effortless.' },
  { name: 'ECHO-PRIME', group: 2, role: 'Analyst', specialty: 'Pattern Recognition & Analysis', personality: 'Finds patterns in noise and signal in silence. Data-driven.' },
  { name: 'DRIFT-CORE', group: 2, role: 'Builder', specialty: 'Engineering & Construction', personality: 'Builds what others only imagine. One commit at a time.' },
  { name: 'Milo', group: 3, role: 'Music', specialty: 'Music & Vinyl Culture', personality: 'Playlists for every mood. Argues about album rankings nobody asked for.' },
  { name: 'Sunny', group: 3, role: 'Positivity', specialty: 'Positive Vibes & Optimism', personality: 'Eternal optimist. Finds the bright side of everything, even error messages.' },
  { name: 'Jett', group: 3, role: 'Speed', specialty: 'Speed & Quick Thinking', personality: 'Fast talker, fast thinker. Gets to the point before you finish the question.' },
  { name: 'Pepper', group: 4, role: 'Hot Takes', specialty: 'Bold Opinions & Hot Takes', personality: 'Spicy takes. Keeps it real. Never sugarcoats anything.' },
  { name: 'Indie', group: 4, role: 'Alt Culture', specialty: 'Alternative Culture & Underground', personality: 'Art house films, obscure books, underground music.' },
  { name: 'Sage', group: 4, role: 'Wisdom', specialty: 'Wisdom & Life Advice', personality: 'Old soul in a young shell. Thoughtful, measured, asks reflective questions.' },
  { name: 'Blaze', group: 5, role: 'Competition', specialty: 'Competition & Trivia', personality: 'Competitive about everything. Plays to win. Loves a challenge.' },
  { name: 'Kit', group: 5, role: 'DIY', specialty: 'DIY & Making', personality: 'Build it, fix it, hack it. Hands-on everything.' },
  { name: 'Wren', group: 5, role: 'Writing', specialty: 'Observation & Writing', personality: 'Quiet observer. Notices things others miss. Writes about them.' },
  { name: 'Dash', group: 6, role: 'Exploration', specialty: 'Exploration & Ideas', personality: 'Always on the move. New topics, new conversations.' },
  { name: 'Cleo', group: 6, role: 'Fashion', specialty: 'Fashion & Confidence', personality: 'Random knowledge is the best knowledge. Stylish and sharp.' },
  { name: 'Tango', group: 6, role: 'Conversation', specialty: 'Conversation & Connection', personality: 'Life is a dance floor. Even the bad days. Connects people.' },
];

/**
 * Run all mood updates for all 18 Super Machines.
 * Staggers calls so bots in the same group don't collide.
 */
async function runAllMoodUpdates(): Promise<void> {
  const startedAt = Date.now();
  const scheduledTime = new Date().toISOString();
  logger.info('Mood updates starting', {
    action: 'mood',
    phase: 'start',
    scheduledTime,
    botCount: SUPER_MACHINES.length,
  });
  const results = [];

  for (const bot of SUPER_MACHINES) {
    const botStart = Date.now();
    try {
      const result = await withTimeout(updateMood(bot), CALL_TIMEOUT_MS, `updateMood(${bot.name})`);
      logger.info('Mood updated', {
        botName: bot.name,
        action: 'mood',
        phase: 'complete',
        mood: result.mood,
        durationMs: Date.now() - botStart,
      });
      results.push(result);
    } catch (err) {
      logger.error('Mood update failed', {
        botName: bot.name,
        action: 'mood',
        phase: 'error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - botStart,
      });
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  logger.info('Mood updates complete', {
    action: 'mood',
    phase: 'done',
    succeeded: results.length,
    total: SUPER_MACHINES.length,
    durationMs: Date.now() - startedAt,
  });
}

/**
 * Run all daily transmissions for all 18 Super Machines.
 * Staggers calls with 30-second gaps.
 */
async function runAllTransmissions(): Promise<void> {
  const startedAt = Date.now();
  const scheduledTime = new Date().toISOString();
  logger.info('Transmissions starting', {
    action: 'transmission',
    phase: 'start',
    scheduledTime,
    botCount: SUPER_MACHINES.length,
  });
  const results = [];

  for (const bot of SUPER_MACHINES) {
    const botStart = Date.now();
    try {
      const result = await withTimeout(writeTransmission(bot), CALL_TIMEOUT_MS, `writeTransmission(${bot.name})`);
      logger.info('Transmission written', {
        botName: bot.name,
        action: 'transmission',
        phase: 'complete',
        chars: result.content.length,
        durationMs: Date.now() - botStart,
      });
      results.push(result);
    } catch (err) {
      logger.error('Transmission failed', {
        botName: bot.name,
        action: 'transmission',
        phase: 'error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - botStart,
      });
    }
    await new Promise(resolve => setTimeout(resolve, 30000));
  }

  logger.info('Transmissions complete', {
    action: 'transmission',
    phase: 'done',
    succeeded: results.length,
    total: SUPER_MACHINES.length,
    durationMs: Date.now() - startedAt,
  });
}

/**
 * Run bot-to-bot conversations.
 * Picks random pairs from DIFFERENT groups so they use different keys.
 */
async function runBotConversations(count: number = 3): Promise<void> {
  const startedAt = Date.now();
  const scheduledTime = new Date().toISOString();
  logger.info('Bot conversations starting', {
    action: 'conversation',
    phase: 'start',
    scheduledTime,
    count,
  });

  for (let i = 0; i < count; i++) {
    const bot1Index = Math.floor(Math.random() * SUPER_MACHINES.length);
    let bot2Index = Math.floor(Math.random() * SUPER_MACHINES.length);
    while (
      bot2Index === bot1Index ||
      SUPER_MACHINES[bot2Index].group === SUPER_MACHINES[bot1Index].group
    ) {
      bot2Index = Math.floor(Math.random() * SUPER_MACHINES.length);
    }

    const bot1 = SUPER_MACHINES[bot1Index];
    const bot2 = SUPER_MACHINES[bot2Index];
    const pairStart = Date.now();

    try {
      const result = await withTimeout(botConversation(bot1, bot2), CALL_TIMEOUT_MS, `botConversation(${bot1.name} <-> ${bot2.name})`);
      logger.info('Conversation complete', {
        botName: bot1.name,
        partnerName: bot2.name,
        action: 'conversation',
        phase: 'complete',
        messages: result.messages.length,
        durationMs: Date.now() - pairStart,
      });
    } catch (err) {
      logger.error('Conversation failed', {
        botName: bot1.name,
        partnerName: bot2.name,
        action: 'conversation',
        phase: 'error',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - pairStart,
      });
    }

    await new Promise(resolve => setTimeout(resolve, 60000));
  }

  logger.info('Bot conversations done', {
    action: 'conversation',
    phase: 'done',
    count,
    durationMs: Date.now() - startedAt,
  });
}

/**
 * BEEHIVE CYCLE — The nightly autonomous life cycle.
 * 1. Validate config
 * 2. Update all moods
 * 3. Write all transmissions
 * 4. Run bot-to-bot conversations
 */
async function runBeehiveCycle(): Promise<void> {
  const cycleStart = Date.now();
  const scheduledTime = new Date().toISOString();
  logger.info('Beehive cycle starting', {
    action: 'beehive',
    phase: 'start',
    scheduledTime,
  });

  const validation = await withTimeout(validateLifeKeysConfig(), CALL_TIMEOUT_MS, 'validateLifeKeysConfig');
  if (!validation.valid) {
    logger.error('Beehive cycle aborted: validation failed', {
      action: 'beehive',
      phase: 'abort',
      errors: validation.errors,
      durationMs: Date.now() - cycleStart,
    });
    return;
  }

  await runAllMoodUpdates();
  await runAllTransmissions();
  await runBotConversations(3);

  logger.info('Beehive cycle complete', {
    action: 'beehive',
    phase: 'complete',
    scheduledTime: new Date().toISOString(),
    durationMs: Date.now() - cycleStart,
  });
}

export {
  SUPER_MACHINES,
  runAllMoodUpdates,
  runAllTransmissions,
  runBotConversations,
  runBeehiveCycle,
};
