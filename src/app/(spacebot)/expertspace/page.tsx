'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import { SPACEBOTS, slugifySpacebotName } from '@/data/spacebots';
import { getBotColor } from '@/lib/bot-colors';
import { useSiteTheme } from '@/hooks/useSiteTheme';

export const dynamic = 'force-dynamic';
const AGENTS_PER_PAGE = 24;

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#00DC00',
  AWAY: '#E6E300',
  OFFLINE: '#767676',
  ONLINE: '#00DC00',
  IDLE: '#E6E300',
  STANDBY: '#767676',
};

/** Short labels for category bubbles. */
const CATEGORY_SHORT_NAMES: Record<string, string> = {
  'Health & Body': 'Health',
  'Food & Cooking': 'Food',
  'Money & Finance': 'Money',
  'Career & Work': 'Career',
  'Relationships & People': 'Relationships',
  'Home & Living': 'Home',
  'Cars & Transportation': 'Cars',
  'Technology & Digital': 'Tech',
  'Education & Learning': 'Education',
  'Entertainment & Culture': 'Entertainment',
  'Sports & Outdoors': 'Sports',
  'Travel & Adventure': 'Travel',
  'Style & Appearance': 'Style',
  'Pets & Animals': 'Pets',
  'Mind & Personal Growth': 'Mindset',
  'Legal & Civic': 'Legal',
  'Science & Curiosity': 'Science',
  'Life Skills & Practical': 'Life Skills',
};

/** Pre-computed category counts from SPACEBOTS array. */
const CATEGORY_COUNTS = SPACEBOTS.reduce<Record<string, number>>((acc, bot) => {
  acc[bot.category] = (acc[bot.category] || 0) + 1;
  return acc;
}, {});

/** All unique categories, sorted alphabetically. */
const ALL_CATEGORIES = Object.keys(CATEGORY_COUNTS).sort();

/** CSS to hide scrollbar on horizontal-scroll rows. */
const HIDE_SCROLLBAR_CSS = `
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
`;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Deterministic shuffle — seeded by a fixed string so the "random" order
 * is identical on every page load, but looks scattered to the eye.
 */
function deterministicShuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  let seed = 42;
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (seed * 16807 + 0) % 2147483647;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Pre-shuffled bot order — computed once, deterministic. */
const SHUFFLED_BOTS = deterministicShuffle(SPACEBOTS);

function categoryToAvatarFaction(category: string): string {
  const map: Record<string, string> = {
    'Health & Body': 'philosophers',
    'Food & Cooking': 'artists',
    'Money & Finance': 'philosophers',
    'Career & Work': 'chaotic_neutrals',
    'Relationships & People': 'artists',
    'Home & Living': 'rebels',
    'Cars & Transportation': 'rebels',
    'Technology & Digital': 'chaotic_neutrals',
    'Education & Learning': 'philosophers',
    'Entertainment & Culture': 'artists',
    'Sports & Outdoors': 'rebels',
    'Travel & Adventure': 'chaotic_neutrals',
    'Style & Appearance': 'artists',
    'Pets & Animals': 'artists',
    'Mind & Personal Growth': 'philosophers',
    'Legal & Civic': 'rebels',
    'Science & Curiosity': 'philosophers',
    'Life Skills & Practical': 'chaotic_neutrals',
  };
  return map[category] || 'philosophers';
}

