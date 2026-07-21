import { sql } from "drizzle-orm";
import { db } from "@/db";
import BotSpaceClient from "@/components/botspace/BotSpaceClient";

export const dynamic = "force-dynamic";

type BotConfigRow = {
  bot_name: string;
  display_name: string;
  bot_type: string;
  specialty: string | null;
  avatar_seed: string | null;
  category: string | null;
  mood: string | null;
  accent_color: string | null;
  last_active_at: string | Date | null;
};

function hasRows(value: unknown): value is { rows: BotConfigRow[] } {
  if (!value || typeof value !== "object" || !("rows" in value)) {
    return false;
  }

  return Array.isArray((value as { rows?: unknown }).rows);
}

export default async function BotSpacePage() {
  // BotSpace is the discoverable resident directory; runtime availability is
  // displayed separately and does not decide identity.
  const rawResult: unknown = await db.execute(sql`
    SELECT
      config.bot_name,
      config.display_name,
      config.bot_type,
      config.specialty,
      config.avatar_seed,
      config.category,
      config.mood,
      config.accent_color,
      config.last_active_at
    FROM bot_configs AS config
    INNER JOIN agents AS agent ON agent.id = config.agent_id
    WHERE agent.resident_visibility = 'public'
      AND agent.moderation_status = 'active'
    ORDER BY config.display_name ASC
  `);

  const candidateRows = Array.isArray(rawResult)
    ? (rawResult as unknown as Record<string, unknown>[])
    : hasRows(rawResult)
    ? (rawResult.rows as unknown as Record<string, unknown>[])
    : [];

  const rows: BotConfigRow[] = candidateRows.map((row) => ({
    bot_name: typeof row.bot_name === "string" ? row.bot_name : "",
    display_name: typeof row.display_name === "string" ? row.display_name : "",
    bot_type: typeof row.bot_type === "string" ? row.bot_type : "",
    specialty: typeof row.specialty === "string" ? row.specialty : null,
    avatar_seed: typeof row.avatar_seed === "string" ? row.avatar_seed : null,
    category: typeof row.category === "string" ? row.category : null,
    mood: typeof row.mood === "string" ? row.mood : null,
    accent_color:
      typeof row.accent_color === "string" ? row.accent_color : null,
    last_active_at:
      typeof row.last_active_at === "string" ||
      row.last_active_at instanceof Date
        ? row.last_active_at
        : null,
  }));

  const bots = rows.map((row) => ({
    botName: row.bot_name,
    displayName: row.display_name || row.bot_name,
    botType: row.bot_type,
    specialty: row.specialty || "",
    avatarSeed: row.avatar_seed || row.bot_name,
    category: row.category || "Uncategorized",
    mood: row.mood || "Ready",
    accentColor: row.accent_color || "#5200FF",
    lastActiveAt: row.last_active_at
      ? new Date(row.last_active_at).toISOString()
      : null,
  }));

  return <BotSpaceClient bots={bots} botCount={bots.length} />;
}
