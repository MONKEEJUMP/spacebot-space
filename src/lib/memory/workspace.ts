// Workspace ID pattern: bot:{bot_id}:user:{authUserId}

function sanitize(segment: string): string {
  return segment.replace(/[^A-Za-z0-9_.-]/g, '_');
}

export function buildWorkspaceId(botId: string, authUserId: string): string {
  const b = sanitize((botId || 'unknown').trim().toLowerCase());
  const u = sanitize((authUserId || 'anon').trim());
  return `bot:${b}:user:${u}`;
}

export function isMemoryEnabled(): boolean {
  return process.env.MEMORY_ENABLED === 'true';
}

export function isExperienceLoopEnabled(): boolean {
  return (process.env.EXPERIENCE_LOOP_ENABLED ?? '').toLowerCase() === 'true';
}

export function isDeepResearchEnabled(): boolean {
  return (process.env.DEEPRESEARCH_ENABLED ?? '').toLowerCase() === 'true';
}
