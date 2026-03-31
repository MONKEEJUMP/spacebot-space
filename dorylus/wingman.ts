// wingman.ts — DORYLUS Wingman Worker
// EACH WINGMAN SEARCHES THE LIVE INTERNET — NO INTERNAL LLM DATA FOR FACTS
// Flow: Receive subtask → Search web with Tavily → Feed results + subtask into QWEN → Synthesize
// QWEN is for THINKING only. All facts come from the web. This is non-negotiable.

import { DORYLUS_CONFIG } from './config';
import { WingmanResult } from './types';
import { callCerebras } from './alpha';

// Search result from Tavily
interface TavilyResult {
  title: string;
  url: string;
  content: string;       // Extracted page content
  score: number;         // Relevance score
}

interface TavilySearchResponse {
  results: TavilyResult[];
  query: string;
}

// Step 1: Search the live internet using Tavily
async function searchWeb(
  wingmanIndex: number,
  searchQuery: string
): Promise<{ results: TavilyResult[]; searchMs: number }> {
  const startTime = Date.now();
  const tavilyKey = DORYLUS_CONFIG.tavilyKeys[wingmanIndex - 1]; // 1-indexed to 0-indexed

  if (!tavilyKey) {
    console.log(`[DORYLUS] Wingman ${wingmanIndex}: No Tavily key, skipping web search`);
    return { results: [], searchMs: 0 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DORYLUS_CONFIG.tavilyTimeout);

  try {
    const response = await fetch(DORYLUS_CONFIG.tavilyEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: searchQuery,
        search_depth: DORYLUS_CONFIG.tavilySearchDepth,
        max_results: DORYLUS_CONFIG.tavilyMaxResults,
        include_answer: false,       // We don't want Tavily's AI answer — QWEN does the thinking
        include_raw_content: false,  // Save tokens — extracted content is enough
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[DORYLUS] Wingman ${wingmanIndex} Tavily error ${response.status}: ${errorBody}`);
      return { results: [], searchMs: Date.now() - startTime };
    }

    const data: TavilySearchResponse = await response.json();
    const searchMs = Date.now() - startTime;

    console.log(`[DORYLUS] Wingman ${wingmanIndex}: Found ${data.results?.length || 0} web results in ${searchMs}ms`);

    return {
      results: data.results || [],
      searchMs,
    };
  } catch (error: any) {
    const searchMs = Date.now() - startTime;
    if (error.name === 'AbortError') {
      console.error(`[DORYLUS] Wingman ${wingmanIndex}: Tavily search timed out after ${searchMs}ms`);
    } else {
      console.error(`[DORYLUS] Wingman ${wingmanIndex}: Tavily search failed:`, error.message);
    }
    return { results: [], searchMs };
  } finally {
    clearTimeout(timeout);
  }
}

// Step 2: Format web results into a context block for QWEN
function formatWebResults(results: TavilyResult[]): string {
  if (results.length === 0) {
    return '[NO WEB RESULTS FOUND — Answer based on general knowledge as fallback only]';
  }

  return results
    .map((r, i) => {
      // Truncate content to ~500 chars per result to stay within context limit
      const content = r.content && r.content.length > 500
        ? r.content.substring(0, 500) + '...'
        : r.content || '[No content extracted]';
      return `SOURCE ${i + 1}: ${r.title}\nURL: ${r.url}\nCONTENT: ${content}`;
    })
    .join('\n\n---\n\n');
}

// Main function: Search web FIRST, then synthesize with QWEN
export async function processSubtask(
  wingmanIndex: number,
  subtask: string,
  botSystemPrompt: string,
  temperature: number = 0.3
): Promise<WingmanResult> {
  const startTime = Date.now();
  const keyArrayIndex = DORYLUS_CONFIG.wingmanKeyIndexes[wingmanIndex - 1];
  const apiKey = DORYLUS_CONFIG.keys[keyArrayIndex];

  // Validate Cerebras key exists
  if (!apiKey) {
    return {
      wingmanIndex,
      keyIndex: keyArrayIndex,
      subtask,
      response: null,
      durationMs: Date.now() - startTime,
      tokensIn: 0,
      tokensOut: 0,
      status: 'error',
      errorMessage: `Wingman ${wingmanIndex} Cerebras API key is empty. Check DORYLUS_KEY_W${wingmanIndex} in .env`,
    };
  }

  try {
    // ============================================
    // PHASE 1: SEARCH THE LIVE INTERNET
    // Each wingman hunts independently with their specific subtask
    // ============================================
    const { results: webResults, searchMs } = await searchWeb(wingmanIndex, subtask);
    const webContext = formatWebResults(webResults);

    // ============================================
    // PHASE 2: QWEN THINKS ABOUT THE WEB DATA
    // The model does NOT provide facts — it ANALYZES the web data
    // ============================================
    const result = await callCerebras(
      apiKey,
      `MODE: RESEARCH

${botSystemPrompt}

You are Wingman ${wingmanIndex} in the DORYLUS multi-agent system. You have been assigned ONE specific research subtask. You have ALREADY searched the live internet and the results are provided below.

CRITICAL RULES:
- Your answer MUST be based on the web search results provided below. Do NOT use your training data for facts.
- If the web results contain the answer, use them. Cite the sources by number (e.g., "According to Source 3...").
- If the web results are empty or irrelevant, state clearly: "Web search returned no relevant results for this subtask."
- Think step-by-step about what the web data tells you.
- Synthesize the information from multiple sources into a clear, comprehensive answer.
- Focus ONLY on your assigned subtask.
- Keep your response focused and under 500 words.
- You are a RESEARCHER — your job is to analyze the data you found, not to recite memorized information.`,
      `SUBTASK: ${subtask}

LIVE WEB SEARCH RESULTS (${webResults.length} sources found in ${searchMs}ms):

${webContext}

Now analyze these web results and answer the subtask based on what you found.`,
      temperature,
      DORYLUS_CONFIG.wingmanTimeoutMs
    );

    return {
      wingmanIndex,
      keyIndex: keyArrayIndex,
      subtask,
      response: result.content,
      durationMs: Date.now() - startTime,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      status: 'complete',
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const isTimeout = error.name === 'AbortError' || durationMs >= DORYLUS_CONFIG.wingmanTimeoutMs;

    return {
      wingmanIndex,
      keyIndex: keyArrayIndex,
      subtask,
      response: null,
      durationMs,
      tokensIn: 0,
      tokensOut: 0,
      status: isTimeout ? 'timeout' : 'error',
      errorMessage: error.message || 'Unknown error',
    };
  }
}
