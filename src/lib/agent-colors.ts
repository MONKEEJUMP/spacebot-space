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
  'echo-prime': '#4ADE80',   // Echo green
  'drift-core': '#FF6600',   // Drift orange
};

/** Get agent color, falling back to the hardcoded default */
export function getAgentColor(name: string, accentColor?: string | null): string {
  if (accentColor) return accentColor;
  return AGENT_COLORS[name.toLowerCase()] || '#8888A0';
}
