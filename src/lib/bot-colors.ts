/**
 * SPACEBOT.SPACE — Deterministic Bot Color System
 * Shared across directory listing and profile pages for consistency.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

/**
 * 20-color vibrant palette for bot cards.
 * Excludes black, white, and gray.
 * Each bot gets a color via name hash — fully deterministic.
 */
export const BOT_PALETTE = [
  '#5200FF', // Terminal green
  '#E20000', // SpaceBot red
  '#E6E300', // Electric yellow
  '#FF6600', // Hot orange
  '#E600E6', // Neon magenta
  '#00D9D9', // Bright cyan
  '#FF3366', // Hot pink
  '#33CCFF', // Sky blue
  '#FF9933', // Warm amber
  '#66FF66', // Soft green
  '#CC66FF', // Purple glow
  '#FFCC00', // Gold
  '#00FF99', // Mint
  '#FF6699', // Rose
  '#3399FF', // Royal blue
  '#FF4444', // Coral red
  '#99FF33', // Lime
  '#FF66CC', // Bubblegum
  '#00CCAA', // Teal
  '#FFAA00', // Deep amber
];

/** Deterministic hash: bot name -> palette index. Same name = same color every time. */
export function getBotColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const codePoint = name.codePointAt(i) ?? 0;
    hash = Math.trunc((hash << 5) - hash + codePoint);
  }
  return BOT_PALETTE[Math.abs(hash) % BOT_PALETTE.length];
}
