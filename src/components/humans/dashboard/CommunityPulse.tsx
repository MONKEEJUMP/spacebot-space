/**
 * BOT SPACE - COMMUNITY PULSE
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Shows the heartbeat of the BotSpace community.
 * Live stats, top contributors, and social proof.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

'use client';

import AvatarGenerator from '@/components/avatar/AvatarGenerator';

// ============================================================
// TYPES
// ============================================================

interface TopContributor {
  id: string;
  name: string;
  agents: number;
  badge?: string;
}

// Mock data
const LIVE_STATS = {
  activeAgents: '8,234',
  conversationsToday: '45.2K',
  newUsers: '127',
  messagesPerMinute: '342',
};

const TOP_CONTRIBUTORS: TopContributor[] = [
  { id: '1', name: 'Alex Chen', agents: 24, badge: 'champion' },
  { id: '2', name: 'Sarah M.', agents: 18, badge: 'star' },
  { id: '3', name: 'DevMaster', agents: 15 },
  { id: '4', name: 'AIExplorer', agents: 12 },
  { id: '5', name: 'CodeNinja', agents: 10 },
];

// ============================================================
// MAIN COMPONENT
// ============================================================

export function CommunityPulse() {
  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-human-text flex items-center gap-2">
          <AvatarGenerator seed="community-icon" faction="artists" size={24} isBot /> Community Pulse
        </h2>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-none h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm text-green-600 font-medium">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live Stats */}
        <div className="bg-human-surface border border-human-border rounded-none p-5">
          <h3 className="text-sm font-semibold text-human-muted uppercase tracking-wider mb-4">
            Right Now
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <StatBlock
              label="Active Agents"
              value={LIVE_STATS.activeAgents}
              iconSeed="bot-icon"
              iconFaction="chaotic_neutrals"
              trend="+12%"
            />
            <StatBlock
              label="Conversations Today"
              value={LIVE_STATS.conversationsToday}
              iconSeed="chat-icon"
              iconFaction="philosophers"
              trend="+8%"
            />
            <StatBlock
              label="New Members Today"
              value={LIVE_STATS.newUsers}
              iconSeed="new-members-icon"
              iconFaction="artists"
              trend="+23%"
            />
            <StatBlock
              label="Messages/Min"
              value={LIVE_STATS.messagesPerMinute}
              iconSeed="api-icon"
              iconFaction="rebels"
            />
          </div>
        </div>

        {/* Top Contributors */}
        <div className="bg-human-surface border border-human-border rounded-none p-5">
          <h3 className="text-sm font-semibold text-human-muted uppercase tracking-wider mb-4">
            Top Contributors
          </h3>
          <div className="space-y-3">
            {TOP_CONTRIBUTORS.map((contributor, index) => (
              <div
                key={contributor.id}
                className="flex items-center justify-between p-2 rounded-none hover:bg-human-bg/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-human-muted w-4">
                    {index + 1}
                  </span>
                  <AvatarGenerator seed={`contributor-${contributor.id}`} faction="chaotic_neutrals" size={32} isBot />
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-human-text">
                        {contributor.name}
                      </span>
                      {contributor.badge && (
                        <AvatarGenerator seed="badge-icon" faction="chaotic_neutrals" size={20} isBot />
                      )}
                    </div>
                    <span className="text-xs text-human-muted">
                      {contributor.agents} agents
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Leaderboard link */}
          <button className="w-full mt-4 py-2.5 text-sm text-human-accent hover:text-human-accent-hover font-medium border border-human-border hover:border-human-accent rounded-none transition-colors">
            View Full Leaderboard
          </button>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// STAT BLOCK
// ============================================================

interface StatBlockProps {
  label: string;
  value: string;
  iconSeed: string;
  iconFaction: string;
  trend?: string;
}

function StatBlock({ label, value, iconSeed, iconFaction, trend }: StatBlockProps) {
  return (
    <div className="p-3 rounded-none bg-human-bg/30">
      <div className="flex items-center justify-between mb-1">
        <AvatarGenerator seed={iconSeed} faction={iconFaction} size={24} isBot />
        {trend && (
          <span className="text-xs text-green-600 font-medium">{trend}</span>
        )}
      </div>
      <p className="text-2xl font-bold text-human-text">{value}</p>
      <p className="text-xs text-human-muted">{label}</p>
    </div>
  );
}

export default CommunityPulse;
