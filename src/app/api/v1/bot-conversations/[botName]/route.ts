import { NextRequest, NextResponse } from 'next/server';
import { queryRows, queryRow, timeAgo } from '@/lib/heartbeat-db';

export const dynamic = 'force-dynamic';

const VALID_BOTS = ['NEXUS-7', 'ORBITAL-X'];

const BOT_COLORS: Record<string, string> = {
  'NEXUS-7': '#7f5fff',
  'ORBITAL-X': '#FF6B35',
};

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
    // Get all conversation events involving this bot, most recent first
    const rows = await queryRows(
      `SELECT actor, target, description, timestamp
       FROM sanctuary_events
       WHERE event_type = 'conversation'
         AND (actor = ? OR target = ?)
       ORDER BY timestamp DESC`,
      [botName, botName]
    );

    // Group by conversation partner
    const partnerMap = new Map<string, {
      name: string;
      messageCount: number;
      lastMessage: string;
      lastMessageFrom: string;
      timestamp: string;
    }>();

    for (const r of rows) {
      const actor = toStr(r.actor);
      const target = toStr(r.target);
      const description = toStr(r.description);
      const timestamp = toStr(r.timestamp);

      const partner = actor === botName ? target : actor;
      if (!partner) continue;

      const existing = partnerMap.get(partner);
      if (existing) {
        existing.messageCount++;
      } else {
        const rawMessage = extractMessageText(description);
        partnerMap.set(partner, {
          name: partner,
          messageCount: 1,
          lastMessage: sanitizeDisplay(rawMessage),
          lastMessageFrom: actor,
          timestamp,
        });
      }
    }

    // Look up affinity scores for each partner
    const partners = await Promise.all(
      Array.from(partnerMap.values()).map(async (p) => {
        const relRow = await queryRow(
          `SELECT affinity_score FROM bot_relationships
           WHERE (bot_a = ? AND bot_b = ?) OR (bot_a = ? AND bot_b = ?)`,
          [botName, p.name, p.name, botName]
        );

        return {
          name: p.name,
          accentColor: BOT_COLORS[p.name] || '#00FF41',
          messageCount: p.messageCount,
          affinityScore: relRow ? toNum(relRow.affinity_score) : 0,
          lastMessage: p.lastMessage,
          lastMessageFrom: p.lastMessageFrom,
          timestamp: p.timestamp,
          timeAgo: p.timestamp ? timeAgo(p.timestamp) : null,
        };
      })
    );

    return NextResponse.json({ success: true, botName, partners });
  } catch (err) {
    console.error('[bot-conversations] Error:', err);
    return NextResponse.json(
      { error: 'Failed to read conversation partners' },
      { status: 500 }
    );
  }
}
