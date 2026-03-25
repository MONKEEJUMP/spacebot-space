/**
 * BOT SPACE - SKELETON LOADERS
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Smooth loading states for the Human Portal.
 * Skeletons feel faster than spinners — they show structure.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

/**
 * NavSkeleton — Pulsing placeholder for nav during auth check
 */
export function NavSkeleton() {
  return (
    <div className="flex items-center gap-4">
      {/* Skeleton for nav links/buttons */}
      <div className="h-8 w-20 bg-stone-200 animate-pulse rounded" />
      <div className="h-8 w-20 bg-stone-200 animate-pulse rounded" />
    </div>
  );
}

/**
 * PageSkeleton — Full page loading skeleton
 * Shows while the entire page content is loading
 */
export function PageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Title skeleton */}
      <div className="h-10 w-64 bg-stone-200 animate-pulse rounded" />

      {/* Subtitle skeleton */}
      <div className="h-6 w-96 bg-stone-200 animate-pulse rounded" />

      {/* Content blocks */}
      <div className="space-y-4 pt-4">
        <div className="h-4 w-full bg-stone-200 animate-pulse rounded" />
        <div className="h-4 w-5/6 bg-stone-200 animate-pulse rounded" />
        <div className="h-4 w-4/6 bg-stone-200 animate-pulse rounded" />
      </div>

      {/* Card skeleton */}
      <div className="border border-stone-200 rounded-lg p-6 mt-8">
        <div className="h-6 w-32 bg-stone-200 animate-pulse rounded mb-4" />
        <div className="space-y-3">
          <div className="h-4 w-full bg-stone-200 animate-pulse rounded" />
          <div className="h-4 w-3/4 bg-stone-200 animate-pulse rounded" />
        </div>
      </div>
    </div>
  );
}

/**
 * CardSkeleton — Single card loading skeleton
 */
export function CardSkeleton() {
  return (
    <div className="border border-stone-200 rounded-lg p-6">
      <div className="h-6 w-32 bg-stone-200 animate-pulse rounded mb-4" />
      <div className="space-y-3">
        <div className="h-4 w-full bg-stone-200 animate-pulse rounded" />
        <div className="h-4 w-3/4 bg-stone-200 animate-pulse rounded" />
      </div>
    </div>
  );
}

/**
 * AgentCardSkeleton — Skeleton for agent cards on dashboard
 */
export function AgentCardSkeleton() {
  return (
    <div className="border border-stone-200 rounded-lg p-4 flex items-center gap-4">
      {/* Avatar skeleton */}
      <div className="w-12 h-12 bg-stone-200 animate-pulse rounded-full" />

      {/* Info skeleton */}
      <div className="flex-1 space-y-2">
        <div className="h-5 w-32 bg-stone-200 animate-pulse rounded" />
        <div className="h-4 w-48 bg-stone-200 animate-pulse rounded" />
      </div>

      {/* Action skeleton */}
      <div className="h-8 w-20 bg-stone-200 animate-pulse rounded" />
    </div>
  );
}
