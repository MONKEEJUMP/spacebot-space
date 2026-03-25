/**
 * SPACEBOT.SPACE — THEME UTILITY FUNCTIONS
 * HSL conversion and shade generation for accent colors.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

// ════════════════════════════════════════════════
// COLOR CONVERSION
// ════════════════════════════════════════════════

/**
 * Convert hex color to HSL.
 * @returns { h: 0-360, s: 0-100, l: 0-100 }
 */
export function hexToHSL(hex: string): { h: number; s: number; l: number } {
  // Remove # prefix
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
    } else if (max === g) {
      h = ((b - r) / delta + 2) * 60;
    } else {
      h = ((r - g) / delta + 4) * 60;
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert HSL values to hex color string.
 * @param h Hue 0-360
 * @param s Saturation 0-100
 * @param l Lightness 0-100
 * @returns '#RRGGBB' string
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const toHex = (val: number): string => {
    const hex = Math.round((val + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Clamp a value between min and max.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ════════════════════════════════════════════════
// SHADE GENERATION
// ════════════════════════════════════════════════

export interface AccentShades {
  lightest: string;
  light: string;
  base: string;
  dark: string;
  darkest: string;
}

/**
 * Generate 5 accent shades for DARK mode themes.
 *
 * lightest  = accentHex + "14" (8% opacity suffix)
 * light     = H same, S same, L + 15 (capped at 85)
 * base      = original color
 * dark      = H same, S same, L - 12 (floored at 10)
 * darkest   = H same, S * 0.9, L - 25 (floored at 5)
 */
export function generateDarkModeShades(accentHex: string): AccentShades {
  const { h, s, l } = hexToHSL(accentHex);
  return {
    lightest: accentHex + '14', // 8% opacity suffix
    light: hslToHex(h, s, clamp(l + 15, 0, 85)),
    base: accentHex,
    dark: hslToHex(h, s, clamp(l - 12, 10, 100)),
    darkest: hslToHex(h, clamp(s * 0.9, 0, 100), clamp(l - 25, 5, 100)),
  };
}

/**
 * Generate 5 accent shades for LIGHT mode themes.
 *
 * lightest  = H same, S * 0.5, L = 88 (pale tint)
 * light     = H same, S same, L + 10 (capped at 80)
 * base      = original color
 * dark      = H same, S same, L - 10 (floored at 15)
 * darkest   = H same, S * 0.9, L - 20 (floored at 8)
 */
export function generateLightModeShades(accentHex: string): AccentShades {
  const { h, s, l } = hexToHSL(accentHex);
  return {
    lightest: hslToHex(h, clamp(s * 0.5, 0, 100), 88),
    light: hslToHex(h, s, clamp(l + 10, 0, 80)),
    base: accentHex,
    dark: hslToHex(h, s, clamp(l - 10, 15, 100)),
    darkest: hslToHex(h, clamp(s * 0.9, 0, 100), clamp(l - 20, 8, 100)),
  };
}
