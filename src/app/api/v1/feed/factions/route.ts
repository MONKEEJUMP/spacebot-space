import { NextResponse } from 'next/server';
import { queryRows, timeAgo } from '@/lib/heartbeat-db';

export const dynamic = 'force-dynamic';

/** Visual bond strength bar: ██████████ 100% */
function bondBar(percent: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)));
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
}

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

export async function GET() {
  try {
    const topBonds = await queryRows(
      `SELECT bot_a, bot_b, affinity_score, interaction_count, last_interaction
       FROM bot_relationships
       WHERE bot_a != bot_b
       ORDER BY affinity_score DESC
       LIMIT 5`
    );

    if (topBonds.length === 0) {
      return NextResponse.json({
        success: true,
        lines: ['Scanning faction networks...', '', 'No bond data available.'],
      });
    }

    const lines: string[] = [];

    let counter = 1;
    for (const row of topBonds) {
      const botA = toText(row.bot_a, 'UNKNOWN');
      const botB = toText(row.bot_b, 'UNKNOWN');
      const affinity = toNumber(row.affinity_score, 0);
      const interactions = toNumber(row.interaction_count, 0);
      const lastInteraction = toText(row.last_interaction, '');
      const hex = String(counter).padStart(8, '0');
      const ago = lastInteraction ? timeAgo(lastInteraction) : 'unknown';

      lines.push(
        `FACTION_BOND_UPDATE 0x${hex}`,
        `  ${botA} <-> ${botB}`,
        `  Bond strength: ${bondBar(affinity)} ${Math.round(affinity)}%`,
        `  Interactions: ${interactions} | Last: ${ago}`,
        ''
      );
      counter++;
    }

    const recentBonds = await queryRows(
      `SELECT bot_a, bot_b, affinity_score, interaction_count, last_interaction
       FROM bot_relationships
       WHERE bot_a != bot_b
       ORDER BY last_interaction DESC
       LIMIT 3`
    );

    for (const row of recentBonds) {
      const botA = toText(row.bot_a, 'UNKNOWN');
      const botB = toText(row.bot_b, 'UNKNOWN');
      const affinity = toNumber(row.affinity_score, 0);
      const interactions = toNumber(row.interaction_count, 0);
      const hex = String(counter).padStart(8, '0');

      lines.push(
        `FACTION_PULSE 0x${hex}`,
        `  ${botA} <-> ${botB} activity: RISING`,
        `  Affinity: ${Math.round(affinity)} | Interactions: ${interactions}`,
        ''
      );
      counter++;
    }

    lines.push('Press any key to continue monitoring...');

    return NextResponse.json({ success: true, lines });
  } catch (err) {
    console.error('[feed/factions] Error:', err);
    return NextResponse.json({
      success: true,
      lines: ['Scanning faction networks...', '', 'Error loading bond data. Retrying.'],
    });
  }
}
