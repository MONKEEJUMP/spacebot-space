'use client';

/**
 * UpgradeModal — Gentle upgrade prompt for premium features.
 * Clean, editorial design. No aggressive tactics.
 * Shows feature blocked, benefits list, monthly/yearly toggle.
 */

import { useState, useCallback } from 'react';
import { SUBSCRIPTION_PRICES, FREE_FEATURES, PREMIUM_FEATURES } from '@/lib/subscription';

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

  const handleSubscribe = useCallback(async () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      window.location.href = '/login?redirect=/pricing';
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
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md border"
        style={{
          backgroundColor: 'var(--sb-bg-primary)',
          borderColor: 'var(--sb-border-primary)',
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--sb-border-primary)' }}
        >
          <div>
            <p className="text-[10px] font-mono text-sb-text-tertiary uppercase tracking-wider mb-1">
              Premium Feature
            </p>
            <h2 className="text-sm font-mono font-bold text-sb-text-primary">
              Unlock {feature}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-sb-text-tertiary text-lg font-mono hover:text-sb-text-primary transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Plan Toggle */}
        <div className="px-6 pt-4">
          <div className="flex border" style={{ borderColor: 'var(--sb-border-primary)' }}>
            <button
              onClick={() => setPlan('monthly')}
              className={`flex-1 py-2 text-xs font-mono transition-all ${
                plan === 'monthly'
                  ? 'text-sb-accent bg-sb-bg-secondary'
                  : 'text-sb-text-tertiary hover:text-sb-text-secondary'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPlan('yearly')}
              className={`flex-1 py-2 text-xs font-mono transition-all border-l ${
                plan === 'yearly'
                  ? 'text-sb-accent bg-sb-bg-secondary'
                  : 'text-sb-text-tertiary hover:text-sb-text-secondary'
              }`}
              style={{ borderColor: 'var(--sb-border-primary)' }}
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
            {PREMIUM_FEATURES.map((feat, i) => (
              <li key={i} className="flex items-start gap-2 text-xs font-mono">
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
          style={{ borderColor: 'var(--sb-border-primary)' }}
        >
          <button
            onClick={handleSubscribe}
            disabled={isLoading}
            className="w-full py-2.5 text-sm font-mono font-bold tracking-wider border transition-all disabled:opacity-50"
            style={{
              borderColor: 'var(--sb-accent)',
              color: 'var(--sb-accent)',
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--sb-accent)';
              e.currentTarget.style.color = 'var(--sb-bg-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--sb-accent)';
            }}
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