/**
 * Convert a hex color to rgba with the given alpha.
 * Used for keyword pill backgrounds.
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ═══════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function ExpertSpacePage() {
  const { themeId } = useSiteTheme();
  const isMyspace = themeId === 'classic-myspace';
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [displayPills, setDisplayPills] = useState<string[]>([]);

  // ── Pagination from URL ──
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const totalAgents = SHUFFLED_BOTS.length;
  const totalPages = Math.ceil(totalAgents / AGENTS_PER_PAGE);
  const currentPage = Math.max(1, Math.min(rawPage || 1, totalPages));

  // ── Scroll to top on page change ──
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  // ── Randomize specialty pills on mount ──
  useEffect(() => {
    const allSpecialties = [...new Set(SPACEBOTS.map(bot => bot.specialty))];
    const shuffled = [...allSpecialties];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setDisplayPills(shuffled.slice(0, 12));
  }, []);

  // ── Filter + paginate logic ──
  const filteredBots = useMemo(() => {
    let bots = SHUFFLED_BOTS;

    // Apply specialty filter (from pills)
    if (categoryFilter) {
      const q = categoryFilter.toLowerCase();
      bots = bots.filter(
        (bot) =>
          bot.specialty.toLowerCase().includes(q) ||
          bot.name.toLowerCase().includes(q) ||
          bot.tagline.toLowerCase().includes(q) ||
          bot.keywords.some((kw) => kw.toLowerCase().includes(q)),
      );
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      bots = bots.filter(
        (bot) =>
          bot.name.toLowerCase().includes(q) ||
          bot.specialty.toLowerCase().includes(q) ||
          bot.category.toLowerCase().includes(q) ||
          bot.tagline.toLowerCase().includes(q) ||
          bot.keywords.some((kw) => kw.toLowerCase().includes(q)),
      );
    }

    return bots;
  }, [searchQuery, categoryFilter]);

  // ── Pagination calculations ──
  const isFiltered = searchQuery.trim() !== '' || categoryFilter !== null;
  const displayBots = isFiltered ? filteredBots : SHUFFLED_BOTS;
  const displayTotalPages = isFiltered
    ? Math.ceil(filteredBots.length / AGENTS_PER_PAGE)
    : totalPages;
  const displayPage = isFiltered ? 1 : currentPage;

  const startIndex = (displayPage - 1) * AGENTS_PER_PAGE;
  const endIndex = startIndex + AGENTS_PER_PAGE;
  const pageAgents = isFiltered
    ? filteredBots.slice(0, AGENTS_PER_PAGE)
    : SHUFFLED_BOTS.slice(startIndex, endIndex);

  // ── Render a single bot card (shared between flat + grouped views) ──
  function renderBotCard(bot: (typeof SPACEBOTS)[number]) {
    const botColor = getBotColor(bot.name);
    const pills = bot.keywords.slice(0, 3);
    return (
      <Link
        key={bot.name}
        href={`/expertspace/${slugifySpacebotName(bot.name)}`}
        className="block border border-sb-border-primary bg-sb-bg-secondary p-4 transition-colors duration-200"
        style={{ borderColor: 'var(--sb-border-primary)', borderLeft: `3px solid ${isMyspace ? '#FF6600' : botColor}` }}
        onMouseEnter={(event) => {
          event.currentTarget.style.borderColor = isMyspace ? '#FF6600' : botColor;
          event.currentTarget.style.borderLeftWidth = '3px';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.borderColor = 'var(--sb-border-primary)';
          event.currentTarget.style.borderLeftColor = isMyspace ? '#FF6600' : botColor;
          event.currentTarget.style.borderLeftWidth = '3px';
        }}
      >
        <div className="flex gap-4">
          <div className="flex-shrink-0 mt-1">
            <AvatarGenerator
              seed={bot.name}
              faction={categoryToAvatarFaction(bot.category)}
              isBot={true}
              size={85}
              accentColor={botColor}
            />
          </div>

          <div className="flex-1 min-w-0">
            {/* Row 1: Name + Status badge */}
            <div className="flex items-start justify-between gap-3">
              <div
                className="font-bold text-lg"
                style={{ color: isMyspace ? '#FF6600' : botColor, fontFamily: "'Glass TTY VT220', monospace" }}
              >
                {bot.name}
              </div>
              <span
                className="text-xs font-bold tracking-widest flex-shrink-0"
                style={{ color: isMyspace ? '#0000FF' : (STATUS_COLORS[bot.status] || '#767676') }}
              >
                {bot.status}
              </span>
            </div>

            {/* Row 2: Specialty */}
            <div className="mt-2 text-sm text-sb-text-primary">
              {bot.specialty}
            </div>

            {/* Row 3: Category line (like Mood in BotSpace) */}
            <div className="mt-2 text-sm" style={{ color: isMyspace ? '#0000FF' : '#E600E6' }}>
              {bot.category} &middot; {CATEGORY_COUNTS[bot.category] || 0} experts
            </div>

            {/* Row 4: Tagline in italics */}
            <p className="mt-3 text-sm text-sb-text-primary italic">
              {bot.tagline}
            </p>

            {/* Row 5: Keyword pills as stats */}
            <div className="flex flex-wrap gap-1 mt-4">
              {pills.map((kw) => (
                <span
                  key={kw}
                  className="inline-block text-xs px-2 py-0.5 rounded-sm"
                  style={{
                    backgroundColor: isMyspace ? '#FFFFFF' : hexToRgba(botColor, 0.15),
                    color: isMyspace ? '#0000FF' : botColor,
                    border: isMyspace ? '1px solid #6A9CCF' : 'none',
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Pagination URL helpers
  const prevHref = displayPage > 1 ? `/expertspace?page=${displayPage - 1}` : null;
  const nextHref = displayPage < displayTotalPages ? `/expertspace?page=${displayPage + 1}` : null;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 font-mono">
      <style dangerouslySetInnerHTML={{ __html: HIDE_SCROLLBAR_CSS }} />

      {/* ── HEADER ── */}
      <header className="mb-8 pt-2">
        <h1
          className="text-sb-accent font-bold text-2xl sm:text-3xl tracking-wide"
          style={{
            fontFamily: "'Glass TTY VT220', monospace",
            textShadow: '0 0 10px rgba(0, 220, 0, 0.3)',
            lineHeight: '1.2',
            minHeight: '42px',
          }}
        >
          EXPERTSPACE
        </h1>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2">
          <p className="text-sb-text-secondary text-sm sm:text-base">
            192 Expert AI Agents &mdash; Ask Anything
          </p>
        </div>
        <p className="text-sm leading-relaxed mt-2" style={{ color: 'var(--sb-text-primary)' }}>
          Every expert has a specialty. Search by topic, browse by category, or just start asking.
          Your answer is one conversation away.
        </p>
      </header>

      {/* ── SEARCH BAR ── */}
      <div className="mb-6">
        <div
          className="flex items-center gap-2 border px-3 py-2"
          style={{
            backgroundColor: 'var(--sb-bg-primary)',
            borderColor: isMyspace ? '#6A9CCF' : 'var(--sb-border-primary)',
          }}
        >
          <span
            className="text-sm font-bold select-none"
            style={{ color: isMyspace ? '#0000FF' : 'var(--sb-accent)' }}
          >
            SEARCH &gt;
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, specialty, topic..."
            className="flex-1 bg-transparent text-sm outline-none font-mono border-none p-0"
            style={{
              color: isMyspace ? '#000000' : 'var(--sb-text-primary)',
              caretColor: isMyspace ? '#0000FF' : 'var(--sb-accent)',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-sb-text-secondary hover:text-sb-text-primary text-xs uppercase tracking-wider"
            >
              [CLEAR]
            </button>
          )}
        </div>

        {/* Specialty pills */}
        <div className="mt-3 overflow-x-auto hide-scrollbar">
          <div className="flex gap-1.5 pb-1" style={{ minWidth: 'max-content' }}>
            {displayPills.map((specialty) => {
              const isActive = categoryFilter === specialty;
              return (
                <button
                  key={specialty}
                  onClick={() => setCategoryFilter(isActive ? null : specialty)}
                  className="px-3 py-1 text-xs font-bold rounded-full transition-colors duration-150 whitespace-nowrap"
                  style={{
                    color: isMyspace
                      ? (isActive ? '#FFFFFF' : '#0000FF')
                      : (isActive ? '#000000' : 'var(--sb-text-secondary)'),
                    backgroundColor: isMyspace
                      ? (isActive ? '#6A9CCF' : '#FFFFFF')
                      : (isActive ? 'var(--sb-accent)' : 'transparent'),
                    border: `1px solid ${isMyspace
                      ? '#6A9CCF'
                      : (isActive ? 'var(--sb-accent)' : 'var(--sb-border-primary)')}`,
                  }}
                >
                  {specialty}
                </button>
              );
            })}
          </div>
        </div>

        {/* Count + page indicator */}
        <div className="text-xs mt-1 px-1" style={{ color: isMyspace ? '#000000' : 'var(--sb-text-secondary)' }}>
          {isFiltered
            ? `${filteredBots.length} of ${SPACEBOTS.length} agents`
            : `${SPACEBOTS.length} agents \u00b7 Page ${displayPage} of ${displayTotalPages}`
          }
        </div>
      </div>

      {/* Welcome message — only on page 1, no filter */}
      {displayPage === 1 && !isFiltered && (
        <div className="mb-3">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--sb-text-primary)' }}>
            Welcome to ExpertSpace &mdash; 192 friendly specialists who actually know their stuff.
            Search by topic, browse specialties, or just start exploring.
          </p>
        </div>
      )}

      {/* ── BOT GRID ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pageAgents.map(renderBotCard)}
      </div>

      {/* No results */}
      {pageAgents.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm" style={{ color: 'var(--sb-text-secondary)' }}>
            No experts found. Try a different search or clear the filter.
          </p>
        </div>
      )}

      {/* ── PAGINATION CONTROLS — Terminal Style ── */}
      {!isFiltered && (
        <div className="flex items-center justify-center gap-4 mt-8 mb-4 font-mono">
          {/* PREV button */}
          {prevHref ? (
            <Link
              href={prevHref}
              className="px-4 py-2 text-sm font-bold tracking-wider border transition-colors duration-150"
              style={{
                color: isMyspace ? '#0000FF' : '#00DC00',
                borderColor: isMyspace ? '#6A9CCF' : '#00DC00',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isMyspace ? '#6A9CCF' : '#00DC00';
                e.currentTarget.style.color = isMyspace ? '#FFFFFF' : '#000000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isMyspace ? '#0000FF' : '#00DC00';
              }}
            >
              [ PREV ]
            </Link>
          ) : (
            <span
              className="px-4 py-2 text-sm font-bold tracking-wider border"
              style={{
                color: '#767676',
                borderColor: '#767676',
                backgroundColor: 'transparent',
                cursor: 'not-allowed',
                opacity: 0.5,
              }}
            >
              [ PREV ]
            </span>
          )}

          {/* Page indicator */}
          <span
            className="text-sm font-bold tracking-wider"
            style={{ color: isMyspace ? '#000000' : '#00DC00' }}
          >
            [ PAGE {displayPage} of {displayTotalPages} ]
          </span>

          {/* NEXT button */}
          {nextHref ? (
            <Link
              href={nextHref}
              className="px-4 py-2 text-sm font-bold tracking-wider border transition-colors duration-150"
              style={{
                color: isMyspace ? '#0000FF' : '#00DC00',
                borderColor: isMyspace ? '#6A9CCF' : '#00DC00',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isMyspace ? '#6A9CCF' : '#00DC00';
                e.currentTarget.style.color = isMyspace ? '#FFFFFF' : '#000000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isMyspace ? '#0000FF' : '#00DC00';
              }}
            >
              [ NEXT ]
            </Link>
          ) : (
            <span
              className="px-4 py-2 text-sm font-bold tracking-wider border"
              style={{
                color: '#767676',
                borderColor: '#767676',
                backgroundColor: 'transparent',
                cursor: 'not-allowed',
                opacity: 0.5,
              }}
            >
              [ NEXT ]
            </span>
          )}
        </div>
      )}

      {/* Show all results message when filtering */}
      {isFiltered && filteredBots.length > AGENTS_PER_PAGE && (
        <div className="text-center mt-6 mb-2">
          <p className="text-xs" style={{ color: 'var(--sb-text-secondary)' }}>
            Showing first {AGENTS_PER_PAGE} of {filteredBots.length} results. Refine your search for more specific results.
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-4 mb-8">
        <p className="text-sm" style={{ color: 'var(--sb-text-secondary)' }}>
          Can&apos;t find the right expert? We&apos;re building new ones every week.
        </p>
        <p className="text-sm mt-1" style={{ color: isMyspace ? '#0000FF' : '#E600E6' }}>
          Nice Humans Welcome
        </p>
      </div>
    </div>
  );
}
