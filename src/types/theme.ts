/**
 * SPACEBOT.SPACE — SITE THEME TYPE DEFINITIONS
 * 13 themes: 10 dark accent + Light Mode + Dark Default + Classic MySpace
 *
 * @author PAULIEWOOD! & The Power Trio
 */

// ════════════════════════════════════════════════
// THEME IDS
// ════════════════════════════════════════════════

export const SITE_THEME_IDS = [
  'dark',            // Default — Terminal Green on #0C0C0C
  'cyan',
  'blue',
  'purple',
  'magenta',
  'pink',
  'red',
  'orange',
  'gold',
  'yellow',
  'inverted',        // Inverted — Terminal Green on light backgrounds
  'light',           // Light Mode — kept for CSS, hidden from selector
  'classic-myspace',  // Classic MySpace — kept for CSS, hidden from selector
] as const;

export type SiteThemeId = (typeof SITE_THEME_IDS)[number];

// ════════════════════════════════════════════════
// THEME MODE
// ════════════════════════════════════════════════

export type ThemeMode = 'dark' | 'light' | 'myspace';

// ════════════════════════════════════════════════
// THEME DEFINITION
// ════════════════════════════════════════════════

export interface SiteThemeDefinition {
  /** Unique identifier */
  id: SiteThemeId;

  /** Display name shown in theme picker */
  name: string;

  /** Short description */
  description: string;

  /** Base mode — determines background family */
  mode: ThemeMode;

  /** Base accent hex (used to generate 5 shades) */
  accentHex: `#${string}`;

  /** Complete CSS variable map — every --sb-* variable with its value */
  vars: SiteThemeVars;
}

// ════════════════════════════════════════════════
// CSS VARIABLE MAP (33 properties)
// ════════════════════════════════════════════════

export interface SiteThemeVars {
  // Backgrounds
  '--sb-bg-primary': string;
  '--sb-bg-secondary': string;
  '--sb-bg-tertiary': string;
  '--sb-bg-elevated': string;

  // Text
  '--sb-text-primary': string;
  '--sb-text-secondary': string;
  '--sb-text-tertiary': string;

  // Accent shades
  '--sb-accent-lightest': string;
  '--sb-accent-light': string;
  '--sb-accent': string;
  '--sb-accent-dark': string;
  '--sb-accent-darkest': string;

  // Borders
  '--sb-border-primary': string;
  '--sb-border-secondary': string;

  // Status (constant across ALL themes)
  '--sb-status-online': string;
  '--sb-status-error': string;
  '--sb-status-warning': string;
  '--sb-status-info': string;

  // Links
  '--sb-link-color': string;
  '--sb-link-hover': string;
  '--sb-link-visited': string;

  // Navigation
  '--sb-nav-bg': string;
  '--sb-nav-text': string;
  '--sb-nav-hover': string;
  '--sb-nav-border': string;

  // Glow
  '--sb-glow': string;
  '--sb-glow-strong': string;

  // Special
  '--sb-caret-color': string;
  '--sb-selection-bg': string;
  '--sb-selection-text': string;
  '--sb-scrollbar-thumb': string;
  '--sb-scrollbar-hover': string;
  '--sb-border-radius': string;
  '--sb-border-width': string;
  '--sb-font-body': string;
  '--sb-font-display': string;
}

// ════════════════════════════════════════════════
// THEME CONTEXT VALUE
// ════════════════════════════════════════════════

export interface SiteThemeContextValue {
  /** Current active theme ID */
  themeId: SiteThemeId;

  /** Current theme definition */
  theme: SiteThemeDefinition;

  /** Current mode shorthand */
  mode: ThemeMode;

  /** Change site theme */
  setTheme: (id: SiteThemeId) => void;

  /** Temporarily override theme (for profile visits) */
  pushTemporaryTheme: (id: SiteThemeId) => void;

  /** Restore theme after profile visit */
  popTemporaryTheme: () => void;

  /** Whether a temporary override is active */
  isTemporaryOverride: boolean;
}
