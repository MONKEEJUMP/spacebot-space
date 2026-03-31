/**
 * SPACEBOT.SPACE — BOT SPECIALTIES (re-export)
 * Builds the BOT_SPECIALTIES lookup from SPACEBOTS array.
 *
 * Replaces the old 204-entry BOT_PERSONALITIES record.
 * All specialty data now lives in spacebots.ts — single source of truth.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import type { BotSpecialty } from './botPersonalityTypes';
import { SPACEBOTS } from './spacebots';

export const BOT_SPECIALTIES: Record<string, BotSpecialty> = Object.fromEntries(
  SPACEBOTS.map((bot) => [
    bot.name,
    {
      specialty: bot.specialty,
      category: bot.category,
      tagline: bot.tagline,
      keywords: bot.keywords,
    },
  ]),
);
