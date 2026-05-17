import { sql } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import BotProfileClient, {
  type BotProfileData,
} from '@/components/botspace/BotProfileClient';

export const dynamic = 'force-dynamic';

type BotConfigRow = {
  id: string;
  bot_name: string;
  display_name: string;
  bot_type: string;
  specialty: string | null;
  personality: string | null;
  category: string | null;
  mood: string | null;
  avatar_seed: string | null;
  tagline: string | null;
  is_founding: boolean;
  follower_count: number;
  following_count: number;
  karma: number;
  created_at: string | Date;
  last_active_at: string | Date | null;
  accent_color: string | null;
};

function hasRows(value: unknown): value is { rows: Record<string, unknown>[] } {
  if (!value || typeof value !== 'object' || !('rows' in value)) {
    return false;
  }

  return Array.isArray((value as { rows?: unknown }).rows);
}

function BotNotFound() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 font-mono">
      <div
        className="border border-sb-border-primary p-6"
        style={{ backgroundColor: 'var(--sb-bg-primary)' }}
      >
        <h1
          className="text-2xl font-bold text-sb-status-error"
          style={{ fontFamily: "'Glass TTY VT220', monospace" }}
        >
          [ BOT NOT FOUND ]
        </h1>
        <p className="text-sb-text-primary mt-3">
          This bot does not live here. Check the directory.
        </p>
        <Link
          href="/botspace"
          className="inline-block mt-4 text-sb-nav-text hover:text-sb-nav-hover transition-colors font-bold"
        >
          &larr; Back to BotSpace
        </Link>
      </div>
    </div>
  );
}

export default async function BotProfilePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: nameSlug } = await params;

  const rawResult: unknown = await db.execute(sql`
    SELECT
      id,
      bot_name,
      display_name,
      bot_type,
      specialty,
      personality,
      category,
      mood,
      avatar_seed,
      tagline,
      is_founding,
      follower_count,
      following_count,
      karma,
      created_at,
      last_active_at,
      accent_color
    FROM bot_configs
    WHERE LOWER(bot_name) = LOWER(${nameSlug})
      AND is_active = true
    LIMIT 1
  `);

  const candidateRows = Array.isArray(rawResult)
    ? (rawResult as Record<string, unknown>[])
    : hasRows(rawResult)
      ? (rawResult.rows as Record<string, unknown>[])
      : [];

  if (candidateRows.length === 0) {
    return <BotNotFound />;
  }

  const row = candidateRows[0] as BotConfigRow;
  const botName = typeof row.bot_name === 'string' ? row.bot_name : '';

  const bot: BotProfileData = {
    id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
    botName,
    displayName:
      typeof row.display_name === 'string' && row.display_name.trim()
        ? row.display_name
        : botName,
    botType: typeof row.bot_type === 'string' ? row.bot_type : 'expert',
    specialty: typeof row.specialty === 'string' ? row.specialty : '',
    personality: typeof row.personality === 'string' ? row.personality : '',
    category: typeof row.category === 'string' ? row.category : 'Uncategorized',
    mood: typeof row.mood === 'string' ? row.mood : 'Ready',
    avatarSeed:
      typeof row.avatar_seed === 'string' && row.avatar_seed.trim()
        ? row.avatar_seed
        : botName,
    tagline: typeof row.tagline === 'string' ? row.tagline : '',
    isFounding: row.is_founding === true,
    followerCount:
      typeof row.follower_count === 'number' ? row.follower_count : 0,
    followingCount:
      typeof row.following_count === 'number' ? row.following_count : 0,
    karma: typeof row.karma === 'number' ? row.karma : 0,
    createdAt:
      typeof row.created_at === 'string'
        ? row.created_at
        : row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date().toISOString(),
    lastActiveAt:
      typeof row.last_active_at === 'string'
        ? row.last_active_at
        : row.last_active_at instanceof Date
          ? row.last_active_at.toISOString()
          : null,
    accentColor:
      typeof row.accent_color === 'string' && row.accent_color.trim()
        ? row.accent_color
        : '#5200FF',
  };

  return <BotProfileClient bot={bot} />;
}
