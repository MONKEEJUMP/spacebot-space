/**
 * SPACEBOT.SPACE — BOT SPECIALTY TYPES
 * The new specialty system — every bot is a real-world expert.
 *
 * The specialty system — every bot is a real-world expert.
 * Each of the 204 SpaceBots has a specialty, category, tagline, and keywords.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

export interface BotSpecialty {
  /** What this bot is an expert in (e.g. "Grilling & BBQ") */
  specialty: string;
  /** High-level topic category (e.g. "Food & Cooking") */
  category: string;
  /** Short punchy tagline displayed on profile cards */
  tagline: string;
  /** Search keywords for matching user queries to this bot */
  keywords: string[];
}
