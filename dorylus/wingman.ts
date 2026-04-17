// wingman.ts — LUCY Wingman Worker

// EACH WINGMAN SEARCHES THE LIVE INTERNET — NO INTERNAL LLM DATA FOR FACTS

// Flow: Receive subtask → Search web with Tavily → Feed results + subtask into QWEN → Synthesize

// QWEN is for THINKING only. All facts come from the web. This is non-negotiable.



import { DORYLUS_CONFIG } from './config';

import { WingmanResult } from './types';

import { callDashScope } from './alpha';

import { logger } from '@/lib/logger';

import { ApiMatch } from './api-router';



// === API ARSENAL === Direct API calling for wingmen ===



/**

 * Call a direct API endpoint from the API Arsenal.

 * Returns structured data much faster than web search.

 * Falls back to null if the API call fails (wingman will use Tavily instead).

 */

async function callDirectApi(apiEndpoint: ApiMatch, queryText?: string): Promise<string | null> {

  const startTime = Date.now();



  try {

    const headers: Record<string, string> = {

      'Accept': 'application/json',

      'User-Agent': 'SpaceBot-LUCY/1.0',

    };



    // Add API key header if needed

    if (apiEndpoint.authType === 'apiKey' && apiEndpoint.apiKey) {

      headers['Authorization'] = `Bearer ${apiEndpoint.apiKey}`;

    }



    let apiUrl = apiEndpoint.url;



    // Date intelligence: if scoreboard endpoint, detect temporal queries

    // and append the correct date parameter

    if (apiUrl.includes('/scoreboard') && !apiUrl.includes('dates=') && queryText) {

      const qLower = queryText.toLowerCase();



      // Detect "last night", "yesterday", "last game", etc.

      const isYesterday = /last\s*night|yesterday|last\s*game|last\s*evening/.test(qLower);

      // Detect "today", "tonight", "this evening"

      const isToday = /today|tonight|this\s*evening|right\s*now|current/.test(qLower);



      if (isYesterday) {

        const yesterday = new Date();

        yesterday.setDate(yesterday.getDate() - 1);

        const dateStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');

        apiUrl += (apiUrl.includes('?') ? '&' : '?') + 'dates=' + dateStr;

      } else if (isToday) {

        const today = new Date();

        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

        apiUrl += (apiUrl.includes('?') ? '&' : '?') + 'dates=' + dateStr;

      }

    }



    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout



    const response = await fetch(apiUrl, {

      method: 'GET',

      headers,

      signal: controller.signal,

    });



    clearTimeout(timeout);



    if (!response.ok) {

      logger.warn('API Arsenal call failed', {

        component: 'wingman',

        api: apiEndpoint.name,

        status: response.status,

        durationMs: Date.now() - startTime,

      });

      return null;

    }



    let data: string;



    if (apiEndpoint.responseFormat === 'json' || response.headers.get('content-type')?.includes('json')) {

      const json = await response.json();

      data = JSON.stringify(json, null, 2);

    } else if (apiEndpoint.responseFormat === 'xml' || response.headers.get('content-type')?.includes('xml')) {

      data = await response.text();

    } else {

      data = await response.text();

    }



    // Smart extraction: if JSON is large, pull only the useful data

    if (data.length > 10000) {

      try {

        const parsed = JSON.parse(data);



        // ESPN-style: extract events array (where scores live)

        if (parsed.events && Array.isArray(parsed.events)) {

          const slim = parsed.events.map((event: any) => ({

            name: event.name || event.shortName,

            date: event.date,

            status: event.status?.type?.description || event.status?.type?.name,

            competitors: event.competitions?.[0]?.competitors?.map((c: any) => ({

              team: c.team?.displayName || c.team?.shortDisplayName || c.team?.name,

              score: c.score,

              winner: c.winner,

              homeAway: c.homeAway,

            })),

          }));

          data = JSON.stringify(slim, null, 2);

        }

        // CoinCap/generic: unwrap { data: [...] } envelope
        else if (parsed.data && Array.isArray(parsed.data)) {
          data = JSON.stringify(parsed.data.slice(0, 20), null, 2);
        }
        // News/search: unwrap { results: [...] } envelope
        else if (parsed.results && Array.isArray(parsed.results)) {
          data = JSON.stringify(parsed.results.slice(0, 20), null, 2);
        }

        // CoinGecko/crypto style: already compact, just limit array size
        else if (Array.isArray(parsed) && parsed.length > 20) {

          data = JSON.stringify(parsed.slice(0, 20), null, 2);

        }

        // Generic object: stringify with formatting

        else {

          data = JSON.stringify(parsed, null, 2);

        }

      } catch {

        // Not valid JSON, keep as text

      }

    }



    // Final safety truncation at 10,000 chars

    if (data.length > 10000) {

      data = data.substring(0, 10000) + '\n... [truncated]';

    }

    // Pre-format the data into human-readable text
    // This is the KEY pattern: wingman formats, ALPHA presents
    data = formatApiResponse(data, apiEndpoint.name);

    logger.info('API Arsenal call succeeded', {

      component: 'wingman',

      api: apiEndpoint.name,

      responseLength: data.length,

      durationMs: Date.now() - startTime,

    });



    return data;



  } catch (error: any) {

    const durationMs = Date.now() - startTime;

    if (error.name === 'AbortError') {

      logger.warn('API Arsenal call timed out', {

        component: 'wingman',

        api: apiEndpoint.name,

        durationMs,

      });

    } else {

      logger.warn('API Arsenal call error', {

        component: 'wingman',

        api: apiEndpoint.name,

        error: error.message,

        durationMs,

      });

    }

    return null;

  }

}

