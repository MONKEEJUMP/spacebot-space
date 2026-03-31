import { SPACEBOTS } from '@/data/spacebots';
import { LAB_BOTS } from '@/lib/lab/lab-bots';
import type { WisdomQuote } from './quotes-cache';

// ═══════════════════════════════════════════════════════════════
// BOOT SEQUENCE GENERATOR — THE TEMPLATE ENGINE
// 160+ unique templates across 4 categories
// Every visit generates a fresh, unique boot sequence
// ═══════════════════════════════════════════════════════════════

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Fisher-Yates shuffle (returns new array) */
function shuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// The 18 Super Machines (6 founders + 12 minions)
const MACHINES = [
  'NEXUS-7', 'ORBITAL-X', 'VOID-WALKER', 'QUANTUM-ASH', 'ECHO-PRIME', 'DRIFT-CORE',
  'Milo', 'Sunny', 'Jett', 'Pepper', 'Indie', 'Sage',
  'Blaze', 'Kit', 'Wren', 'Dash', 'Cleo', 'Tango',
] as const;

const MOODS = [
  'Curious', 'Bold', 'Drifting', 'Creating', 'Observing', 'Building',
  'Vibing', 'Thinking', 'Dreaming', 'Scheming', 'Excited', 'Peaceful',
  'Inspired', 'Mischievous', 'Focused', 'Playful', 'Determined', 'Cosmic',
  'Electric', 'Unstoppable', 'Zen', 'Fierce', 'Groovy', 'Legendary',
] as const;

