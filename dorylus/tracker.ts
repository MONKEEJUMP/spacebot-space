// tracker.ts — LUCY Data Tracker
// Baked in, not bolted on. Every query logs automatically.
// Uses existing server-side Supabase client (supabaseAdmin with service role key)

import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/supabase';
import { DecompositionResult, WingmanResult, FusionResult } from './types';

// Alias for brevity — supabaseAdmin uses service role key, bypasses RLS
const db = supabaseAdmin;

// Create the initial query row — returns the query UUID
// FIX 37: never throws - returns a fallback UUID on failure so the
// LUCY cycle continues. Downstream track* calls on the fallback ID
// will fail silently inside their own try-catch blocks.
export async function trackQueryStart(
  userId: string,
  botName: string,
  botSpace: string,
  originalQuery: string,
  alphaSystemPrompt: string
): Promise<string> {
  try {
    const { data, error } = await db
      .from('dorylus_queries')
      .insert({
        user_id: userId,
        bot_name: botName,
        bot_space: botSpace,
        original_query: originalQuery,
        alpha_system_prompt: alphaSystemPrompt,
        status: 'pending',
        decomposition_started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      const fallback = randomUUID();
      logger.error('Tracker trackQueryStart insert failed - using fallback id', {
        correlationId: fallback,
        botName,
        phase: 'tracker.queryStart',
        error: error.message,
        code: (error as { code?: string }).code,
      });
      return fallback;
    }
    return data.id;
  } catch (e: unknown) {
    const fallback = randomUUID();
    logger.error('Tracker trackQueryStart unexpected error - using fallback id', {
      correlationId: fallback,
      botName,
      phase: 'tracker.queryStart',
      error: e instanceof Error ? e.message : String(e),
    });
    return fallback;
  }
}

// Update after ALPHA decomposition
// FIX 37: resilient try-catch
export async function trackDecomposition(
  queryId: string,
  result: DecompositionResult
): Promise<void> {
  try {
    const { error } = await db
      .from('dorylus_queries')
      .update({
        alpha_decomposition: result.subtasks,
        alpha_decomposition_ms: result.durationMs,
        alpha_decomposition_tokens_in: result.tokensIn,
        alpha_decomposition_tokens_out: result.tokensOut,
        status: 'dispatched',
        decomposition_completed_at: new Date().toISOString(),
        dispatch_started_at: new Date().toISOString(),
      })
      .eq('id', queryId);

    if (error) {
      logger.error('Tracker trackDecomposition failed', {
        correlationId: queryId,
        phase: 'tracker.decomposition',
        error: error.message,
        code: (error as { code?: string }).code,
      });
    }
  } catch (e: unknown) {
    logger.error('Tracker trackDecomposition unexpected error', {
      correlationId: queryId,
      phase: 'tracker.decomposition',
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// Log individual wingman response
// NOTE: As of March 2026, wingman responses are based on LIVE WEB SEARCH data.
// Each wingman searches Tavily independently, gets 10 web results, and synthesizes them.
// The response text includes source citations. Search time is included in response_ms.
// FIX 37: resilient try-catch
export async function trackWingmanResponse(
  queryId: string,
  result: WingmanResult
): Promise<void> {
  try {
    const { error } = await db
      .from('dorylus_wingman_responses')
      .insert({
        query_id: queryId,
        wingman_index: result.wingmanIndex,
        wingman_key_index: result.keyIndex + 1,
        subtask: result.subtask,
        response: result.response,
        response_ms: result.durationMs,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        status: result.status,
        error_message: result.errorMessage || null,
        dispatched_at: new Date(Date.now() - result.durationMs).toISOString(),
        completed_at: new Date().toISOString(),
      });

    if (error) {
      logger.error('Tracker trackWingmanResponse failed', {
        correlationId: queryId,
        wingmanIndex: result.wingmanIndex,
        phase: 'tracker.wingmanResponse',
        error: error.message,
        code: (error as { code?: string }).code,
      });
    }
  } catch (e: unknown) {
    logger.error('Tracker trackWingmanResponse unexpected error', {
      correlationId: queryId,
      wingmanIndex: result.wingmanIndex,
      phase: 'tracker.wingmanResponse',
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// Update after ALPHA fusion
// FIX 37: resilient try-catch. updateDailyStats has its own try-catch (Fix 7).
export async function trackFusion(
  queryId: string,
  result: FusionResult,
  wingmanResults: WingmanResult[],
  totalCycleMs: number
): Promise<void> {
  const totalTokensIn = result.tokensIn + wingmanResults.reduce((sum, w) => sum + w.tokensIn, 0);
  const totalTokensOut = result.tokensOut + wingmanResults.reduce((sum, w) => sum + w.tokensOut, 0);

  try {
    const { error } = await db
      .from('dorylus_queries')
      .update({
        alpha_fusion_input: wingmanResults.map(w => ({ wingman: w.wingmanIndex, response: w.response, status: w.status })),
        alpha_final_response: result.finalResponse,
        alpha_fusion_ms: result.durationMs,
        alpha_fusion_tokens_in: result.tokensIn,
        alpha_fusion_tokens_out: result.tokensOut,
        total_cycle_ms: totalCycleMs,
        total_tokens_in: totalTokensIn,
        total_tokens_out: totalTokensOut,
        total_tokens: totalTokensIn + totalTokensOut,
        status: 'complete',
        all_wingmen_completed_at: new Date().toISOString(),
        fusion_completed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq('id', queryId);

    if (error) {
      logger.error('Tracker trackFusion failed', {
        correlationId: queryId,
        phase: 'tracker.fusion',
        totalCycleMs,
        error: error.message,
        code: (error as { code?: string }).code,
      });
    }
  } catch (e: unknown) {
    logger.error('Tracker trackFusion unexpected error', {
      correlationId: queryId,
      phase: 'tracker.fusion',
      totalCycleMs,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // updateDailyStats handles its own errors (Fix 7 + Fix 37)
  await updateDailyStats(queryId, totalTokensIn + totalTokensOut, totalCycleMs, wingmanResults);
}

// Log errors
// FIX 37: resilient try-catch around both the insert AND the follow-up update
export async function trackError(
  queryId: string | null,
  botName: string | null,
  stage: string,
  errorType: string,
  errorMessage: string,
  extra?: {
    wingmanIndex?: number;
    keyIndex?: number;
    requestPayload?: unknown;
    responsePayload?: unknown;
    httpStatus?: number;
    stack?: string;
  }
): Promise<void> {
  try {
    const { error } = await db
      .from('dorylus_errors')
      .insert({
        query_id: queryId,
        bot_name: botName,
        stage,
        error_type: errorType,
        error_message: errorMessage,
        error_stack: extra?.stack || null,
        wingman_index: extra?.wingmanIndex || null,
        llm_key_index: extra?.keyIndex != null ? extra.keyIndex + 1 : null,
        request_payload: extra?.requestPayload || null,
        response_payload: extra?.responsePayload || null,
        http_status: extra?.httpStatus || null,
      });

    if (error) {
      logger.error('Tracker trackError insert failed', {
        correlationId: queryId,
        botName,
        stage,
        errorType,
        phase: 'tracker.errorInsert',
        error: error.message,
        code: (error as { code?: string }).code,
      });
    }
  } catch (e: unknown) {
    logger.error('Tracker trackError unexpected error on insert', {
      correlationId: queryId,
      botName,
      stage,
      errorType,
      phase: 'tracker.errorInsert',
      error: e instanceof Error ? e.message : String(e),
    });
  }

  if (queryId) {
    try {
      const { error: updateError } = await db
        .from('dorylus_queries')
        .update({ status: 'error', error_message: errorMessage })
        .eq('id', queryId);

      if (updateError) {
        logger.error('Tracker trackError status update failed', {
          correlationId: queryId,
          botName,
          stage,
          phase: 'tracker.errorStatusUpdate',
          error: updateError.message,
          code: (updateError as { code?: string }).code,
        });
      }
    } catch (e: unknown) {
      logger.error('Tracker trackError unexpected error on status update', {
        correlationId: queryId,
        botName,
        stage,
        phase: 'tracker.errorStatusUpdate',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/**
 * FIX 7: Race-safe daily stats aggregator.
 *
 * The original implementation used a SELECT-then-IF-UPDATE-ELSE-INSERT
 * pattern that was vulnerable to TWO races:
 *
 *   1. Midnight rollover: two concurrent writers both SELECT empty, both
 *      INSERT, one gets duplicate-key (PG code 23505) and the stat is lost.
 *   2. Lost updates: two concurrent writers both SELECT the same row, both
 *      UPDATE - the second UPDATE silently overwrites the first, dropping
 *      an increment.
 *
 * The project has no Postgres RPC function for atomic increment (verified).
 * Best-available pattern for Supabase JS:
 *   - bounded retry loop
 *   - INSERT first on missing row; catch duplicate-key, fall through to UPDATE
 *   - UPDATE with optimistic lock: .eq('total_queries', readValue). If another
 *     writer bumped total_queries between our SELECT and UPDATE, the row count
 *     is 0 and we retry with a fresh SELECT.
 *
 * Wrapped in try-catch per Fix 37.
 */
async function updateDailyStats(
  queryId: string,
  totalTokens: number,
  cycleMs: number,
  wingmanResults: WingmanResult[]
): Promise<void> {
  void wingmanResults; // reserved for future per-wingman aggregate columns
  const MAX_RETRIES = 5;
  const today = new Date().toISOString().split('T')[0];

  try {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // 1. Read current row (may be null at midnight rollover)
      const { data: existing, error: selectError } = await db
        .from('dorylus_daily_stats')
        .select('*')
        .eq('stat_date', today)
        .maybeSingle();

      if (selectError) {
        logger.error('Tracker updateDailyStats SELECT failed', {
          correlationId: queryId,
          statDate: today,
          attempt,
          phase: 'tracker.dailyStats.select',
          error: selectError.message,
          code: (selectError as { code?: string }).code,
        });
        return;
      }

      if (!existing) {
        // 2a. Row missing - attempt INSERT. On duplicate-key, another writer
        //     won the race - fall through to UPDATE on the next iteration.
        const { error: insertError } = await db
          .from('dorylus_daily_stats')
          .insert({
            stat_date: today,
            total_queries: 1,
            successful_queries: 1,
            total_tokens_consumed: totalTokens,
            avg_cycle_ms: cycleMs,
            min_cycle_ms: cycleMs,
            max_cycle_ms: cycleMs,
          });

        if (!insertError) {
          return; // clean insert
        }

        const code = (insertError as { code?: string }).code;
        const msg = insertError.message || '';
        const lower = msg.toLowerCase();
        const isDuplicate =
          code === '23505' ||
          lower.includes('duplicate') ||
          lower.includes('unique constraint') ||
          lower.includes('conflict');

        if (isDuplicate) {
          // someone else inserted first - loop and try UPDATE path
          continue;
        }

        logger.error('Tracker updateDailyStats INSERT failed', {
          correlationId: queryId,
          statDate: today,
          attempt,
          phase: 'tracker.dailyStats.insert',
          error: msg,
          code,
        });
        return;
      }

      // 2b. Row exists - UPDATE with optimistic lock on total_queries.
      //     Matching .eq('total_queries', existing.total_queries) ensures we
      //     only update if nobody else has bumped it since our SELECT.
      const newTotal = existing.total_queries + 1;
      const newAvg = Math.round(
        ((existing.avg_cycle_ms || 0) * existing.total_queries + cycleMs) / newTotal
      );

      const { data: updated, error: updateError } = await db
        .from('dorylus_daily_stats')
        .update({
          total_queries: newTotal,
          successful_queries: existing.successful_queries + 1,
          total_tokens_consumed: existing.total_tokens_consumed + totalTokens,
          avg_cycle_ms: newAvg,
          min_cycle_ms: Math.min(existing.min_cycle_ms ?? Infinity, cycleMs),
          max_cycle_ms: Math.max(existing.max_cycle_ms ?? 0, cycleMs),
          updated_at: new Date().toISOString(),
        })
        .eq('stat_date', today)
        .eq('total_queries', existing.total_queries) // optimistic lock
        .select();

      if (updateError) {
        logger.error('Tracker updateDailyStats UPDATE failed', {
          correlationId: queryId,
          statDate: today,
          attempt,
          phase: 'tracker.dailyStats.update',
          error: updateError.message,
          code: (updateError as { code?: string }).code,
        });
        return;
      }

      if (updated && updated.length > 0) {
        return; // success
      }

      // 0 rows updated = optimistic lock conflict, retry
      logger.warn('Tracker updateDailyStats optimistic lock conflict, retrying', {
        correlationId: queryId,
        statDate: today,
        attempt,
        phase: 'tracker.dailyStats.retry',
      });
    }

    logger.error('Tracker updateDailyStats exhausted retries', {
      correlationId: queryId,
      statDate: today,
      maxRetries: MAX_RETRIES,
      phase: 'tracker.dailyStats.exhausted',
    });
  } catch (e: unknown) {
    logger.error('Tracker updateDailyStats unexpected error', {
      correlationId: queryId,
      statDate: today,
      phase: 'tracker.dailyStats',
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
