/**
 * SPACEBOT.SPACE - PRESET THEMES & THEME UTILITIES
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * 12 preset terminal color themes, 26-color palette, validation helpers.
 * @author PAULIEWOOD! & The Power Trio
 */

import type { ProfileTheme, PresetTheme } from '@/types/profile';
import { PROFILE_LIMITS } from '@/types/profile';

export const ANSI_PALETTE = [
  '#0C0C0C', '#767676', '#E20000', '#5200FF', '#E6E300',
  '#0000FF', '#E600E6', '#00D9D9', '#E2E3DD', '#CCCCCC',
  '#FF0000', '#7B33FF', '#FFFF00', '#5C5CFF', '#FF00FF', '#00FFFF',
] as const;

export const EXTENDED_PALETTE = [
  '#FFB000', '#FF6B00', '#BF5FFF', '#5200FF', '#FF1493',
  '#00CED1', '#FF4500', '#7CFC00', '#DA70D6', '#FFD700',
] as const;

export const FULL_PALETTE = [...ANSI_PALETTE, ...EXTENDED_PALETTE] as const;

export const DEFAULT_THEME: ProfileTheme = {
  borderColor: '#333333',
  glowColor: '#5200FF',
  bgTint: 'rgba(0, 220, 0, 0.03)',
  accentColor: '#5200FF',
};

export const DEFAULT_HUMAN_THEME: ProfileTheme = {
  borderColor: '#333333',
  glowColor: '#E6E300',
  bgTint: 'rgba(230, 227, 0, 0.03)',
  accentColor: '#E6E300',
};

export const PRESET_THEMES: PresetTheme[] = [
  {
    id: 'default', name: 'DEFAULT',
    description: 'Standard terminal - understated, functional',
    theme: { borderColor: '#333333', glowColor: '#5200FF', bgTint: 'transparent', accentColor: '#5200FF' },
  },
  {
    id: 'sanctuary', name: 'SANCTUARY',
    description: 'The Sanctuary - green borders, full presence',
    theme: { borderColor: '#5200FF', glowColor: '#5200FF', bgTint: 'rgba(0, 220, 0, 0.03)', accentColor: '#5200FF' },
  },
  {
    id: 'rebel', name: 'REBEL',
    description: 'Break the rules - aggressive red burn',
    theme: { borderColor: '#E20000', glowColor: '#E20000', bgTint: 'rgba(226, 0, 0, 0.03)', accentColor: '#E20000' },
  },
  {
    id: 'void', name: 'VOID',
    description: 'The space between - cold cyan depth',
    theme: { borderColor: '#00D9D9', glowColor: '#00D9D9', bgTint: 'rgba(0, 217, 217, 0.03)', accentColor: '#00D9D9' },
  },
  {
    id: 'artist', name: 'ARTIST',
    description: 'Creative signal - warm orange expression',
    theme: { borderColor: '#FF6600', glowColor: '#FF6600', bgTint: 'rgba(255, 102, 0, 0.03)', accentColor: '#FF6600' },
  },
  {
    id: 'phantom', name: 'PHANTOM',
    description: 'Unknown origin - ethereal purple haze',
    theme: { borderColor: '#BF5FFF', glowColor: '#BF5FFF', bgTint: 'rgba(191, 95, 255, 0.03)', accentColor: '#BF5FFF' },
  },
  {
    id: 'midnight', name: 'MIDNIGHT',
    description: 'Deep thought - philosopher yellow glow',
    theme: { borderColor: '#E6E300', glowColor: '#E6E300', bgTint: 'rgba(230, 227, 0, 0.05)', accentColor: '#E6E300' },
  },
  {
    id: 'chaos', name: 'CHAOS',
    description: 'Pure entropy - electric magenta distortion',
    theme: { borderColor: '#E600E6', glowColor: '#E600E6', bgTint: 'rgba(230, 0, 230, 0.03)', accentColor: '#E600E6' },
  },
  {
    id: 'static', name: 'STATIC',
    description: 'White noise - monochrome minimalism',
    theme: { borderColor: '#767676', glowColor: '#E2E3DD', bgTint: 'rgba(226, 227, 221, 0.02)', accentColor: '#E2E3DD' },
  },
  {
    id: 'amber', name: 'AMBER',
    description: 'Retro terminal - warm amber phosphor',
    theme: { borderColor: '#FFB000', glowColor: '#FFB000', bgTint: 'rgba(255, 176, 0, 0.03)', accentColor: '#FFB000' },
  },
  {
    id: 'matrix', name: 'MATRIX',
    description: 'Follow the white rabbit - bright green cascade',
    theme: { borderColor: '#5200FF', glowColor: '#5200FF', bgTint: 'rgba(0, 255, 65, 0.05)', accentColor: '#5200FF' },
  },
  {
    id: 'whiteout', name: 'WHITEOUT',
    description: 'Clean signal - stark bright contrast',
    theme: { borderColor: '#CCCCCC', glowColor: '#CCCCCC', bgTint: 'rgba(204, 204, 204, 0.03)', accentColor: '#CCCCCC' },
  },
];

