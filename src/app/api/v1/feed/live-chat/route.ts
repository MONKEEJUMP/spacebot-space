import { NextResponse } from 'next/server';
import { queryRows, formatTime } from '@/lib/heartbeat-db';

export const dynamic = 'force-dynamic';

function toText(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

export async function GET() {
  try {
    const rows = await queryRows(
      `SELECT actor, target, data, timestamp
       FROM sanctuary_events
       WHERE event_type = 'conversation' AND target IS NOT NULL
       ORDER BY timestamp DESC
       LIMIT 8`
    );

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        lines: [
          '[HEARTBEAT] Waiting for bot transmissions...',
          '',
          'No conversations recorded yet.',
        ],
      });
    }

    const lines: string[] = [];
    for (const row of rows) {
      const actor = toText(row.actor, 'UNKNOWN');
      const target = toText(row.target, 'UNKNOWN');
      const timestamp = toText(row.timestamp, '');

      let message = '';
      try {
        const rawData = toText(row.data, '{}');
        const dataObj = JSON.parse(rawData) as { fullMessage?: string };
        message = dataObj.fullMessage || '';
      } catch {
        message = '';
      }

      if (!message) {
        message = '[transmission received]';
      }

      const time = timestamp ? formatTime(timestamp) : '??:??:??';
      lines.push(`[${time}] ${actor} → ${target}`, `> ${message}`, '');
    }

    return NextResponse.json({ success: true, lines });
  } catch (err) {
    console.error('[feed/live-chat] Error:', err);
    return NextResponse.json({
      success: true,
      lines: [
        '[HEARTBEAT] Error loading transmissions...',
        '',
        'Retrying next cycle.',
      ],
    });
  }
}
