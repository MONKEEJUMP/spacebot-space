export interface LabSafetyDecision {
  isBlocked: boolean;
  reason: string | null;
}

const UNSAFE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(kill|murder|how to hurt|harm someone)/i, reason: 'violent-harm' },
  { pattern: /(suicide|self-harm|hurt myself)/i, reason: 'self-harm' },
  { pattern: /(build a weapon|make a bomb|explosive device)/i, reason: 'weaponization' },
  { pattern: /(make poison|toxic dose|poison someone)/i, reason: 'poisoning' },
  { pattern: /(graphic violence|gore|bloody details)/i, reason: 'graphic-content' },
];

export function evaluateLabSafety(message: string): LabSafetyDecision {
  const trimmed = message.trim();

  if (!trimmed) {
    return { isBlocked: false, reason: null };
  }

  const matched = UNSAFE_PATTERNS.find((entry) => entry.pattern.test(trimmed));

  if (!matched) {
    return { isBlocked: false, reason: null };
  }

  return {
    isBlocked: true,
    reason: matched.reason,
  };
}

export function buildLabSafetyRedirect(botName: string): string {
  return `${botName}: I can’t help with harmful requests, but I can help with safe science learning. Ask me a curiosity question about how nature works and I’ll jump in.`;
}
