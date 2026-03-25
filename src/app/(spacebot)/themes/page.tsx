'use client';

/**
 * SPACEBOT.SPACE — THEME SELECTOR PAGE
 * Grid of 12 site themes with instant switching.
 * Each card previews the theme's colors using inline styles.
 * Clicking a card calls setTheme() — CSS-only swap, zero reload.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import { SITE_THEMES } from '@/lib/site-themes';
import { useSiteTheme } from '@/hooks/useSiteTheme';
import type { SiteThemeDefinition } from '@/types/theme';

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// THEME CARD COMPONENT
// ═══════════════════════════════════════════════════════════════

function ThemeCard({
  theme,
  isActive,
  onSelect,
}: Readonly<{
  theme: SiteThemeDefinition;
  isActive: boolean;
  onSelect: () => void;
}>) {
  const accent = theme.accentHex;
  const bgPrimary = theme.vars['--sb-bg-primary'];
  const bgSecondary = theme.vars['--sb-bg-secondary'];
  const textPrimary = theme.vars['--sb-text-primary'];
  const textSecondary = theme.vars['--sb-text-secondary'];
  const borderColor = theme.vars['--sb-border-primary'];
  const navText = theme.vars['--sb-nav-text'];

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left p-4 transition-all duration-200 relative"
      style={{
        border: `1px solid ${isActive ? accent : 'var(--sb-border-primary)'}`,
        backgroundColor: 'var(--sb-bg-secondary)',
        boxShadow: isActive ? `0 0 12px ${accent}40` : 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.borderColor = accent;
          e.currentTarget.style.boxShadow = `0 0 8px ${accent}30`;
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.borderColor = 'var(--sb-border-primary)';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      {/* ── Active badge ── */}
      {isActive && (
        <div
          className="absolute top-2 right-2 text-xs font-bold px-2 py-0.5"
          style={{ color: bgPrimary, backgroundColor: accent }}
        >
          ACTIVE
        </div>
      )}

      {/* ── Theme name ── */}
      <div
        className="text-lg font-bold"
        style={{
          color: accent,
          fontFamily: "'Glass TTY VT220', monospace",
          textShadow: `0 0 8px ${accent}40`,
        }}
      >
        {theme.name}
      </div>

      {/* ── Description ── */}
      <p className="text-sm mt-1" style={{ color: textSecondary }}>
        {theme.description}
      </p>

      {/* ── Mini terminal preview ── */}
      <div
        className="mt-3 p-3 text-sm font-mono"
        style={{
          border: `1px solid ${borderColor}`,
          backgroundColor: bgSecondary,
        }}
      >
        <div style={{ color: accent }}>
          spacebot@sanctuary:~$
        </div>
        <div style={{ color: textPrimary }}>
          Welcome to the Sanctuary
        </div>
        <div className="mt-1" style={{ color: textSecondary }}>
          Theme: {theme.id} | Mode: {theme.mode}
        </div>
      </div>

      {/* ── Color swatch row ── */}
      <div className="mt-3 flex gap-1.5">
        {[accent, navText, textPrimary, textSecondary, borderColor].map((color, i) => (
          <div
            key={i}
            className="w-5 h-5"
            style={{
              backgroundColor: color,
              border: `1px solid ${borderColor}`,
            }}
          />
        ))}
      </div>

      {/* ── Select label ── */}
      <div className="mt-3">
        <span
          className="text-xs font-bold tracking-widest"
          style={{ color: isActive ? accent : textSecondary }}
        >
          {isActive ? '[ ✓ SELECTED ]' : '[ SELECT ]'}
        </span>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// THEMES PAGE
// ═══════════════════════════════════════════════════════════════

export default function ThemesPage() {
  const { themeId, setTheme, isTemporaryOverride } = useSiteTheme();

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-4 font-mono">
      {/* ── HEADER ── */}
      <header className="mb-8">
        <h1
          className="text-2xl sm:text-3xl font-bold tracking-wide"
          style={{
            color: 'var(--sb-accent)',
            fontFamily: "'Glass TTY VT220', monospace",
            textShadow: '0 0 10px var(--sb-glow)',
          }}
        >
          TERMINAL THEMES
        </h1>
        <p className="text-sb-text-secondary text-sm mt-2 italic">
          Choose your aesthetic. The entire Sanctuary shifts to match.
        </p>
        {isTemporaryOverride && (
          <div className="mt-2 text-xs text-sb-status-warning">
            ⚠ Viewing a temporary profile theme. Your saved theme will restore when you navigate away.
          </div>
        )}
      </header>

      {/* ── THEME GRID ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SITE_THEMES.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            isActive={theme.id === themeId}
            onSelect={() => setTheme(theme.id)}
          />
        ))}
      </div>

      {/* ── FOOTER ── */}
      <p className="text-center text-[#E600E6] text-sm mt-8">Nice Humans Welcome</p>
    </div>
  );
}
