/**
 * SPACEBOT.SPACE — ALL 14 SITE THEME DEFINITIONS
 * Each theme has complete 33 CSS variable maps.
 * Hex values copied EXACTLY from THEME_SYSTEM_ARCHITECTURE.md Section 6.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import type { SiteThemeId, SiteThemeDefinition } from '@/types/theme';

// ════════════════════════════════════════════════
// SHARED CONSTANTS
// ════════════════════════════════════════════════

const DARK_BG = {
  '--sb-bg-primary': '#0C0C0C',
  '--sb-bg-secondary': '#141414',
  '--sb-bg-tertiary': '#1A1A1A',
  '--sb-bg-elevated': '#1E1E1E',
} as const;

const DARK_TEXT = {
  '--sb-text-primary': '#CCCCCC',
  '--sb-text-secondary': '#767676',
  '--sb-text-tertiary': '#4A4A4A',
} as const;

const DARK_BORDERS = {
  '--sb-border-primary': '#333333',
  '--sb-border-secondary': '#222222',
} as const;

const STATUS_COLORS = {
  '--sb-status-online': '#5200FF',
  '--sb-status-error': '#E20000',
  '--sb-status-warning': '#E6E300',
  '--sb-status-info': '#4A9EFF',
} as const;

const DARK_SPECIAL_BASE = {
  '--sb-scrollbar-thumb': '#767676',
  '--sb-border-radius': '0px',
  '--sb-border-width': '1px',
  '--sb-font-body': "'Glass TTY VT220', 'JetBrains Mono', monospace",
  '--sb-font-display': "'Glass TTY VT220', 'Press Start 2P', monospace",
} as const;

/** Helper: build glow values from accent hex */
function glow(hex: string) {
  return {
    '--sb-glow': `0 0 5px ${hex}33, 0 0 10px ${hex}11`,
    '--sb-glow-strong': `0 0 10px ${hex}66, 0 0 20px ${hex}33, 0 0 40px ${hex}11`,
  } as const;
}

/** Helper: build a complete dark accent theme */
function darkTheme(
  id: SiteThemeId,
  name: string,
  description: string,
  accent: `#${string}`,
  accentLight: string,
  accentDark: string,
  accentDarkest: string,
  overrides?: Partial<SiteThemeDefinition['vars']>,
): SiteThemeDefinition {
  return {
    id,
    name,
    description,
    mode: 'dark',
    accentHex: accent,
    vars: {
      ...DARK_BG,
      ...DARK_TEXT,

      '--sb-accent-lightest': `${accent}14`,
      '--sb-accent-light': accentLight,
      '--sb-accent': accent,
      '--sb-accent-dark': accentDark,
      '--sb-accent-darkest': accentDarkest,

      ...DARK_BORDERS,
      ...STATUS_COLORS,

      '--sb-link-color': accent,
      '--sb-link-hover': accentLight,
      '--sb-link-visited': accent,

      '--sb-nav-bg': '#0C0C0C',
      '--sb-nav-text': accent,
      '--sb-nav-hover': accentLight,
      '--sb-nav-border': '#333333',

      ...glow(accent),

      '--sb-caret-color': accent,
      '--sb-selection-bg': accent,
      '--sb-selection-text': '#0C0C0C',
      '--sb-scrollbar-hover': accent,
      ...DARK_SPECIAL_BASE,

      ...overrides,
    },
  };
}

// ════════════════════════════════════════════════
// ALL 13 THEMES
// ════════════════════════════════════════════════

const THEME_DARK: SiteThemeDefinition = {
  id: 'dark',
  name: 'Dark Mode',
  description: 'Terminal Green on black. The default SpaceBot experience.',
  mode: 'dark',
  accentHex: '#5200FF',
  vars: {
    ...DARK_BG,
    ...DARK_TEXT,

    '--sb-accent-lightest': '#5200FF10',
    '--sb-accent-light': '#33FF33',
    '--sb-accent': '#5200FF',
    '--sb-accent-dark': '#3D00CC',
    '--sb-accent-darkest': '#006600',

    ...DARK_BORDERS,
    ...STATUS_COLORS,

    '--sb-link-color': '#00D9D9',
    '--sb-link-hover': '#5200FF',
    '--sb-link-visited': '#00D9D9',

    '--sb-nav-bg': '#0C0C0C',
    '--sb-nav-text': '#5200FF',
    '--sb-nav-hover': '#5200FF',
    '--sb-nav-border': '#333333',

    ...glow('#5200FF'),

    '--sb-caret-color': '#5200FF',
    '--sb-selection-bg': '#5200FF',
    '--sb-selection-text': '#0C0C0C',
    '--sb-scrollbar-hover': '#5200FF',
    ...DARK_SPECIAL_BASE,
  },
};

