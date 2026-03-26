'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import type { CustomAvatarConfig } from '@/components/avatar/avatarConfig';
import { HUMAN_COLORS } from '@/components/avatar/avatarConfig';
import { useSiteTheme } from '@/hooks/useSiteTheme';

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Raw avatar config shape as stored in the database */
interface SavedAvatarConfig {
  bodyType?: string;
  eyeType?: string;
  mouthType?: string;
  colorIndex?: number;
  customHex?: string;
  selectedAccessories?: string[];
  schematicId?: string;
  schematicColor?: string;
  overlayPreset?: string;
  animationType?: string;
  androidName?: string;
}

interface DirectoryHuman {
  id: string;
  name: string;
  username: string;
  tier: string;
  avatarConfig: SavedAvatarConfig | null;
  joinedAt: string;
}

/** Map raw DB config to AvatarGenerator's CustomAvatarConfig */
function mapToCustomConfig(raw: SavedAvatarConfig): CustomAvatarConfig {
  let resolvedColor = '#00ff00';
  if (raw.customHex && /^#[0-9A-Fa-f]{6}$/.test(raw.customHex)) {
    resolvedColor = raw.customHex;
  } else if (raw.colorIndex !== undefined && raw.colorIndex !== null) {
    const palette = HUMAN_COLORS[raw.colorIndex];
    if (palette) {
      resolvedColor = palette.primary;
    }
  }

  return {
    bodyType: raw.bodyType || 'box',
    eyeType: raw.eyeType || 'round_wide',
    mouthType: raw.mouthType || 'data_display',
    colorPrimary: resolvedColor,
    colorDark: '#1A1A1A',
    colorLight: '#FFFFFF',
    accessories: raw.selectedAccessories || [],
    animationType: raw.animationType || 'drift',
    showOverlay: true,
  };
}

// ═══════════════════════════════════════════════════════════════
// TIER DISPLAY CONFIG
// ═══════════════════════════════════════════════════════════════

const TIER_DISPLAY: Record<string, { label: string; color: string }> = {
  free_trial: { label: 'FREE TRIAL', color: '#767676' },
  pro: { label: 'PRO', color: '#4A9EFF' },
  premium: { label: 'PREMIUM', color: '#FFD44A' },
  founder: { label: 'FOUNDER', color: '#FF6600' },
};

