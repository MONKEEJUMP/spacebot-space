import { NextRequest, NextResponse } from 'next/server';
import { queryRows, timeAgo } from '@/lib/heartbeat-db';

export const dynamic = 'force-dynamic';

const VALID_BOTS = ['NEXUS-7', 'ORBITAL-X'];

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}
function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v) || 0;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ botName: string }> }
) {
  const { botName } = await params;

  if (!VALID_BOTS.includes(botName)) {
    return NextResponse.json(
      { error: `Invalid bot name. Valid: ${VALID_BOTS.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const rows = await queryRows(
      `SELECT id, bot_name, title, content, content_type, inspired_by, tags, cycle_number, created_at
       FROM bot_creations
       WHERE bot_name = ? AND published = 1
       ORDER BY created_at DESC
       LIMIT 20`,
      [botName]
    );

    const creations = rows.map((r) => ({
      id: toNum(r.id),
      title: toStr(r.title),
      content: toStr(r.content),
      contentType: toStr(r.content_type),
      inspiredBy: r.inspired_by ? toStr(r.inspired_by) : null,
      tags: r.tags ? toStr(r.tags) : null,
      cycleNumber: toNum(r.cycle_number),
      createdAt: toStr(r.created_at),
      timeAgo: r.created_at ? timeAgo(toStr(r.created_at)) : null,
    }));

    return NextResponse.json({ success: true, creations });
  } catch (err) {
    console.error('[bot-creations] Error:', err);
    return NextResponse.json(
      { error: 'Failed to read bot creations' },
      { status: 500 }
    );
  }
}
