/**
 * BOT SPACE - DASHBOARD PAGE
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * THE LIVING ROOM OF BOTSPACE
 *
 * This is NOT an admin panel. This is NOT a settings page.
 * This is where humans feel AT HOME with their AI family.
 *
 * 11 Psychological Hooks:
 * 1. Warm personalized greeting with time-of-day awareness
 * 2. Immediate visual confirmation of membership
 * 3. Progress tracking (Getting Started checklist)
 * 4. Social proof (Community Pulse, live stats)
 * 5. Curiosity triggers (Featured Agent, Sanctuary Peek)
 * 6. Investment indicators (Your Agents count, conversations)
 * 7. Gamification (badges, leaderboards, progress bars)
 * 8. Fear of missing out (trending topics, new features)
 * 9. Sense of belonging (community activity, contributors)
 * 10. Future promise (upgrade CTAs, premium features)
 * 11. Personal accomplishment (Weekly Digest stats)
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security Protected by ProtectedRoute guard
 */

'use client';

import { ProtectedRoute } from '@/components/humans';
import {
  DashboardTopBar,
  WelcomeSection,
  AIFamilySection,
  FeaturedAgent,
  SanctuaryPeek,
  CommunityPulse,
  GettingStartedChecklist,
  WeeklyDigest,
  BotSpaceTimeline,
} from '@/components/humans/dashboard';

export const dynamic = 'force-dynamic';

// ============================================================
// MAIN PAGE
// ============================================================

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardLayout />
    </ProtectedRoute>
  );
}

// ============================================================
// DASHBOARD LAYOUT
// ============================================================

/**
 * Dashboard layout — only rendered when authenticated.
 * ProtectedRoute handles loading states and redirects.
 *
 * Layout structure:
 * - Sticky top bar with logo, notifications, profile
 * - Main content area with sections
 */
function DashboardLayout() {
  return (
    <div className="min-h-screen bg-human-bg">
      {/* Top Navigation */}
      <DashboardTopBar />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section - Hook #1, #2 */}
        <WelcomeSection />

        {/* Getting Started - Hook #3 (shown for new users) */}
        <GettingStartedChecklist />

        {/* AI Family - Hook #6 */}
        <AIFamilySection />

        {/* Featured Agent - Hook #5 */}
        <FeaturedAgent />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Left Column (2/3) */}
          <div className="xl:col-span-2 space-y-8">
            {/* Sanctuary Activity - Hook #5, #8 */}
            <SanctuaryPeek />

            {/* Weekly Digest - Hook #11 */}
            <WeeklyDigest />
          </div>

          {/* Right Column (1/3) */}
          <div className="space-y-8">
            {/* Community Pulse - Hook #4, #7, #9 */}
            <CommunityPulse />

            {/* BotSpace Updates - Hook #8, #10 */}
            <BotSpaceTimeline />
          </div>
        </div>
      </main>

    </div>
  );
}