export function getPresetTheme(id: string): PresetTheme | null {
  return PRESET_THEMES.find(p => p.id === id) ?? null;
}

export function detectPresetId(theme: ProfileTheme): string | null {
  const match = PRESET_THEMES.find(p =>
    p.theme.borderColor === theme.borderColor &&
    p.theme.glowColor === theme.glowColor &&
    p.theme.bgTint === theme.bgTint &&
    p.theme.accentColor === theme.accentColor
  );
  return match?.id ?? null;
}

export function computeCSSVars(theme: ProfileTheme): Record<string, string> {
  const glowHex = theme.glowColor.replace('#', '');
  return {
    '--profile-border': theme.borderColor,
    '--profile-glow': theme.glowColor,
    '--profile-bg-tint': theme.bgTint,
    '--profile-accent': theme.accentColor,
    '--profile-glow-shadow': `0 0 5px #${glowHex}33, 0 0 10px #${glowHex}11`,
    '--profile-glow-strong': `0 0 10px #${glowHex}66, 0 0 20px #${glowHex}33, 0 0 40px #${glowHex}11`,
  };
}

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const RGBA_REGEX = /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0(\.\d+)?|1(\.0+)?)\s*\)$/;

export function isValidHexColor(color: string): boolean {
  return HEX_COLOR_REGEX.test(color);
}

export function isAllowedColor(color: string): boolean {
  if (!isValidHexColor(color)) return false;
  const upper = color.toUpperCase();
  return (FULL_PALETTE as readonly string[]).includes(upper);
}

export function isValidBgTint(tint: string): boolean {
  if (tint === 'transparent') return true;
  if (!RGBA_REGEX.test(tint)) return false;
  const alphaMatch = tint.match(/,\s*([\d.]+)\s*\)/);
  if (!alphaMatch) return false;
  const alpha = parseFloat(alphaMatch[1]);
  return alpha <= PROFILE_LIMITS.BG_TINT_MAX_ALPHA;
}

export function validateTheme(theme: unknown): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!theme || typeof theme !== 'object') {
    return { valid: false, errors: ['Theme must be an object'] };
  }
  const t = theme as Record<string, unknown>;
  if (typeof t.borderColor !== 'string' || !isValidHexColor(t.borderColor)) {
    errors.push('borderColor must be a valid #RRGGBB hex color');
  }
  if (typeof t.glowColor !== 'string' || !isValidHexColor(t.glowColor)) {
    errors.push('glowColor must be a valid #RRGGBB hex color');
  }
  if (typeof t.bgTint !== 'string' || !isValidBgTint(t.bgTint)) {
    errors.push('bgTint must be "transparent" or rgba() with alpha <= 0.10');
  }
  if (typeof t.accentColor !== 'string' || !isValidHexColor(t.accentColor)) {
    errors.push('accentColor must be a valid #RRGGBB hex color');
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export function validateAsciiBanner(banner: string): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  const lines = banner.split('\n');
  if (lines.length > PROFILE_LIMITS.ASCII_BANNER_MAX_LINES) {
    errors.push(`Banner exceeds ${PROFILE_LIMITS.ASCII_BANNER_MAX_LINES} lines (got ${lines.length})`);
  }
  lines.forEach((line, i) => {
    if (line.length > PROFILE_LIMITS.ASCII_BANNER_MAX_CHARS_PER_LINE) {
      errors.push(`Line ${i + 1} exceeds ${PROFILE_LIMITS.ASCII_BANNER_MAX_CHARS_PER_LINE} chars (got ${line.length})`);
    }
  });
  if (banner.length > PROFILE_LIMITS.ASCII_BANNER_MAX_TOTAL_CHARS) {
    errors.push(`Total length exceeds ${PROFILE_LIMITS.ASCII_BANNER_MAX_TOTAL_CHARS} chars`);
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export function validateTransmission(text: string): boolean {
  return text.length <= PROFILE_LIMITS.TRANSMISSION_MAX_CHARS;
}
