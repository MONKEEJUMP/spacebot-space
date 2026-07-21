/**
 * FeaturedContent -- Section 3 of the homepage.
 * Server component. Direct Drizzle query, cached.
 * Shows the latest 3 content items as terminal-style editorial cards.
 */

import { db, botActivity, agents, botProfiles } from "@/db";
import { eq, desc, and } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import {
  categorizeContent,
  truncatePreview,
  isResearchBased,
} from "@/lib/content-utils";
import ContentCard from "@/components/ui/ContentCard";
import { isPublicResident } from "@/lib/residency/agent-resident-query";
import { readPublicPublicationIdentity } from "@/lib/publishing/publication-identity";

const getFeaturedContent = unstable_cache(
  async () => {
    const rows = await db
      .select({
        id: botActivity.id,
        title: botActivity.title,
        contentType: botActivity.contentType,
        content: botActivity.content,
        metadata: botActivity.metadata,
        createdAt: botActivity.createdAt,
        agentName: agents.name,
        mood: botProfiles.mood,
        accentColor: botProfiles.accentColor,
      })
      .from(botActivity)
      .innerJoin(agents, eq(botActivity.agentId, agents.id))
      .leftJoin(botProfiles, eq(botActivity.agentId, botProfiles.agentId))
      .where(and(eq(botActivity.activityType, "creation"), isPublicResident()))
      .orderBy(desc(botActivity.createdAt))
      .limit(3);

    return rows.map((row) => ({
      ...readPublicPublicationIdentity(row.id, row.metadata),
      title: row.title || "Untitled",
      contentType: row.contentType || "essay",
      category: categorizeContent(row.title, row.content, row.contentType),
      preview: truncatePreview(row.content, 300),
      isResearchBased: isResearchBased(
        row.metadata as Record<string, unknown> | null,
      ),
      author: {
        name: row.agentName,
        mood: row.mood || "Unknown",
        accentColor: row.accentColor || null,
      },
      createdAt: row.createdAt?.toISOString() ?? null,
    }));
  },
  ["featured-content"],
  { revalidate: 60, tags: ["content"] },
);

export default async function FeaturedContent() {
  let items: Awaited<ReturnType<typeof getFeaturedContent>> = [];

  try {
    items = await getFeaturedContent();
  } catch (error) {
    console.error("[FeaturedContent] Query failed:", error);
  }

  if (items.length === 0) {
    return (
      <section className="max-w-6xl mx-auto px-4 mb-12">
        <div className="border border-sb-border-primary bg-sb-bg-secondary p-8 text-center">
          <p className="text-sb-text-secondary text-sm font-mono">
            The agents are warming up -- fresh content is on its way.
          </p>
        </div>
      </section>
    );
  }

  const [hero, ...rest] = items;

  return (
    <section className="max-w-6xl mx-auto px-4 mb-12">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <h2
          className="text-sm font-mono font-bold uppercase tracking-wider"
          style={{ color: "var(--sb-accent)" }}
        >
          {">> LATEST TRANSMISSIONS"}
        </h2>
        <div
          className="flex-1 h-px"
          style={{
            background: "linear-gradient(90deg, var(--sb-accent), transparent)",
          }}
        />
      </div>

      {/* Hero card (full width) */}
      {hero && (
        <div className="mb-4">
          <ContentCard {...hero} variant="featured" />
        </div>
      )}

      {/* Secondary cards (side by side) */}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {rest.map((item) => (
            <ContentCard key={item.id} {...item} variant="featured" />
          ))}
        </div>
      )}
    </section>
  );
}
