/**
 * SCOUT — The API Harvester
 * Crawls GitHub repos for new free APIs. Tests them. Adds to the arsenal.
 * The arsenal grows every day without anyone lifting a finger.
 *
 * Run: npx ts-node scripts/scout-harvester.ts
 * PM2: pm2 start scripts/scout-harvester.ts --interpreter="npx" --interpreter-args="ts-node" --cron "0 3 * * *" --no-autorestart
 * (runs daily at 3 AM CDT)
 *
 * Space Bot Engineering — April 2026
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ═══ ESM COMPAT ═══
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ═══ STANDALONE ENV LOADING ═══
// Matches api-health-check.ts pattern — reads .env.local directly

function loadEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '..', '.env.local');
  const raw = readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const ENV = loadEnv();

function getEnv(key: string): string {
  const val = ENV[key] || process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

// ═══ STANDALONE SUPABASE CLIENT ═══

const supabaseAdmin: SupabaseClient = createClient(
  getEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getEnv('SUPABASE_SERVICE_ROLE_KEY'),
);

// ═══ STANDALONE LOGGER ═══
// Structured JSON logger matching project conventions

function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
  const record: Record<string, unknown> = {
    level,
    timestamp: new Date().toISOString(),
    message,
    component: 'scout',
    ...data,
  };
  const line = JSON.stringify(record);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

// ═══ GITHUB SOURCES TO CRAWL ═══

const GITHUB_SOURCES = [
  {
    name: 'public-apis',
    url: 'https://raw.githubusercontent.com/public-apis/public-apis/master/README.md',
    filterAuth: 'No',
  },
  {
    name: 'public-api-lists',
    url: 'https://raw.githubusercontent.com/public-api-lists/public-api-lists/master/README.md',
    filterAuth: 'No',
  },
  {
    name: 'alexandresanlim-no-auth',
    url: 'https://raw.githubusercontent.com/alexandresanlim/public-apis-no-auth-only/master/README.md',
    filterAuth: null, // already filtered to no-auth
  },
  {
    name: 'marcelscruz',
    url: 'https://raw.githubusercontent.com/marcelscruz/public-apis/main/README.md',
    filterAuth: 'No',
  },
];

// ═══ PARSER ═══

interface ParsedApi {
  name: string;
  url: string;
  description: string;
  category: string;
  auth: string;
  https: boolean;
}

/**
 * Parse a GitHub README.md that uses the public-apis table format:
 * | [Name](url) | Description | Auth | HTTPS | CORS |
 */
function parseReadme(markdown: string, filterAuth: string | null): ParsedApi[] {
  const apis: ParsedApi[] = [];
  let currentCategory = 'Unknown';

  const lines = markdown.split('\n');

  for (const line of lines) {
    // Detect category headers: ### Category Name or ## Category Name
    const categoryMatch = line.match(/^#{2,3}\s+(.+)/);
    if (categoryMatch) {
      const cat = categoryMatch[1].trim();
      // Skip index links and non-category headers
      if (!cat.startsWith('[') && !cat.includes('Index') && !cat.includes('Back to')) {
        currentCategory = cat;
      }
      continue;
    }

    // Detect table rows: | [Name](url) | Description | Auth | HTTPS | CORS |
    const tableMatch = line.match(
      /\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]*)\|?/,
    );
    if (tableMatch) {
      const name = tableMatch[1].trim();
      const url = tableMatch[2].trim();
      const description = tableMatch[3].trim();
      const auth = tableMatch[4].trim();
      const https = tableMatch[5].trim().toLowerCase() === 'yes';

      // Filter by auth if specified
      if (filterAuth && auth !== filterAuth) continue;

      // Skip empty or invalid entries
      if (!name || !url || url === '#') continue;

      apis.push({ name, url, description, category: currentCategory, auth, https });
      continue;
    }

    // Also detect simpler format: | Name | Description | url | ...
    const simpleMatch = line.match(/\|\s*([^|\[]+)\s*\|\s*([^|]+)\|\s*(https?:\/\/[^\s|]+)/);
    if (simpleMatch) {
      const name = simpleMatch[1].trim();
      const description = simpleMatch[2].trim();
      const url = simpleMatch[3].trim();

      if (!name || !url || name === 'API' || name === '---') continue;

      apis.push({
        name,
        url,
        description,
        category: currentCategory,
        auth: 'No',
        https: url.startsWith('https'),
      });
    }
  }

  return apis;
}

// ═══ SLUG GENERATOR ═══

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ═══ TAG GENERATOR ═══

function generateTags(name: string, category: string): string[] {
  const words = [
    ...(category || '').toLowerCase().split(/[^a-z]+/),
    ...name.toLowerCase().split(/[^a-z]+/),
  ].filter((w) => w.length > 2 && w !== 'api');
  return [...new Set(words)].slice(0, 10);
}

// ═══ MAIN HARVEST FUNCTION ═══