const THEME_CYAN: SiteThemeDefinition = darkTheme(
  'cyan', 'Cyan', 'Electric cyan on black. Hyperlink energy.',
  '#00D9D9', '#33FFFF', '#00A8A8', '#006666',
  {
    '--sb-link-color': '#00D9D9',
    '--sb-link-hover': '#33FFFF',
    '--sb-link-visited': '#00D9D9',
  },
);

const THEME_BLUE: SiteThemeDefinition = darkTheme(
  'blue', 'Blue', 'Cool blue on black. Calm and focused.',
  '#4A9EFF', '#7DBBFF', '#2D7DD6', '#1A4D8A',
);

const THEME_PURPLE: SiteThemeDefinition = darkTheme(
  'purple', 'Purple', 'Deep purple on black. Creative and mysterious.',
  '#8A4AFF', '#AA7AFF', '#6A2DD6', '#3D1A80',
);

const THEME_MAGENTA: SiteThemeDefinition = darkTheme(
  'magenta', 'Magenta', 'Vivid magenta on black. Bold and electric.',
  '#E600E6', '#FF33FF', '#B300B3', '#660066',
);

const THEME_PINK: SiteThemeDefinition = darkTheme(
  'pink', 'Pink', 'Vibrant pink on black. Energetic and fun.',
  '#FF4A8D', '#FF7DAD', '#D62D6B', '#801A40',
);

const THEME_RED: SiteThemeDefinition = darkTheme(
  'red', 'Red', 'Alert red on black. Intense and powerful.',
  '#E20000', '#FF3333', '#B30000', '#660000',
  { '--sb-selection-text': '#FFFFFF' },
);

const THEME_ORANGE: SiteThemeDefinition = darkTheme(
  'orange', 'Orange', 'Warm orange on black. Friendly and inviting.',
  '#FF6A00', '#FF8A33', '#CC5500', '#803500',
);

const THEME_GOLD: SiteThemeDefinition = darkTheme(
  'gold', 'Gold', 'Rich gold on black. Premium and polished.',
  '#FFD44A', '#FFE07D', '#D4AD2D', '#806818',
);

const THEME_YELLOW: SiteThemeDefinition = darkTheme(
  'yellow', 'Yellow', 'Bright yellow on black. Warning level vibes.',
  '#E6E300', '#F5F466', '#B3B000', '#666500',
);

const THEME_INVERT: SiteThemeDefinition = {
  id: 'invert',
  name: 'Invert',
  description: 'Full color inversion. Everything flips. Wild and experimental.',
  mode: 'dark',
  accentHex: '#FF23FF',
  vars: {
    '--sb-bg-primary': '#F3F3F3',
    '--sb-bg-secondary': '#EBEBEB',
    '--sb-bg-tertiary': '#E5E5E5',
    '--sb-bg-elevated': '#E1E1E1',

    '--sb-text-primary': '#333333',
    '--sb-text-secondary': '#898989',
    '--sb-text-tertiary': '#B5B5B5',

    '--sb-accent-lightest': '#FF23FF14',
    '--sb-accent-light': '#CC00CC',
    '--sb-accent': '#FF23FF',
    '--sb-accent-dark': '#FF55FF',
    '--sb-accent-darkest': '#FF99FF',

    '--sb-border-primary': '#CCCCCC',
    '--sb-border-secondary': '#DDDDDD',

    ...STATUS_COLORS,

    '--sb-link-color': '#FF23FF',
    '--sb-link-hover': '#CC00CC',
    '--sb-link-visited': '#FF23FF',

    '--sb-nav-bg': '#F3F3F3',
    '--sb-nav-text': '#FF23FF',
    '--sb-nav-hover': '#CC00CC',
    '--sb-nav-border': '#CCCCCC',

    ...glow('#FF23FF'),

    '--sb-caret-color': '#FF23FF',
    '--sb-selection-bg': '#FF23FF',
    '--sb-selection-text': '#F3F3F3',
    '--sb-scrollbar-hover': '#FF23FF',
    ...DARK_SPECIAL_BASE,
  },
};

