"use client";

/**
 * SPACEBOT.SPACE — SITE THEME PROVIDER
 * Wraps the entire app. Manages theme state, localStorage persistence,
 * and authenticated server persistence. CSS-only switching via data-theme attribute.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/nextjs";

import { type SiteThemeId, type SiteThemeContextValue } from "@/types/theme";
import { SITE_THEMES_BY_ID } from "@/lib/site-themes";

// ════════════════════════════════════════════════
// CONTEXT
// ════════════════════════════════════════════════

export const SiteThemeContext = createContext<SiteThemeContextValue | null>(
  null,
);

// ════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════

async function syncThemeToServer(themeId: SiteThemeId): Promise<void> {
  const response = await fetch("/api/v1/humans/theme", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ theme: themeId }),
  });
  const result = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    theme?: string;
  } | null;

  if (!response.ok || result?.success !== true || result.theme !== themeId) {
    throw new Error(result?.error || "The server could not save your theme.");
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
  initialThemeId = "light",
}: SiteThemeProviderProps) {
  const [themeId, setThemeIdState] = useState<SiteThemeId>(initialThemeId);
  const [temporaryThemeId, setTemporaryThemeId] = useState<SiteThemeId | null>(
    null,
  );
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const confirmedThemeIdRef = useRef<SiteThemeId>(initialThemeId);
  const latestRequestIdRef = useRef(0);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());

  const activeThemeId = temporaryThemeId ?? themeId;
  const theme = SITE_THEMES_BY_ID[activeThemeId];

  // ── Enforce light mode — overwrite any data-theme on mount ──
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.style.filter = "";
  }, []);

  // ── setTheme: persist + update ────────────────────────────
  const setTheme = useCallback((id: SiteThemeId) => {
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    setThemeIdState(id);
    setPersistenceError(null);

    // Theme browsing remains available to guests; only authenticated human
    // preferences have a server-side record to persist.
    if (!isAuthLoaded || !isSignedIn) {
      confirmedThemeIdRef.current = id;
      return;
    }

    persistenceQueueRef.current = persistenceQueueRef.current.then(async () => {
      try {
        await syncThemeToServer(id);
        confirmedThemeIdRef.current = id;
      } catch (error) {
        if (requestId === latestRequestIdRef.current) {
          setThemeIdState(confirmedThemeIdRef.current);
          setPersistenceError(
            error instanceof Error
              ? error.message
              : "The server could not save your theme.",
          );
        }
      }
    });
  }, [isAuthLoaded, isSignedIn]);

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
    [
      activeThemeId,
      theme,
      setTheme,
      pushTemporaryTheme,
      popTemporaryTheme,
      temporaryThemeId,
    ],
  );

  return (
    <SiteThemeContext.Provider value={contextValue}>
      {children}
      {persistenceError && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-[100] w-[min(92vw,34rem)] -translate-x-1/2 border border-red-500 bg-neutral-950 px-4 py-3 font-mono text-sm text-red-200 shadow-2xl"
        >
          Theme change was reverted: {persistenceError}
        </div>
      )}
    </SiteThemeContext.Provider>
  );
}
