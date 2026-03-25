/**
 * SPACEBOT.SPACE — Avatar Color Utilities
 * Color manipulation for metallic gradients and lighting effects
 */

/**
 * Parse hex OR rgb()/rgba() color to RGB components
 */
export function hexToRgb(color: string): { r: number; g: number; b: number } {
  // Handle rgb() and rgba() strings
  if (color.startsWith('rgb')) {
    const match = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (match) {
      return {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
      };
    }
    return { r: 0, g: 0, b: 0 };
  }
  // Handle hex strings
  const clean = color.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

/**
 * Convert RGB to CSS string
 */
export function rgbString(r: number, g: number, b: number, a?: number): string {
  if (a !== undefined) return `rgba(${r},${g},${b},${a})`;
  return `rgb(${r},${g},${b})`;
}

/**
 * Lighten a hex color by mixing toward white
 * @param hex - Base color like '#FF6600'
 * @param percent - 0 to 100, how much to lighten
 * @returns CSS rgb() string
 */
export function lightenColor(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const factor = percent / 100;
  return rgbString(
    Math.min(255, Math.round(r + (255 - r) * factor)),
    Math.min(255, Math.round(g + (255 - g) * factor)),
    Math.min(255, Math.round(b + (255 - b) * factor)),
  );
}

/**
 * Darken a hex color by mixing toward black
 * @param hex - Base color like '#FF6600'
 * @param percent - 0 to 100, how much to darken
 * @returns CSS rgb() string
 */
export function darkenColor(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 - (percent / 100);
  return rgbString(
    Math.max(0, Math.round(r * factor)),
    Math.max(0, Math.round(g * factor)),
    Math.max(0, Math.round(b * factor)),
  );
}

/**
 * Get color with alpha
 */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbString(r, g, b, alpha);
}
