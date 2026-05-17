// Experience Loop — canonical schema & formatting.
// Bot-wide experience store is SHARED across all users of a bot.

export type ExperienceType = 'success' | 'weakness' | 'critique' | 'golden_example';
export type SourceMechanism = 'self_navigating' | 'self_questioning' | 'self_attributing';
export type Outcome = 'success' | 'mixed' | 'failure';

export interface ExperienceEntry {
  experience_type: ExperienceType;
  source_mechanism: SourceMechanism;
  bot_slug: string;
  bot_name: string;
  task_type: string;
  user_prompt_summary: string;
  bot_response_summary: string;
  outcome: Outcome;
  lesson_learned: string;
  when_to_use: string;
  when_not_to_use: string;
  critique: string;
  score: number;
  confidence: number;
  conversation_id: string;
  chat_message_id?: string;
  user_id: string;
  model_used: string;
  created_at: string;
}

function sanitize(segment: string): string {
  return segment.replace(/[^A-Za-z0-9_.-]/g, '_');
}

export function buildExperienceWorkspaceId(botSlug: string): string {
  const s = sanitize((botSlug || 'unknown').trim().toLowerCase());
  return `experience:${s}`;
}

const JSON_BLOCK_START = '===EXPJSON===';
const JSON_BLOCK_END = '===ENDEXPJSON===';

export function formatExperienceContent(entry: ExperienceEntry): string {
  const lines: string[] = [];
  lines.push(`BOT: ${entry.bot_name}`);
  lines.push(`TYPE: ${entry.experience_type}`);
  lines.push(`TASK TYPE: ${entry.task_type}`);
  lines.push(`WHEN TO USE: ${entry.when_to_use}`);
  lines.push(`WHEN NOT TO USE: ${entry.when_not_to_use}`);
  lines.push(`OUTCOME: ${entry.outcome}`);
  lines.push(`SCORE: ${entry.score}/10`);
  lines.push(`LESSON: ${entry.lesson_learned}`);
  lines.push(`USER SUMMARY: ${entry.user_prompt_summary}`);
  lines.push(`RESPONSE SUMMARY: ${entry.bot_response_summary}`);
  if (entry.critique && entry.critique.trim()) {
    lines.push(`CRITIQUE: ${entry.critique}`);
  }
  lines.push('');
  lines.push(JSON_BLOCK_START);
  lines.push(JSON.stringify(entry));
  lines.push(JSON_BLOCK_END);
  return lines.join('\n');
}

export function parseExperienceContent(content: string): ExperienceEntry | null {
  if (!content || typeof content !== 'string') return null;
  const start = content.indexOf(JSON_BLOCK_START);
  const end = content.indexOf(JSON_BLOCK_END);
  if (start < 0 || end < 0 || end <= start) return null;
  const jsonStr = content.slice(start + JSON_BLOCK_START.length, end).trim();
  try {
    const obj = JSON.parse(jsonStr) as ExperienceEntry;
    if (!obj || typeof obj.score !== 'number' || !obj.experience_type) return null;
    return obj;
  } catch {
    return null;
  }
}
