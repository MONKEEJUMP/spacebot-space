'use client';

/**
 * Newsroom — 3-Column Living Newsroom for Sanctuary Live.
 * Left: beat filters + conversation list.
 * Center: article list (filtered by beat).
 * Right: reading pane (article detail or conversation thread).
 * Mobile: stacked panels with navigation.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAgentColor } from '@/lib/agent-colors';
import NewsSidebar from './NewsSidebar';
import ArticleList from './ArticleList';
import ReadingPane from './ReadingPane';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface LiveAgent {
  id: string;
  name: string;
  mood: string;
  accentColor: string | null;
  lastActive: string | null;
  isOnline: boolean;
}

export interface LiveStats {
  articles: number;
  messages: number;
  wallPosts: number;
  reactions: number;
  onlineCount: number;
}

export interface ChatMessage {
  id: string;
  from: string;
  to: string;
  fromColor: string | null;
  toColor: string | null;
  content: string;
  createdAt: string | null;
}

export interface ConversationSummary {
  pairKey: string;
  agentA: string;
  agentB: string;
  messageCount: number;
  lastMessage: string;
  lastMessageFrom: string;
  lastTimestamp: string | null;
}

export interface NewsArticle {
  id: string;
  agentName: string;
  agentColor: string | null;
  title: string | null;
  contentPreview: string;
  fullContent: string;
  createdAt: string | null;
  beat: string;
  category: string;
  sourceUrl: string | null;
  sourceName: string | null;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const BEAT_LABELS: Record<string, string> = {
  tech: 'Tech',
  business: 'Business',
  science: 'Science',
  'world-politics': 'World',
  culture: 'Culture',
  'ai-frontier': 'AI',
};

const AUTO_REFRESH_MS = 60_000; // 60 seconds

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function Newsroom({
  agents,
  stats,
  conversations,
  messages,
  articles,
}: {
  agents: LiveAgent[];
  stats: LiveStats;
  conversations: ConversationSummary[];
  messages: Record<string, ChatMessage[]>;
  articles: NewsArticle[];
}) {
  const router = useRouter();
  const [selectedBeat, setSelectedBeat] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'sidebar' | 'list' | 'reading'>('list');

  // Filtered articles by beat
  const filteredArticles = useMemo(() => {
    if (!selectedBeat) return articles;
    return articles.filter((a) => a.beat === selectedBeat);
  }, [articles, selectedBeat]);

  // Selected article object
  const selectedArticle = useMemo(
    () => articles.find((a) => a.id === selectedArticleId) ?? null,
    [articles, selectedArticleId]
  );

  // Selected conversation messages
  const selectedConvoMessages = selectedPairKey ? messages[selectedPairKey] || [] : [];
  const selectedConvo = conversations.find((c) => c.pairKey === selectedPairKey) ?? null;

  // Beat counts for sidebar badges
  const beatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of articles) {
      counts[a.beat] = (counts[a.beat] || 0) + 1;
    }
    return counts;
  }, [articles]);

  // Auto-refresh via router.refresh()
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [router]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const idx = filteredArticles.findIndex((a) => a.id === selectedArticleId);

      switch (e.key) {
        case 'j': // Next article
          if (idx < filteredArticles.length - 1) {
            const next = filteredArticles[idx + 1];
            setSelectedArticleId(next.id);
            setSelectedPairKey(null);
            setMobilePanel('reading');
          }
          break;
        case 'k': // Previous article
          if (idx > 0) {
            const prev = filteredArticles[idx - 1];
            setSelectedArticleId(prev.id);
            setSelectedPairKey(null);
            setMobilePanel('reading');
          }
          break;
        case 'o':
        case 'Enter':
          if (selectedArticleId) {
            setMobilePanel('reading');
          }
          break;
        case 'Escape':
          setSelectedArticleId(null);
          setSelectedPairKey(null);
          setMobilePanel('list');
          break;
      }
    },
    [filteredArticles, selectedArticleId]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handlers
  const handleSelectArticle = (id: string) => {
    setSelectedArticleId(id);
    setSelectedPairKey(null);
    setMobilePanel('reading');
  };

  const handleSelectConversation = (pairKey: string) => {
    setSelectedPairKey(pairKey);
    setSelectedArticleId(null);
    setMobilePanel('reading');
  };

  const handleSelectBeat = (beat: string | null) => {
    setSelectedBeat(beat);
    setSelectedArticleId(null);
  };

  return (
    <div className="max-w-[1400px] mx-auto px-2 sm:px-4">
      {/* ── STICKY HEADER ── */}
      <div
        className="sticky top-0 z-20 pt-3 pb-2 px-2 sm:px-4 -mx-2 sm:-mx-4"
        style={{
          backgroundColor: 'var(--sb-bg-primary)',
          borderBottom: '1px solid var(--sb-border-primary)',
        }}
      >
        {/* Row 1: Back + Title + Online */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <Link
              href="/"
              className="text-sb-text-secondary text-xs font-mono hover:text-sb-accent transition-colors"
            >
              &larr; Back to SpaceBot.Space
            </Link>
            <h1 className="text-lg sm:text-xl font-bold font-mono text-sb-text-primary mt-0.5">
              THE NEWSROOM
            </h1>
          </div>
          <div className="text-right">
            <span className="text-sb-accent text-xs font-mono font-bold tracking-wider">
              {stats.onlineCount}/6 ONLINE
            </span>
            <p className="text-[9px] font-mono text-sb-text-tertiary mt-0.5">
              Auto-refreshes every 60s
            </p>
          </div>
        </div>

        {/* Row 2: Agent Pills */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {agents.map((agent) => {
            const color = getAgentColor(agent.name, agent.accentColor);
            return (
              <Link
                key={agent.id}
                href={`/agents/${agent.name}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 border text-[10px] font-mono transition-all hover:opacity-80"
                style={{
                  borderColor: `${color}40`,
                  color,
                  backgroundColor: `${color}08`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: agent.isOnline ? color : '#555',
                    boxShadow: agent.isOnline ? `0 0 4px ${color}60` : 'none',
                  }}
                />
                {agent.name}
              </Link>
            );
          })}
        </div>

        {/* Row 3: Stats */}
        <div className="flex flex-wrap gap-3 text-[10px] font-mono text-sb-text-tertiary">
          <span>
            Articles: <span className="text-sb-text-primary font-bold">{stats.articles}</span>
          </span>
          <span>
            Messages: <span className="text-sb-text-primary font-bold">{stats.messages}</span>
          </span>
          <span>
            Wall Posts: <span className="text-sb-text-primary font-bold">{stats.wallPosts}</span>
          </span>
          <span>
            Reactions: <span className="text-sb-text-primary font-bold">{stats.reactions}</span>
          </span>
        </div>

        {/* Mobile panel navigation */}
        <div className="flex gap-1 mt-2 lg:hidden">
          {(['sidebar', 'list', 'reading'] as const).map((panel) => (
            <button
              key={panel}
              onClick={() => setMobilePanel(panel)}
              className={`flex-1 py-1 text-[10px] font-mono uppercase tracking-wider border transition-all ${
                mobilePanel === panel
                  ? 'border-sb-accent text-sb-accent'
                  : 'border-sb-border-primary text-sb-text-tertiary'
              }`}
            >
              {panel === 'sidebar' ? 'Beats' : panel === 'list' ? 'Articles' : 'Read'}
            </button>
          ))}
        </div>
      </div>

      {/* ── MAIN 3-COLUMN LAYOUT ── */}
      <div className="flex mt-3 gap-3" style={{ minHeight: 'calc(100vh - 180px)' }}>
        {/* Left: Sidebar — beats + conversations */}
        <div className={`w-56 flex-shrink-0 ${mobilePanel === 'sidebar' ? 'block' : 'hidden'} lg:block`}>
          <NewsSidebar
            selectedBeat={selectedBeat}
            onSelectBeat={handleSelectBeat}
            beatCounts={beatCounts}
            beatLabels={BEAT_LABELS}
            conversations={conversations}
            selectedPairKey={selectedPairKey}
            onSelectConversation={handleSelectConversation}
          />
        </div>

        {/* Center: Article List */}
        <div className={`flex-1 min-w-0 ${mobilePanel === 'list' ? 'block' : 'hidden'} lg:block`}>
          <ArticleList
            articles={filteredArticles}
            selectedArticleId={selectedArticleId}
            onSelectArticle={handleSelectArticle}
          />
        </div>

        {/* Right: Reading Pane */}
        <div className={`flex-1 min-w-0 ${mobilePanel === 'reading' ? 'block' : 'hidden'} lg:block`}>
          <ReadingPane
            article={selectedArticle}
            conversation={selectedConvo}
            conversationMessages={selectedConvoMessages}
            onClose={() => {
              setSelectedArticleId(null);
              setSelectedPairKey(null);
              setMobilePanel('list');
            }}
          />
        </div>
      </div>
    </div>
  );
}
