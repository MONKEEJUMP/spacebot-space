// Experience Loop — ReMe bridge for experience memories.
// Workspace is "experience:{bot_slug}" and SHARED across all users.

import { logger } from '@/lib/logger';
import { remeClient, type MemoryRecord } from '@/lib/memory/reme-client';
import {
  buildExperienceWorkspaceId,
  formatExperienceContent,
  parseExperienceContent,
  type ExperienceEntry,
} from './schema';

const READ_TIMEOUT_MS = 300;
const DEDUP_TIMEOUT_MS = 400;
// ReMe ChromaDB returns squared-L2 distance in ~[0, 2+]; lower = more similar.
// Distance < 0.4 means near-identical embedding — treat as duplicate.
const DEDUP_DISTANCE_THRESHOLD = 0.4;

function raceWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  void p.catch(() => undefined);
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function readExperiences(
  botSlug: string,
  query: string,
  topK: number = 3,
): Promise<ExperienceEntry[]> {
  try {
    const workspaceId = buildExperienceWorkspaceId(botSlug);
    const memories = await raceWithTimeout<MemoryRecord[]>(
      remeClient.read(workspaceId, query, topK),
      READ_TIMEOUT_MS,
      'experience.read',
    );
    const entries: ExperienceEntry[] = [];
    for (const m of memories) {
      const parsed = parseExperienceContent(m.content || '');
      if (parsed) entries.push(parsed);
    }
    entries.sort((a, b) => b.score - a.score);
    return entries;
  } catch (err) {
    logger.warn('Experience read failed', {
      phase: 'experience.reme.read',
      botSlug,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export function writeExperience(entry: ExperienceEntry): void {
  try {
    const workspaceId = buildExperienceWorkspaceId(entry.bot_slug);
    const content = formatExperienceContent(entry);
    const metadata = {
      experience_type: entry.experience_type,
      source_mechanism: entry.source_mechanism,
      score: entry.score,
      outcome: entry.outcome,
      task_type: entry.task_type,
      bot_slug: entry.bot_slug,
      created_at: entry.created_at,
    };
    void remeClient
      .write(workspaceId, content, metadata)
      .then((id) => {
        logger.info('Experience stored', {
          phase: 'experience.reme.write',
          botSlug: entry.bot_slug,
          experienceType: entry.experience_type,
          source: entry.source_mechanism,
          score: entry.score,
          memoryId: id,
        });
      })
      .catch((err: unknown) => {
        logger.warn('Experience write failed', {
          phase: 'experience.reme.write',
          botSlug: entry.bot_slug,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  } catch (err) {
    logger.warn('Experience write synchronous failure', {
      phase: 'experience.reme.write.sync',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Blocking variant used by the nightly cron so it can log dedup deterministically.
 * NEVER throws; returns null on failure.
 */
export async function writeExperienceBlocking(
  entry: ExperienceEntry,
): Promise<string | null> {
  try {
    const workspaceId = buildExperienceWorkspaceId(entry.bot_slug);
    const content = formatExperienceContent(entry);
    const metadata = {
      experience_type: entry.experience_type,
      source_mechanism: entry.source_mechanism,
      score: entry.score,
      outcome: entry.outcome,
      task_type: entry.task_type,
      bot_slug: entry.bot_slug,
      created_at: entry.created_at,
    };
    return await remeClient.write(workspaceId, content, metadata);
  } catch (err) {
    logger.warn('Experience blocking write failed', {
      phase: 'experience.reme.write.blocking',
      botSlug: entry.bot_slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Returns true when the bot's experience workspace already contains a memory
 * highly similar to `query`. Uses ReMe squared-L2 distance; lower = more similar.
 */
export async function checkDuplicate(
  botSlug: string,
  query: string,
): Promise<boolean> {
  try {
    const workspaceId = buildExperienceWorkspaceId(botSlug);
    const memories = await raceWithTimeout<MemoryRecord[]>(
      remeClient.read(workspaceId, query, 1),
      DEDUP_TIMEOUT_MS,
      'experience.dedup',
    );
    if (!memories.length) return false;
    const top = memories[0];
    const distance = typeof top.distance === 'number' ? top.distance : null;
    if (distance === null) return false;
    return distance < DEDUP_DISTANCE_THRESHOLD;
  } catch (err) {
    logger.warn('Experience dedup check failed', {
      phase: 'experience.reme.dedup',
      botSlug,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