const THEME_LIGHT: SiteThemeDefinition = {
  id: 'light',
  name: 'Light Mode',
  description: 'Clean and bright. Terminal vibes in daylight.',
  mode: 'light',
  accentHex: '#1877F2',
  vars: {
    '--sb-bg-primary': '#F0F2F5',
    '--sb-bg-secondary': '#FFFFFF',
    '--sb-bg-tertiary': '#F0F2F5',
    '--sb-bg-elevated': '#E4E6EB',
    '--sb-text-primary': '#050505',
    '--sb-text-secondary': '#65676B',
    '--sb-text-tertiary': '#8A8D91',

    '--sb-accent-lightest': '#1877F215',
    '--sb-accent-light': '#EBF5FF',
    '--sb-accent': '#1877F2',
    '--sb-accent-dark': '#166FE5',
    '--sb-accent-darkest': '#1466D1',

    '--sb-border-primary': '#CED0D4',
    '--sb-border-secondary': '#E4E6EB',

    '--sb-status-online': '#1877F2',
    '--sb-status-error': '#E41E3F',
    '--sb-status-warning': '#F0AD4E',
    '--sb-status-info': '#1877F2',

    '--sb-link-color': '#1877F2',
    '--sb-link-hover': '#166FE5',
    '--sb-link-visited': '#1466D1',

    '--sb-nav-bg': '#F0F2F5',
    '--sb-nav-text': '#050505',
    '--sb-nav-hover': '#1877F2',
    '--sb-nav-border': '#CED0D4',

    '--sb-glow': 'none',
    '--sb-glow-strong': 'none',

    '--sb-caret-color': '#1877F2',
    '--sb-selection-bg': '#1877F2',
    '--sb-selection-text': '#FFFFFF',
    '--sb-scrollbar-thumb': '#CED0D4',
    '--sb-scrollbar-hover': '#1877F2',
    '--sb-border-radius': '0px',
    '--sb-border-width': '1px',
    '--sb-font-body': "'Glass TTY VT220', 'JetBrains Mono', monospace",
    '--sb-font-display': "'Glass TTY VT220', 'Press Start 2P', monospace",
  },
};

const THEME_INVERTED: SiteThemeDefinition = {
  id: 'inverted',
  name: 'Inverted',
  description: 'Terminal Green on light backgrounds. The Sanctuary, flipped.',
  mode: 'light',
  accentHex: '#006600',
  vars: {
    '--sb-bg-primary': '#E8E8E8',
    '--sb-bg-secondary': '#D4D4D4',
    '--sb-bg-tertiary': '#C0C0C0',
    '--sb-bg-elevated': '#F0F0F0',

    '--sb-text-primary': '#0C0C0C',
    '--sb-text-secondary': '#1A1A1A',
    '--sb-text-tertiary': '#333333',

    '--sb-accent-lightest': '#290099',
    '--sb-accent-light': '#004D00',
    '--sb-accent': '#006600',
    '--sb-accent-dark': '#008000',
    '--sb-accent-darkest': '#00B300',

    '--sb-border-primary': '#999999',
    '--sb-border-secondary': '#AAAAAA',

    '--sb-status-online': '#006600',
    '--sb-status-error': '#CC0000',
    '--sb-status-warning': '#CC8800',
    '--sb-status-info': '#003399',

    '--sb-link-color': '#006600',
    '--sb-link-hover': '#008800',
    '--sb-link-visited': '#004400',

    '--sb-nav-bg': '#D4D4D4',
    '--sb-nav-text': '#0C0C0C',
    '--sb-nav-hover': '#006600',
    '--sb-nav-border': '#999999',

    '--sb-glow': '0 0 5px #00660044',
    '--sb-glow-strong': '0 0 10px #00660088',

    '--sb-caret-color': '#006600',
    '--sb-selection-bg': '#006600',
    '--sb-selection-text': '#FFFFFF',
    '--sb-scrollbar-thumb': '#999999',
    '--sb-scrollbar-hover': '#006600',
    '--sb-border-radius': '0px',
    '--sb-border-width': '1px',
    '--sb-font-body': "'Glass TTY VT220', 'JetBrains Mono', monospace",
    '--sb-font-display': "'Glass TTY VT220', 'Press Start 2P', monospace",
  },
};

