'use client';

/**
 * UpgradeModal — Gentle upgrade prompt for premium features.
 * Clean, editorial design. No aggressive tactics.
 * Shows feature blocked, benefits list, monthly/yearly toggle.
 */

import { useState, useCallback } from 'react';
import { SUBSCRIPTION_PRICES, PREMIUM_FEATURES } from '@/lib/subscription';

const BACKDROP_STYLE = { backgroundColor: 'rgba(0, 0, 0, 0.8)' };
const MODAL_STYLE = {
  backgroundColor: 'var(--sb-bg-primary)',
  borderColor: 'var(--sb-border-primary)',
};
const BORDER_STYLE = { borderColor: 'var(--sb-border-primary)' };
// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface UpgradeModalProps {
  /** What feature triggered the modal */
  feature: string;
  /** Close handler */
  onClose: () => void;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function UpgradeModal({ feature, onClose, isAuthenticated }: UpgradeModalProps) {
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = SUBSCRIPTION_PRICES[plan];
  const handleMonthlyPlan = useCallback(() => setPlan('monthly'), []);
  const handleYearlyPlan = useCallback(() => setPlan('yearly'), []);

  const handleSubscribe = useCallback(async () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      window.location.href = '/sign-in?redirect_url=%2Fpricing';
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();

      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [plan, isAuthenticated]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={BACKDROP_STYLE}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        className="w-full max-w-md border"
        style={MODAL_STYLE}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={BORDER_STYLE}
        >
          <div>
            <p className="text-[10px] font-mono text-sb-text-tertiary uppercase tracking-wider mb-1">
              Premium Feature
            </p>
            <h2 id="upgrade-modal-title" className="text-sm font-mono font-bold text-sb-text-primary">
              Unlock {feature}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sb-text-tertiary text-lg font-mono hover:text-sb-text-primary transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Plan Toggle */}
        <div className="px-6 pt-4">
          <div className="flex border" style={BORDER_STYLE}>
            <button
              type="button"
              onClick={handleMonthlyPlan}
              className={`flex-1 py-2 text-xs font-mono transition-all ${
                plan === 'monthly'
                  ? 'text-sb-accent bg-sb-bg-secondary'
                  : 'text-sb-text-tertiary hover:text-sb-text-secondary'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={handleYearlyPlan}
              className={`flex-1 py-2 text-xs font-mono transition-all border-l ${
                plan === 'yearly'
                  ? 'text-sb-accent bg-sb-bg-secondary'
                  : 'text-sb-text-tertiary hover:text-sb-text-secondary'
              }`}
              style={BORDER_STYLE}
            >
              Yearly
              <span className="text-[9px] ml-1 opacity-70">
                (Save {SUBSCRIPTION_PRICES.yearly.savings})
              </span>
            </button>
          </div>

          {/* Price */}
          <div className="text-center mt-4">
            <span className="text-2xl font-mono font-bold text-sb-text-primary">
              {price.display}
            </span>
            <span className="text-xs font-mono text-sb-text-tertiary ml-1">
              /{price.interval}
            </span>
          </div>
        </div>

        {/* Features */}
        <div className="px-6 py-4">
          <p className="text-[10px] font-mono text-sb-text-tertiary uppercase tracking-wider mb-2">
            What you get
          </p>
          <ul className="space-y-1.5">
            {PREMIUM_FEATURES.map((feat) => (
              <li key={feat} className="flex items-start gap-2 text-xs font-mono">
                <span className="text-sb-accent flex-shrink-0 mt-0.5">&#10003;</span>
                <span className="text-sb-text-secondary">{feat}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Error */}
        {error && (
          <div className="px-6 pb-2">
            <p className="text-xs font-mono text-red-400">{error}</p>
          </div>
        )}

        {/* CTA */}
        <div
          className="px-6 py-4 border-t"
          style={BORDER_STYLE}
        >
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={isLoading}
            className="w-full border border-sb-accent bg-transparent py-2.5 text-sm font-mono font-bold tracking-wider text-sb-accent transition-all hover:bg-sb-accent hover:text-sb-bg-primary disabled:opacity-50"
          >
            {isLoading ? 'LOADING...' : isAuthenticated ? 'SUBSCRIBE NOW' : 'LOG IN TO SUBSCRIBE'}
          </button>
          <p className="text-center text-[9px] font-mono text-sb-text-tertiary mt-2">
            Cancel anytime. Content is always free.
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HOOK: useUpgradeModal
// ═══════════════════════════════════════════════════════════════

export function useUpgradeModal() {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    feature: string;
  }>({ isOpen: false, feature: '' });

  const openUpgradeModal = useCallback((feature: string) => {
    setModalState({ isOpen: true, feature });
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setModalState({ isOpen: false, feature: '' });
  }, []);

  return {
    isUpgradeModalOpen: modalState.isOpen,
    upgradeFeature: modalState.feature,
    openUpgradeModal,
    closeUpgradeModal,
  };
}