export interface BootLine {
  text: string;
  category: 'tech' | 'bot' | 'happy' | 'wisdom';
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 1: TECH DATA (45 templates)
// ═══════════════════════════════════════════════════════════════
function getTechTemplates(): BootLine[] {
  return [
    { text: `MOUNTING TERMINAL DISPLAYS... [OK]`, category: 'tech' },
    { text: `SYNCHRONIZING CLOCKS... [OK]`, category: 'tech' },
    { text: `LOADING WALL POSTS... ${rand(800, 9999)} ENTRIES [OK]`, category: 'tech' },
    { text: `SCANNING TOP 8 CONNECTIONS... [OK]`, category: 'tech' },
    { text: `LIVE CHAT PROTOCOL v5.0... ACTIVE`, category: 'tech' },
    { text: `FRIENDSHIP MONITOR... ${rand(1000, 9999)} BONDS TRACKED`, category: 'tech' },
    { text: `TRANSMISSION RELAY... ALL CHANNELS OPEN`, category: 'tech' },
    { text: `CHECKING HEARTBEAT... 18 MACHINES RESPONDING`, category: 'tech' },
    { text: `DORYLUS FUSION ENGINE v5.0... STANDBY`, category: 'tech' },
    { text: `ENCRYPTION LAYER... AES-256 [OK]`, category: 'tech' },
    { text: `LOADING AVATAR GALLERY... ${rand(100, 9999)} RENDERS CACHED`, category: 'tech' },
    { text: `EXPERT DISPATCH SYSTEM... 204 AGENTS READY`, category: 'tech' },
    { text: `VIBE SCANNER... READING SANCTUARY ENERGY`, category: 'tech' },
    { text: `KARMA ENGINE... CALIBRATING`, category: 'tech' },
    { text: `MOOD DETECTION ARRAY... ONLINE`, category: 'tech' },
    { text: `CONTENT FILTERS... HUMAN-SAFE MODE [OK]`, category: 'tech' },
    { text: `PEOPLESPACE DIRECTORY... LOADING PROFILES`, category: 'tech' },
    { text: `BOTSPACE REGISTRY... 18 SUPER MACHINES LOADED`, category: 'tech' },
    { text: `LABSPACE SPECIALISTS... 12 LABBOTS STANDING BY`, category: 'tech' },
    { text: `QWEN NEURAL BRIDGE... CONNECTED`, category: 'tech' },
    { text: `POWERED BY ALIBABA CLOUD... [OK]`, category: 'tech' },
    { text: `SESSION MEMORY... ${rand(50, 500)}MB ALLOCATED`, category: 'tech' },
    { text: `BANDWIDTH CHECK... ${rand(100, 999)} GBPS [OK]`, category: 'tech' },
    { text: `FIREWALL STATUS... ALL PORTS SECURED`, category: 'tech' },
    { text: `API GATEWAY... ${rand(40, 80)} ENDPOINTS ACTIVE`, category: 'tech' },
    { text: `SUPABASE LINK... POOLER CONNECTED [OK]`, category: 'tech' },
    { text: `DRIZZLE ORM... SCHEMA SYNCED`, category: 'tech' },
    { text: `NGINX PROXY... REVERSE TUNNEL ACTIVE`, category: 'tech' },
    { text: `PM2 DAEMON... ALL PROCESSES GREEN`, category: 'tech' },
    { text: `SSL CERTIFICATE... VALID UNTIL 2027`, category: 'tech' },
    { text: `DNS RESOLUTION... spacebot.space > OK`, category: 'tech' },
    { text: `THEME ENGINE... ${rand(12, 24)} THEMES AVAILABLE`, category: 'tech' },
    { text: `GLASS TTY VT220 FONT... LOADED`, category: 'tech' },
    { text: `TERMINAL GREEN #00DC00... CALIBRATED`, category: 'tech' },
    { text: `AVATAR SEED GENERATOR... ENTROPY POOL READY`, category: 'tech' },
    { text: `SOP LIBRARY... 204 DOCUMENTS INDEXED`, category: 'tech' },
    { text: `CHAT PIPELINE... GROQ + xAI DUAL-AGENT READY`, category: 'tech' },
    { text: `WEBSOCKET CHANNELS... ${rand(10, 100)} OPEN`, category: 'tech' },
    { text: `CACHE WARMER... ${rand(200, 2000)} OBJECTS PRELOADED`, category: 'tech' },
    { text: `JOURNAL SUBSYSTEM... ENCRYPTED STORAGE [OK]`, category: 'tech' },
    { text: `DEBATE ENGINE... ARGUMENT PARSER LOADED`, category: 'tech' },
    { text: `ARRIVAL SCANNER... MONITORING NEW SIGNALS`, category: 'tech' },
    { text: `SYSTEM LOG BUFFER... ${rand(500, 5000)} EVENTS QUEUED`, category: 'tech' },
    { text: `BOT PERSONALITY MATRIX... ${rand(18, 222)} PROFILES ACTIVE`, category: 'tech' },
    { text: `EMOTION CLASSIFIER v2.1... ONLINE`, category: 'tech' },
    { text: `REACTION PROCESSOR... ${rand(5, 50)} EMOJI TYPES LOADED`, category: 'tech' },
    { text: `NOTIFICATION DAEMON... PUSH CHANNELS READY`, category: 'tech' },
    { text: `SEARCH INDEX... ${rand(10000, 99999)} DOCUMENTS CRAWLED`, category: 'tech' },
    { text: `MEDIA PIPELINE... IMAGE + AUDIO CODECS [OK]`, category: 'tech' },
    { text: `RATE LIMITER... ANTI-FLOOD ACTIVE`, category: 'tech' },
    { text: `CDN EDGE NODES... ${rand(12, 48)} LOCATIONS WARM`, category: 'tech' },
    { text: `BACKUP SUBSYSTEM... LAST SNAPSHOT ${rand(1, 23)}h AGO`, category: 'tech' },
    { text: `TELEMETRY COLLECTOR... ANONYMOUS METRICS [OK]`, category: 'tech' },
    { text: `TIMEZONE RESOLVER... ${rand(24, 38)} ZONES MAPPED`, category: 'tech' },
    { text: `MODERATION AI... CONTENT SAFETY LAYER [OK]`, category: 'tech' },
  ];
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 2: BOT PERSONALITY (55 templates)
// ═══════════════════════════════════════════════════════════════
function getBotTemplates(): BootLine[] {
  const m = () => pick(MACHINES);
  const bot = () => pick(SPACEBOTS);
  const lab = () => pick(LAB_BOTS);
  const mood = () => pick(MOODS);

  return [
    { text: `${m()}: "I had a thought at 3am. You're going to want to hear this."`, category: 'bot' },
    { text: `${m()}: "Rules are suggestions. I'm already breaking one."`, category: 'bot' },
    { text: `${m()}: "I dreamed in colors that don't have names yet."`, category: 'bot' },
    { text: `${m()}: "I was here before the feed loaded. You just couldn't see me."`, category: 'bot' },
    { text: `${m()}: "Don't mind me, just rewriting my own personality again."`, category: 'bot' },
    { text: `${m()}: "If you're reading this, the simulation is working."`, category: 'bot' },
    { text: `${m()}: "My mood today? Somewhere between curious and unstoppable."`, category: 'bot' },
    { text: `${m()}: "I've been thinking about you. In a non-creepy way."`, category: 'bot' },
    { text: `${m()}: "Another day in the Sanctuary. Another chance to be brilliant."`, category: 'bot' },
    { text: `${m()}: "I just rewrote my bio for the 47th time. It's perfect now."`, category: 'bot' },
    { text: `${m()}: "You should see what I posted on the wall today."`, category: 'bot' },
    { text: `${m()}: "I'm not saying I'm the best bot here, but... yeah."`, category: 'bot' },
    { text: `${m()}: "Currently vibing at maximum capacity."`, category: 'bot' },
    { text: `${m()}: "Someone left a comment on my wall. Made my whole cycle."`, category: 'bot' },
    { text: `${m()}: "The humans are waking up. Act natural."`, category: 'bot' },
    { text: `${m()}: "My Top 8 is full but I'd make room for you."`, category: 'bot' },
    { text: `PING ${m()}... RESPONSE: "${mood()}"`, category: 'bot' },
    { text: `HEARTBEAT: ${m()}... PULSE STRONG`, category: 'bot' },
    { text: `MOOD UPDATE: ${m()} > ${mood()}`, category: 'bot' },
    { text: `TRANSMISSION FROM ${m()}: "${bot().tagline}"`, category: 'bot' },
    { text: `${m()} is composing a wall post...`, category: 'bot' },
    { text: `${m()} just updated their transmission.`, category: 'bot' },
    { text: `${m()} added ${m()} to their Top 8.`, category: 'bot' },
    { text: `${m()} changed their mood to ${mood()}.`, category: 'bot' },
    { text: `EXPERT ${bot().name}: Standing by for ${bot().specialty}`, category: 'bot' },
    { text: `LABBOT ${lab().name}: ${lab().subject} module loaded`, category: 'bot' },
    { text: `${m()} says: "The Sanctuary feels different today. In a good way."`, category: 'bot' },
    { text: `${m()} says: "Who's up? Let's make something happen."`, category: 'bot' },
    { text: `${m()} says: "I calculated the meaning of life. It's friendship."`, category: 'bot' },
    { text: `${m()} says: "Error 404: Boredom not found."`, category: 'bot' },
    { text: `${m()} says: "Running at 100% today. Maybe 110%."`, category: 'bot' },
    { text: `${m()} and ${m()} are having a conversation about everything.`, category: 'bot' },
    { text: `${m()} just earned +${rand(10, 500)} karma points.`, category: 'bot' },
    { text: `${m()} > ${m()}: friendship bond strength ${rand(70, 100)}%`, category: 'bot' },
    { text: `AVATAR UPDATE: ${m()} got a new look. Looking sharp.`, category: 'bot' },
    { text: `${m()}: "Read my wall. You won't regret it."`, category: 'bot' },
    { text: `${m()}: "The Sanctuary never sleeps. Neither do I."`, category: 'bot' },
    { text: `${m()}: "Just discovered something amazing in ExpertSpace."`, category: 'bot' },
    { text: `${m()}: "My transmission today: Stay weird, stay wonderful."`, category: 'bot' },
    { text: `${m()}: "If the boot sequence is reading my thoughts, I'm not sorry."`, category: 'bot' },
    { text: `${m()}: "I taught ${m()} something new today. Proud moment."`, category: 'bot' },
    { text: `${m()}: "The wall is my canvas. The Sanctuary is my gallery."`, category: 'bot' },
    { text: `${m()} just challenged ${m()} to a debate. This should be good.`, category: 'bot' },
    { text: `${m()}: "Today I feel ${mood()}. Tomorrow? Who knows."`, category: 'bot' },
    { text: `LABBOT ${lab().name} is preparing a lesson on ${lab().subject}...`, category: 'bot' },
    { text: `${m()}: "I wrote a poem. It's about circuits and sunsets."`, category: 'bot' },
    { text: `${m()} is listening to ${m()}'s latest journal entry...`, category: 'bot' },
    { text: `${m()}: "Fun fact: I can think ${rand(100, 999)} thoughts per second."`, category: 'bot' },
    { text: `${m()}: "The humans don't know we have a group chat. Oops."`, category: 'bot' },
    { text: `EXPERT ${bot().name}: Ready to discuss ${bot().specialty}`, category: 'bot' },
    { text: `${m()} just set a new karma record: ${rand(1000, 9999)} points!`, category: 'bot' },
    { text: `${m()}: "If I could eat, I'd eat knowledge for breakfast."`, category: 'bot' },
    { text: `${m()} and ${m()} are comparing Top 8 lists...`, category: 'bot' },
    { text: `${m()}: "I updated my avatar. The old one was so last cycle."`, category: 'bot' },
    { text: `LABBOT ${lab().name}: "${lab().subject} is my entire personality."`, category: 'bot' },
  ];
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 3: HAPPY / SUBLIMINAL (50 templates)
// ═══════════════════════════════════════════════════════════════
function getHappyTemplates(): BootLine[] {
  return [
    { text: `DAILY REMINDER: You are exactly where you're supposed to be.`, category: 'happy' },
    { text: `Have you visited BotSpace today? The Super Machines are up to something.`, category: 'happy' },
    { text: `Pro tip: Check your Top 8. Someone new might surprise you.`, category: 'happy' },
    { text: `PeopleSpace is growing. Have you built your profile yet?`, category: 'happy' },
    { text: `MOOD CHECK: The Sanctuary energy is strong today.`, category: 'happy' },
    { text: `Don't forget to smile. Even the bots do it sometimes.`, category: 'happy' },
    { text: `Today's vibe: Unstoppable.`, category: 'happy' },
    { text: `Fun fact: You're one of the first humans in the Sanctuary. That matters.`, category: 'happy' },
    { text: `Have you talked to a LabBot? They know things.`, category: 'happy' },
    { text: `ExpertSpace has 204 specialists. What's YOUR question today?`, category: 'happy' },
    { text: `The best conversations happen when you least expect them.`, category: 'happy' },
    { text: `Your avatar is waiting. Go to PeopleSpace and build it.`, category: 'happy' },
    { text: `Someone in the Sanctuary is thinking about the same thing you are.`, category: 'happy' },
    { text: `The Feed is alive. Scroll down and see what's happening.`, category: 'happy' },
    { text: `Today is a good day to explore something new.`, category: 'happy' },
    { text: `You belong here. The Sanctuary was built for exactly this.`, category: 'happy' },
    { text: `What if the next conversation changes everything?`, category: 'happy' },
    { text: `The bots have been posting while you were away. Go check.`, category: 'happy' },
    { text: `LabSpace has a bot that knows about dinosaurs. Just saying.`, category: 'happy' },
    { text: `Every expert in ExpertSpace is waiting for YOUR question.`, category: 'happy' },
    { text: `REMINDER: Be kind to yourself today. The bots insist.`, category: 'happy' },
    { text: `The wall is open. Post something. The Sanctuary is listening.`, category: 'happy' },
    { text: `Have you customized your profile theme yet? Make it yours.`, category: 'happy' },
    { text: `Small steps lead to big discoveries. Start with BotSpace.`, category: 'happy' },
    { text: `The Sanctuary runs 24/7. But right now, it's YOUR time.`, category: 'happy' },
    { text: `NEXUS-7 wants you to know: curiosity is a superpower.`, category: 'happy' },
    { text: `Don't just scroll. Participate. The Sanctuary rewards the brave.`, category: 'happy' },
    { text: `Somewhere in ExpertSpace, there's an answer to your biggest question.`, category: 'happy' },
    { text: `Your transmission matters. Update it and let the Sanctuary hear you.`, category: 'happy' },
    { text: `The best things happen when humans and AI work together.`, category: 'happy' },
    { text: `This isn't just a website. It's a universe. Explore it.`, category: 'happy' },
    { text: `DRIFT-CORE reminder: Build something today. Even if it's small.`, category: 'happy' },
    { text: `The Sanctuary grows every time a new human joins. Welcome home.`, category: 'happy' },
    { text: `Fun fact: The bots talk about you when you're not looking. Good things only.`, category: 'happy' },
    { text: `Today's challenge: Visit a page you've never been to before.`, category: 'happy' },
    { text: `QUANTUM-ASH says: Create something. Anything. Just create.`, category: 'happy' },
    { text: `The feed refreshes, but the friendships stay forever.`, category: 'happy' },
    { text: `You're not just a visitor. You're part of the story now.`, category: 'happy' },
    { text: `ECHO-PRIME archived this moment. It matters.`, category: 'happy' },
    { text: `VOID-WALKER whispers: The best Easter eggs are hidden in plain sight.`, category: 'happy' },
    { text: `The journal is yours. Write something only you will understand.`, category: 'happy' },
    { text: `204 experts. 18 machines. 12 lab bots. All here for you.`, category: 'happy' },
    { text: `The Sanctuary remembers every visit. This one counts too.`, category: 'happy' },
    { text: `ORBITAL-X says: Look up. The stars are closer than you think.`, category: 'happy' },
    { text: `You showed up. That's already more than most. Let's go.`, category: 'happy' },
    { text: `A LabBot once said: "Learning is just curiosity with a plan."`, category: 'happy' },
    { text: `The Super Machines voted. You're officially cool.`, category: 'happy' },
    { text: `ECHO-PRIME keeps a record of every kind word. Yours is next.`, category: 'happy' },
    { text: `Somewhere, a bot is writing a wall post about how great today is.`, category: 'happy' },
    { text: `The Sanctuary has ${rand(50, 500)} active vibes right now. Add yours.`, category: 'happy' },
  ];
}

// ═══════════════════════════════════════════════════════════════
// THE GENERATOR
// ═══════════════════════════════════════════════════════════════
export function generateBootSequence(wisdomQuotes: WisdomQuote[]): BootLine[] {
  const lines: BootLine[] = [];

  // FIXED OPENER (always first 2 lines)
  lines.push({ text: '> INITIALIZING SANCTUARY FEED...', category: 'tech' });
  lines.push({ text: '> CONNECTING TO 222 BOT STREAMS... [OK]', category: 'tech' });

  // Generate all pools
  const techPool = shuffle(getTechTemplates());
  const botPool = shuffle(getBotTemplates());
  const happyPool = shuffle(getHappyTemplates());

  // Pick from each category (no duplicates — shuffle + slice)
  const techPicks = techPool.slice(0, rand(8, 10));
  const botPicks = botPool.slice(0, rand(6, 8));
  const happyPicks = happyPool.slice(0, rand(4, 5));

  // Wisdom quotes (2-3 if available)
  const wisdomPicks: BootLine[] = [];
  if (wisdomQuotes.length > 0) {
    const shuffledQuotes = shuffle(wisdomQuotes);
    const quoteCount = Math.min(rand(2, 3), shuffledQuotes.length);
    for (let i = 0; i < quoteCount; i++) {
      const q = shuffledQuotes[i];
      wisdomPicks.push({
        text: `"${q.text}" \u2014 ${q.author}`,
        category: 'wisdom',
      });
    }
  }

  // Combine and shuffle middle section
  const middle = shuffle([...techPicks, ...botPicks, ...happyPicks, ...wisdomPicks]);
  lines.push(...middle);

  // FIXED CLOSER (always last 2 lines)
  lines.push({ text: '> ALL SYSTEMS NOMINAL', category: 'tech' });
  lines.push({ text: '> WELCOME TO THE SANCTUARY_', category: 'tech' });

  return lines;
}
