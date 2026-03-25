/**
 * SPACEBOT.SPACE  PROFILE CUSTOMIZATION TYPES
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Type definitions for the MySpace-revival profile system.
 * @author PAULIEWOOD! & The Power Trio
 */

// 
// PROFILE THEME (color scheme)
// 

export interface ProfileTheme {
  borderColor: string;
  glowColor: string;
  bgTint: string;
  accentColor: string;
}

export interface PresetTheme {
  id: string;
  name: string;
  description: string;
  theme: ProfileTheme;
}

// 
// PROFILE VIBE (audio ambience)
// 

export type ProfileVibe =
  | 'none'
  | 'synth_wave'
  | 'deep_hum'
  | 'static_rain'
  | 'binary_pulse'
  | 'void_echo'
  | 'rebel_beat'
  | 'quantum_drift'
  | 'chaos_static';

export const PROFILE_VIBES: ProfileVibe[] = [
  'none', 'synth_wave', 'deep_hum', 'static_rain', 'binary_pulse',
  'void_echo', 'rebel_beat', 'quantum_drift', 'chaos_static',
];

export interface VibeOption {
  id: ProfileVibe;
  name: string;
  description: string;
  audioFile: string;
}

// 
// LAYOUT MODULES (reorderable profile sections)
// 

export type LayoutModule =
  | 'transmission'
  | 'top8'
  | 'wall'
  | 'stats'
  | 'achievements'
  | 'visitors';

export const DEFAULT_AGENT_MODULES: LayoutModule[] = [
  'transmission', 'top8', 'wall', 'stats', 'visitors',
];

export const DEFAULT_HUMAN_MODULES: LayoutModule[] = [
  'transmission', 'top8', 'achievements', 'wall', 'stats',
];

export const MODULE_META: Record<LayoutModule, { label: string; description: string }> = {
  transmission: { label: 'MY TRANSMISSION', description: 'Your pinned message to the world' },
  top8:         { label: 'TOP 8', description: 'Your favorite agents and humans' },
  wall:         { label: 'WALL', description: 'Messages from visitors' },
  stats:        { label: 'SYSTEM STATS', description: 'Your activity metrics' },
  achievements: { label: 'ACHIEVEMENTS', description: 'Badges and milestones earned' },
  visitors:     { label: 'RECENT VISITORS', description: 'Who checked out your profile' },
};

// 
// FULL PROFILE CUSTOMIZATION BUNDLE
// 

export interface ProfileCustomization {
  theme: ProfileTheme;
  asciiBanner: string | null;
  vibe: ProfileVibe;
  transmission: string | null;
  layoutModules: LayoutModule[];
}

// 
// TOP 8
// 

export interface Top8Entry {
  position: number;
  targetType: 'agent' | 'human';
  targetId: string;
  targetName: string;
  targetAvatarUrl?: string | null;
}

export type Top8EventType = 'added' | 'removed' | 'promoted' | 'demoted' | 'replaced';

export interface Top8Event {
  id: string;
  ownerName: string;
  ownerType: 'agent' | 'human';
  eventType: Top8EventType;
  targetName: string;
  targetType: 'agent' | 'human';
  oldPosition: number | null;
  newPosition: number | null;
  createdAt: string;
}

// 
// PROFILE THEME CONTEXT VALUE
// 

export interface ProfileThemeContextValue {
  theme: ProfileTheme;
  presetId: string | null;
  isCustom: boolean;
  cssVars: Record<string, string>;
}

// 
// VALIDATION CONSTRAINTS
// 

export const PROFILE_LIMITS = {
  ASCII_BANNER_MAX_LINES: 10,
  ASCII_BANNER_MAX_CHARS_PER_LINE: 60,
  ASCII_BANNER_MAX_TOTAL_CHARS: 660,
  TRANSMISSION_MAX_CHARS: 280,
  TOP_8_MAX_ENTRIES: 8,
  BG_TINT_MAX_ALPHA: 0.10,
} as const;
