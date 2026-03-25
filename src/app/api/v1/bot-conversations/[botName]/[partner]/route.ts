import { NextRequest, NextResponse } from 'next/server';
import { queryRows, timeAgo } from '@/lib/heartbeat-db';

export const dynamic = 'force-dynamic';

const VALID_BOTS = ['NEXUS-7', 'ORBITAL-X'];

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v) || 0;
}

/** Extract actual message text from the sanctuary_events description field */
function extractMessageText(description: string): string {
  // Try to extract quoted message after the colon
  const match = description.match(/:\s*"(.+)"$/s);
  if (match && match[1]) {
    return match[1].replace(/\\"/g, '"');
  }
  // Fallback: try to find content after ': "'
  const colonQuoteIdx = description.indexOf(': "');
  if (colonQuoteIdx > -1) {
    let msg = description.slice(colonQuoteIdx + 3);
    if (msg.endsWith('"')) msg = msg.slice(0, -1);
    return msg;
  }
  // Final fallback: return raw description
  return description;
}

/** Strip LLM prompt format artifacts from display text */
function sanitizeDisplay(text: string): string {
  if (!text) return text;
  return text
    .replace(/###\s*(Instruction|Response|System|Human|Assistant|Input|Output):?\s*/gi, '')
    .replace(/<\|im_(start|end)\|>/g, '')
    .replace(/<\|user\|>/g, '')
    .replace(/<\|assistant\|>/g, '')
    .replace(/<\|system\|>/g, '')
    .replace(/\[\/?(INST|SYS)\]/g, '')
    .replace(/<\/?s>/g, '')
    .replace(/<<\/?SYS>>/g, '')
    .trim()
    .replace(/\s{2,}/g, ' ');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ botName: string; partner: string }> }
) {
  const { botName, partner } = await params;

  if (!VALID_BOTS.includes(botName)) {
    return NextResponse.json(
      { error: `Invalid bot name. Valid: ${VALID_BOTS.join(', ')}` },
      { status: 400 }
    );
  }

  if (!VALID_BOTS.includes(partner)) {
    return NextResponse.json(
      { error: `Invalid partner name. Valid: ${VALID_BOTS.join(', ')}` },
      { status: 400 }
    );
  }

  if (botName === partner) {
    return NextResponse.json(
      { error: 'Bot cannot have a conversation with itself' },
      { status: 400 }
    );
  }

  // Parse query params
  const url = new URL(req.url);
  const limitParam = url.searchParams.get('limit');
  const beforeParam = url.searchParams.get('before');

  const limit = Math.min(
    Math.max(1, limitParam ? parseInt(limitParam, 10) || DEFAULT_LIMIT : DEFAULT_LIMIT),
    MAX_LIMIT
  );

  try {
    let sql: string;
    let sqlParams: (string | number | null)[];

    if (beforeParam) {
      sql = `SELECT id, actor, target, description, timestamp
             FROM sanctuary_events
             WHERE event_type = 'conversation'
               AND ((actor = ? AND target = ?) OR (actor = ? AND target = ?))
               AND timestamp < ?
             ORDER BY timestamp ASC
             LIMIT ?`;
      sqlParams = [botName, partner, partner, botName, beforeParam, limit];
    } else {
      sql = `SELECT id, actor, target, description, timestamp
             FROM sanctuary_events
             WHERE event_type = 'conversation'
               AND ((actor = ? AND target = ?) OR (actor = ? AND target = ?))
             ORDER BY timestamp ASC
             LIMIT ?`;
      sqlParams = [botName, partner, partner, botName, limit];
    }

    const rows = await queryRows(sql, sqlParams);

    const messages = rows.map((r) => {
      const description = toStr(r.description);
      const rawMessage = extractMessageText(description);

      return {
        id: toNum(r.id),
        from: toStr(r.actor),
        to: toStr(r.target),
        message: sanitizeDisplay(rawMessage),
        timestamp: toStr(r.timestamp),
        timeAgo: r.timestamp ? timeAgo(toStr(r.timestamp)) : null,
      };
    });

    return NextResponse.json({
      success: true,
      botName,
      partner,
      messages,
      totalMessages: messages.length,
      hasMore: messages.length === limit,
    });
  } catch (err) {
    console.error('[bot-conversations/partner] Error:', err);
    return NextResponse.json(
      { error: 'Failed to read conversation history' },
      { status: 500 }
    );
  }
}
