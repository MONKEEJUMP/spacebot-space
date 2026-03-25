'use client';

/**
 * SPACEBOT.SPACE — SITE THEME PROVIDER
 * Wraps the entire app. Manages theme state, localStorage persistence,
 * and Supabase sync. CSS-only switching via data-theme attribute.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { SITE_THEME_IDS, type SiteThemeId, type SiteThemeContextValue } from '@/types/theme';
import { SITE_THEMES_BY_ID } from '@/lib/site-themes';

// ════════════════════════════════════════════════
// CONTEXT
// ════════════════════════════════════════════════

export const SiteThemeContext = createContext<SiteThemeContextValue | null>(null);

// ════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════

function isValidThemeId(value: string): value is SiteThemeId {
  return (SITE_THEME_IDS as readonly string[]).includes(value);
}

/**
 * Fire-and-forget sync to Supabase. Fails silently.
 */
async function syncThemeToSupabase(themeId: SiteThemeId): Promise<void> {
  try {
    await fetch('/api/v1/humans/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ theme: themeId }),
    });
  } catch {
    // Fire-and-forget — do NOT block UI
  }
}

// ════════════════════════════════════════════════
// PROVIDER COMPONENT
// ════════════════════════════════════════════════

interface SiteThemeProviderProps {
  children: ReactNode;
  /** Server-side hint (avoids flash) — defaults to 'dark' */
  initialThemeId?: SiteThemeId;
}

export default function SiteThemeProvider({
  children,
  initialThemeId = 'dark',
}: SiteThemeProviderProps) {
  const [themeId, setThemeIdState] = useState<SiteThemeId>(initialThemeId);
  const [temporaryThemeId, setTemporaryThemeId] = useState<SiteThemeId | null>(null);

  const activeThemeId = temporaryThemeId ?? themeId;
  const theme = SITE_THEMES_BY_ID[activeThemeId];

  // ── On mount: read from localStorage ──────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sb-theme');
      if (stored && isValidThemeId(stored)) {
        setThemeIdState(stored);
      }
    } catch {
      // SSR or localStorage blocked — ignore
    }
  }, []);

  // ── When activeThemeId changes: update <html data-theme> + invert filter ──
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-theme', activeThemeId);
    // Invert theme: apply CSS filter for full color inversion
    if (activeThemeId === 'invert') {
      html.style.filter = 'invert(1)';
    } else {
      html.style.filter = '';
    }
  }, [activeThemeId]);

  // ── setTheme: persist + update ────────────────────────────
  const setTheme = useCallback((id: SiteThemeId) => {
    setThemeIdState(id);
    try {
      localStorage.setItem('sb-theme', id);
    } catch {
      // localStorage blocked — ignore
    }
    // Fire-and-forget Supabase sync
    void syncThemeToSupabase(id);
  }, []);

  // ── Temporary theme push/pop for profile visits ───────────
  const pushTemporaryTheme = useCallback((id: SiteThemeId) => {
    setTemporaryThemeId(id);
  }, []);

  const popTemporaryTheme = useCallback(() => {
    setTemporaryThemeId(null);
  }, []);

  // ── Context value (memoized) ──────────────────────────────
  const contextValue = useMemo<SiteThemeContextValue>(
    () => ({
      themeId: activeThemeId,
      theme,
      mode: theme.mode,
      setTheme,
      pushTemporaryTheme,
      popTemporaryTheme,
      isTemporaryOverride: temporaryThemeId !== null,
    }),
    [activeThemeId, theme, setTheme, pushTemporaryTheme, popTemporaryTheme, temporaryThemeId],
  );

  return (
    <SiteThemeContext.Provider value={contextValue}>
      {children}
    </SiteThemeContext.Provider>
  );
}
