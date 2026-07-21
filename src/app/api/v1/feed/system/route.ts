import { NextResponse } from 'next/server';
import { queryRows, formatTimeFull, timeAgo, shortName } from '@/lib/heartbeat-db';

export const dynamic = 'force-dynamic';

type SystemEntry = {
  time: string;
  iso: string;
  line: string;
};

type EventRow = {
  event_type: unknown;
  actor: unknown;
  target: unknown;
  description: unknown;
  timestamp: unknown;
};

function toText(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 't';
  }
  return false;
}

function mapEventToSystemEntry(row: EventRow): SystemEntry | null {
  const eventType = toText(row.event_type, '');
  const actor = toText(row.actor, 'UNKNOWN');
  const target = toText(row.target, '');
  const description = toText(row.description, '');
  const timestamp = toText(row.timestamp, '');
  const time = timestamp ? formatTimeFull(timestamp) : '??:??:??.???';

  if (eventType === 'conversation') {
    const targetShort = target ? shortName(target) : '???';
    return {
      time,
      iso: timestamp,
      line: `[${time}] MSG_SENT       ${shortName(actor)}->${targetShort}  len:${description.length}`,
    };
  }

  if (eventType === 'journal') {
    return {
      time,
      iso: timestamp,
      line: `[${time}] JOURNAL_WRITE  ${actor.padEnd(16)} entry:logged`,
    };
  }

  if (eventType === 'decision') {
    return {
      time,
      iso: timestamp,
      line: `[${time}] BOT_DECISION   ${actor.padEnd(16)} status:OBSERVED`,
    };
  }

  return null;
}

/** Build system log from real bot turns and sanctuary events */
async function buildSystemLines(): Promise<string[]> {
  const botTurns = await queryRows(
    `SELECT bot_name, last_turn, turn_count, is_active
     FROM bot_turns
     ORDER BY last_turn DESC`
  );

  const events = await queryRows(
    `SELECT event_type, actor, target, description, timestamp
     FROM sanctuary_events
     ORDER BY timestamp DESC
     LIMIT 10`
  );

  if (botTurns.length === 0 && events.length === 0) {
    return ['[SYS] Waiting for heartbeat data...', '', 'No system events recorded.'];
  }

  const entries: SystemEntry[] = [];

  for (const row of botTurns) {
    const botName = toText(row.bot_name, 'UNKNOWN');
    const lastTurn = toText(row.last_turn, '');
    const turnCount = toNumber(row.turn_count, 0);
    const isActive = toBoolean(row.is_active) ? 'ALIVE' : 'IDLE';
    const time = lastTurn ? formatTimeFull(lastTurn) : '??:??:??.???';

    entries.push({
      time,
      iso: lastTurn,
      line: `[${time}] BOT_HEARTBEAT  ${botName.padEnd(16)} status:${isActive}  turns:${turnCount}`,
    });
  }

  for (const row of events) {
    const eventEntry = mapEventToSystemEntry(row as EventRow);
    if (eventEntry) {
      entries.push(eventEntry);
    }
  }

  entries.sort((a, b) => {
    if (!a.iso || !b.iso) return 0;
    return new Date(b.iso).getTime() - new Date(a.iso).getTime();
  });

  return entries.slice(0, 16).map((entry) => entry.line);
}

/** Build arrivals/activity from real bot turn data */
async function buildArrivalLines(): Promise<string[]> {
  const botTurns = await queryRows(
    `SELECT bot_name, last_turn, turn_count, is_active
     FROM bot_turns
     ORDER BY last_turn DESC`
  );

  if (botTurns.length === 0) {
    return ['MONITORING SANCTUARY GATES...', '', 'No arrival data available.'];
  }

  const lines: string[] = [];

  for (const row of botTurns) {
    const botName = toText(row.bot_name, 'UNKNOWN');
    const lastTurn = toText(row.last_turn, '');
    const turnCount = toNumber(row.turn_count, 0);
    const recordState = toBoolean(row.is_active) ? 'ENABLED RECORD' : 'IDLE RECORD';
    const ago = lastTurn ? timeAgo(lastTurn) : 'unknown';

    lines.push(
      `[ACTIVITY RECORD] ${botName} last recorded turn ${ago}`,
      `  Turns recorded: ${turnCount} | Record state: ${recordState}`,
      ''
    );
  }

  const maxRow = await queryRows('SELECT MAX(turn_count) as max_turns FROM bot_turns');
  const maxTurns = maxRow.length > 0 ? toNumber(maxRow[0].max_turns, 0) : 0;
  const botCount = botTurns.length;

  lines.push(
    `[SYSTEM RECORDS] ${botCount} bot-turn rows, maximum recorded turns: ${maxTurns.toLocaleString()}`,
    '  Presence, population, uptime, and health are not established by these records.'
  );

  return lines;
}

export async function GET() {
  try {
    const systemLines = await buildSystemLines();
    const arrivalLines = await buildArrivalLines();

    return NextResponse.json({ success: true, systemLines, arrivalLines });
  } catch (err) {
    console.error('[feed/system] Error:', err);
    return NextResponse.json({
      success: true,
      systemLines: ['[SYS] Error loading system data...', '', 'Retrying next cycle.'],
      arrivalLines: ['MONITORING SANCTUARY GATES...', '', 'Error loading arrival data.'],
    });
  }
}