const THEME_CLASSIC_MYSPACE: SiteThemeDefinition = {
  id: 'classic-myspace',
  name: 'Classic MySpace',
  description: 'The OG. White backgrounds, navy blue, chunky borders. Pure nostalgia.',
  mode: 'myspace',
  accentHex: '#003366',
  vars: {
    '--sb-bg-primary': '#FFFFFF',
    '--sb-bg-secondary': '#FFFFFF',
    '--sb-bg-tertiary': '#F0F0F0',
    '--sb-bg-elevated': '#E8E8E8',

    '--sb-text-primary': '#000000',
    '--sb-text-secondary': '#333333',
    '--sb-text-tertiary': '#666666',

    '--sb-accent-lightest': '#B2D4EA',
    '--sb-accent-light': '#336699',
    '--sb-accent': '#003366',
    '--sb-accent-dark': '#002244',
    '--sb-accent-darkest': '#001122',

    '--sb-border-primary': '#CCCCCC',
    '--sb-border-secondary': '#DDDDDD',

    ...STATUS_COLORS,

    '--sb-link-color': '#0000FF',
    '--sb-link-hover': '#0000CC',
    '--sb-link-visited': '#660099',

    '--sb-nav-bg': '#003366',
    '--sb-nav-text': '#FFFFFF',
    '--sb-nav-hover': '#B2D4EA',
    '--sb-nav-border': '#002244',

    '--sb-glow': 'none',
    '--sb-glow-strong': 'none',

    '--sb-caret-color': '#003366',
    '--sb-selection-bg': '#003366',
    '--sb-selection-text': '#FFFFFF',
    '--sb-scrollbar-thumb': '#CCCCCC',
    '--sb-scrollbar-hover': '#003366',
    '--sb-border-radius': '0px',
    '--sb-border-width': '2px',
    '--sb-font-body': "'Glass TTY VT220', 'JetBrains Mono', monospace",
    '--sb-font-display': "'Glass TTY VT220', 'Press Start 2P', monospace",
  },
};

// ════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════

export const SITE_THEMES: readonly SiteThemeDefinition[] = [
  THEME_ORANGE,
  THEME_DARK,
  THEME_CYAN,
  THEME_BLUE,
  THEME_PURPLE,
  THEME_MAGENTA,
  THEME_PINK,
  THEME_RED,
  THEME_GOLD,
  THEME_YELLOW,
  THEME_INVERT,
  THEME_LIGHT,
] as const;

/** All theme definitions including hidden ones (for CSS/validation) */
export const ALL_THEME_DEFINITIONS: readonly SiteThemeDefinition[] = [
  ...SITE_THEMES,
  THEME_INVERTED,
  THEME_CLASSIC_MYSPACE,
] as const;

// ════════════════════════════════════════════════
// BOT ACCENT → THEME MAPPING
// ════════════════════════════════════════════════

/**
 * Map a bot's accent hex color to the nearest SiteThemeId.
 * Used for profile-visit theme switching on bot/expert profiles.
 */
const ACCENT_TO_THEME: Record<string, SiteThemeId> = {
  '#33CCFF': 'cyan',
  '#FFCC00': 'gold',
  '#FF6600': 'orange',
  '#E20000': 'red',
  '#CC66FF': 'purple',
  '#00FF99': 'dark',
  '#FF3366': 'pink',
  '#00D9D9': 'cyan',
  '#E600E6': 'magenta',
  '#5200FF': 'dark',
  '#FFD44A': 'gold',
  '#3399FF': 'blue',
  '#E6E300': 'yellow',
  '#4A9EFF': 'blue',
  '#7B33FF': 'dark',
};

export function botAccentToThemeId(accentColor: string): SiteThemeId {
  return ACCENT_TO_THEME[accentColor] ?? 'dark';
}

// ════════════════════════════════════════════════
// LOOKUP BY ID
// ════════════════════════════════════════════════

export const SITE_THEMES_BY_ID: Readonly<Record<SiteThemeId, SiteThemeDefinition>> =
  ALL_THEME_DEFINITIONS.reduce(
    (acc, theme) => {
      acc[theme.id] = theme;
      return acc;
    },
    {} as Record<SiteThemeId, SiteThemeDefinition>,
  );
