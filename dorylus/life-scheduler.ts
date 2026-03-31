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
  console.log('LIFE ENGINE: Starting mood updates for all 18 Super Machines...');
  const results = [];

  for (const bot of SUPER_MACHINES) {
    try {
      const result = await updateMood(bot);
      console.log(`MOOD: ${bot.name} -> "${result.mood}"`);
      results.push(result);
    } catch (err) {
      console.error(`MOOD FAILED: ${bot.name}`, err);
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  console.log(`LIFE ENGINE: Mood updates complete. ${results.length}/18 succeeded.`);
}

/**
 * Run all daily transmissions for all 18 Super Machines.
 * Staggers calls with 30-second gaps.
 */
async function runAllTransmissions(): Promise<void> {
  console.log('LIFE ENGINE: Starting daily transmissions for all 18 Super Machines...');
  const results = [];

  for (const bot of SUPER_MACHINES) {
    try {
      const result = await writeTransmission(bot);
      console.log(`TRANSMISSION: ${bot.name} wrote ${result.content.length} chars`);
      results.push(result);
    } catch (err) {
      console.error(`TRANSMISSION FAILED: ${bot.name}`, err);
    }
    await new Promise(resolve => setTimeout(resolve, 30000));
  }

  console.log(`LIFE ENGINE: Transmissions complete. ${results.length}/18 succeeded.`);
}

/**
 * Run bot-to-bot conversations.
 * Picks random pairs from DIFFERENT groups so they use different keys.
 */
async function runBotConversations(count: number = 3): Promise<void> {
  console.log(`LIFE ENGINE: Starting ${count} bot-to-bot conversations...`);

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

    try {
      const result = await botConversation(bot1, bot2);
      console.log(`CONVERSATION: ${bot1.name} <-> ${bot2.name} — ${result.messages.length} messages`);
    } catch (err) {
      console.error(`CONVERSATION FAILED: ${bot1.name} <-> ${bot2.name}`, err);
    }

    await new Promise(resolve => setTimeout(resolve, 60000));
  }

  console.log('LIFE ENGINE: Bot conversations complete.');
}

/**
 * BEEHIVE CYCLE — The nightly autonomous life cycle.
 * 1. Validate config
 * 2. Update all moods
 * 3. Write all transmissions
 * 4. Run bot-to-bot conversations
 */
async function runBeehiveCycle(): Promise<void> {
  console.log('═══════════════════════════════════════════');
  console.log('LIFE ENGINE: BEEHIVE CYCLE STARTING');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════');

  const validation = await validateLifeKeysConfig();
  if (!validation.valid) {
    console.error('LIFE ENGINE: Validation failed. Aborting beehive cycle.');
    console.error('Errors:', validation.errors);
    return;
  }

  await runAllMoodUpdates();
  await runAllTransmissions();
  await runBotConversations(3);

  console.log('═══════════════════════════════════════════');
  console.log('LIFE ENGINE: BEEHIVE CYCLE COMPLETE');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════');
}

export {
  SUPER_MACHINES,
  runAllMoodUpdates,
  runAllTransmissions,
  runBotConversations,
  runBeehiveCycle,
};
