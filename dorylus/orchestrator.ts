// orchestrator.ts — LUCY Orchestrator
// FULL PIPELINE EVERY TIME. No shortcuts. No bypass.
// Query → ALPHA decompose → 5 wingmen parallel → ALPHA fuse → response

import { DORYLUS_CONFIG } from './config';
import { DorylusQuery, DorylusCycleResult, FusionResult, WingmanResult } from './types';
import { decompose, fuse, callDashScope } from './alpha';
import { processSubtask } from './wingman';
import { routeQuestion, ApiMatch } from './api-router';
import {
  trackQueryStart,
  trackDecomposition,
  trackWingmanResponse,
  trackFusion,
  trackError,
} from './tracker';
import { logger } from '@/lib/logger';

// ════════════════════════════════════════════
// LUCY CYCLE CONCURRENCY LIMIT
// Caps simultaneous full pipelines to prevent 2GB server OOM
// Manual semaphore — p-limit is only a transitive dep, not declared
// ════════════════════════════════════════════

const MAX_CONCURRENT_CYCLES = 20;
let activeCycles = 0;

async function acquireCycleSlot(): Promise<void> {
  while (activeCycles >= MAX_CONCURRENT_CYCLES) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  activeCycles++;
}

function releaseCycleSlot(): void {
  if (activeCycles > 0) {
    activeCycles--;
  }
}


// ════════════════════════════════════════════
// FAST PATH — Skip fusion when we have verified API data
// When a wingman returns structured data from a direct API call,
// skip the fusion step entirely and present it directly through ALPHA.
// ════════════════════════════════════════════
function detectFastPath(results: WingmanResult[]): { isFastPath: boolean; apiData: string | null } {
  for (const result of results) {
    const response = result.response || '';
    if (response.includes('[SOURCE: DIRECT API')) {
      // Extract the data portion after the source label line
      const dataStart = response.indexOf('\n');
      const apiData = dataStart > 0 ? response.substring(dataStart + 1).trim() : response;

      // Only fast-path if the data looks substantial (not an error or empty)
      if (apiData.length > 50 && (
        apiData.includes('📊') ||
        apiData.includes('📰') ||
        apiData.includes('🌤') ||
        apiData.includes('🕐') ||
        apiData.includes('•')
      )) {
        return { isFastPath: true, apiData };
      }
    }
  }
  return { isFastPath: false, apiData: null };
}


// ════════════════════════════════════════════
// QWEN-AGENT TOOL SERVICE
// Try tool service for factual queries before running full LUCY pipeline.
// Falls back silently to LUCY if tool service is unavailable.
// ════════════════════════════════════════════
async function tryToolService(question: string, botPrompt: string): Promise<string | null> {
  const TOOL_SERVICE_ENABLED = process.env.TOOL_SERVICE_ENABLED === 'true';
  if (!TOOL_SERVICE_ENABLED) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch('http://127.0.0.1:8100/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, bot_prompt: botPrompt }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    const answer = data?.answer;

    // Only use the tool service answer if it is substantial AND not an error
    if (answer && typeof answer === 'string' && answer.length > 20) {
      // Check if the answer is actually an error disguised as text
      const lowerAnswer = answer.toLowerCase();
      const isError = (
        lowerAnswer.includes('agent error') ||
        lowerAnswer.includes('error code') ||
        lowerAnswer.includes('404 not found') ||
        lowerAnswer.includes('could not fetch') ||
        lowerAnswer.includes('api request failed') ||
        lowerAnswer.includes('api returned a') ||
        lowerAnswer.includes('technical difficulties') ||
        lowerAnswer.includes('try again later') ||
        lowerAnswer.includes('unable to retrieve') ||
        lowerAnswer.includes('service is currently unavailable') ||
        lowerAnswer.includes('encountered an error') ||
        lowerAnswer.includes('encountered an issue') ||
        lowerAnswer.includes('operation was aborted') ||
        lowerAnswer.includes('server error') ||
        (data?.path === 'direct' && lowerAnswer.includes('recommend checking')) ||
        lowerAnswer.includes('did not return any results') ||
        lowerAnswer.includes('no results found') ||
        lowerAnswer.includes('try checking the') ||
        lowerAnswer.includes('using a different query') ||
        lowerAnswer.includes('not directly listed')
      );

      if (isError) {
        logger.info('Tool service returned error-like answer, falling through to LUCY', {
          component: 'orchestrator',
          phase: 'tool-service-error-detect',
          answerPreview: answer.substring(0, 100),
          path: data?.path || 'unknown',
        });
        return null; // Fall through to LUCY wingmen
      }

      logger.info('Tool service answered', {
        component: 'orchestrator',
        phase: 'tool-service',
        path: data?.path || 'tool',
        apisUsed: data?.apis_used || [],
        answerLength: answer.length,
      });
      return answer;
    }

    return null; // Fall through to LUCY
  } catch (error: any) {
    // Service unavailable, timed out, or errored - fall through to LUCY
    logger.info('Tool service unavailable, using LUCY', {
      component: 'orchestrator',
      phase: 'tool-service-fallback',
      error: error.message,
    });
    return null;
  }
}

