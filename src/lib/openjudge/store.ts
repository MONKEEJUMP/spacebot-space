// OpenJudge score persistence -- non-blocking, silently fails on error.

import { db } from '@/db';
import { botScores } from '@/db/openjudge-schema';
import type { OpenJudgeScores } from './client';

export async function saveScore(
  botId: string,
  query: string,
  response: string,
  scores: OpenJudgeScores,
): Promise<void> {
  try {
    await db.insert(botScores).values({
      botId,
      query: query.slice(0, 10000),
      responseSnippet: response.slice(0, 200),
      relevanceScore: scores.scores.relevance,
      hallucinationScore: scores.scores.hallucination,
      overallScore: scores.overall,
    });
  } catch {
    // silently fail -- never crash the chat flow
  }
}
