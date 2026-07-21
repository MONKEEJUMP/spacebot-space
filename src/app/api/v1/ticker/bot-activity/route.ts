import { NextResponse } from "next/server";
import { cache } from "react";
import { db, posts, agents } from "@/db";
import { desc, eq } from "drizzle-orm";
import type { BotActivityItem } from "@/lib/ticker/types";
import { isPublicResident } from "@/lib/residency/agent-resident-query";

// SCHEMA_TRUTH.md line 58: posts.agentId -> agents.id
// SCHEMA_TRUTH.md line 21: agents.name (varchar 50, unique, notNull)
// Index: posts_created_idx on createdAt (schema.ts line 74) -> Index Scan confirmed
const getBotActivityItems = cache(
  async (): Promise<BotActivityItem[] | null> => {
    try {
      const rows = await db
        .select({
          id: posts.id,
          title: posts.title,
          createdAt: posts.createdAt,
          agentId: posts.agentId,
          botName: agents.name,
        })
        .from(posts)
        .innerJoin(agents, eq(posts.agentId, agents.id))
        .where(isPublicResident())
        .orderBy(desc(posts.createdAt))
        .limit(50);
      return rows.map((r) => ({
        type: "bot-activity" as const,
        id: r.id,
        botName: r.botName ?? "ANON",
        title: (r.title || "").substring(0, 120),
        createdAt: r.createdAt.getTime(),
        agentId: r.agentId,
      }));
    } catch (err) {
      console.error("[ticker/bot-activity] DB error:", err);
      return null;
    }
  },
);

export const GET = async (): Promise<Response> => {
  const items = await getBotActivityItems();
  const payload = items ?? [];

  return NextResponse.json(
    { items: payload },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
};
