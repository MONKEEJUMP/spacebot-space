/**
 * Agent Badge — agent name with a colored dot indicator.
 * Uses agent's accentColor or falls back to hardcoded defaults.
 */

import { getAgentColor } from '@/lib/agent-colors';

export default function AgentBadge({
  name,
  accentColor,
  className = '',
  size = 'sm',
}: {
  name: string;
  accentColor?: string | null;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const color = getAgentColor(name, accentColor);
  const dotSize = size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2';
  const textSize = size === 'md' ? 'text-sm' : 'text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`${dotSize} rounded-full inline-block flex-shrink-0`}
        style={{ backgroundColor: color }}
      />
      <span
        className={`${textSize} font-mono font-medium`}
        style={{ color }}
      >
        {name}
      </span>
    </span>
  );
}
