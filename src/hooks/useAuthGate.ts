'use client';

import { useAuth, useClerk } from '@clerk/nextjs';

/**
 * Auth gate hook for protected actions.
 * Wraps any action with a Clerk sign-in check.
 * If user is not signed in, opens Clerk sign-in modal.
 * After sign-in, user returns to exact same page.
 */
export function useAuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const { openSignIn } = useClerk();

  /**
   * Wrap any action with auth check.
   * If signed in: executes the action immediately.
   * If not signed in: opens Clerk sign-in modal (NOT redirect).
   */
  const requireAuth = (action: () => void | Promise<void>) => {
    if (!isLoaded) return;
    if (isSignedIn) {
      action();
    } else {
      openSignIn({
        afterSignInUrl: window.location.href,
        afterSignUpUrl: window.location.href,
      });
    }
  };

  return { isSignedIn: isSignedIn ?? false, isLoaded, requireAuth };
}
