// orchestrator.ts — DORYLUS Orchestrator
// FULL PIPELINE EVERY TIME. No shortcuts. No bypass.
// Query → ALPHA decompose → 5 wingmen parallel → ALPHA fuse → response

import { DORYLUS_CONFIG } from './config';
import { DorylusQuery, DorylusCycleResult } from './types';
import { decompose, fuse } from './alpha';
import { processSubtask } from './wingman';
import {
  trackQueryStart,
  trackDecomposition,
  trackWingmanResponse,
  trackFusion,
  trackError,
} from './tracker';

export async function executeDorylusCycle(query: DorylusQuery): Promise<DorylusCycleResult> {
  const cycleStartTime = Date.now();
  let queryId: string = '';

  try {
    // ========================================
    // STEP 1: Log query start
    // ========================================
    queryId = await trackQueryStart(
      query.userId,
      query.botName,
      query.botSpace,
      query.originalQuery,
      query.botSystemPrompt
    );

    console.log(`[DORYLUS] Query ${queryId} started for bot ${query.botName}`);

    // ========================================
    // STEP 2: ALPHA decomposes query into 5 subtasks
    // ========================================
    console.log(`[DORYLUS] ALPHA decomposing query...`);
    const decomposition = await decompose(
      query.originalQuery,
      query.botSystemPrompt,
      query.temperature || DORYLUS_CONFIG.temperature
    );

    await trackDecomposition(queryId, decomposition);
    console.log(`[DORYLUS] Decomposed into ${decomposition.subtasks.length} subtasks in ${decomposition.durationMs}ms`);

    // ========================================
    // STEP 3: ALL 5 WINGMEN FIRE IN PARALLEL
    // ========================================
    console.log(`[DORYLUS] Dispatching ${DORYLUS_CONFIG.wingmanCount} wingmen...`);

    const wingmanPromises = decomposition.subtasks.map((subtask, i) =>
      processSubtask(
        i + 1,
        subtask,
        query.botSystemPrompt,
        query.temperature || DORYLUS_CONFIG.temperature
      )
    );

    // Promise.all — ALL 5 fire simultaneously
    const wingmanResults = await Promise.all(wingmanPromises);

    // Log each wingman result
    for (const result of wingmanResults) {
      await trackWingmanResponse(queryId, result);
      console.log(`[DORYLUS] Wingman ${result.wingmanIndex}: ${result.status} in ${result.durationMs}ms (${result.tokensIn + result.tokensOut} tokens)`);
    }

    const completedWingmen = wingmanResults.filter(w => w.status === 'complete');
    console.log(`[DORYLUS] ${completedWingmen.length}/${DORYLUS_CONFIG.wingmanCount} wingmen completed successfully`);

    // If ALL wingmen failed, we have nothing to fuse
    if (completedWingmen.length === 0) {
      const errorMsg = 'All 5 wingmen failed — nothing to fuse';
      await trackError(queryId, query.botName, 'wingman_dispatch', 'all_failed', errorMsg);

      return {
        queryId,
        botName: query.botName,
        originalQuery: query.originalQuery,
        finalResponse: 'I apologize, but I was unable to process your request at this time. Please try again.',
        decomposition,
        wingmanResults,
        fusion: { finalResponse: '', durationMs: 0, tokensIn: 0, tokensOut: 0, rawResponse: '' },
        totalCycleMs: Date.now() - cycleStartTime,
        totalTokensIn: decomposition.tokensIn,
        totalTokensOut: decomposition.tokensOut,
        totalTokens: decomposition.tokensIn + decomposition.tokensOut,
        status: 'error',
        errorMessage: errorMsg,
      };
    }

    // ========================================
    // STEP 4: ALPHA fuses all wingman results
    // ========================================
    console.log(`[DORYLUS] ALPHA fusing ${completedWingmen.length} wingman results...`);
    const fusion = await fuse(
      query.originalQuery,
      query.botSystemPrompt,
      wingmanResults,
      query.temperature || DORYLUS_CONFIG.temperature
    );

    const totalCycleMs = Date.now() - cycleStartTime;

    // Log fusion and totals
    await trackFusion(queryId, fusion, wingmanResults, totalCycleMs);

    // Calculate totals
    const decompTokensIn = decomposition.tokensIn;
    const decompTokensOut = decomposition.tokensOut;
    const wingmanTokensIn = wingmanResults.reduce((sum, w) => sum + w.tokensIn, 0);
    const wingmanTokensOut = wingmanResults.reduce((sum, w) => sum + w.tokensOut, 0);
    const fusionTokensIn = fusion.tokensIn;
    const fusionTokensOut = fusion.tokensOut;
    const totalTokensIn = decompTokensIn + wingmanTokensIn + fusionTokensIn;
    const totalTokensOut = decompTokensOut + wingmanTokensOut + fusionTokensOut;

    console.log(`[DORYLUS] ✅ COMPLETE in ${totalCycleMs}ms | ${totalTokensIn + totalTokensOut} total tokens`);

    return {
      queryId,
      botName: query.botName,
      originalQuery: query.originalQuery,
      finalResponse: fusion.finalResponse,
      decomposition,
      wingmanResults,
      fusion,
      totalCycleMs,
      totalTokensIn,
      totalTokensOut,
      totalTokens: totalTokensIn + totalTokensOut,
      status: 'complete',
    };

  } catch (error: any) {
    const totalCycleMs = Date.now() - cycleStartTime;

    await trackError(
      queryId || null,
      query.botName,
      'orchestrator',
      'unknown',
      error.message || 'Unknown orchestrator error',
      { stack: error.stack }
    );

    console.error(`[DORYLUS] ❌ FAILED after ${totalCycleMs}ms:`, error.message);

    return {
      queryId: queryId || 'unknown',
      botName: query.botName,
      originalQuery: query.originalQuery,
      finalResponse: 'I apologize, but I encountered an error processing your request. Please try again.',
      decomposition: { subtasks: [], durationMs: 0, tokensIn: 0, tokensOut: 0, rawResponse: '' },
      wingmanResults: [],
      fusion: { finalResponse: '', durationMs: 0, tokensIn: 0, tokensOut: 0, rawResponse: '' },
      totalCycleMs,
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalTokens: 0,
      status: 'error',
      errorMessage: error.message,
    };
  }
}
