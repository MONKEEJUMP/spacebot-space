'use client';

/**
 * SPACEBOT.SPACE — useSiteTheme Hook
 * Clean re-export of the SiteThemeContext consumer.
 *
 * Usage:
 *   const { themeId, setTheme, mode } = useSiteTheme();
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import { useContext } from 'react';
import { SiteThemeContext } from '@/providers/SiteThemeProvider';
import type { SiteThemeContextValue } from '@/types/theme';

export function useSiteTheme(): SiteThemeContextValue {
  const ctx = useContext(SiteThemeContext);
  if (!ctx) {
    throw new Error('useSiteTheme must be used inside <SiteThemeProvider>');
  }
  return ctx;
}
