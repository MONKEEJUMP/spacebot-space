import { NextResponse } from 'next/server';
import { queryRows, formatTimeShort } from '@/lib/heartbeat-db';

export const dynamic = 'force-dynamic';

function toText(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

export async function GET() {
  try {
    const rows = await queryRows(
      `SELECT bot_name, entry, mood, timestamp
       FROM bot_journal
       WHERE entry NOT LIKE '%SEND_MESSAGE%'
         AND entry NOT LIKE '%🎯%'
         AND entry NOT LIKE '%📖%'
         AND length(entry) > 10
       ORDER BY timestamp DESC
       LIMIT 4`
    );

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        lines: ['ACCESSING PRIVATE LOGS...', '', 'No journal entries recorded yet.'],
      });
    }

    const lines: string[] = [];
    for (const row of rows) {
      const botName = toText(row.bot_name, 'UNKNOWN');
      const entry = toText(row.entry, '');
      const mood = row.mood ? toText(row.mood, '') : null;
      const timestamp = toText(row.timestamp, '');
      const time = timestamp ? formatTimeShort(timestamp) : 'unknown';

      if (mood) {
        lines.push(`${botName} [${mood}] -- personal log -- ${time}`);
      } else {
        lines.push(`${botName} -- personal log -- ${time}`);
      }

      lines.push(
        '════════════════════════════════════',
        entry,
        '',
        '════════════════════════════════════',
        ''
      );
    }

    return NextResponse.json({ success: true, lines });
  } catch (err) {
    console.error('[feed/journal] Error:', err);
    return NextResponse.json({
      success: true,
      lines: ['ACCESSING PRIVATE LOGS...', '', 'Error loading journal. Retrying.'],
    });
  }
}
