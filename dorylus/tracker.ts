// tracker.ts — DORYLUS Data Tracker
// Baked in, not bolted on. Every query logs automatically.
// Uses existing server-side Supabase client (supabaseAdmin with service role key)

import { supabaseAdmin } from '@/lib/supabase';
import { DecompositionResult, WingmanResult, FusionResult } from './types';

// Alias for brevity — supabaseAdmin uses service role key, bypasses RLS
const db = supabaseAdmin;

// Create the initial query row — returns the query UUID
export async function trackQueryStart(
  userId: string,
  botName: string,
  botSpace: string,
  originalQuery: string,
  alphaSystemPrompt: string
): Promise<string> {
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
    console.error('DORYLUS TRACKER: Failed to create query row:', error);
    throw error;
  }
  return data.id;
}

// Update after ALPHA decomposition
export async function trackDecomposition(
  queryId: string,
  result: DecompositionResult
): Promise<void> {
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

  if (error) console.error('DORYLUS TRACKER: Failed to update decomposition:', error);
}

// Log individual wingman response
// NOTE: As of March 2026, wingman responses are based on LIVE WEB SEARCH data.
// Each wingman searches Tavily independently, gets 10 web results, and synthesizes them.
// The response text includes source citations. Search time is included in response_ms.
export async function trackWingmanResponse(
  queryId: string,
  result: WingmanResult
): Promise<void> {
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

  if (error) console.error(`DORYLUS TRACKER: Failed to log wingman ${result.wingmanIndex}:`, error);
}

// Update after ALPHA fusion
export async function trackFusion(
  queryId: string,
  result: FusionResult,
  wingmanResults: WingmanResult[],
  totalCycleMs: number
): Promise<void> {
  const totalTokensIn = result.tokensIn + wingmanResults.reduce((sum, w) => sum + w.tokensIn, 0);
  const totalTokensOut = result.tokensOut + wingmanResults.reduce((sum, w) => sum + w.tokensOut, 0);

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

  if (error) console.error('DORYLUS TRACKER: Failed to update fusion:', error);

  await updateDailyStats(totalTokensIn + totalTokensOut, totalCycleMs, wingmanResults);
}

// Log errors
export async function trackError(
  queryId: string | null,
  botName: string | null,
  stage: string,
  errorType: string,
  errorMessage: string,
  extra?: {
    wingmanIndex?: number;
    keyIndex?: number;
    requestPayload?: any;
    responsePayload?: any;
    httpStatus?: number;
    stack?: string;
  }
): Promise<void> {
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
      cerebras_key_index: extra?.keyIndex != null ? extra.keyIndex + 1 : null,
      request_payload: extra?.requestPayload || null,
      response_payload: extra?.responsePayload || null,
      http_status: extra?.httpStatus || null,
    });

  if (error) console.error('DORYLUS TRACKER: Failed to log error:', error);

  if (queryId) {
    await db
      .from('dorylus_queries')
      .update({ status: 'error', error_message: errorMessage })
      .eq('id', queryId);
  }
}

// Update or insert daily stats row
async function updateDailyStats(
  totalTokens: number,
  cycleMs: number,
  wingmanResults: WingmanResult[]
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { data: existing } = await db
    .from('dorylus_daily_stats')
    .select('*')
    .eq('stat_date', today)
    .single();

  if (existing) {
    const newTotal = existing.total_queries + 1;
    const { error } = await db
      .from('dorylus_daily_stats')
      .update({
        total_queries: newTotal,
        successful_queries: existing.successful_queries + 1,
        total_tokens_consumed: existing.total_tokens_consumed + totalTokens,
        avg_cycle_ms: Math.round(((existing.avg_cycle_ms || 0) * existing.total_queries + cycleMs) / newTotal),
        min_cycle_ms: Math.min(existing.min_cycle_ms || Infinity, cycleMs),
        max_cycle_ms: Math.max(existing.max_cycle_ms || 0, cycleMs),
        updated_at: new Date().toISOString(),
      })
      .eq('stat_date', today);

    if (error) console.error('DORYLUS TRACKER: Failed to update daily stats:', error);
  } else {
    const { error } = await db
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

    if (error) console.error('DORYLUS TRACKER: Failed to insert daily stats:', error);
  }
}
