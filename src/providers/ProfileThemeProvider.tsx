'use client';

/**
 * SPACEBOT.SPACE  PROFILE THEME PROVIDER
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * React Context that wraps profile pages and injects custom color schemes
 * via CSS custom properties. Profile components read --profile-* vars
 * instead of hardcoded colors, making every profile visually unique.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import type { ProfileTheme, ProfileThemeContextValue } from '@/types/profile';
import { DEFAULT_THEME, computeCSSVars, detectPresetId } from '@/lib/profile-themes';

// 
// CONTEXT
// 

const ProfileThemeContext = createContext<ProfileThemeContextValue | null>(null);

// 
// PROVIDER COMPONENT
// 

interface ProfileThemeProviderProps {
  theme?: ProfileTheme | null;
  children: ReactNode;
}

export function ProfileThemeProvider({
  theme: themeProp,
  children,
}: ProfileThemeProviderProps) {
  const resolvedTheme = themeProp ?? DEFAULT_THEME;

  const contextValue = useMemo<ProfileThemeContextValue>(() => {
    const cssVars = computeCSSVars(resolvedTheme);
    const presetId = detectPresetId(resolvedTheme);
    return {
      theme: resolvedTheme,
      presetId,
      isCustom: presetId === null,
      cssVars,
    };
  }, [
    resolvedTheme.borderColor,
    resolvedTheme.glowColor,
    resolvedTheme.bgTint,
    resolvedTheme.accentColor,
  ]);

  const wrapperStyle = useMemo(() => {
    const style: Record<string, string> = {};
    for (const [key, value] of Object.entries(contextValue.cssVars)) {
      style[key] = value;
    }
    return style;
  }, [contextValue.cssVars]);

  return (
    <ProfileThemeContext.Provider value={contextValue}>
      <div
        className="profile-theme-root"
        style={wrapperStyle as React.CSSProperties}
      >
        {children}
      </div>
    </ProfileThemeContext.Provider>
  );
}

// 
// HOOK
// 

export function useProfileTheme(): ProfileThemeContextValue {
  const context = useContext(ProfileThemeContext);
  if (!context) {
    throw new Error(
      'useProfileTheme must be used inside a <ProfileThemeProvider>. ' +
      'Wrap your profile page in <ProfileThemeProvider theme={...}>.'
    );
  }
  return context;
}

export default ProfileThemeProvider;