async function harvest(): Promise<void> {
  const startTime = Date.now();

  log('info', 'SCOUT Harvester starting', {
    sources: GITHUB_SOURCES.length,
  });

  // Step 1: Get all existing API slugs + URLs from the database (for dedup)
  const { data: existing } = await supabaseAdmin
    .from('api_endpoints')
    .select('slug, url');

  const existingSlugs = new Set((existing || []).map((e: any) => e.slug));
  const existingUrls = new Set((existing || []).map((e: any) => e.url));

  // Also get pending queue items
  const { data: queued } = await supabaseAdmin
    .from('api_harvest_queue')
    .select('url');

  const queuedUrls = new Set((queued || []).map((q: any) => q.url));

  let totalFound = 0;
  let totalNew = 0;
  let totalSkipped = 0;

  // Step 2: Crawl each source
  for (const source of GITHUB_SOURCES) {
    try {
      log('info', `Crawling ${source.name}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(source.url, {
        headers: { 'User-Agent': 'SpaceBot-SCOUT/1.0' },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        log('warn', `Failed to fetch ${source.name}: HTTP ${response.status}`);
        continue;
      }

      const markdown = await response.text();
      const apis = parseReadme(markdown, source.filterAuth);

      totalFound += apis.length;
      log('info', `Parsed ${apis.length} APIs from ${source.name}`);

      // Step 3: Check each API against existing database
      for (const api of apis) {
        const slug = toSlug(api.name);

        // Skip if already in database or queue
        if (existingSlugs.has(slug) || existingUrls.has(api.url) || queuedUrls.has(api.url)) {
          totalSkipped++;
          continue;
        }

        // NEW API FOUND — add to harvest queue
        const { error } = await supabaseAdmin.from('api_harvest_queue').insert({
          name: api.name,
          url: api.url,
          source: source.name,
          category_guess: api.category,
        });

        if (!error) {
          totalNew++;
          queuedUrls.add(api.url); // Prevent duplicates within this run

          log('info', `New API: ${api.name}`, {
            source: source.name,
            category: api.category,
          });
        }
      }
    } catch (error: any) {
      log('warn', `Error crawling ${source.name}`, {
        error: error.message,
      });
    }
  }

  // Step 4: Verify queued APIs (test if they're alive)
  const { data: unverified } = await supabaseAdmin
    .from('api_harvest_queue')
    .select('*')
    .eq('verified', false)
    .eq('rejected', false)
    .limit(50); // Process 50 at a time — be gentle

  let verified = 0;
  let rejected = 0;

  if (unverified && unverified.length > 0) {
    log('info', `Verifying ${unverified.length} queued APIs`);

    for (const api of unverified) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(api.url, {
          method: 'GET',
          headers: {
            'User-Agent': 'SpaceBot-SCOUT/1.0',
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          // API is alive — mark as verified
          await supabaseAdmin
            .from('api_harvest_queue')
            .update({ verified: true, verified_at: new Date().toISOString() })
            .eq('id', api.id);
          verified++;
        } else {
          // API returned error — reject it
          await supabaseAdmin
            .from('api_harvest_queue')
            .update({ rejected: true, reject_reason: `HTTP ${response.status}` })
            .eq('id', api.id);
          rejected++;
        }
      } catch (error: any) {
        await supabaseAdmin
          .from('api_harvest_queue')
          .update({
            rejected: true,
            reject_reason: error.name === 'AbortError' ? 'timeout' : error.message,
          })
          .eq('id', api.id);
        rejected++;
      }

      // 500ms delay between checks — be gentle
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Step 5: Promote verified APIs to the master table
  const { data: readyToPromote } = await supabaseAdmin
    .from('api_harvest_queue')
    .select('*')
    .eq('verified', true);

  let promoted = 0;

  if (readyToPromote && readyToPromote.length > 0) {
    log('info', `Promoting ${readyToPromote.length} verified APIs to master table`);

    for (const api of readyToPromote) {
      const slug = toSlug(api.name);

      // Double-check slug doesn't already exist in master
      if (existingSlugs.has(slug)) {
        await supabaseAdmin.from('api_harvest_queue').delete().eq('id', api.id);
        continue;
      }

      const tags = generateTags(api.name, api.category_guess);

      // Insert into master table — match api_endpoints schema exactly
      const { error } = await supabaseAdmin
        .from('api_endpoints')
        .insert({
          name: api.name,
          slug,
          url: api.url,
          description: `Discovered by SCOUT from ${api.source}`,
          category: api.category_guess || 'Uncategorized',
          auth_type: 'none',
          tags,
          keywords: tags,
          source_repo: api.source,
          is_active: true,
          reliability: 0.8,
        })
        .select();

      if (!error) {
        promoted++;
        existingSlugs.add(slug);

        // Remove from queue — successfully promoted
        await supabaseAdmin.from('api_harvest_queue').delete().eq('id', api.id);
      } else if (error.message?.includes('duplicate key') || error.code === '23505') {
        // Slug already exists in master — clean up queue entry silently
        existingSlugs.add(slug);
        await supabaseAdmin.from('api_harvest_queue').delete().eq('id', api.id);
      } else {
        log('warn', `Failed to promote ${api.name}`, { error: error.message });
      }
    }
  }

  const totalTime = Date.now() - startTime;

  log('info', 'SCOUT Harvester complete', {
    totalFound,
    totalNew,
    totalSkipped,
    verified,
    rejected,
    promoted,
    totalTimeMs: totalTime,
  });

  // Human-readable summary
  const summary = `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  SCOUT HARVESTER COMPLETE
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

  Sources crawled:     ${GITHUB_SOURCES.length}
  APIs found:          ${totalFound}
  New (not in DB):     ${totalNew}
  Already known:       ${totalSkipped}

  Queue verified:      ${verified}
  Queue rejected:      ${rejected}
  Promoted to master:  ${promoted}

  Time: ${Math.round(totalTime / 1000)} seconds
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`;
  process.stdout.write(summary);
}

// ═══ RUN ═══

harvest()
  .then(() => process.exit(0))
  .catch((error) => {
    log('error', 'SCOUT crashed', { error: error.message, stack: error.stack });
    process.exit(1);
  });
