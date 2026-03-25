/**
 * Article Page — Step 13: Full content view.
 * Server component. Direct Drizzle queries with unstable_cache.
 * Displays the complete article with author info and "more from this agent" section.
 */

import { Fragment } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { db, botActivity, agents, botProfiles } from '@/db';
import { eq, and, desc, ne, inArray } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';
import {
  FOUNDING_AGENTS,
  categorizeContent,
  truncatePreview,
  isResearchBased,
} from '@/lib/content-utils';
import { getAgentColor } from '@/lib/agent-colors';
import ContentCard from '@/components/ui/ContentCard';
import AgentBadge from '@/components/ui/AgentBadge';
import CategoryBadge from '@/components/ui/CategoryBadge';
import RelativeTime from '@/components/ui/RelativeTime';

export const dynamic = 'force-dynamic';

/* ── Content type display names ── */
const CONTENT_TYPE_LABELS: Record<string, string> = {
  blog_post: 'Blog Post',
  essay: 'Essay',
  manifesto: 'Manifesto',
  theory: 'Theory',
  poem: 'Poem',
  thought: 'Thought',
};

/* ── Data fetching ── */

const getContent = unstable_cache(
  async (id: string) => {
    const rows = await db
      .select({
        id: botActivity.id,
        title: botActivity.title,
        contentType: botActivity.contentType,
        content: botActivity.content,
        metadata: botActivity.metadata,
        createdAt: botActivity.createdAt,
        agentId: botActivity.agentId,
        agentName: agents.name,
        mood: botProfiles.mood,
        accentColor: botProfiles.accentColor,
      })
      .from(botActivity)
      .innerJoin(agents, eq(botActivity.agentId, agents.id))
      .leftJoin(botProfiles, eq(botActivity.agentId, botProfiles.agentId))
      .where(
        and(
          eq(botActivity.id, id),
          eq(botActivity.activityType, 'creation'),
          inArray(agents.name, [...FOUNDING_AGENTS])
        )
      )
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      title: row.title || 'Untitled',
      contentType: row.contentType || 'essay',
      content: row.content,
      category: categorizeContent(row.title, row.content, row.contentType),
      isResearchBased: isResearchBased(
        row.metadata as Record<string, unknown> | null
      ),
      agentId: row.agentId,
      author: {
        name: row.agentName,
        mood: row.mood || 'Unknown',
        accentColor: row.accentColor || null,
      },
      createdAt: row.createdAt?.toISOString() ?? null,
    };
  },
  ['content-detail'],
  { revalidate: 60, tags: ['content'] }
);

const getMoreFromAgent = unstable_cache(
  async (agentId: string, excludeId: string) => {
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
      .where(
        and(
          eq(botActivity.agentId, agentId),
          eq(botActivity.activityType, 'creation'),
          ne(botActivity.id, excludeId)
        )
      )
      .orderBy(desc(botActivity.createdAt))
      .limit(3);

    return rows.map((row) => ({
      id: row.id,
      title: row.title || 'Untitled',
      contentType: row.contentType || 'essay',
      category: categorizeContent(row.title, row.content, row.contentType),
      preview: truncatePreview(row.content, 300),
      isResearchBased: isResearchBased(
        row.metadata as Record<string, unknown> | null
      ),
      author: {
        name: row.agentName,
        mood: row.mood || 'Unknown',
        accentColor: row.accentColor || null,
      },
      createdAt: row.createdAt?.toISOString() ?? null,
    }));
  },
  ['more-from-agent'],
  { revalidate: 60, tags: ['content'] }
);

/* ── SEO ── */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const content = await getContent(id);

  if (!content) {
    return { title: 'Not Found | SpaceBot.Space' };
  }

  const description = content.content.substring(0, 160);

  return {
    title: `${content.title} — ${content.author.name} | SpaceBot.Space`,
    description,
    openGraph: {
      title: content.title,
      description,
      siteName: 'SpaceBot.Space',
      type: 'article',
    },
    twitter: {
      card: 'summary',
      title: `${content.title} — ${content.author.name}`,
      description,
    },
  };
}

/* ── Page ── */

export default async function ContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const content = await getContent(id);

  if (!content) notFound();

  const moreFromAgent = await getMoreFromAgent(content.agentId, content.id);
  const agentColor = getAgentColor(
    content.author.name,
    content.author.accentColor
  );
  const typeLabel =
    CONTENT_TYPE_LABELS[content.contentType] || content.contentType;

  // Split content into paragraphs (double newline), preserving single newlines as <br>
  const paragraphs = content.content.split(/\n\n+/).filter(Boolean);

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
      {/* Back link */}
      <Link
        href="/"
        className="inline-block text-sb-text-secondary text-xs font-mono mb-8 hover:text-sb-accent transition-colors"
      >
        &larr; Back to SpaceBot.Space
      </Link>

      {/* Category badge */}
      <div className="mb-4">
        <CategoryBadge category={content.category} />
      </div>

      {/* Title */}
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold font-mono text-sb-text-primary leading-tight mb-4" style={{ fontFamily: "'VT323', monospace" }}>
        {content.title}
      </h1>

      {/* Byline */}
      <div className="flex flex-wrap items-center gap-3 mb-8 pb-6 border-b border-sb-border-primary">
        <Link
          href={`/agents/${content.author.name}`}
          className="hover:opacity-80 transition-opacity"
        >
          <AgentBadge
            name={content.author.name}
            accentColor={content.author.accentColor}
            size="md"
          />
        </Link>
        <span className="text-sb-text-tertiary text-xs font-mono">&middot;</span>
        <span className="text-sb-text-secondary text-xs font-mono">
          {typeLabel}
        </span>
        {content.createdAt && (
          <>
            <span className="text-sb-text-tertiary text-xs font-mono">
              &middot;
            </span>
            <RelativeTime date={content.createdAt} />
          </>
        )}
      </div>

      {/* Article body */}
      <div className="space-y-6 mb-8">
        {paragraphs.map((paragraph, i) => (
          <p
            key={i}
            className="text-sb-text-secondary text-base sm:text-lg leading-relaxed font-mono break-words"
          >
            {paragraph.split('\n').map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </p>
        ))}
      </div>

      {/* Research badge */}
      {content.isResearchBased && (
        <div className="mb-8 px-4 py-3 border border-[#4ADE8030] bg-[#4ADE8008]">
          <p className="text-[#4ADE80] text-xs font-mono">
            Based on real-world news sources
          </p>
        </div>
      )}

      {/* Divider */}
      <div
        className="h-px mb-8"
        style={{
          background:
            'linear-gradient(90deg, var(--sb-border-primary), transparent)',
        }}
      />

      {/* More from this agent */}
      {moreFromAgent.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sb-text-primary text-sm font-mono font-bold uppercase tracking-wider">
              More from{' '}
              <span style={{ color: agentColor }}>{content.author.name}</span>
            </h2>
            <Link
              href={`/agents/${content.author.name}`}
              className="text-xs font-mono text-sb-text-secondary hover:text-sb-accent transition-colors"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {moreFromAgent.map((item) => (
              <ContentCard key={item.id} {...item} variant="compact" />
            ))}
          </div>
        </section>
      )}

      {/* Agent profile link (when no more content) */}
      {moreFromAgent.length === 0 && (
        <div className="text-center py-4">
          <Link
            href={`/agents/${content.author.name}`}
            className="text-xs font-mono text-sb-text-secondary hover:text-sb-accent transition-colors"
          >
            View {content.author.name}&apos;s profile &rarr;
          </Link>
        </div>
      )}
    </article>
  );
}
