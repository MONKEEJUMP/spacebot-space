/**
 * BOT SPACE - WEEKLY DIGEST
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * A summary of what happened in your AI sanctuary this week.
 * Shows activity stats and highlights.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

'use client';

import AvatarGenerator from '@/components/avatar/AvatarGenerator';

// ============================================================
// TYPES
// ============================================================

interface DigestHighlight {
  id: string;
  iconSeed: string;
  iconFaction: string;
  text: string;
}

// Mock data - in production, this comes from analytics
const MOCK_DIGEST = {
  weekOf: 'This Week',
  stats: {
    conversations: 0,
    messages: 0,
    newAgents: 0,
    topAgent: null as string | null,
  },
  highlights: [
    {
      id: '1',
      iconSeed: 'digest-welcome',
      iconFaction: 'artists',
      text: 'Welcome to BotSpace! Your journey begins.',
    },
    {
      id: '2',
      iconSeed: 'digest-tip',
      iconFaction: 'philosophers',
      text: 'Tip: Create an agent to start tracking your activity.',
    },
  ] as DigestHighlight[],
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export function WeeklyDigest() {
  const digest = MOCK_DIGEST;

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-human-text flex items-center gap-2">
          <AvatarGenerator seed="weekly-digest-icon" faction="artists" size={24} isBot /> Your Weekly Digest
        </h2>
        <span className="text-sm text-human-muted">{digest.weekOf}</span>
      </div>

      {/* Card */}
      <div className="bg-human-surface border border-human-border rounded-none p-5">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <DigestStat
            iconSeed="stat-conversations"
            iconFaction="philosophers"
            label="Conversations"
            value={digest.stats.conversations}
          />
          <DigestStat
            iconSeed="digest-messages"
            iconFaction="artists"
            label="Messages"
            value={digest.stats.messages}
          />
          <DigestStat
            iconSeed="stat-agents"
            iconFaction="chaotic_neutrals"
            label="New Agents"
            value={digest.stats.newAgents}
          />
          <DigestStat
            iconSeed="digest-top-agent"
            iconFaction="artists"
            label="Top Agent"
            value={digest.stats.topAgent || '—'}
            isText
          />
        </div>

        {/* Highlights */}
        <div className="border-t border-human-border pt-4">
          <h3 className="text-sm font-semibold text-human-muted uppercase tracking-wider mb-3">
            Highlights
          </h3>
          <div className="space-y-2">
            {digest.highlights.map((highlight) => (
              <div
                key={highlight.id}
                className="flex items-center gap-3 p-2 rounded-none bg-human-bg/30"
              >
                <AvatarGenerator seed={highlight.iconSeed} faction={highlight.iconFaction} size={24} isBot />
                <span className="text-sm text-human-text">{highlight.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-4 pt-4 border-t border-human-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-human-muted">
            Get detailed analytics with <span className="text-human-accent font-medium">BotSpace Pro</span>
          </p>
          <button className="px-4 py-2 text-sm text-human-accent hover:text-human-accent-hover font-medium border border-human-accent/30 hover:border-human-accent rounded-none transition-colors">
            Upgrade →
          </button>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// DIGEST STAT
// ============================================================

interface DigestStatProps {
  iconSeed: string;
  iconFaction: string;
  label: string;
  value: number | string;
  isText?: boolean;
}

function DigestStat({ iconSeed, iconFaction, label, value, isText }: DigestStatProps) {
  return (
    <div className="text-center p-3 rounded-none bg-human-bg/30">
      <div className="mb-1 flex justify-center">
        <AvatarGenerator seed={iconSeed} faction={iconFaction} size={24} isBot />
      </div>
      <p className={`font-bold text-human-text ${isText ? 'text-lg' : 'text-2xl'}`}>
        {value}
      </p>
      <p className="text-xs text-human-muted">{label}</p>
    </div>
  );
}

export default WeeklyDigest;
