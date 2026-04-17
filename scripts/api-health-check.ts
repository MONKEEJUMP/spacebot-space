/**
 * API ARSENAL — Health Check System
 * Pings all APIs, updates response times and reliability scores.
 * Auto-deactivates dead APIs after reliability drops below 0.2.
 *
 * Run:  cd /var/www/spacebot && npx tsx scripts/api-health-check.ts
 * PM2:  See bottom of file for PM2 cron command
 *
 * Space Bot Engineering — April 2026
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// ═══ ENV LOADING ═══
// Read .env.local directly (same pattern as migrate-add-clerk-fields.ts)
// This script runs standalone — Next.js env loading is not available.

const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');

function getEnv(key: string): string {
  const match = envContent.match(new RegExp(`^${key}="?([^"\\n]+)"?`, 'm'));
  if (!match) {
    console.error(`${key} not found in .env.local`);
    process.exit(1);
  }
  return match[1];
}

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// ═══ LOGGER ═══
// Minimal structured logger (standalone — @/lib/logger uses path alias that won't resolve here)

function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
  const record = { level, timestamp: new Date().toISOString(), message, component: 'health-check', ...data };
  const line = JSON.stringify(record);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

// ═══ TYPES ═══

interface ApiRow {
  id: number;
  name: string;
  url: string;
  avg_response_ms: number | null;
  reliability: number | null;
  last_checked: string | null;
  last_failed: string | null;
}

// ═══ PING ═══

async function pingApi(url: string, timeoutMs: number = 5000): Promise<{ ok: boolean; ms: number; error?: string }> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'SpaceBot-HealthCheck/1.0',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const ms = Date.now() - start;

    return { ok: response.ok, ms };

  } catch (error: any) {
    const ms = Date.now() - start;

    if (error.name === 'AbortError') {
      return { ok: false, ms, error: 'timeout' };
    }

    return { ok: false, ms, error: error.message || 'unknown error' };
  }
}

// ═══ MAIN ═══

async function runHealthCheck(): Promise<void> {
  const startTime = Date.now();

  log('info', 'API Health Check starting');

  // Fetch all APIs from database
  // Supabase returns max 1000 rows per request — paginate to get all
  const PAGE_SIZE = 1000;
  const apis: ApiRow[] = [];
  let offset = 0;

  while (true) {
    const { data: page, error } = await supabaseAdmin
      .from('api_endpoints')
      .select('id, name, url, avg_response_ms, reliability, last_checked, last_failed')
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      log('error', 'Health check failed to fetch APIs', { error: error.message, offset });
      return;
    }

    if (!page || page.length === 0) break;
    apis.push(...(page as ApiRow[]));
    offset += page.length;

    if (page.length < PAGE_SIZE) break; // Last page
  }

  if (apis.length === 0) {
    log('error', 'Health check found no APIs in database');
    return;
  }

  log('info', `Checking ${apis.length} APIs`);

  let alive = 0;
  let dead = 0;
  let deactivated = 0;

  // Process in batches of 20 to avoid overwhelming the network
  const batchSize = 20;

  for (let i = 0; i < apis.length; i += batchSize) {
    const batch = apis.slice(i, i + batchSize) as ApiRow[];

    await Promise.all(
      batch.map(async (api) => {
        const result = await pingApi(api.url);

        if (result.ok) {
          alive++;

          // Rolling average: (old * 0.7) + (new * 0.3)
          const oldAvg = api.avg_response_ms ?? 500;
          const newAvg = Math.round(oldAvg * 0.7 + result.ms * 0.3);

          // Increase reliability toward 1.0
          const oldRel = api.reliability ?? 0.5;
          const newReliability = Math.min(1.0, oldRel + 0.05);

          await supabaseAdmin
            .from('api_endpoints')
            .update({
              avg_response_ms: newAvg,
              reliability: Math.round(newReliability * 100) / 100,
              last_checked: new Date().toISOString(),
              is_active: true,
            })
            .eq('id', api.id);

        } else {
          dead++;

          // Decrease reliability
          const oldRel = api.reliability ?? 0.5;
          const newReliability = Math.max(0.0, oldRel - 0.15);
          const roundedRel = Math.round(newReliability * 100) / 100;

          const updateData: Record<string, unknown> = {
            reliability: roundedRel,
            last_checked: new Date().toISOString(),
            last_failed: new Date().toISOString(),
          };

          // Auto-deactivate if reliability drops below 0.2
          if (roundedRel < 0.2) {
            updateData.is_active = false;
            deactivated++;

            log('warn', 'API auto-deactivated', {
              api: api.name,
              url: api.url,
              reliability: roundedRel,
            });
          }

          await supabaseAdmin
            .from('api_endpoints')
            .update(updateData)
            .eq('id', api.id);
        }
      })
    );

    // Brief pause between batches
    if (i + batchSize < apis.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Progress update every 100 APIs
    const checked = Math.min(i + batchSize, apis.length);
    if (checked % 100 === 0 || checked === apis.length) {
      log('info', `Progress: ${checked}/${apis.length} checked (${alive} alive, ${dead} dead)`);
    }
  }

  // Update category counts
  // Paginate category fetch too
  const categoryCounts: Record<string, unknown>[] = [];
  let catOffset = 0;
  while (true) {
    const { data: catPage } = await supabaseAdmin
      .from('api_endpoints')
      .select('category')
      .eq('is_active', true)
      .range(catOffset, catOffset + 999);
    if (!catPage || catPage.length === 0) break;
    categoryCounts.push(...catPage);
    catOffset += catPage.length;
    if (catPage.length < 1000) break;
  }

  if (categoryCounts.length > 0) {
    const counts: Record<string, number> = {};
    categoryCounts.forEach((row: Record<string, unknown>) => {
      const cat = row.category as string;
      counts[cat] = (counts[cat] || 0) + 1;
    });

    for (const [category, count] of Object.entries(counts)) {
      await supabaseAdmin
        .from('api_categories')
        .update({ api_count: count })
        .eq('name', category);
    }

    log('info', 'Category counts updated', { categories: Object.keys(counts).length });
  }

  const totalTime = Date.now() - startTime;

  log('info', 'API Health Check complete', {
    totalApis: apis.length,
    alive,
    dead,
    deactivated,
    totalTimeMs: totalTime,
    totalTimeMinutes: Math.round(totalTime / 60000),
  });

  const report = [
    '',
    '═══════════════════════════════════════',
    '  API HEALTH CHECK COMPLETE',
    '═══════════════════════════════════════',
    '',
    `  Total APIs checked: ${apis.length}`,
    `  Alive:              ${alive}`,
    `  Dead/Timeout:       ${dead}`,
    `  Auto-deactivated:   ${deactivated}`,
    `  Alive rate:         ${apis.length > 0 ? Math.round((alive / apis.length) * 100) : 0}%`,
    '',
    `  Time: ${Math.round(totalTime / 1000)} seconds`,
    '',
    '═══════════════════════════════════════',
    '',
  ].join('\n');

  console.log(report);
}

// PM2 cron setup:
// pm2 start "npx tsx scripts/api-health-check.ts" --name api-health --cron "0 */6 * * *" --no-autorestart --cwd /var/www/spacebot

// Run it
runHealthCheck()
  .then(() => process.exit(0))
  .catch((error) => {
    log('error', 'Health check crashed', { error: error.message });
    console.error('FATAL:', error);
    process.exit(1);
  });
