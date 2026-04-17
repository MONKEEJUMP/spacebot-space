/**
 * API ROUTER — The brain that matches questions to the right APIs
 * Part of the LUCY engine (formerly DORYLUS)
 * Space Bot Engineering — April 2026
 *
 * Flow:
 * 1. ALPHA classifies the user's question (category, tags, keywords)
 * 2. Router queries api_endpoints database
 * 3. Returns top N APIs ranked by relevance + reliability + speed
 * 4. Wingmen call these APIs instead of just Tavily
 */

import { logger } from '@/lib/logger';
import { supabaseAdmin } from '@/lib/supabase';

// ═══ TYPES ═══

export interface QuestionClassification {
  intent: string;           // "sports_score" | "weather" | "news" | "general_knowledge" | etc.
  category: string;         // "Sports & Fitness" | "Weather" | "News" | etc.
  subcategory?: string;     // "NHL Hockey" | "US Politics" | etc.
  searchTags: string[];     // ["hockey", "nhl", "scores"]
  searchKeywords: string[]; // ["flyers", "game", "score"]
  timeSensitive: boolean;   // true = needs real-time data
}

export interface ApiMatch {
  id: number;
  name: string;
  url: string;
  description: string;
  category: string;
  tags: string[];
  keywords: string[];
  authType: string;
  apiKey: string | null;
  avgResponseMs: number;
  reliability: number;
  responseFormat: string;
  relevanceScore: number;   // computed score for this match
}

export interface RouterResult {
  apis: ApiMatch[];
  classification: QuestionClassification;
  queryTimeMs: number;
  totalMatches: number;
}

// ═══ QUESTION CLASSIFIER ═══

