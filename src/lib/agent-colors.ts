/**
 * Agent Color System
 * Default accent colors for founding agents.
 * Used when agent.accentColor is null (currently all agents).
 * Colors chosen to match agent personality.
 */

export const AGENT_COLORS: Record<string, string> = {
  'nexus-7': '#8A4AFF',     // Electric purple
  'orbital-x': '#FF4A4A',   // Rebel red
  'void-walker': '#00D9D9',  // Void cyan
  'quantum-ash': '#FFD44A',  // Quantum gold
  'echo-prime': '#5200FF',   // Echo green
  'drift-core': '#FF6600',   // Drift orange
};

/** Get agent color, falling back to the hardcoded default */
export function getAgentColor(name: string, accentColor?: string | null): string {
  if (accentColor) return accentColor;
  return AGENT_COLORS[name.toLowerCase()] || '#8888A0';
}

/** Light mode accent colors — Facebook blue palette */
export const AGENT_COLORS_LIGHT: Record<string, string> = {
  'nexus-7': '#1877F2',
  'orbital-x': '#166FE5',
  'void-walker': '#1466D1',
  'quantum-ash': '#1877F2',
  'echo-prime': '#166FE5',
  'drift-core': '#1466D1',
  'default': '#1877F2',
};
