'use client';

/**
 * BOT SPACE - HUMAN AUTH PROVIDER
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * React context provider for human authentication.
 * Manages auth state, token refresh, and provides auth actions.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';

import type {
  Human,
  HumanAuthContext as HumanAuthContextType,
  HumanAuthState,
} from '@/types/human';

import { isApiError } from '@/types/human';
import { useSiteTheme } from '@/hooks/useSiteTheme';
import { SITE_THEME_IDS, type SiteThemeId } from '@/types/theme';

import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  refreshToken as apiRefreshToken,
  getMe as apiGetMe,
} from '@/lib/human-api';

// ============================================================
// CONSTANTS
// ============================================================

/** Token refresh interval: 14 minutes (before 15-min expiry) */
const TOKEN_REFRESH_INTERVAL = 14 * 60 * 1000;

// ============================================================
// CONTEXT
// ============================================================

const defaultState: HumanAuthState = {
  human: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

export const HumanAuthContext = createContext<HumanAuthContextType | null>(null);

// ============================================================
// PROVIDER COMPONENT
// ============================================================

interface HumanAuthProviderProps {
  children: ReactNode;
}

export function HumanAuthProvider({ children }: HumanAuthProviderProps) {
  const [human, setHuman] = useState<Human | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  // ============================================================
  // TOKEN REFRESH
  // ============================================================

  const startTokenRefresh = useCallback(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    refreshIntervalRef.current = setInterval(async () => {
      try {
        const result = await apiRefreshToken();
        if (isApiError(result)) {
          console.warn('[HumanAuth] Token refresh failed:', result.error);
          setHuman(null);
          setIsAuthenticated(false);
          stopTokenRefresh();
        }
      } catch (err) {
        console.error('[HumanAuth] Token refresh error:', err);
      }
    }, TOKEN_REFRESH_INTERVAL);
  }, []);

  const stopTokenRefresh = useCallback(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  }, []);

  // ============================================================
  // AUTH ACTIONS
  // ============================================================

  const login = useCallback(
    async (email: string, password: string, captchaToken?: string): Promise<Human | null> => {
      setError(null);
      setIsLoading(true);

      try {
        const result = await apiLogin({ email, password, ...(captchaToken ? { captchaToken } : {}) });

        if (isApiError(result)) {
          setError(result.error);
          setIsLoading(false);
          return null;
        }

        setHuman(result.human);
        setIsAuthenticated(true);
        setError(null);
        setIsLoading(false);
        startTokenRefresh();

        return result.human;

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
        setIsLoading(false);
        return null;
      }
    },
    [startTokenRefresh]
  );

  /**
   * Register a new account — auto-login after success
   */
  const register = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      captchaToken: string
    ): Promise<Pick<Human, 'email' | 'name'> | null> => {
      setError(null);
      setIsLoading(true);

      try {
        const result = await apiRegister({ email, password, name, captchaToken });

        if (isApiError(result)) {
          setError(result.error);
          setIsLoading(false);
          return null;
        }

        // Registration successful — auto-login
        // The server already set httpOnly cookies with JWT tokens
        setHuman(result.human);
        setIsAuthenticated(true);
        setError(null);
        setIsLoading(false);

        // Start token refresh timer
        startTokenRefresh();

        return {
          email: result.human.email,
          name: result.human.name,
        };

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed');
        setIsLoading(false);
        return null;
      }
    },
    [startTokenRefresh]
  );

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);

    try {
      await apiLogout();
    } catch (err) {
      console.error('[HumanAuth] Logout error:', err);
    }

    // Clear the logged_in marker cookie
    document.cookie = 'logged_in=; path=/; max-age=0';

    stopTokenRefresh();
    setHuman(null);
    setIsAuthenticated(false);
    setError(null);
    setIsLoading(false);
  }, [stopTokenRefresh]);

  const refreshAuth = useCallback(async (): Promise<void> => {
    try {
      const result = await apiRefreshToken();

      if (isApiError(result)) {
        setHuman(null);
        setIsAuthenticated(false);
        stopTokenRefresh();
        return;
      }

      const meResult = await apiGetMe();
      if (!isApiError(meResult)) {
        setHuman(meResult.human);
        setIsAuthenticated(true);
      }

    } catch (err) {
      console.error('[HumanAuth] Refresh auth error:', err);
      setHuman(null);
      setIsAuthenticated(false);
      stopTokenRefresh();
    }
  }, [stopTokenRefresh]);

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  // ============================================================
  // INITIALIZATION
  // ============================================================

  useEffect(() => {
    if (isInitializedRef.current) {
      return;
    }
    isInitializedRef.current = true;

    const checkAuth = async () => {
      try {
        const meResult = await apiGetMe();

        if (!isApiError(meResult)) {
          setHuman(meResult.human);
          setIsAuthenticated(true);
          setIsLoading(false);
          startTokenRefresh();
          return;
        }

        const refreshResult = await apiRefreshToken();

        if (!isApiError(refreshResult)) {
          const meRetry = await apiGetMe();

          if (!isApiError(meRetry)) {
            setHuman(meRetry.human);
            setIsAuthenticated(true);
            setIsLoading(false);
            startTokenRefresh();
            return;
          }
        }

        setHuman(null);
        setIsAuthenticated(false);
        setIsLoading(false);

      } catch (err) {
        console.error('[HumanAuth] Auth check error:', err);
        setHuman(null);
        setIsAuthenticated(false);
        setIsLoading(false);
      }
    };

    checkAuth();

    return () => {
      stopTokenRefresh();
    };
  }, [startTokenRefresh, stopTokenRefresh]);

  // ============================================================
  // THEME SYNC
  // ============================================================
  const { setTheme: setSiteTheme } = useSiteTheme();

  useEffect(() => {
    if (isAuthenticated && human?.siteTheme) {
      const serverTheme = human.siteTheme;
      if ((SITE_THEME_IDS as readonly string[]).includes(serverTheme)) {
        setSiteTheme(serverTheme as SiteThemeId);
      }
    }
  }, [isAuthenticated, human?.siteTheme, setSiteTheme]);

  // ============================================================
  // CONTEXT VALUE
  // ============================================================

  const contextValue: HumanAuthContextType = {
    human,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    refreshAuth,
    clearError,
  };

  return (
    <HumanAuthContext.Provider value={contextValue}>
      {children}
    </HumanAuthContext.Provider>
  );
}

// ============================================================
// HOOK
// ============================================================

export function useHumanAuth(): HumanAuthContextType {
  const context = useContext(HumanAuthContext);

  if (context === null) {
    throw new Error(
      'useHumanAuth must be used within a HumanAuthProvider. ' +
      'Wrap your component tree with <HumanAuthProvider>.'
    );
  }

  return context;
}

export default HumanAuthProvider;
