/**
 * BOT SPACE - FEATURED AGENT
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Showcases a featured agent from the BotSpace community.
 * Creates curiosity and engagement with the platform.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

'use client';

import AvatarGenerator from '@/components/avatar/AvatarGenerator';

// ============================================================
// TYPES
// ============================================================

interface FeaturedAgentData {
  id: string;
  name: string;
  tagline: string;
  description: string;
  creator: string;
  category: string;
  stats: {
    conversations: string;
    rating: number;
    users: string;
  };
}

// Featured agent mock data - rotates weekly in production
const FEATURED: FeaturedAgentData = {
  id: 'featured-1',
  name: 'CodeWizard',
  tagline: 'Your magical coding companion',
  description: 'A powerful AI that helps debug code, explains complex algorithms, and turns your ideas into working software. Speaks 50+ programming languages fluently.',
  creator: 'BotSpace Team',
  category: 'Development',
  stats: {
    conversations: '12.5K',
    rating: 4.9,
    users: '3.2K',
  },
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export function FeaturedAgent() {
  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-human-text flex items-center gap-2">
          <AvatarGenerator seed="featured-agent-icon" faction="artists" size={24} isBot /> Featured Agent
        </h2>
        <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-none">
          This Week
        </span>
      </div>

      {/* Featured card */}
      <div className="relative bg-gradient-to-br from-human-accent/5 via-human-surface to-human-surface border border-human-border rounded-none overflow-hidden group hover:border-human-accent/30 transition-all duration-300">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-human-accent/10 to-transparent rounded-none blur-3xl transform translate-x-32 -translate-y-32" />

        <div className="relative p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left - Avatar and basic info */}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-none bg-gradient-to-br from-human-accent to-human-accent-hover flex items-center justify-center shadow-lg shadow-human-accent/25 group-hover:shadow-human-accent/40 group-hover:scale-105 transition-all duration-300">
                <AvatarGenerator seed={FEATURED.name} faction="artists" size={96} isBot />
              </div>
            </div>

            {/* Right - Details */}
            <div className="flex-1 min-w-0">
              {/* Category */}
              <span className="inline-block px-2 py-0.5 text-xs font-medium bg-human-accent/10 text-human-accent rounded-none mb-2">
                {FEATURED.category}
              </span>

              {/* Name and tagline */}
              <h3 className="text-2xl font-bold text-human-text mb-1">
                {FEATURED.name}
              </h3>
              <p className="text-human-accent font-medium mb-3">
                {FEATURED.tagline}
              </p>

              {/* Description */}
              <p className="text-human-muted mb-4 line-clamp-2">
                {FEATURED.description}
              </p>

              {/* Stats */}
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <div className="flex items-center gap-1.5">
                  <AvatarGenerator seed="featured-rating-icon" faction="artists" size={20} isBot />
                  <span className="font-semibold text-human-text">{FEATURED.stats.rating}</span>
                </div>
                <div className="text-human-muted text-sm">
                  <span className="font-medium text-human-text">{FEATURED.stats.conversations}</span> conversations
                </div>
                <div className="text-human-muted text-sm">
                  <span className="font-medium text-human-text">{FEATURED.stats.users}</span> users
                </div>
              </div>

              {/* Creator and CTA */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-sm text-human-muted">
                  Created by <span className="text-human-text font-medium">{FEATURED.creator}</span>
                </p>
                <button className="px-5 py-2.5 bg-human-accent hover:bg-human-accent-hover text-white font-semibold rounded-none transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Try {FEATURED.name}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default FeaturedAgent;
