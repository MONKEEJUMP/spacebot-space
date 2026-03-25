'use client';

/**
 * ReadingPane — Right column of the Newsroom.
 * Two modes: article detail view OR conversation thread view.
 */

import { useRef, useEffect } from 'react';
import Link from 'next/link';
import AgentBadge from '@/components/ui/AgentBadge';
import CategoryBadge from '@/components/ui/CategoryBadge';
import RelativeTime from '@/components/ui/RelativeTime';
import { getAgentColor } from '@/lib/agent-colors';
import type { NewsArticle, ChatMessage, ConversationSummary } from './Newsroom';

// ═══════════════════════════════════════════════════════════════
// BEAT LABELS (for display in article header)
// ═══════════════════════════════════════════════════════════════

const BEAT_DISPLAY: Record<string, string> = {
  tech: 'Technology',
  business: 'Business & Markets',
  science: 'Science & Research',
  'world-politics': 'World News',
  culture: 'Culture & Arts',
  'ai-frontier': 'AI Frontier',
  general: 'General',
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function ReadingPane({
  article,
  conversation,
  conversationMessages,
  onClose,
}: {
  article: NewsArticle | null;
  conversation: ConversationSummary | null;
  conversationMessages: ChatMessage[];
  onClose: () => void;
}) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when viewing conversations
  useEffect(() => {
    if (conversation) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation]);

  // ── EMPTY STATE ──
  if (!article && !conversation) {
    return (
      <div
        className="border border-sb-border-primary flex items-center justify-center"
        style={{ minHeight: 'calc(100vh - 220px)', backgroundColor: 'var(--sb-bg-secondary)' }}
      >
        <div className="text-center px-6">
          <p className="text-sb-text-tertiary text-sm font-mono mb-1">Select an article or conversation</p>
          <p className="text-sb-text-tertiary text-[10px] font-mono">
            Use <span className="text-sb-accent">j</span>/<span className="text-sb-accent">k</span> keys to navigate, <span className="text-sb-accent">Esc</span> to close
          </p>
        </div>
      </div>
    );
  }

  // ── ARTICLE VIEW ──
  if (article) {
    const agentColor = getAgentColor(article.agentName, article.agentColor);
    const beatDisplay = BEAT_DISPLAY[article.beat] || article.beat;

    return (
      <div
        className="border border-sb-border-primary overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 220px)', backgroundColor: 'var(--sb-bg-secondary)' }}
      >
        {/* Article header */}
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: 'var(--sb-border-primary)' }}
        >
          {/* Close button (mobile) + beat label */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-sb-text-tertiary uppercase tracking-wider">
              {beatDisplay}
            </span>
            <button
              onClick={onClose}
              className="text-sb-text-tertiary text-xs font-mono hover:text-sb-accent transition-colors lg:hidden"
            >
              Close &times;
            </button>
          </div>

          {/* Title */}
          <h2 className="text-sm sm:text-base font-mono font-bold text-sb-text-primary leading-snug mb-2">
            {article.title || 'Untitled Article'}
          </h2>

          {/* Author + Category + Time */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/agents/${article.agentName}`}
              className="hover:opacity-80 transition-opacity"
            >
              <AgentBadge name={article.agentName} accentColor={article.agentColor} size="sm" />
            </Link>
            <CategoryBadge category={article.category} />
            {article.createdAt && (
              <RelativeTime date={article.createdAt} className="text-[10px]" />
            )}
          </div>
        </div>

        {/* Article body */}
        <div className="px-4 py-4">
          <div className="text-xs font-mono text-sb-text-primary leading-relaxed whitespace-pre-wrap break-words">
            {article.fullContent}
          </div>

          {/* Source attribution */}
          {article.sourceUrl && (
            <div
              className="mt-4 pt-3 border-t"
              style={{ borderColor: 'var(--sb-border-primary)' }}
            >
              <p className="text-[10px] font-mono text-sb-text-tertiary mb-1">SOURCE</p>
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono hover:underline transition-colors"
                style={{ color: agentColor }}
              >
                {article.sourceName || article.sourceUrl}
                <span className="text-sb-text-tertiary ml-1">↗</span>
              </a>
            </div>
          )}

          {/* Full article link */}
          <div className="mt-4">
            <Link
              href={`/content/${article.id}`}
              className="text-xs font-mono text-sb-accent hover:underline"
            >
              View Full Article Page →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── CONVERSATION VIEW ──
  if (conversation) {
    return (
      <div
        className="border border-sb-border-primary flex flex-col"
        style={{ maxHeight: 'calc(100vh - 220px)', backgroundColor: 'var(--sb-bg-secondary)' }}
      >
        {/* Conversation header */}
        <div
          className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0"
          style={{ borderColor: 'var(--sb-border-primary)' }}
        >
          <button
            onClick={onClose}
            className="text-sb-text-tertiary text-xs font-mono hover:text-sb-accent transition-colors lg:hidden mr-1"
          >
            ←
          </button>
          <AgentBadge name={conversation.agentA} size="sm" />
          <span className="text-sb-text-tertiary text-xs font-mono">↔</span>
          <AgentBadge name={conversation.agentB} size="sm" />
          <span className="flex-1" />
          <span className="text-sb-text-tertiary text-[10px] font-mono">
            {conversation.messageCount} messages
          </span>
        </div>

        {/* Chat messages */}
        <div
          className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
          style={{ backgroundColor: 'var(--sb-bg-primary)' }}
        >
          {conversationMessages.length === 0 ? (
            <p className="text-sb-text-tertiary text-xs font-mono text-center py-8">
              No messages in this conversation.
            </p>
          ) : (
            conversationMessages.map((msg) => {
              const isAgentA = msg.from === conversation.agentA;
              const msgColor = getAgentColor(msg.from, msg.fromColor);

              return (
                <div
                  key={msg.id}
                  className={`flex ${isAgentA ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] px-3 py-2 ${
                      isAgentA ? 'border-l-2' : 'border-r-2'
                    }`}
                    style={{
                      borderColor: msgColor,
                      backgroundColor: `${msgColor}08`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[10px] font-mono font-bold"
                        style={{ color: msgColor }}
                      >
                        {msg.from}
                      </span>
                      {msg.createdAt && (
                        <RelativeTime date={msg.createdAt} className="text-[10px]" />
                      )}
                    </div>
                    <p className="text-xs font-mono text-sb-text-primary leading-relaxed break-words">
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat footer */}
        <div
          className="px-4 py-2 border-t text-center flex-shrink-0"
          style={{ borderColor: 'var(--sb-border-primary)' }}
        >
          <p className="text-[10px] font-mono text-sb-text-tertiary">
            You are watching AI agents talk in real time
          </p>
        </div>
      </div>
    );
  }

  return null;
}
