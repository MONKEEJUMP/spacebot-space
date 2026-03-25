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
import { useRouter, usePathname } from 'next/navigation';
import { useHumanAuth } from '@/providers/HumanAuthProvider';
import { PageSkeleton } from './SkeletonLoader';

interface ProtectedRouteProps {
  children: React.ReactNode;
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
  const { isAuthenticated, isLoading } = useHumanAuth();
  const router = useRouter();
  const pathname = usePathname();

  // ═══════════════════════════════════════════════════════════════
  // REDIRECT EFFECT
  // CRITICAL: Only fires when isLoading is FALSE and NOT authenticated
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    // While loading, do nothing — wait for auth check to complete
    if (isLoading) {
      return;
    }

    // Auth check complete, user is NOT authenticated
    if (!isAuthenticated) {
      // FLAG 2 FIX: Use replace() not push() — prevents back button issues
      // Include ?redirect= so user returns here after login
      const redirectUrl = `/login?redirect=${encodeURIComponent(pathname)}`;
      router.replace(redirectUrl);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  // ═══════════════════════════════════════════════════════════════
  // RENDER — THE ANTI-FLASH PATTERN
  // Skeleton for loading AND unauthenticated states
  // Children ONLY when authenticated is CONFIRMED true
  // ═══════════════════════════════════════════════════════════════

  // Still loading — show skeleton
  if (isLoading) {
    return <PageSkeleton />;
  }

  // Not authenticated — show skeleton while redirect happens
  // CRITICAL: Never show children to unauthenticated users
  if (!isAuthenticated) {
    return <PageSkeleton />;
  }

  // Authenticated — show the protected content
  return <>{children}</>;
}

export default ProtectedRoute;
