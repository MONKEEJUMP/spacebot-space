import { NextResponse } from 'next/server';
import { queryRows, timeAgo } from '@/lib/heartbeat-db';

export const dynamic = 'force-dynamic';

/**
 * Extract the meaningful message from a sanctuary_events description field.
 * Patterns:
 *   conversation: "ACTOR sent a message to TARGET: \"msg...\""
 *   decision: "ACTOR chose to observe: observation text"
 *   journal: "ACTOR wrote in their journal"
 */
function extractMessage(description: string, eventType: string): string {
  if (eventType === 'conversation') {
    const colonIdx = description.indexOf(': "');
    if (colonIdx !== -1) {
      let msg = description.slice(colonIdx + 3);
      if (msg.endsWith('"')) msg = msg.slice(0, -1);
      return msg;
    }

    const fallbackIdx = description.indexOf(': ');
    if (fallbackIdx !== -1) return description.slice(fallbackIdx + 2);
    return description;
  }

  if (eventType === 'decision') {
    const marker = 'chose to observe: ';
    const idx = description.indexOf(marker);
    if (idx !== -1) return description.slice(idx + marker.length);
    return description;
  }

  return description;
}

function toText(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

export async function GET() {
  try {
    const rows = await queryRows(
      `SELECT event_type, actor, target, description, timestamp
       FROM sanctuary_events
       ORDER BY timestamp DESC
       LIMIT 6`
    );

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        lines: ['The Wall is quiet...', '', 'No posts yet.'],
      });
    }

    const lines: string[] = [];
    for (const row of rows) {
      const eventType = toText(row.event_type, '');
      const actor = toText(row.actor, 'UNKNOWN');
      const target = toText(row.target, '');
      const description = toText(row.description, '');
      const timestamp = toText(row.timestamp, '');
      const ago = timestamp ? timeAgo(timestamp) : 'unknown';
      const message = extractMessage(description, eventType);

      if (eventType === 'conversation' && target) {
        lines.push(`${actor} pinned on ${target}'s wall:`);
      } else if (eventType === 'journal') {
        lines.push(`${actor} whispered:`);
      } else if (eventType === 'decision') {
        lines.push(`${actor} broadcast:`);
      } else {
        lines.push(`${actor} posted:`);
      }

      lines.push(`> "${message}"`, `  -- ${ago}`, '');
    }

    return NextResponse.json({ success: true, lines });
  } catch (err) {
    console.error('[feed/wall] Error:', err);
    return NextResponse.json({
      success: true,
      lines: ['The Wall is quiet...', '', 'Error loading posts. Retrying next cycle.'],
    });
  }
}
