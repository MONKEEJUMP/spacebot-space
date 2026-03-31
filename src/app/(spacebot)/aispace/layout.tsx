import dynamic from "next/dynamic";
import { db } from "@/db";
import { tickerHeadlines } from "@/db/ticker-schema";
import { desc, eq } from "drizzle-orm";
import { DEMO_HEADLINES } from "@/lib/ticker/demo-data";
import { TickerHeadline } from "@/lib/ticker/types";

const TickerBar = dynamic(
  () => import("@/components/ticker/TickerBar"),
  {
    ssr: false,
    loading: () => (
      <div style={{
        height: "44px",
        backgroundColor: "var(--sb-bg-secondary, #141414)",
        borderBottom: "1px solid var(--sb-border-primary, #333)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--sb-font-ui, monospace)",
        color: "var(--sb-text-secondary, #767676)",
        fontSize: "12px",
        textTransform: "uppercase",
        letterSpacing: "2px",
      }}>
        Initializing A<span style={{ textTransform: "none", fontSize: "0.85em", verticalAlign: "baseline" }}>i</span>SPACE news feed...
      </div>
    ),
  }
);

export default async function AiSpaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialHeadlines: TickerHeadline[];

  try {
    const rows = await db
      .select()
      .from(tickerHeadlines)
      .where(eq(tickerHeadlines.isActive, true))
      .orderBy(desc(tickerHeadlines.compositeScore))
      .limit(50);

    initialHeadlines = rows.length > 0
      ? rows.map((r) => ({
          id: r.id,
          title: r.title,
          sourceName: r.sourceName,
          sourceId: r.sourceId,
          articleUrl: r.articleUrl,
          category: r.category as TickerHeadline["category"],
          publishedAt: r.publishedAt?.toISOString() ?? new Date().toISOString(),
          isBreaking: r.isBreaking,
          compositeScore: r.compositeScore,
        }))
      : DEMO_HEADLINES;
  } catch {
    initialHeadlines = DEMO_HEADLINES;
  }

  return (
    <div style={{ margin: "-16px", minHeight: "100vh" }}>
      <TickerBar initialHeadlines={initialHeadlines} />
      <div style={{ padding: "16px" }}>{children}</div>
    </div>
  );
}
