'use client';

/**
 * BOT SPACE - GUEST ROUTE GUARD
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * THE USHER FOR GUEST-ONLY PAGES
 *
 * Wraps pages that are for GUESTS ONLY (login, register).
 * - If authenticated → redirect to avatar builder (or ?redirect= target)
 * - If loading → show PageSkeleton
 * - If not authenticated → render children (show the form)
 *
 * Uses the ANTI-FLASH PATTERN:
 * Children ONLY render when isAuthenticated is CONFIRMED false.
 * Skeleton shows for BOTH loading AND authenticated states.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { Suspense, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useHumanAuth } from '@/providers/HumanAuthProvider';
import { PageSkeleton } from './SkeletonLoader';

interface GuestRouteProps {
  children: React.ReactNode;
}

/**
 * Guest-only routes — redirect loops to these must be prevented
 */
const GUEST_ROUTES = ['/login', '/register'];

/**
 * GuestRoute — Guests only (redirects authenticated users)
 *
 * Wrapped in Suspense for useSearchParams() (Next.js 14 requirement)
 *
 * @example
 * // In login/page.tsx
 * export default function LoginPage() {
 *   return (
 *     <GuestRoute>
 *       <LoginForm />
 *     </GuestRoute>
 *   );
 * }
 */
export function GuestRoute({ children }: GuestRouteProps) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <GuestRouteInner>{children}</GuestRouteInner>
    </Suspense>
  );
}

/**
 * Inner component that uses useSearchParams
 * Must be inside Suspense boundary
 */
function GuestRouteInner({ children }: GuestRouteProps) {
  const { isAuthenticated, isLoading, human } = useHumanAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ═══════════════════════════════════════════════════════════════
  // COMPUTE SAFE REDIRECT TARGET
  // FLAG 4 FIX: Validate ?redirect= to prevent loops and attacks
  // ═══════════════════════════════════════════════════════════════
  const safeRedirect = useMemo(() => {
    const redirectTo = searchParams.get('redirect') || searchParams.get('from');

    // Validate the redirect URL:
    // 1. Must exist
    // 2. Must start with /humans/ or /peoplespace/ (prevents external redirects)
    // 3. Must NOT be a guest route (prevents loops)
    if (
      redirectTo &&
      (redirectTo.startsWith('/humans/') || redirectTo.startsWith('/peoplespace/')) &&
      !GUEST_ROUTES.includes(redirectTo)
    ) {
      return redirectTo;
    }

    // Returning users go straight to their profile page
    if (human?.name) {
      return `/peoplespace/profile/${encodeURIComponent(human.name)}`;
    }

    // New users without a name go to avatar builder onboarding
    return '/peoplespace/build-avatar';
  }, [searchParams, human?.name]);

  // ═══════════════════════════════════════════════════════════════
  // REDIRECT EFFECT
  // CRITICAL: Only fires when isLoading is FALSE and IS authenticated
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    // While loading, do nothing — wait for auth check to complete
    if (isLoading) {
      return;
    }

    // Auth check complete, user IS authenticated
    if (isAuthenticated) {
      // FLAG 2 FIX: Use replace() not push() — prevents back button issues
      router.replace(safeRedirect);
    }
  }, [isLoading, isAuthenticated, safeRedirect, router]);

  // ═══════════════════════════════════════════════════════════════
  // RENDER — THE ANTI-FLASH PATTERN
  // Skeleton for loading AND authenticated states
  // Children ONLY when NOT authenticated is CONFIRMED
  // ═══════════════════════════════════════════════════════════════

  // Still loading — show skeleton
  if (isLoading) {
    return <PageSkeleton />;
  }

  // Authenticated — show skeleton while redirect happens
  // CRITICAL: Never show guest page (login/register) to authenticated users
  if (isAuthenticated) {
    return <PageSkeleton />;
  }

  // Not authenticated — show the guest content (login/register form)
  return <>{children}</>;
}

export default GuestRoute;
