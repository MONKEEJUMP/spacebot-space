'use client';

/**
 * BOT SPACE - PROTECTED ROUTE GUARD
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * THE GUARDIAN OF PROTECTED PAGES
 *
 * Wraps pages that REQUIRE authentication.
 * - If not authenticated → redirect to login (with ?redirect= param)
 * - If loading → show PageSkeleton
 * - If authenticated → render children
 *
 * Uses the ANTI-FLASH PATTERN:
 * Children ONLY render when isAuthenticated is CONFIRMED true.
 * Skeleton shows for BOTH loading AND unauthenticated states.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter, usePathname } from 'next/navigation';
import { useClerkHuman } from '@/hooks/useClerkHuman';
import { PageSkeleton } from './SkeletonLoader';

interface ProtectedRouteProps {
  children: ReactElement;
}

/**
 * ProtectedRoute — Requires authentication
 *
 * @example
 * // In dashboard/page.tsx
 * export default function DashboardPage() {
 *   return (
 *     <ProtectedRoute>
 *       <DashboardContent />
 *     </ProtectedRoute>
 *   );
 * }
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const {
    error: humanError,
    isRetrying,
    retry,
    status: humanStatus,
  } = useClerkHuman();
  const router = useRouter();
  const pathname = usePathname();

  // ═══════════════════════════════════════════════════════════════
  // REDIRECT EFFECT
  // CRITICAL: Only fires when isLoading is FALSE and NOT authenticated
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    // While loading, do nothing — wait for auth check to complete
    if (!isLoaded) {
      return;
    }

    // Auth check complete, user is NOT authenticated
    if (!isSignedIn) {
      // FLAG 2 FIX: Use replace() not push() — prevents back button issues
      // Include ?redirect= so user returns here after login
      const redirectUrl = `/login?redirect=${encodeURIComponent(pathname)}`;
      router.replace(redirectUrl);
    }
  }, [isLoaded, isSignedIn, pathname, router]);

  // ═══════════════════════════════════════════════════════════════
  // RENDER — THE ANTI-FLASH PATTERN
  // Skeleton for loading AND unauthenticated states
  // Children ONLY when authenticated is CONFIRMED true
  // ═══════════════════════════════════════════════════════════════

  // Still loading — show skeleton
  if (!isLoaded) {
    return <PageSkeleton />;
  }

  // Not authenticated — show skeleton while redirect happens
  // CRITICAL: Never show children to unauthenticated users
  if (!isSignedIn) {
    return <PageSkeleton />;
  }

  if (humanStatus === 'loading') {
    return <PageSkeleton />;
  }

  if (humanStatus === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-human-bg px-4 py-12">
        <section
          role="alert"
          className="w-full max-w-xl border border-sb-status-error bg-human-surface p-8 text-center"
        >
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-sb-status-error">
            Account connection interrupted
          </p>
          <h1 className="mb-3 text-2xl font-bold text-human-text">
            We couldn&apos;t load your SpaceBot account
          </h1>
          <p className="mb-6 text-human-muted">
            {humanError || 'The account service did not return your profile.'}
            {' '}Your account data has not been replaced or reset.
          </p>
          <button
            type="button"
            onClick={retry}
            disabled={isRetrying}
            className="border-2 border-human-accent px-6 py-3 font-semibold text-human-accent transition-colors hover:bg-human-accent hover:text-black disabled:cursor-wait disabled:opacity-60"
          >
            {isRetrying ? 'Retrying account connection...' : 'Try loading your account again'}
          </button>
        </section>
      </main>
    );
  }

  // Authenticated — show the protected content
  return children;
}

export default ProtectedRoute;