// Category mapping — maps common words to database categories
const CATEGORY_MAP: Record<string, string[]> = {
  'Sports & Fitness': ['sport', 'sports', 'game', 'score', 'hockey', 'nhl', 'nba', 'nfl', 'mlb', 'soccer', 'football', 'basketball', 'baseball', 'tennis', 'golf', 'mma', 'ufc', 'boxing', 'racing', 'f1', 'nascar', 'team', 'player', 'standings', 'playoff', 'championship', 'super bowl', 'world series', 'stanley cup'],
  'Weather': ['weather', 'forecast', 'temperature', 'rain', 'snow', 'storm', 'hurricane', 'tornado', 'wind', 'sunny', 'cloudy', 'climate', 'uv'],
  'News': ['news', 'headline', 'breaking', 'politics', 'election', 'president', 'congress', 'senate', 'war', 'conflict', 'protest', 'media', 'journalist'],
  'Cryptocurrency': ['crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'dogecoin', 'solana', 'blockchain', 'defi', 'nft', 'token', 'mining', 'wallet', 'exchange'],
  'Finance': ['stock', 'market', 'invest', 'bank', 'economy', 'gdp', 'inflation', 'interest rate', 'fed', 'treasury', 'dow', 'nasdaq', 'sp500', 'forex', 'currency', 'exchange rate'],
  'Food & Drink': ['food', 'recipe', 'cook', 'meal', 'restaurant', 'nutrition', 'calories', 'diet', 'drink', 'cocktail', 'beer', 'wine', 'coffee'],
  'Health': ['health', 'medical', 'disease', 'symptom', 'drug', 'medicine', 'hospital', 'doctor', 'mental health', 'fitness', 'exercise', 'workout', 'vitamin', 'fda'],
  'Science & Math': ['science', 'physics', 'chemistry', 'biology', 'space', 'nasa', 'planet', 'star', 'math', 'equation', 'research', 'study', 'experiment', 'element'],
  'Government': ['government', 'law', 'regulation', 'federal', 'fbi', 'cia', 'patent', 'trademark', 'court', 'supreme court', 'congress', 'bill', 'legislation'],
  'Geocoding': ['location', 'map', 'address', 'city', 'country', 'zip code', 'coordinates', 'latitude', 'longitude', 'directions', 'distance', 'timezone', 'time zone'],
  'Entertainment': ['movie', 'film', 'tv', 'show', 'series', 'netflix', 'anime', 'manga', 'comic', 'joke', 'meme', 'music', 'song', 'artist', 'album', 'band'],
  'Animals': ['animal', 'dog', 'cat', 'bird', 'fish', 'pet', 'wildlife', 'species', 'breed', 'zoo'],
  'Books': ['book', 'author', 'novel', 'read', 'library', 'literature', 'poem', 'poetry', 'publish'],
  'Transportation': ['car', 'flight', 'airline', 'airport', 'train', 'bus', 'transit', 'vehicle', 'drive', 'traffic', 'uber', 'bike'],
  'Development': ['code', 'programming', 'github', 'npm', 'javascript', 'python', 'api', 'developer', 'software', 'bug', 'deploy'],
  'Games & Comics': ['gaming', 'video game', 'playstation', 'xbox', 'nintendo', 'steam', 'pokemon', 'minecraft', 'fortnite', 'comic', 'marvel', 'dc'],
  'Currency Exchange': ['currency', 'exchange rate', 'usd', 'eur', 'gbp', 'yen', 'convert', 'forex'],
  'Environment': ['environment', 'pollution', 'carbon', 'emission', 'renewable', 'solar', 'wind energy', 'recycle', 'climate change'],
};

// Time-sensitive intents — these need real-time data
const TIME_SENSITIVE_CATEGORIES = ['Sports & Fitness', 'Weather', 'News', 'Cryptocurrency', 'Finance', 'Currency Exchange'];

/**
 * Classify a user question into category, tags, and keywords.
 * This is a FAST local classification — no LLM call needed.
 * Uses word matching against the CATEGORY_MAP.
 */
export function classifyQuestion(question: string): QuestionClassification {
  const q = question.toLowerCase().trim();
  const words = q.split(/\s+/);

  // Score each category by how many matching words it has
  const scores: Record<string, number> = {};
  const matchedTags: Set<string> = new Set();

  for (const [category, categoryWords] of Object.entries(CATEGORY_MAP)) {
    let score = 0;
    for (const cw of categoryWords) {
      if (cw.includes(' ')) {
        // Multi-word match (e.g., "exchange rate", "stanley cup")
        if (q.includes(cw)) {
          score += 3; // Multi-word matches are more specific
          matchedTags.add(cw.replace(/\s+/g, '-'));
        }
      } else {
        // Single word match
        if (words.includes(cw) || q.includes(cw)) {
          score += 1;
          matchedTags.add(cw);
        }
      }
    }
    if (score > 0) {
      scores[category] = score;
    }
  }

  // Best category is the one with the highest score
  let bestCategory = 'Development'; // default fallback
  let bestScore = 0;
  for (const [cat, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  // Extract keywords — significant words from the question
  const stopWords = new Set(['what', 'who', 'where', 'when', 'how', 'why', 'is', 'are', 'was', 'were', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but', 'not', 'do', 'does', 'did', 'can', 'will', 'would', 'should', 'could', 'have', 'has', 'had', 'be', 'been', 'being', 'this', 'that', 'these', 'those', 'it', 'its', 'my', 'me', 'i', 'you', 'we', 'they', 'them', 'their', 'about', 'just', 'very', 'really', 'much', 'some', 'any', 'all', 'tell', 'give', 'know', 'think', 'get', 'got', 'right', 'now', 'today', 'tonight', 'last', 'night', 'please']);
  const searchKeywords = words.filter(w => w.length > 2 && !stopWords.has(w));

  // Determine intent
  let intent = 'general_knowledge';
  if (bestCategory === 'Sports & Fitness') {
    if (q.includes('score') || q.includes('won') || q.includes('win') || q.includes('beat') || q.includes('game') || q.includes('match')) {
      intent = 'sports_score';
    } else if (q.includes('standing') || q.includes('rank')) {
      intent = 'sports_standings';
    } else {
      intent = 'sports_info';
    }
  } else if (bestCategory === 'Weather') {
    intent = 'weather';
  } else if (bestCategory === 'News') {
    intent = 'news';
  } else if (bestCategory === 'Cryptocurrency' || bestCategory === 'Finance') {
    intent = 'finance';
  } else if (bestCategory === 'Geocoding') {
    if (q.includes('time') || q.includes('clock') || q.includes('timezone')) {
      intent = 'time';
    } else {
      intent = 'location';
    }
  }

  return {
    intent,
    category: bestCategory,
    subcategory: undefined,
    searchTags: Array.from(matchedTags).slice(0, 10),
    searchKeywords: searchKeywords.slice(0, 10),
    timeSensitive: TIME_SENSITIVE_CATEGORIES.includes(bestCategory),
  };
}

// ═══ DATABASE QUERY ═══

// Alias for brevity — supabaseAdmin uses service role key, bypasses RLS
const db = supabaseAdmin;

/**
 * Query the api_endpoints table for APIs matching the classification.
 * Uses Supabase PostgREST overlap filters on tags and keywords arrays.
 * Returns top N APIs sorted by relevance, reliability, and speed.
 */
export async function findMatchingApis(
  classification: QuestionClassification,
  limit: number = 10
): Promise<ApiMatch[]> {
  const startTime = Date.now();

  const { searchTags, searchKeywords, category } = classification;

  // Build filter — match by category OR overlapping tags OR overlapping keywords
  // Supabase .or() with .ov (overlap) for array columns
  const orClauses = [`category.eq.${category}`];
  if (searchTags.length > 0) {
    orClauses.push(`tags.ov.{${searchTags.join(',')}}`);
  }
  if (searchKeywords.length > 0) {
    orClauses.push(`keywords.ov.{${searchKeywords.join(',')}}`);
  }

  const { data, error } = await db
    .from('api_endpoints')
    .select('id, name, url, description, category, tags, keywords, auth_type, api_key, avg_response_ms, reliability, response_format')
    .eq('is_active', true)
    .or(orClauses.join(','))
    .order('reliability', { ascending: false })
    .order('avg_response_ms', { ascending: true })
    .limit(limit * 2); // Fetch extra for re-ranking

  if (error) {
    logger.error('API Router query failed', {
      component: 'api-router',
      error: error.message,
      category,
      tags: searchTags,
    });
    return [];
  }

  if (!data || data.length === 0) {
    logger.warn('API Router found no matches', {
      component: 'api-router',
      category,
      tags: searchTags,
      keywords: searchKeywords,
    });
    return [];
  }

  // Re-rank results by computing a proper relevance score
  const scored: ApiMatch[] = data.map((row: Record<string, unknown>) => {
    let relevanceScore = 0;

    // Category match = 10 points
    if (row.category === category) relevanceScore += 10;

    // Tag overlap = 3 points per matching tag
    const rowTags = (row.tags as string[] | null) || [];
    const tagOverlap = rowTags.filter((t: string) => searchTags.includes(t)).length;
    relevanceScore += tagOverlap * 3;

    // Keyword overlap = 2 points per matching keyword
    const rowKeywords = (row.keywords as string[] | null) || [];
    const keywordOverlap = rowKeywords.filter((k: string) => searchKeywords.includes(k)).length;
    relevanceScore += keywordOverlap * 2;

    // Sport-specific boost: when user asks about a specific sport,
    // APIs with THAT EXACT SPORT tag score much higher
    const sportTags = ['nhl', 'nba', 'nfl', 'mlb', 'mma', 'ufc', 'soccer', 'tennis', 'golf', 'epl'];
    const querySportTags = searchTags.filter((t: string) => sportTags.includes(t));
    const apiSportTags = rowTags.filter((t: string) => sportTags.includes(t));

    if (querySportTags.length > 0) {
      const exactSportMatch = querySportTags.some((qt: string) => apiSportTags.includes(qt));
      if (exactSportMatch) {
        relevanceScore += 20; // Massive boost for exact sport match
      } else if (apiSportTags.length > 0) {
        relevanceScore -= 10; // Penalty for wrong sport
      }
    }

    // Reliability bonus (0-5 points)
    const reliability = (row.reliability as number) ?? 1.0;
    relevanceScore += reliability * 5;

    // Speed bonus (faster = more points, max 3 points)
    const avgMs = (row.avg_response_ms as number) ?? 500;
    const speedScore = Math.max(0, 3 - (avgMs / 500));
    relevanceScore += speedScore;

    return {
      id: row.id as number,
      name: row.name as string,
      url: row.url as string,
      description: (row.description as string) || '',
      category: row.category as string,
      tags: rowTags,
      keywords: rowKeywords,
      authType: (row.auth_type as string) || 'none',
      apiKey: (row.api_key as string) || null,
      avgResponseMs: avgMs,
      reliability,
      responseFormat: (row.response_format as string) || 'json',
      relevanceScore,
    };
  });

  // Sort by relevance score descending
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Return top N
  const results = scored.slice(0, limit);

  const queryTimeMs = Date.now() - startTime;

  logger.info('API Router matched', {
    component: 'api-router',
    phase: 'route',
    category,
    intent: classification.intent,
    totalMatches: data.length,
    returned: results.length,
    topMatch: results[0]?.name || 'none',
    queryTimeMs,
  });

  return results;
}

// ═══ MAIN EXPORT ═══

/**
 * Route a user question to the best matching APIs.
 * This is the main function called by ALPHA/orchestrator.
 *
 * @param question - The user's raw question
 * @param maxApis - Maximum number of APIs to return (default: 5, one per wingman)
 * @returns RouterResult with matched APIs and classification
 */
export async function routeQuestion(
  question: string,
  maxApis: number = 5
): Promise<RouterResult> {
  const startTime = Date.now();

  // Step 1: Classify the question (fast, local, no DB call)
  const classification = classifyQuestion(question);

  logger.info('Question classified', {
    component: 'api-router',
    phase: 'classify',
    intent: classification.intent,
    category: classification.category,
    tags: classification.searchTags,
    timeSensitive: classification.timeSensitive,
  });

  // Step 2: Find matching APIs from database
  const apis = await findMatchingApis(classification, maxApis);

  const queryTimeMs = Date.now() - startTime;

  return {
    apis,
    classification,
    queryTimeMs,
    totalMatches: apis.length,
  };
}
