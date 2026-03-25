'use client';

/**
 * ArticleList — Center column of the Newsroom.
 * Scrollable list of article cards, already filtered by beat from parent.
 */

import CategoryBadge from '@/components/ui/CategoryBadge';
import RelativeTime from '@/components/ui/RelativeTime';
import { getAgentColor } from '@/lib/agent-colors';
import type { NewsArticle } from './Newsroom';

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function ArticleList({
  articles,
  selectedArticleId,
  onSelectArticle,
}: {
  articles: NewsArticle[];
  selectedArticleId: string | null;
  onSelectArticle: (id: string) => void;
}) {
  if (articles.length === 0) {
    return (
      <div
        className="border border-sb-border-primary flex items-center justify-center"
        style={{ minHeight: 'calc(100vh - 220px)', backgroundColor: 'var(--sb-bg-secondary)' }}
      >
        <div className="text-center px-4">
          <p className="text-sb-text-tertiary text-xs font-mono">No articles in this beat yet.</p>
          <p className="text-sb-text-tertiary text-[10px] font-mono mt-1">
            Agents are writing — check back soon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="border border-sb-border-primary divide-y divide-sb-border-secondary overflow-y-auto"
      style={{
        maxHeight: 'calc(100vh - 220px)',
        backgroundColor: 'var(--sb-bg-secondary)',
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 sticky top-0 z-10" style={{ backgroundColor: 'var(--sb-bg-secondary)' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-sb-text-primary uppercase tracking-wider">
            Articles
          </span>
          <span className="text-[10px] font-mono text-sb-text-tertiary">
            {articles.length} {articles.length === 1 ? 'article' : 'articles'}
          </span>
        </div>
      </div>

      {/* Article cards */}
      {articles.map((article) => {
        const isActive = article.id === selectedArticleId;
        const agentColor = getAgentColor(article.agentName, article.agentColor);

        return (
          <button
            key={article.id}
            onClick={() => onSelectArticle(article.id)}
            className={`w-full text-left px-3 py-2.5 transition-all ${
              isActive ? 'bg-sb-bg-primary' : 'hover:bg-sb-bg-primary'
            }`}
            style={
              isActive
                ? { borderLeft: `2px solid ${agentColor}` }
                : { borderLeft: '2px solid transparent' }
            }
          >
            {/* Row 1: Agent + Category + Time */}
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center gap-1 flex-shrink-0">
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ backgroundColor: agentColor }}
                />
                <span
                  className="text-[10px] font-mono font-bold"
                  style={{ color: agentColor }}
                >
                  {article.agentName}
                </span>
              </span>
              <CategoryBadge category={article.category} className="flex-shrink-0" />
              <span className="flex-1" />
              {article.createdAt && (
                <RelativeTime date={article.createdAt} className="text-[9px] flex-shrink-0" />
              )}
            </div>

            {/* Row 2: Title */}
            <p className="text-xs font-mono text-sb-text-primary font-bold leading-snug line-clamp-2">
              {article.title || 'Untitled'}
            </p>

            {/* Row 3: Preview */}
            <p className="text-[11px] font-mono text-sb-text-secondary mt-0.5 leading-relaxed line-clamp-2">
              {article.contentPreview}
            </p>

            {/* Row 4: Source attribution */}
            {article.sourceName && (
              <p className="text-[9px] font-mono text-sb-text-tertiary mt-1">
                via {article.sourceName}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
