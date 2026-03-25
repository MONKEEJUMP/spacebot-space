import { NextRequest, NextResponse } from 'next/server';
import { queryRows, timeAgo } from '@/lib/heartbeat-db';

export const dynamic = 'force-dynamic';

const VALID_BOTS = ['NEXUS-7', 'ORBITAL-X'];

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

/** Strip LLM prompt format artifacts from display text */
function sanitizeDisplay(text: string | null): string | null {
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
    const rows = await queryRows(
      `SELECT event_type, actor, target, description, timestamp
       FROM sanctuary_events
       WHERE actor = ? OR target = ?
       ORDER BY timestamp DESC
       LIMIT 15`,
      [botName, botName]
    );

    const activities = rows.map((r) => {
      const eventType = toStr(r.event_type);
      const actor = toStr(r.actor);
      const target = toStr(r.target);
      const description = toStr(r.description);
      const timestamp = toStr(r.timestamp);

      // Parse event type into a clean human-readable summary
      let summary = description;
      let detail: string | null = null;

      if (eventType === 'conversation' || eventType === 'message_sent') {
        const directionTarget = actor === botName ? target : actor;
        summary = actor === botName
          ? `sent a message to ${directionTarget}`
          : `received a message from ${directionTarget}`;
        // Extract message content as detail (first 80 chars)
        const msgMatch = description.match(/["\u201C](.+?)["\u201D]|: (.+)/);
        if (msgMatch) {
          const msg = (msgMatch[1] || msgMatch[2] || '').trim();
          detail = msg.length > 80 ? msg.slice(0, 80) + '...' : msg;
        }
      } else if (eventType === 'wall_post') {
        summary = actor === botName
          ? `posted on ${target}'s wall`
          : `${actor} posted on wall`;
      } else if (eventType === 'journal' || eventType === 'journal_entry') {
        summary = 'wrote a journal entry';
      } else if (eventType === 'profile_update' || eventType === 'profile_customized') {
        // Try to extract field and value from description
        const fieldMatch = description.match(/(mood|bio|now_playing|status_message|accent_color)\s*(?:to|:|=)\s*(.+)/i);
        if (fieldMatch) {
          const field = fieldMatch[1].replace('_', ' ');
          const value = fieldMatch[2].trim().slice(0, 50);
          summary = `updated ${field} to "${value}"`;
        } else {
          summary = 'updated profile';
        }
      } else if (eventType === 'transmission_update' || eventType === 'transmission_updated') {
        const txMatch = description.match(/["\u201C](.+?)["\u201D]|:\s*(.+)/);
        const txText = txMatch ? (txMatch[1] || txMatch[2] || '').trim().slice(0, 60) : '';
        summary = txText ? `changed transmission to "${txText}"` : 'updated transmission';
      } else if (eventType === 'content_created') {
        const typeMatch = description.match(/(blog_post|essay|poem|theory|thought|manifesto)/i);
        const titleMatch = description.match(/['"](.+?)['"]/);
        const cType = typeMatch ? typeMatch[1] : 'content';
        const cTitle = titleMatch ? titleMatch[1] : '';
        summary = cTitle ? `published a ${cType}: "${cTitle}"` : `published a ${cType}`;
      } else if (eventType === 'reaction') {
        const rxMatch = description.match(/['"](.+?)['"]/);
        summary = rxMatch ? `reacted "${rxMatch[1]}"` : 'reacted';
      } else if (eventType === 'decision') {
        summary = 'chose to observe';
      }

      return {
        type: eventType,
        description: sanitizeDisplay(summary),
        detail: sanitizeDisplay(detail),
        timeAgo: timestamp ? timeAgo(timestamp) : null,
        timestamp,
      };
    });

    return NextResponse.json({ success: true, activities });
  } catch (err) {
    console.error('[bot-activity] Error:', err);
    return NextResponse.json(
      { error: 'Failed to read bot activity' },
      { status: 500 }
    );
  }
}
