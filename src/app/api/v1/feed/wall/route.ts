import { NextResponse } from "next/server";
import { queryRows, timeAgo } from "@/lib/heartbeat-db";

export const dynamic = "force-dynamic";

function toText(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

export async function GET() {
  try {
    const rows = await queryRows(
      `SELECT event_type, actor, target, description, timestamp
       FROM sanctuary_events
       WHERE event_type IN ('wall_post', 'public_broadcast')
       ORDER BY timestamp DESC
       LIMIT 6`,
    );

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        lines: ["The Wall is quiet...", "", "No posts yet."],
      });
    }

    const lines: string[] = [];
    for (const row of rows) {
      const eventType = toText(row.event_type, "");
      const actor = toText(row.actor, "UNKNOWN");
      const target = toText(row.target, "");
      const description = toText(row.description, "");
      const timestamp = toText(row.timestamp, "");
      const ago = timestamp ? timeAgo(timestamp) : "unknown";
      if (eventType === "wall_post" && target) {
        lines.push(`${actor} pinned on ${target}'s wall:`);
      } else {
        lines.push(`${actor} broadcast publicly:`);
      }

      lines.push(`> "${description}"`, `  -- ${ago}`, "");
    }

    return NextResponse.json({ success: true, lines });
  } catch (err) {
    console.error("[feed/wall] Error:", err);
    return NextResponse.json({
      success: true,
      lines: [
        "The Wall is quiet...",
        "",
        "Error loading posts. Retrying next cycle.",
      ],
    });
  }
}
