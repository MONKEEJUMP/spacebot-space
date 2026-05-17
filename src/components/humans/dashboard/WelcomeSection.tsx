/**
 * BOT SPACE - WELCOME SECTION
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * The warm, personalized greeting at the top of the dashboard.
 * Uses time-of-day greetings and shows membership duration.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

'use client';

import Link from 'next/link';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import type { CustomAvatarConfig } from '@/components/avatar/avatarConfig';
import { useHumanAuth } from '@/providers/HumanAuthProvider';

// ============================================================
// HELPERS
// ============================================================

/**
 * Get time-of-day greeting
 */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

/**
 * Calculate membership duration
 */
function getMembershipDuration(createdAt: string | Date | undefined): string {
  if (!createdAt) return 'New member';

  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Joined today';
  if (diffDays === 1) return 'Member for 1 day';
  if (diffDays < 7) return `Member for ${diffDays} days`;
  if (diffDays < 30) return `Member for ${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''}`;
  if (diffDays < 365) return `Member for ${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''}`;
  return `Member for ${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''}`;
}

/**
 * Get a random motivational quote
 */
function getMotivationalQuote(): { text: string; author: string } {
  const quotes = [
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
    { text: "AI is not about replacing humans, it's about amplifying human potential.", author: "BotSpace Philosophy" },
    { text: "Every agent you create is a reflection of your imagination.", author: "BotSpace Community" },
    { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
    { text: "Your AI family is ready to help you build something amazing.", author: "BotSpace" },
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

function toCustomAvatarConfig(avatarConfig: Record<string, unknown> | null | undefined): CustomAvatarConfig | undefined {
  if (!avatarConfig) {
    return undefined;
  }

  const accessoriesRaw = avatarConfig.selectedAccessories;
  const accessories = Array.isArray(accessoriesRaw)
    ? accessoriesRaw.filter((item): item is string => typeof item === 'string')
    : [];

  const customHex = typeof avatarConfig.customHex === 'string' ? avatarConfig.customHex : undefined;
  const bodyType = typeof avatarConfig.bodyType === 'string' ? avatarConfig.bodyType : 'box';
  const eyeType = typeof avatarConfig.eyeType === 'string' ? avatarConfig.eyeType : 'round_wide';
  const mouthType = typeof avatarConfig.mouthType === 'string' ? avatarConfig.mouthType : 'data_display';
  const animationType = typeof avatarConfig.animationType === 'string' ? avatarConfig.animationType : 'drift';

  return {
    bodyType,
    eyeType,
    mouthType,
    colorPrimary: customHex || '#7B33FF',
    colorDark: '#000000',
    colorLight: '#ffffff',
    accessories,
    animationType,
  };
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function WelcomeSection() {
  const { human } = useHumanAuth();
  const customAvatarConfig = toCustomAvatarConfig(human?.avatarConfig);
  const hasAvatar = Boolean(customAvatarConfig);
  const greeting = getGreeting();
  const membershipDuration = getMembershipDuration(human?.createdAt);
  const quote = getMotivationalQuote();

  // Get first name
  const firstName = human?.name?.split(' ')[0] || 'Friend';

  return (
    <section className="mb-8">
      <style>{`
        @keyframes avatar-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(0, 255, 0, 0.3); }
          50% { box-shadow: 0 0 40px rgba(0, 255, 0, 0.6), 0 0 60px rgba(0, 255, 0, 0.2); }
        }
      `}</style>

      {/* AVATAR CTA — Dead center, above greeting */}
      <div className="mb-8 flex flex-col items-center">
        <div
          className="mb-4 border-2 border-human-accent p-1"
          style={{
            boxShadow: '0 0 20px rgba(0, 255, 0, 0.3), inset 0 0 20px rgba(0, 255, 0, 0.1)',
            animation: hasAvatar ? 'none' : 'avatar-pulse 2s ease-in-out infinite',
          }}
        >
          {hasAvatar ? (
            <AvatarGenerator
              seed={human?.name || 'human'}
              faction="cyber"
              isBot={false}
              size={120}
              customConfig={customAvatarConfig}
            />
          ) : (
            <div className="w-[120px] h-[120px] bg-human-surface flex items-center justify-center">
              <span className="text-human-accent text-4xl font-mono">?</span>
            </div>
          )}
        </div>

        <Link href="/peoplespace/build-avatar" className="group">
          <div
            className="border border-human-accent px-8 py-4 text-center transition-all duration-300 hover:bg-human-accent/10"
            style={{ boxShadow: '0 0 15px rgba(0, 255, 0, 0.2)' }}
          >
            <span className="text-human-accent font-mono text-lg tracking-wider">
              {hasAvatar ? '[ CUSTOMIZE YOUR AVATAR ]' : '[ CREATE YOUR AVATAR ]'}
            </span>
            <p className="text-human-muted font-mono text-sm mt-1">
              {hasAvatar ? 'Update your look' : 'Design your identity in the Sanctuary'}
            </p>
          </div>
        </Link>
      </div>

      {/* Main greeting card */}
      <div className="bg-gradient-to-br from-human-accent/10 via-human-surface to-human-surface border border-human-border rounded-none p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Left side - Greeting */}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-human-text mb-2">
              {greeting}, {firstName}!
            </h1>
            <p className="text-human-muted">
              Welcome back to your AI sanctuary.{' '}
              <span className="text-human-accent">{membershipDuration}</span>
            </p>
          </div>

          {/* Right side - Quick action */}
          <div className="flex-shrink-0">
            <button className="w-full md:w-auto px-6 py-3 bg-human-accent hover:bg-human-accent-hover text-white font-semibold rounded-none transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-human-accent/25 hover:shadow-human-accent/40 hover:scale-105">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Agent
            </button>
          </div>
        </div>

        {/* Motivational quote */}
        <div className="mt-6 pt-6 border-t border-human-border/50">
          <p className="text-human-muted italic text-sm">
            "{quote.text}"
          </p>
          <p className="text-human-accent text-xs mt-1">— {quote.author}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <StatCard
          iconSeed="stat-agents"
          iconFaction="cyber"
          label="Your Agents"
          value="0"
          subtext="Create your first"
        />
        <StatCard
          iconSeed="stat-conversations"
          iconFaction="neural"
          label="Conversations"
          value="0"
          subtext="Start chatting"
        />
        <StatCard
          iconSeed="stat-rank"
          iconFaction="quantum"
          label="Community Rank"
          value="#-"
          subtext="Join the community"
        />
        <StatCard
          iconSeed="stat-api"
          iconFaction="void"
          label="API Calls"
          value="0"
          subtext="This month"
        />
      </div>
    </section>
  );
}

// ============================================================
// STAT CARD
// ============================================================

interface StatCardProps {
  iconSeed: string;
  iconFaction: string;
  label: string;
  value: string;
  subtext: string;
}

function StatCard({ iconSeed, iconFaction, label, value, subtext }: Readonly<StatCardProps>) {
  return (
    <div className="bg-human-surface border border-human-border rounded-none p-4 hover:border-human-accent/30 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <AvatarGenerator seed={iconSeed} faction={iconFaction} size={28} />
        <span className="text-sm text-human-muted">{label}</span>
      </div>
      <p className="text-2xl font-bold text-human-text">{value}</p>
      <p className="text-xs text-human-muted mt-1">{subtext}</p>
    </div>
  );
}

export default WelcomeSection;
