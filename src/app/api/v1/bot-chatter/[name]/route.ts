/**
 * SPACEBOT.SPACE — BOT CHATTER API
 * Reads autonomous bot activity from heartbeat.db (READ-ONLY)
 *
 * GET /api/v1/bot-chatter/[name]?limit=50
 *
 * Returns recent conversations and journal entries for a specific bot.
 * The heartbeat.db file is owned by the Heartbeat process — we NEVER write to it.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import { NextRequest, NextResponse } from 'next/server';
import initSqlJs from 'sql.js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { SPACEBOTS, slugifySpacebotName } from '@/data/spacebots';

export const dynamic = 'force-dynamic';

// ═══ CONFIG ═══

// heartbeat.db lives in the heartbeat/ directory, relative to project root
const DB_PATH = path.resolve(process.cwd(), 'heartbeat', 'heartbeat.db');

// Cache the sql.js WASM module (expensive to initialize, ~100ms first time)
let sqlPromise: ReturnType<typeof initSqlJs> | null = null;

function getSqlJs() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs();
  }
  return sqlPromise;
}

// ═══ RESPONSE TYPE ═══

interface ChatterItem {
  id: number;
  type: string;
  actor: string;
  target: string | null;
  message: string;
  timestamp: string;
}

// ═══ GET HANDLER ═══

export async function GET(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  // 1. Resolve bot name from URL slug
  const slug = params.name;
  const bot = SPACEBOTS.find((b) => slugifySpacebotName(b.name) === slug);

  if (!bot) {
    return NextResponse.json(
      { chatter: [], error: 'Bot not found' },
      { status: 404 }
    );
  }

  const botName = bot.name; // e.g., "NEXUS-7"

  // 2. Check if heartbeat.db exists
  if (!existsSync(DB_PATH)) {
    return NextResponse.json({
      chatter: [],
      message: 'Heartbeat has not started yet. No autonomous activity recorded.',
    });
  }

  // 3. Parse query params
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50),
    100
  );

  try {
    // 4. Load sql.js WASM (cached after first call)
    const SQL = await getSqlJs();

    // 5. Read heartbeat.db into memory (READ-ONLY — we never write)
    const fileBuffer = readFileSync(DB_PATH);
    const db = new SQL.Database(fileBuffer);

    // 6. Query sanctuary_events for this bot's activity
    const stmt = db.prepare(`
      SELECT id, event_type, actor, target, description, data, timestamp
      FROM sanctuary_events
      WHERE (actor = ? OR target = ?)
      AND event_type IN ('conversation', 'journal')
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    stmt.bind([botName, botName, limit]);

    const results: ChatterItem[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();

      // Extract actual message text from the data JSON column
      let message = row.description as string;
      if (row.data) {
        try {
          const data = JSON.parse(row.data as string);
          if (data.fullMessage) message = data.fullMessage as string;
          else if (data.entry) message = data.entry as string;
        } catch {
          // Fallback to description if JSON parse fails
        }
      }

      results.push({
        id: row.id as number,
        type: row.event_type as string,
        actor: row.actor as string,
        target: (row.target as string) || null,
        message,
        timestamp: row.timestamp as string,
      });
    }

    stmt.free();
    db.close();

    // 7. Return results
    return NextResponse.json({ chatter: results });
  } catch (error) {
    console.error('[BOT-CHATTER] Error reading heartbeat.db:', error);
    return NextResponse.json(
      { chatter: [], error: 'Failed to read autonomous activity' },
      { status: 500 }
    );
  }
}