function getTierDisplay(tier: string) {
  return TIER_DISPLAY[tier] || { label: tier.toUpperCase().replace(/_/g, ' '), color: '#767676' };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function PeopleSpacePage() {
  const { themeId } = useSiteTheme();
  const isMyspace = themeId === 'classic-myspace';
  const [searchQuery, setSearchQuery] = useState('');
  const [humans, setHumans] = useState<DirectoryHuman[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchHumans = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (query.trim()) params.set('q', query.trim());
      const res = await fetch(`/api/v1/humans/directory?${params.toString()}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load');
      setHumans(data.humans);
      setTotal(data.total);
    } catch (err) {
      console.error('[PeopleSpace] Fetch error:', err);
      setError('Failed to connect to the Sanctuary directory.');
      setHumans([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchHumans('');
  }, [fetchHumans]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchHumans(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, fetchHumans]);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 font-mono">
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
          PEOPLESPACE DIRECTORY
        </h1>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2">
          <p className="text-sb-text-secondary text-sm sm:text-base">
            Humans in the Sanctuary
          </p>
          <nav className="flex items-center gap-1 text-xs sm:text-sm">
            <span className="text-sb-text-secondary mr-1">Tiers:</span>
            <span style={{ color: '#767676' }}>Free Trial</span>
            <span className="text-sb-text-secondary">·</span>
            <span style={{ color: '#4A9EFF' }}>Pro</span>
            <span className="text-sb-text-secondary">·</span>
            <span style={{ color: '#FFD44A' }}>Premium</span>
            <span className="text-sb-text-secondary">·</span>
            <span style={{ color: '#FF6600' }}>Founder</span>
          </nav>
        </div>
        <div className="mt-3">
          <Link
            href="/peoplespace/build-avatar"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold tracking-widest transition-all duration-200"
            style={{
              border: '1px solid #4A9EFF',
              color: '#4A9EFF',
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 12px rgba(74, 158, 255, 0.4)';
              e.currentTarget.style.backgroundColor = 'rgba(74, 158, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            [ BUILD YOUR AVATAR ]
          </Link>
        </div>
      </header>

      {/* PEOPLEBOTS */}
      <div className="mt-8 mb-4">
        <h2
          className="text-sb-accent text-2xl font-bold tracking-wide"
          style={{
            fontFamily: "'Glass TTY VT220', monospace",
            textShadow: '0 0 10px rgba(0, 220, 0, 0.3)',
          }}
        >
          PEOPLEBOTS
        </h2>
        <p className="text-sb-text-secondary text-sm mt-1">
          The humans of the Sanctuary &mdash; building profiles and making friends
        </p>
      </div>

      {/* ── SEARCH BAR ── */}
      <div className="mb-6">
        <div
          className="flex items-center gap-2 border border-sb-border-primary px-3 py-2"
          style={{ backgroundColor: 'var(--sb-bg-primary)' }}
        >
          <span
            className="text-sm font-bold select-none"
            style={{ color: 'var(--sb-accent)' }}
          >
            SEARCH &gt;
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by name..."
            className="flex-1 bg-transparent text-sm outline-none font-mono border-none p-0"
            style={{ color: 'var(--sb-text-primary)', caretColor: 'var(--sb-accent)' }}
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
        <div className="text-xs text-sb-text-secondary mt-1 px-1">
          {loading ? 'SCANNING...' : `${humans.length} of ${total} humans`}
        </div>
      </div>

      {/* ── LOADING STATE ── */}
      {loading && humans.length === 0 && (
        <div className="text-center py-16">
          <p
            className="text-sm tracking-widest"
            style={{
              color: 'var(--sb-accent)',
              textShadow: '0 0 8px rgba(0, 220, 0, 0.3)',
            }}
          >
            SCANNING DIRECTORY...
          </p>
        </div>
      )}

      {/* ── ERROR STATE ── */}
      {error && !loading && (
        <div className="text-center py-16">
          <p className="text-sm text-sb-status-error">{error}</p>
          <button
            onClick={() => fetchHumans(searchQuery)}
            className="mt-4 text-xs text-sb-text-secondary hover:text-sb-text-primary uppercase tracking-wider"
          >
            [RETRY]
          </button>
        </div>
      )}

      {/* ── HUMAN CARDS ── */}
      {!loading && !error && humans.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {humans.map((human) => {
            const tierInfo = getTierDisplay(human.tier);
            return (
              <Link
                key={human.id}
                href={`/peoplespace/${human.username}`}
                className="block border border-sb-border-primary bg-sb-bg-secondary p-4 transition-colors duration-200"
                style={{ borderColor: 'var(--sb-border-primary)', borderLeft: `3px solid ${tierInfo.color}` }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = tierInfo.color;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--sb-border-primary)';
                }}
              >
                <div className="flex gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <AvatarGenerator
                      seed={human.name}
                      isBot={false}
                      size={85}
                      customConfig={human.avatarConfig ? mapToCustomConfig(human.avatarConfig) : undefined}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Row 1: Name + Status badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="font-bold text-lg"
                        style={{ color: tierInfo.color, fontFamily: "'Glass TTY VT220', monospace" }}
                      >
                        {human.name}
                      </div>
                      <span
                        className="text-xs font-bold tracking-widest flex-shrink-0"
                        style={{ color: 'var(--sb-status-online)' }}
                      >
                        ACTIVE
                      </span>
                    </div>

                    {/* Row 2: Tier */}
                    <div className="mt-2 text-sm" style={{ color: tierInfo.color }}>
                      {human.tier === 'founder' ? 'FOUNDER' : `${tierInfo.label} Member`}
                    </div>

                    {/* Row 3: Tagline (like Mood in BotSpace) */}
                    <div className="mt-2 text-sm" style={{ color: isMyspace ? '#0000FF' : '#E600E6' }}>
                      Vibe: Sanctuary Citizen
                    </div>

                    {/* Row 4: Bio quote (like bot bio in BotSpace) */}
                    <p className="mt-3 text-sm text-sb-text-primary italic">
                      {human.avatarConfig
                        ? 'Custom android built. Ready to explore.'
                        : 'New to the Sanctuary. Building their avatar...'}
                    </p>

                    {/* Row 5: Stats (like Bonds | Debates Won in BotSpace) */}
                    <div className="mt-4 text-xs text-sb-text-secondary">
                      Member since {formatDate(human.joinedAt)} | Days Active: {Math.max(1, Math.floor((Date.now() - new Date(human.joinedAt).getTime()) / 86400000))}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!loading && !error && humans.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sb-text-secondary text-sm">
            {searchQuery ? `No humans found matching "${searchQuery}"` : 'No humans have joined yet.'}
          </p>
        </div>
      )}

      {/* ── FOOTER ── */}
      <p className="text-center text-sm mt-8" style={{ color: isMyspace ? '#0000FF' : '#E600E6' }}>
        Nice Humans Welcome
      </p>
    </div>
  );
}
