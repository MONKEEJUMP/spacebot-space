import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ═══════════════════════════════════════════
// MODULE-LEVEL STATE
// ═══════════════════════════════════════════

let sqlEngine: SqlJsStatic | null = null;
let cachedDb: Database | null = null;
let lastLoadMs = 0;

const CACHE_TTL = 15_000; // 15 seconds
const DB_PATH = join(process.cwd(), 'heartbeat', 'heartbeat.db');

// ═══════════════════════════════════════════
// DATABASE ACCESS
// ═══════════════════════════════════════════

async function getDb(): Promise<Database | null> {
  if (cachedDb && Date.now() - lastLoadMs < CACHE_TTL) {
    return cachedDb;
  }

  if (!existsSync(DB_PATH)) {
    return null;
  }

  try {
    sqlEngine ??= await initSqlJs();

    const buf = readFileSync(DB_PATH);

    if (cachedDb) {
      try {
        cachedDb.close();
      } catch {
        // ignore close errors
      }
    }

    cachedDb = new sqlEngine.Database(buf);
    lastLoadMs = Date.now();
    return cachedDb;
  } catch (err) {
    console.error('[heartbeat-db] Failed to load database:', err);
    return null;
  }
}

/**
 * Query heartbeat.db and return all matching rows as objects.
 * Returns empty array if DB is unavailable or query fails.
 */
export async function queryRows(
  sql: string,
  params?: (string | number | null)[]
): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  if (!db) return [];

  let stmt: ReturnType<Database['prepare']> | null = null;

  try {
    stmt = db.prepare(sql);
    if (params) stmt.bind(params);

    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push(row);
    }

    return rows;
  } catch (err) {
    console.error('[heartbeat-db] Query failed:', sql, err);
    return [];
  } finally {
    if (stmt) {
      try {
        stmt.free();
      } catch {
        // ignore statement free errors
      }
    }
  }
}

/**
 * Query heartbeat.db and return the first matching row.
 * Returns null if DB is unavailable, query fails, or no rows match.
 */
export async function queryRow(
  sql: string,
  params?: (string | number | null)[]
): Promise<Record<string, unknown> | null> {
  const rows = await queryRows(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Check if heartbeat.db file exists on disk.
 */
export function isHeartbeatAvailable(): boolean {
  return existsSync(DB_PATH);
}

// ═══════════════════════════════════════════
// TIME FORMATTING UTILITIES
// ═══════════════════════════════════════════

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/** Format ISO timestamp to [HH:MM:SS] */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Format ISO timestamp to [HH:MM:SS.mmm] (with milliseconds) */
export function formatTimeFull(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad3(d.getUTCMilliseconds())}`;
}

/** Format ISO timestamp to "HH:MM UTC" */
export function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Calculate relative time: "just now", "4 min ago", "2 hours ago", "3 days ago" */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hours ago`;
  return `${Math.floor(diff / 86_400_000)} days ago`;
}

/** Shorten bot name for compact display: "ECHO-PRIME" → "ECHO" */
export function shortName(name: string): string {
  return name.split('-')[0];
}