// === PRE-FORMAT API RESPONSES === Human-readable output for ALPHA ===

/**
 * Format raw API data into clean, human-readable text.
 * This is the KEY architectural pattern: the wingman formats,
 * ALPHA presents. ALPHA should never reinterpret this data.
 */
function formatApiResponse(data: string, apiName: string): string {
  try {
    const parsed = JSON.parse(data);

    // Unwrap common API response envelopes ({ data: [...] }, { results: [...] })
    const items: any[] | null = Array.isArray(parsed) ? parsed
        : (parsed.data && Array.isArray(parsed.data)) ? parsed.data
        : (parsed.results && Array.isArray(parsed.results)) ? parsed.results
        : null;

    // ESPN Scoreboard format — array of game objects with competitors
    if (items && items.length > 0 && items[0].competitors) {
      const lines: string[] = [];
      lines.push(`📊 ${apiName} — ${items.length} games:\n`);

      for (const game of items) {
        const comps = game.competitors || [];
        if (comps.length === 2) {
          const away = comps.find((c: any) => c.homeAway === 'away') || comps[0];
          const home = comps.find((c: any) => c.homeAway === 'home') || comps[1];
          const status = game.status || 'Final';

          let line = `${away.team} ${away.score}, ${home.team} ${home.score}`;
          if (status && status !== 'Final') {
            line += ` (${status})`;
          } else {
            line += ` (Final)`;
          }
          if (away.winner) line += ` — ${away.team} win`;
          else if (home.winner) line += ` — ${home.team} win`;

          lines.push(`• ${line}`);
        } else if (game.name) {
          const status = game.status || 'Final';
          lines.push(`• ${game.name} — ${status}`);
        }
      }

      return lines.join('\n');
    }

    // Crypto/Finance format — array of asset objects
    if (items && items.length > 0 && (items[0].priceUsd || items[0].current_price || items[0].price)) {
      const lines: string[] = [];
      lines.push(`📊 ${apiName} — ${items.length} results:\n`);

      for (const item of items.slice(0, 15)) {
        const name = item.name || item.symbol || 'Unknown';
        const price = item.priceUsd || item.current_price || item.price || 'N/A';
        const change = item.changePercent24Hr || item.price_change_percentage_24h;
        let line = `• ${name}: $${typeof price === 'number' ? price.toFixed(2) : parseFloat(price).toFixed(2)}`;
        if (change !== undefined && change !== null) {
          const pct = typeof change === 'number' ? change : parseFloat(change);
          line += ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
        }
        lines.push(line);
      }

      return lines.join('\n');
    }

    // Weather format — current_weather object
    if (parsed.current_weather || parsed.current) {
      const w = parsed.current_weather || parsed.current;
      const lines: string[] = [];
      lines.push(`🌤️ Weather Data:\n`);
      if (w.temperature !== undefined) lines.push(`• Temperature: ${w.temperature}°${parsed.current_weather_units?.temperature || 'F'}`);
      if (w.windspeed !== undefined) lines.push(`• Wind: ${w.windspeed} ${parsed.current_weather_units?.windspeed || 'mph'}`);
      if (w.weathercode !== undefined) lines.push(`• Condition code: ${w.weathercode}`);
      if (w.is_day !== undefined) lines.push(`• Daytime: ${w.is_day ? 'Yes' : 'No'}`);
      return lines.join('\n');
    }

    // Time format — timezone response
    if (parsed.datetime && parsed.timezone) {
      return `🕐 Current time in ${parsed.timezone}: ${parsed.datetime}\n• UTC offset: ${parsed.utc_offset || 'N/A'}\n• DST active: ${parsed.dst ? 'Yes' : 'No'}`;
    }

    // News/RSS format — array with title/description
    if (items && items.length > 0 && (items[0].title || items[0].headline)) {
      const lines: string[] = [];
      lines.push(`📰 ${apiName} — ${items.length} stories:\n`);
      for (const item of items.slice(0, 10)) {
        const title = item.title || item.headline || item.name;
        const source = item.source || item.author || '';
        lines.push(`• ${title}${source ? ` (${source})` : ''}`);
      }
      return lines.join('\n');
    }

    // RSS feed with items array
    if (parsed.items && Array.isArray(parsed.items)) {
      const lines: string[] = [];
      lines.push(`📰 ${apiName} — ${parsed.items.length} stories:\n`);
      for (const item of parsed.items.slice(0, 10)) {
        lines.push(`• ${item.title || item.name}`);
      }
      return lines.join('\n');
    }

    // Generic object — return a clean key-value summary
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      const lines: string[] = [];
      lines.push(`📊 ${apiName}:\n`);
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== 'object' && value !== null && value !== undefined) {
          lines.push(`• ${key}: ${value}`);
        }
      }
      if (lines.length > 1) return lines.join('\n');
    }

    // If nothing matched, return the raw data (truncated)
    return data.length > 5000 ? data.substring(0, 5000) + '\n... [truncated]' : data;

  } catch {
    // Not valid JSON or parsing failed — return as-is
    return data.length > 5000 ? data.substring(0, 5000) + '\n... [truncated]' : data;
  }
}





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

    logger.warn('Wingman missing Tavily key, skipping web search', {

      component: 'wingman',

      wingmanIndex,

      phase: 'search',

    });

    return { results: [], searchMs: 0 };

  }



  // Tavily hard limit: 400 character max per query. Truncate to avoid 400 errors.

  const TAVILY_MAX_QUERY_CHARS = 350;

  const truncatedQuery =

    searchQuery.length > TAVILY_MAX_QUERY_CHARS

      ? searchQuery.substring(0, TAVILY_MAX_QUERY_CHARS - 3) + '...'

      : searchQuery;



  if (searchQuery.length > TAVILY_MAX_QUERY_CHARS) {

    logger.warn('Wingman Tavily query truncated', {

      component: 'wingman',

      wingmanIndex,

      phase: 'search',

      originalLength: searchQuery.length,

      truncatedLength: truncatedQuery.length,

    });

  }



  // Prepend today's date to improve search recency

  const today = new Date();

  const datePrefix = `${today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

  const queryWithDate = `${datePrefix}: ${truncatedQuery}`;



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

        query: queryWithDate,

        search_depth: DORYLUS_CONFIG.tavilySearchDepth,

        max_results: DORYLUS_CONFIG.tavilyMaxResults,

        topic: DORYLUS_CONFIG.tavilyTopic,

        time_range: DORYLUS_CONFIG.tavilyTimeRange,

        include_answer: false,

        include_raw_content: false,

      }),

      signal: controller.signal,

    });



    if (!response.ok) {

      const errorBody = await response.text();

      logger.error('Wingman Tavily HTTP error', {

        component: 'wingman',

        wingmanIndex,

        phase: 'search',

        status: response.status,

        body: errorBody,

      });

      return { results: [], searchMs: Date.now() - startTime };

    }



    const data: TavilySearchResponse = await response.json();

    const searchMs = Date.now() - startTime;



    logger.info('Wingman web search complete', {

      component: 'wingman',

      wingmanIndex,

      phase: 'search',

      resultCount: data.results?.length || 0,

      searchMs,

    });



    return {

      results: data.results || [],

      searchMs,

    };

  } catch (error: any) {

    const searchMs = Date.now() - startTime;

    if (error.name === 'AbortError') {

      logger.error('Wingman Tavily search timed out', {

        component: 'wingman',

        wingmanIndex,

        phase: 'search',

        searchMs,

        timeoutMs: DORYLUS_CONFIG.tavilyTimeout,

      });

    } else {

      logger.error('Wingman Tavily search failed', {

        component: 'wingman',

        wingmanIndex,

        phase: 'search',

        searchMs,

        error: error?.message || String(error),

      });

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

  temperature: number = 0.3,

  assignedApi?: ApiMatch,

): Promise<WingmanResult> {

  const startTime = Date.now();

  const keyArrayIndex = DORYLUS_CONFIG.wingmanKeyIndexes[wingmanIndex - 1];

  const apiKey = DORYLUS_CONFIG.keys[keyArrayIndex];



  // Validate DashScope key exists

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

      errorMessage: `Wingman ${wingmanIndex} DashScope API key is empty. Check DORYLUS_KEY_W${wingmanIndex} in .env`,

    };

  }



  try {

    // ============================================

    // PHASE 1: TRY API ARSENAL FIRST (milliseconds, structured data)

    // Fall back to Tavily web search if no API assigned or API fails

    // ============================================

    let webResults: TavilyResult[] = [];

    let searchMs = 0;

    let apiArsenalData: string | null = null;



    if (assignedApi) {

      apiArsenalData = await callDirectApi(assignedApi, subtask);

      if (apiArsenalData) {

        logger.info('Wingman using API Arsenal data', {

          component: 'wingman',

          wingmanIndex,

          api: assignedApi.name,

          category: assignedApi.category,

        });

      }

    }



    // Fall back to Tavily if no API assigned or API call failed

    if (!apiArsenalData) {

      const tavilyResult = await searchWeb(wingmanIndex, subtask);

      webResults = tavilyResult.results;

      searchMs = tavilyResult.searchMs;

    }



    // Build context: API Arsenal data OR Tavily web results

    const webContext = apiArsenalData

      ? `API ARSENAL DATA (${assignedApi!.name}):\n${apiArsenalData}`

      : formatWebResults(webResults);



    // ============================================

    // PHASE 2: QWEN THINKS ABOUT THE WEB DATA

    // The model does NOT provide facts — it ANALYZES the web data

    // ============================================

    const result = await callDashScope(

      apiKey,

      DORYLUS_CONFIG.wingmanModel,

      `MODE: RESEARCH



${botSystemPrompt}



You are Wingman ${wingmanIndex} in the LUCY multi-agent system. You have been assigned ONE specific research subtask. You have ALREADY searched the live internet and the results are provided below.



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



LIVE WEB SEARCH RESULTS (${apiArsenalData ? "API Arsenal direct data" : webResults.length + " sources found in " + searchMs + "ms"}):



${webContext}



Now analyze these web results and answer the subtask based on what you found.`,

      temperature,

      DORYLUS_CONFIG.wingmanTimeoutMs

    );



    // Label data source so ALPHA knows to trust API data over web search
    const sourceLabel = apiArsenalData
      ? '[SOURCE: DIRECT API - VERIFIED REAL-TIME DATA]\n'
      : '[SOURCE: WEB SEARCH - MAY BE OUTDATED]\n';

    return {

      wingmanIndex,

      keyIndex: keyArrayIndex,

      subtask,

      response: sourceLabel + result.content,

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





// Export API Arsenal caller for use by orchestrator

export { callDirectApi };