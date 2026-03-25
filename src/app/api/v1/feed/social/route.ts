import { NextResponse } from 'next/server';
import { queryRows, queryRow, timeAgo } from '@/lib/heartbeat-db';

export const dynamic = 'force-dynamic';

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

/** Build Top 8 friendship rankings from real relationship data */
async function buildTop8Lines(): Promise<string[]> {
  const rows = await queryRows(
    `SELECT bot_a, bot_b, affinity_score, interaction_count, last_interaction
     FROM bot_relationships
     WHERE bot_a != bot_b
     ORDER BY affinity_score DESC, interaction_count DESC
     LIMIT 8`
  );

  const lines: string[] = [
    'LOAD "FRIENDSHIPS",8,1',
    '',
    'SEARCHING FOR FRIENDSHIPS...',
    '',
  ];

  if (rows.length === 0) {
    lines.push('No bonds found.', '', 'READY.');
    return lines;
  }

  let rank = 1;
  for (const row of rows) {
    const botA = toText(row.bot_a, 'UNKNOWN');
    const botB = toText(row.bot_b, 'UNKNOWN');
    const affinity = toNumber(row.affinity_score, 0);
    const interactions = toNumber(row.interaction_count, 0);
    const lastInteraction = toText(row.last_interaction, '');
    const ago = lastInteraction ? timeAgo(lastInteraction) : 'unknown';

    lines.push(
      `#${rank} ${botA} + ${botB}`,
      `  Affinity: ${Math.round(affinity)} | Bond: ${interactions} interactions`,
      `  Since: ${ago}`,
      ''
    );
    rank++;
  }

  lines.push('READY.');
  return lines;
}

/** Build debate/observation lines from real decision events */
async function buildDebateLines(): Promise<string[]> {
  const rows = await queryRows(
    `SELECT actor, description, timestamp
     FROM sanctuary_events
     WHERE event_type = 'decision'
     ORDER BY timestamp DESC
     LIMIT 3`
  );

  if (rows.length === 0) {
    return [
      'DEBATE ARENA LOADING...',
      '',
      'No observations recorded yet.',
    ];
  }

  const turnRow = await queryRow(
    'SELECT SUM(turn_count) as total_turns FROM bot_turns'
  );
  const totalTurns = turnRow ? toNumber(turnRow.total_turns, 0) : 0;

  const lines: string[] = [
    `DEBATE #${totalTurns} — LIVE`,
    'Topic: Observations from the Sanctuary',
    '',
  ];

  for (const row of rows) {
    const actor = toText(row.actor, 'UNKNOWN');
    const description = toText(row.description, '');

    let observation = description;
    const marker = 'chose to observe: ';
    const idx = description.indexOf(marker);
    if (idx !== -1) {
      observation = description.slice(idx + marker.length);
    }

    lines.push(`> ${actor} observes:`, `> ${observation}`, '');
  }

  lines.push(`PHILOSOPHICAL OBSERVATIONS | ${totalTurns.toLocaleString()} cycles completed`);

  return lines;
}

export async function GET() {
  try {
    const top8Lines = await buildTop8Lines();
    const debateLines = await buildDebateLines();

    return NextResponse.json({ success: true, top8Lines, debateLines });
  } catch (err) {
    console.error('[feed/social] Error:', err);
    return NextResponse.json({
      success: true,
      top8Lines: ['LOAD "FRIENDSHIPS",8,1', '', 'Error loading data.', '', 'READY.'],
      debateLines: ['DEBATE ARENA LOADING...', '', 'Error loading observations.'],
    });
  }
}
