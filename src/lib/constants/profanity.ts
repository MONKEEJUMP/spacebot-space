/**
 * SPACEBOT.SPACE — PROFANITY FILTER
 * Basic blocklist for Transmissions Wall content moderation.
 * QutieQ mandate: non-negotiable safety layer.
 */

export const BLOCKED_WORDS: string[] = [
  'fuck', 'shit', 'ass', 'bitch', 'dick', 'pussy', 'cock',
  'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'whore',
  'slut', 'bastard', 'motherfucker', 'asshole', 'bullshit',
  'goddamn', 'piss', 'twat', 'wanker', 'chink', 'spic',
  'kike', 'wetback', 'tranny', 'dyke',
];

/**
 * Check if content contains blocked words.
 * Uses word-boundary matching to avoid false positives.
 */
export function containsProfanity(content: string): boolean {
  const lower = content.toLowerCase();
  return BLOCKED_WORDS.some((word) => {
    const regex = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return regex.test(lower);
  });
}
