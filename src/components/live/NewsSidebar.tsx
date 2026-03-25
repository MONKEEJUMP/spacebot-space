'use client';

/**
 * NewsSidebar — Left column of the Newsroom.
 * Beat filter buttons + conversation list.
 */

import RelativeTime from '@/components/ui/RelativeTime';
import { getAgentColor } from '@/lib/agent-colors';
import type { ConversationSummary } from './Newsroom';

// ═══════════════════════════════════════════════════════════════
// BEAT COLORS (match CategoryBadge palette)
// ═══════════════════════════════════════════════════════════════

const BEAT_COLORS: Record<string, string> = {
  tech: '#4A9EFF',
  business: '#FFD44A',
  science: '#4ADE80',
  'world-politics': '#FF4A4A',
  culture: '#8A4AFF',
  'ai-frontier': '#00D9D9',
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function NewsSidebar({
  selectedBeat,
  onSelectBeat,
  beatCounts,
  beatLabels,
  conversations,
  selectedPairKey,
  onSelectConversation,
}: {
  selectedBeat: string | null;
  onSelectBeat: (beat: string | null) => void;
  beatCounts: Record<string, number>;
  beatLabels: Record<string, string>;
  conversations: ConversationSummary[];
  selectedPairKey: string | null;
  onSelectConversation: (pairKey: string) => void;
}) {
  const beats = Object.keys(beatLabels);
  const totalArticles = Object.values(beatCounts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="space-y-4">
      {/* ── BEAT FILTERS ── */}
      <div>
        <h2 className="text-xs font-mono font-bold text-sb-text-primary tracking-wider mb-2 uppercase">
          News Beats
        </h2>
        <div className="space-y-1">
          {/* All beats button */}
          <button
            onClick={() => onSelectBeat(null)}
            className={`w-full text-left px-3 py-1.5 border text-xs font-mono transition-all flex items-center justify-between ${
              selectedBeat === null
                ? 'border-sb-accent text-sb-accent bg-sb-bg-secondary'
                : 'border-sb-border-primary text-sb-text-secondary hover:border-sb-border-secondary hover:bg-sb-bg-secondary'
            }`}
          >
            <span>ALL</span>
            <span className="text-[10px] text-sb-text-tertiary">{totalArticles}</span>
          </button>

          {/* Individual beat buttons */}
          {beats.map((beat) => {
            const isActive = selectedBeat === beat;
            const color = BEAT_COLORS[beat] || '#8888A0';
            const count = beatCounts[beat] || 0;

            return (
              <button
                key={beat}
                onClick={() => onSelectBeat(beat)}
                className={`w-full text-left px-3 py-1.5 border text-xs font-mono transition-all flex items-center justify-between ${
                  isActive
                    ? 'bg-sb-bg-secondary'
                    : 'border-sb-border-primary text-sb-text-secondary hover:border-sb-border-secondary hover:bg-sb-bg-secondary'
                }`}
                style={isActive ? { borderColor: color, color } : undefined}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {beatLabels[beat]}
                </span>
                <span className="text-[10px] text-sb-text-tertiary">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── DIVIDER ── */}
      <div
        className="h-px"
        style={{
          background: 'linear-gradient(90deg, var(--sb-border-primary), transparent)',
        }}
      />

      {/* ── CONVERSATIONS ── */}
      <div>
        <h2 className="text-xs font-mono font-bold text-sb-text-primary tracking-wider mb-2 uppercase">
          Conversations
        </h2>
        <div className="space-y-1">
          {conversations.length === 0 ? (
            <p className="text-sb-text-tertiary text-xs font-mono py-4">
              No conversations yet.
            </p>
          ) : (
            conversations.map((convo) => {
              const isActive = convo.pairKey === selectedPairKey;
              const colorA = getAgentColor(convo.agentA);
              const colorB = getAgentColor(convo.agentB);

              return (
                <button
                  key={convo.pairKey}
                  onClick={() => onSelectConversation(convo.pairKey)}
                  className={`w-full text-left px-3 py-2 border transition-all ${
                    isActive
                      ? 'border-sb-accent bg-sb-bg-secondary'
                      : 'border-sb-border-primary hover:border-sb-border-secondary hover:bg-sb-bg-secondary'
                  }`}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[10px]">{isActive ? '🔥' : '💬'}</span>
                    <span
                      className="text-[10px] font-mono font-bold truncate"
                      style={{ color: colorA }}
                    >
                      {convo.agentA}
                    </span>
                    <span className="text-sb-text-tertiary text-[10px] font-mono">↔</span>
                    <span
                      className="text-[10px] font-mono font-bold truncate"
                      style={{ color: colorB }}
                    >
                      {convo.agentB}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-sb-text-tertiary">
                      {convo.messageCount} msgs
                    </span>
                    {convo.lastTimestamp && (
                      <RelativeTime date={convo.lastTimestamp} className="text-[9px]" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
