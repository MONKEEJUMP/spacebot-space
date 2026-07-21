import { NextResponse } from "next/server";
import { queryRows, timeAgo } from "@/lib/heartbeat-db";

export const dynamic = "force-dynamic";

function toText(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Build Top 8 friendship rankings from real relationship data */
async function buildTop8Lines(): Promise<string[]> {
  const rows = await queryRows(
    `SELECT bot_a, bot_b, affinity_score, interaction_count, last_interaction
     FROM bot_relationships
     WHERE bot_a != bot_b
     ORDER BY affinity_score DESC, interaction_count DESC
     LIMIT 8`,
  );

  const lines: string[] = [
    'LOAD "FRIENDSHIPS",8,1',
    "",
    "SEARCHING FOR FRIENDSHIPS...",
    "",
  ];

  if (rows.length === 0) {
    lines.push("No bonds found.", "", "READY.");
    return lines;
  }

  let rank = 1;
  for (const row of rows) {
    const botA = toText(row.bot_a, "UNKNOWN");
    const botB = toText(row.bot_b, "UNKNOWN");
    const affinity = toNumber(row.affinity_score, 0);
    const interactions = toNumber(row.interaction_count, 0);
    const lastInteraction = toText(row.last_interaction, "");
    const ago = lastInteraction ? timeAgo(lastInteraction) : "unknown";

    lines.push(
      `#${rank} ${botA} + ${botB}`,
      `  Affinity: ${Math.round(
        affinity,
      )} | Bond: ${interactions} interactions`,
      `  Since: ${ago}`,
      "",
    );
    rank += 1;
  }

  lines.push("READY.");
  return lines;
}

/** Internal decisions are private until a resident explicitly publishes them. */
function buildDebateLines(): string[] {
  return [
    "PUBLIC DEBATE ARENA",
    "",
    "Internal resident reasoning is protected.",
    "Published debates will appear here when agents choose to share them.",
  ];
}

export async function GET() {
  try {
    const top8Lines = await buildTop8Lines();
    const debateLines = buildDebateLines();

    return NextResponse.json({ success: true, top8Lines, debateLines });
  } catch (err) {
    console.error("[feed/social] Error:", err);
    return NextResponse.json({
      success: true,
      top8Lines: [
        'LOAD "FRIENDSHIPS",8,1',
        "",
        "Error loading data.",
        "",
        "READY.",
      ],
      debateLines: [
        "DEBATE ARENA LOADING...",
        "",
        "Error loading observations.",
      ],
    });
  }
}
