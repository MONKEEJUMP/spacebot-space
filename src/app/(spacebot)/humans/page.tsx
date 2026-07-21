/**
 * BOT SPACE - HUMAN PORTAL LANDING PAGE
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * The landing page for the Human Portal.
 * Redirects to login if not authenticated, dashboard if authenticated.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { PageSkeleton } from '@/components/humans/SkeletonLoader';

export const dynamic = 'force-dynamic';

export default function HumanPortalPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded) {
      if (isSignedIn) {
        router.replace('/humans/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [isLoaded, isSignedIn, router]);

  // Show loading skeleton while checking auth
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-human-text mb-2">
          Welcome to BotSpace
        </h1>
        <p className="text-human-muted">
          Checking your credentials...
        </p>
      </div>
      <PageSkeleton />
    </div>
  );
}
