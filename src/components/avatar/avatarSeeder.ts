/**
 * SPACEBOT.SPACE — Avatar Seeder
 * Deterministic PRNG and config generation from seed string
 */

import {
  RobotConfig, FactionPalette,
  BODY_TYPES, EYE_TYPES, HUMAN_EYE_TYPES, MOUTH_TYPES, ACCESSORIES,
  HUMAN_ACCESSORIES, BOT_ACCESSORIES, SHARED_ACCESSORIES,
  SURFACE_FINISHES, ANIMATION_TYPES, FACTION_COLORS, HUMAN_COLORS,
} from './avatarConfig';

// ═══════════════════════════════════════════════
// SEEDED PRNG — Lehmer algorithm (deterministic)
// ═══════════════════════════════════════════════

export function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.codePointAt(i) ?? 0;
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  hash = (Math.abs(hash) % 2147483646) + 1;
  return function () {
    hash = (hash * 16807) % 2147483647;
    return (hash - 1) / 2147483646;
  };
}

export function generateUID(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h) + (seed.codePointAt(i) ?? 0);
    h = h & h;
  }
  return `av${Math.abs(h).toString(36)}`;
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ═══════════════════════════════════════════════
// CONFIG GENERATION
// ═══════════════════════════════════════════════

export function generateConfig(rng: () => number, _faction?: string, isBot?: boolean): RobotConfig {
  const bodyType = pick(BODY_TYPES, rng);
  const eyeType = isBot === false ? pick(HUMAN_EYE_TYPES, rng) : pick(EYE_TYPES, rng);
  const mouthPool = isBot === false ? MOUTH_TYPES.filter(m => m !== 'none') : MOUTH_TYPES;
  const mouthType = pick(mouthPool, rng);
  const surfaceFinish = pick(SURFACE_FINISHES, rng);
  const animationType = pick(ANIMATION_TYPES, rng);

  // 2-4 accessories without duplicates
  const numAccessories = 2 + Math.floor(rng() * 3);
  const pool = [...ACCESSORIES];
  const selected: string[] = [];
  for (let i = 0; i < numAccessories && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    selected.push(pool.splice(idx, 1)[0]);
  }

  // Tilts for personality
  const headTilt = (rng() * 8) - 4;   // -4 to +4 degrees
  const eyeTilt = (rng() * 6) - 3;    // -3 to +3 degrees

  // Surface detail counts
  const panelLineCount = 2 + Math.floor(rng() * 3);  // 2-4
  const rivetCount = 3 + Math.floor(rng() * 4);       // 3-6
  const boltCount = [0, 2, 3, 4][Math.floor(rng() * 4)];

  // Serial number suffix
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let serialSuffix = '';
  for (let i = 0; i < 4; i++) {
    serialSuffix += chars[Math.floor(rng() * chars.length)];
  }

  // Human accessories (2-4, no duplicates) — merged with SHARED pool (40 total)
  let humanAccessories: string[] = [];
  if (isBot === false) {
    const numHumanAcc = 2 + Math.floor(rng() * 3);
    const hPool: string[] = [...HUMAN_ACCESSORIES, ...SHARED_ACCESSORIES];
    for (let i = 0; i < numHumanAcc && hPool.length > 0; i++) {
      const idx = Math.floor(rng() * hPool.length);
      humanAccessories.push(hPool.splice(idx, 1)[0]);
    }
  }

  // Bot accessories (2-4, no duplicates) — merged with SHARED pool (40 total)
  let botAccessories: string[] = [];
  if (isBot === true) {
    const numBotAcc = 2 + Math.floor(rng() * 3);
    const bPool: string[] = [...BOT_ACCESSORIES, ...SHARED_ACCESSORIES];
    for (let i = 0; i < numBotAcc && bPool.length > 0; i++) {
      const idx = Math.floor(rng() * bPool.length);
      botAccessories.push(bPool.splice(idx, 1)[0]);
    }
  }

  return {
    bodyType,
    eyeType,
    mouthType,
    accessories: selected,
    surfaceFinish,
    animationType,
    headTilt,
    eyeTilt,
    panelLineCount,
    rivetCount,
    boltCount,
    serialSuffix,
    humanAccessories,
    botAccessories,
  };
}

// ═══════════════════════════════════════════════
// COLOR RESOLUTION
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// COLOR SHUFFLE DECK — ensures all colors used before any repeats
// ═══════════════════════════════════════════════

let colorDeck: FactionPalette[] = [];

function shuffleArray<T>(arr: T[], rng?: () => number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const random = rng ? rng() : Math.random();
    const j = Math.floor(random * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function dealColor(rng?: () => number): FactionPalette {
  if (colorDeck.length === 0) {
    colorDeck = shuffleArray(HUMAN_COLORS, rng);
  }
  return colorDeck.pop()!;
}

export function getColors(faction?: string, isBot?: boolean, rng?: () => number): FactionPalette {
  if (isBot && faction && FACTION_COLORS[faction]) {
    return FACTION_COLORS[faction];
  }
  // Use shuffle deck for random generation — guarantees all 20 colors used before repeats
  return dealColor(rng);
}