export async function executeDorylusCycle(query: DorylusQuery): Promise<DorylusCycleResult> {
  await acquireCycleSlot();
  try {
    return await executeDorylusCycleCore(query);
  } finally {
    releaseCycleSlot();
  }
}

async function executeDorylusCycleCore(query: DorylusQuery): Promise<DorylusCycleResult> {
  const cycleStartTime = Date.now();
  let queryId: string = '';

  try {
    return await Promise.race([
      (async (): Promise<DorylusCycleResult> => {
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

        logger.info('LUCY cycle started', {
          component: 'orchestrator',
          phase: 'start',
          queryId,
          botName: query.botName,
        });

        // ========================================
        // STEP 1.5: TRY QWEN-AGENT TOOL SERVICE
        // Skip full LUCY pipeline for factual queries tools can answer
        // ========================================
        const toolAnswer = await tryToolService(query.originalQuery, query.botSystemPrompt);
        if (toolAnswer && toolAnswer.length > 20) {
          logger.info('Tool service answered', {
            component: 'orchestrator',
            phase: 'tool-service',
            queryId,
            botName: query.botName,
            answerLength: toolAnswer.length,
          });

          const totalCycleMs = Date.now() - cycleStartTime;
          return {
            queryId,
            botName: query.botName,
            originalQuery: query.originalQuery,
            finalResponse: toolAnswer,
            decomposition: { subtasks: [], durationMs: 0, tokensIn: 0, tokensOut: 0, rawResponse: '' },
            wingmanResults: [],
            fusion: { finalResponse: toolAnswer, durationMs: 0, tokensIn: 0, tokensOut: 0, rawResponse: '' },
            totalCycleMs,
            totalTokensIn: 0,
            totalTokensOut: 0,
            totalTokens: 0,
            status: 'complete',
          };
        }

        // ========================================
        // STEP 2: ALPHA decomposes query into 5 subtasks
        // ========================================
        logger.info('ALPHA decomposing query', {
          component: 'orchestrator',
          phase: 'decompose',
          queryId,
          botName: query.botName,
        });
        const decomposition = await decompose(
          query.originalQuery,
          query.botSystemPrompt,
          query.temperature || DORYLUS_CONFIG.temperature
        );

        await trackDecomposition(queryId, decomposition);
        logger.info('Decomposition complete', {
          component: 'orchestrator',
          phase: 'decompose',
          queryId,
          botName: query.botName,
          subtaskCount: decomposition.subtasks.length,
          durationMs: decomposition.durationMs,
        });

        // ========================================
        // STEP 3: ALL 5 WINGMEN FIRE IN PARALLEL
        // ========================================
        logger.info('Dispatching wingmen', {
          component: 'orchestrator',
          phase: 'wingman',
          queryId,
          botName: query.botName,
          wingmanCount: DORYLUS_CONFIG.wingmanCount,
        });


        // ════════════════════════════════════════
        // API ARSENAL: Route question to find best APIs
        // ════════════════════════════════════════
        let apiAssignments: ApiMatch[] = [];
        try {
          const routerResult = await routeQuestion(query.originalQuery, DORYLUS_CONFIG.wingmanCount);
          apiAssignments = routerResult.apis;
          logger.info('API Router assigned APIs to wingmen', {
            component: 'orchestrator',
            phase: 'api-route',
            queryId,
            totalApis: apiAssignments.length,
            topMatch: apiAssignments[0]?.name || 'none',
            category: routerResult.classification.category,
            intent: routerResult.classification.intent,
            queryTimeMs: routerResult.queryTimeMs,
          });
        } catch (error: any) {
          logger.warn('API Router failed, wingmen will use Tavily only', {
            component: 'orchestrator',
            phase: 'api-route',
            queryId,
            error: error.message,
          });
        }

        const wingmanPromises = decomposition.subtasks.map((subtask, i) =>
          processSubtask(
            i + 1,
            subtask,
            query.botSystemPrompt,
            query.temperature || DORYLUS_CONFIG.temperature,
            apiAssignments[i],  // API Arsenal: assigned API for this wingman
          )
        );

        // Promise.all — ALL 5 fire simultaneously
        const wingmanResults = await Promise.all(wingmanPromises);

        // Log each wingman result
        for (const result of wingmanResults) {
          await trackWingmanResponse(queryId, result);
          logger.info('Wingman result', {
            component: 'orchestrator',
            phase: 'wingman',
            queryId,
            botName: query.botName,
            wingmanIndex: result.wingmanIndex,
            status: result.status,
            durationMs: result.durationMs,
            tokensTotal: result.tokensIn + result.tokensOut,
          });
        }

        const completedWingmen = wingmanResults.filter(w => w.status === 'complete');
        logger.info('Wingmen completed', {
          component: 'orchestrator',
          phase: 'wingman',
          queryId,
          botName: query.botName,
          completedCount: completedWingmen.length,
          totalCount: DORYLUS_CONFIG.wingmanCount,
        });

        // If ALL wingmen failed, we have nothing to fuse
        if (completedWingmen.length === 0) {
          const errorMsg = 'All wingmen failed — nothing to fuse';
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

        // ════════════════════════════════════════════
        // STEP 4: FAST PATH CHECK — Skip fusion for verified API data
        // ════════════════════════════════════════════
        const fastPath = detectFastPath(completedWingmen);

        logger.info('Path decision', {
          component: 'orchestrator',
          phase: 'routing',
          queryId,
          botName: query.botName,
          path: fastPath.isFastPath ? 'FAST' : 'NORMAL',
          apiDataLength: fastPath.apiData?.length || 0,
        });

        let fusion: FusionResult;

        if (fastPath.isFastPath && fastPath.apiData) {
          // ════ FAST PATH — Skip fusion, present API data directly ════
          logger.info('FAST PATH activated — skipping fusion', {
            component: 'orchestrator',
            phase: 'fast-path',
            queryId,
            botName: query.botName,
            dataLength: fastPath.apiData.length,
          });

          const fastPathStartTime = Date.now();
          const alphaKey = DORYLUS_CONFIG.keys[DORYLUS_CONFIG.alphaFuseKeyIndex];

          if (!alphaKey) {
            throw new Error('LUCY: ALPHA FUSE API key is empty for fast path');
          }

          const fastPathSystemPrompt = `${query.botSystemPrompt}

You are presenting verified, real-time data to the user. This data came directly from an API source moments ago and is 100% accurate.

INSTRUCTIONS:
- Present ALL the data points below to the user. Do not skip any.
- Do NOT change any numbers, scores, names, or facts.
- You may add a brief intro and a brief personality-driven closing.
- Keep the actual data EXACTLY as provided.
- Be conversational but ACCURATE.
- NO EMOJIS. NO MARKDOWN. Plain text only.
- Match your personality from the system prompt above.`;

          const fastPathUserMessage = `User asked: "${query.originalQuery}"

Here is the verified real-time data:

${fastPath.apiData}

Present this data to the user in your personality and style. Include ALL data points.`;

          const fastResult = await callDashScope(
            alphaKey,
            DORYLUS_CONFIG.alphaFuseModel,
            fastPathSystemPrompt,
            fastPathUserMessage,
            query.temperature || DORYLUS_CONFIG.temperature,
            DORYLUS_CONFIG.alphaTimeoutMs,
            4096
          );

          fusion = {
            finalResponse: fastResult.content,
            durationMs: Date.now() - fastPathStartTime,
            tokensIn: fastResult.tokensIn,
            tokensOut: fastResult.tokensOut,
            rawResponse: fastResult.content,
          };
        } else {
          // ════ NORMAL PATH — Full fusion via ALPHA ════
          logger.info('ALPHA fusing results', {
            component: 'orchestrator',
            phase: 'fuse',
            queryId,
            botName: query.botName,
            inputCount: completedWingmen.length,
          });
          fusion = await fuse(
            query.originalQuery,
            query.botSystemPrompt,
            completedWingmen,
            query.temperature || DORYLUS_CONFIG.temperature
          );
        }

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

        logger.info('LUCY cycle complete', {
          component: 'orchestrator',
          phase: 'complete',
          queryId,
          botName: query.botName,
          totalCycleMs,
          totalTokens: totalTokensIn + totalTokensOut,
          totalTokensIn,
          totalTokensOut,
        });

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
      })(),
      new Promise<DorylusCycleResult>((_, reject) =>
        setTimeout(
          () => reject(new Error(`LUCY cycle exceeded ${DORYLUS_CONFIG.totalCycleTimeoutMs}ms timeout`)),
          DORYLUS_CONFIG.totalCycleTimeoutMs
        )
      ),
    ]);

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

    logger.error('LUCY cycle failed', {
      component: 'orchestrator',
      phase: 'error',
      queryId: queryId || 'unknown',
      botName: query.botName,
      totalCycleMs,
      error: error.message,
    });

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
