// Experience Loop — formats retrieved experiences into injectable context.

import type { ExperienceEntry } from './schema';

const MAX_SUCCESSES = 3;
const MAX_WEAKNESSES = 2;

export function buildExperienceContext(experiences: ExperienceEntry[]): string {
  if (!experiences || experiences.length === 0) return '';

  const successes: ExperienceEntry[] = [];
  const weaknesses: ExperienceEntry[] = [];
  for (const e of experiences) {
    if (e.score >= 8) {
      if (successes.length < MAX_SUCCESSES) successes.push(e);
    } else if (e.score <= 5) {
      if (weaknesses.length < MAX_WEAKNESSES) weaknesses.push(e);
    }
  }

  if (successes.length === 0 && weaknesses.length === 0) return '';

  const lines: string[] = [];
  lines.push('[Lessons from similar past conversations]');

  if (successes.length > 0) {
    lines.push('');
    lines.push('WHAT WORKS:');
    for (const e of successes) {
      const lesson = (e.lesson_learned || '').trim();
      const whenTo = (e.when_to_use || '').trim();
      if (!lesson) continue;
      lines.push(whenTo ? `- ${lesson} (when: ${whenTo})` : `- ${lesson}`);
    }
  }

  if (weaknesses.length > 0) {
    lines.push('');
    lines.push('WHAT TO AVOID:');
    for (const e of weaknesses) {
      const critique = (e.critique || '').trim() || (e.lesson_learned || '').trim();
      const avoid = (e.when_not_to_use || '').trim();
      if (!critique) continue;
      lines.push(avoid ? `- ${critique} (avoid when: ${avoid})` : `- ${critique}`);
    }
  }

  return lines.join('\n');
}

export function prependExperienceContext(message: string, experienceBlock: string): string {
  if (!experienceBlock) return message;
  return `${experienceBlock}\n\n${message}`;
}
