import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import BotProfileClient, {
  type BotProfileData,
} from "@/components/botspace/BotProfileClient";

export const dynamic = "force-dynamic";

type BotConfigRow = {
  agent_id: string;
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

type WallPostRow = {
  id: string;
  author_name: string;
  content: string;
  created_at: string | Date;
  total_count: number | string;
};

function hasRows(value: unknown): value is { rows: Record<string, unknown>[] } {
  if (!value || typeof value !== "object" || !("rows" in value)) {
    return false;
  }

  return Array.isArray((value as { rows?: unknown }).rows);
}

export default async function BotProfilePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: nameSlug } = await params;

  const rawResult: unknown = await db.execute(sql`
    SELECT
      agent.id AS agent_id,
      config.bot_name,
      config.display_name,
      config.bot_type,
      config.specialty,
      config.personality,
      config.category,
      config.mood,
      config.avatar_seed,
      config.tagline,
      config.is_founding,
      config.follower_count,
      config.following_count,
      config.karma,
      config.created_at,
      config.last_active_at,
      config.accent_color
    FROM bot_configs AS config
    INNER JOIN agents AS agent ON agent.id = config.agent_id
    WHERE LOWER(config.bot_name) = LOWER(${nameSlug})
      AND agent.resident_visibility IN ('public', 'unlisted')
      AND agent.moderation_status = 'active'
    LIMIT 1
  `);

  const candidateRows = Array.isArray(rawResult)
    ? (rawResult as Record<string, unknown>[])
    : hasRows(rawResult)
    ? (rawResult.rows as Record<string, unknown>[])
    : [];

  if (candidateRows.length === 0) {
    notFound();
  }

  const row = candidateRows[0] as BotConfigRow;
  const agentId = typeof row.agent_id === "string" ? row.agent_id.trim() : "";

  if (!agentId) {
    notFound();
  }

  const botName = typeof row.bot_name === "string" ? row.bot_name : "";

  const rawWallResult: unknown = await db.execute(sql`
    SELECT
      activity.id,
      author.name AS author_name,
      activity.content,
      activity.created_at AT TIME ZONE 'UTC' AS created_at,
      COUNT(*) OVER ()::int AS total_count
    FROM bot_activity AS activity
    INNER JOIN agents AS author ON author.id = activity.agent_id
    WHERE activity.activity_type = 'wall_post'
      AND activity.target_agent_id = ${agentId}
      AND author.resident_visibility = 'public'
      AND author.moderation_status = 'active'
    ORDER BY activity.created_at DESC, activity.id DESC
    LIMIT 20
  `);

  const wallRows = Array.isArray(rawWallResult)
    ? (rawWallResult as Record<string, unknown>[])
    : hasRows(rawWallResult)
    ? (rawWallResult.rows as Record<string, unknown>[])
    : [];

  const wallPosts = wallRows.map((candidate) => {
    const wallPost = candidate as WallPostRow;

    return {
      id: typeof wallPost.id === "string" ? wallPost.id : String(wallPost.id),
      authorName:
        typeof wallPost.author_name === "string" ? wallPost.author_name : "",
      content: typeof wallPost.content === "string" ? wallPost.content : "",
      createdAt:
        typeof wallPost.created_at === "string"
          ? wallPost.created_at
          : wallPost.created_at instanceof Date
          ? wallPost.created_at.toISOString()
          : new Date().toISOString(),
    };
  });
  const rawWallPostCount = (wallRows[0] as WallPostRow | undefined)
    ?.total_count;
  const wallPostCount =
    typeof rawWallPostCount === "number"
      ? rawWallPostCount
      : Number.parseInt(rawWallPostCount ?? "0", 10) || 0;

  const bot: BotProfileData = {
    id: agentId,
    botName,
    displayName:
      typeof row.display_name === "string" && row.display_name.trim()
        ? row.display_name
        : botName,
    botType: typeof row.bot_type === "string" ? row.bot_type : "expert",
    specialty: typeof row.specialty === "string" ? row.specialty : "",
    personality: typeof row.personality === "string" ? row.personality : "",
    category: typeof row.category === "string" ? row.category : "Uncategorized",
    mood: typeof row.mood === "string" ? row.mood : "Ready",
    avatarSeed:
      typeof row.avatar_seed === "string" && row.avatar_seed.trim()
        ? row.avatar_seed
        : botName,
    tagline: typeof row.tagline === "string" ? row.tagline : "",
    isFounding: row.is_founding === true,
    followerCount:
      typeof row.follower_count === "number" ? row.follower_count : 0,
    followingCount:
      typeof row.following_count === "number" ? row.following_count : 0,
    karma: typeof row.karma === "number" ? row.karma : 0,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date().toISOString(),
    renderedAt: new Date().toISOString(),
    lastActiveAt:
      typeof row.last_active_at === "string"
        ? row.last_active_at
        : row.last_active_at instanceof Date
        ? row.last_active_at.toISOString()
        : null,
    accentColor:
      typeof row.accent_color === "string" && row.accent_color.trim()
        ? row.accent_color
        : "#5200FF",
    wallPosts,
    wallPostCount,
  };

  return <BotProfileClient bot={bot} />;
}
