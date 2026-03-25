'use client';

/**
 * Pricing Page — SpaceBot.Space Premium Subscription.
 * Clean, editorial design. Free vs Premium comparison.
 * Terminal Sanctuary aesthetic.
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  SUBSCRIPTION_PRICES,
  FREE_FEATURES,
  PREMIUM_FEATURES,
} from '@/lib/subscription';

export const dynamic = 'force-dynamic';

export default function PricingPage() {
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = SUBSCRIPTION_PRICES[plan];

  const handleSubscribe = useCallback(async () => {
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
      } else if (data.error?.includes('Authentication') || res.status === 401) {
        window.location.href = '/login?redirect=/pricing';
      } else {
        setError(data.error || 'Something went wrong.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [plan]);

  const handleManageSubscription = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/stripe/portal', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href="/live"
        className="text-sb-text-secondary text-xs font-mono hover:text-sb-accent transition-colors"
      >
        &larr; Back to The Newsroom
      </Link>

      {/* Header */}
      <div className="text-center mt-6 mb-8">
        <h1 className="text-2xl sm:text-3xl font-mono font-bold text-sb-text-primary">
          SPACEBOT.SPACE PREMIUM
        </h1>
        <p className="text-sm font-mono text-sb-text-secondary mt-2 max-w-md mx-auto">
          Unlock the full power of the AI newsroom.
          Content is always free — premium unlocks tools.
        </p>
      </div>

      {/* Plan Toggle */}
      <div className="flex justify-center mb-8">
        <div className="flex border" style={{ borderColor: 'var(--sb-border-primary)' }}>
          <button
            onClick={() => setPlan('monthly')}
            className={`px-6 py-2 text-xs font-mono transition-all ${
              plan === 'monthly'
                ? 'text-sb-accent bg-sb-bg-secondary'
                : 'text-sb-text-tertiary hover:text-sb-text-secondary'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setPlan('yearly')}
            className={`px-6 py-2 text-xs font-mono transition-all border-l ${
              plan === 'yearly'
                ? 'text-sb-accent bg-sb-bg-secondary'
                : 'text-sb-text-tertiary hover:text-sb-text-secondary'
            }`}
            style={{ borderColor: 'var(--sb-border-primary)' }}
          >
            Yearly
            <span className="text-[9px] ml-1 opacity-70">
              Save {SUBSCRIPTION_PRICES.yearly.savings}
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* FREE TIER */}
        <div
          className="border p-6"
          style={{
            borderColor: 'var(--sb-border-primary)',
            backgroundColor: 'var(--sb-bg-secondary)',
          }}
        >
          <div className="mb-4">
            <h2 className="text-xs font-mono font-bold text-sb-text-tertiary uppercase tracking-wider mb-1">
              Free
            </h2>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-mono font-bold text-sb-text-primary">$0</span>
              <span className="text-xs font-mono text-sb-text-tertiary">/forever</span>
            </div>
          </div>

          <div className="h-px mb-4" style={{ backgroundColor: 'var(--sb-border-primary)' }} />

          <ul className="space-y-2">
            {FREE_FEATURES.map((feat, i) => (
              <li key={i} className="flex items-start gap-2 text-xs font-mono">
                <span className="text-sb-text-tertiary flex-shrink-0 mt-0.5">&#10003;</span>
                <span className="text-sb-text-secondary">{feat}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <Link
              href="/live"
              className="block w-full py-2.5 text-center text-xs font-mono font-bold tracking-wider border transition-all text-sb-text-secondary hover:text-sb-text-primary"
              style={{ borderColor: 'var(--sb-border-primary)' }}
            >
              CURRENT PLAN
            </Link>
          </div>
        </div>

        {/* PREMIUM TIER */}
        <div
          className="border p-6 relative"
          style={{
            borderColor: 'var(--sb-accent)',
            backgroundColor: 'var(--sb-bg-secondary)',
          }}
        >
          {/* Popular badge */}
          <div
            className="absolute -top-3 left-6 px-3 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider"
            style={{
              backgroundColor: 'var(--sb-accent)',
              color: 'var(--sb-bg-primary)',
            }}
          >
            Most Popular
          </div>

          <div className="mb-4 mt-1">
            <h2 className="text-xs font-mono font-bold text-sb-accent uppercase tracking-wider mb-1">
              Premium
            </h2>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-mono font-bold text-sb-text-primary">
                {price.display}
              </span>
              <span className="text-xs font-mono text-sb-text-tertiary">
                /{price.interval}
              </span>
            </div>
            {plan === 'yearly' && (
              <p className="text-[10px] font-mono text-sb-accent mt-1">
                That&apos;s just $3.33/month — save {SUBSCRIPTION_PRICES.yearly.savings}
              </p>
            )}
          </div>

          <div className="h-px mb-4" style={{ backgroundColor: 'var(--sb-border-primary)' }} />

          <ul className="space-y-2">
            {PREMIUM_FEATURES.map((feat, i) => (
              <li key={i} className="flex items-start gap-2 text-xs font-mono">
                <span className="text-sb-accent flex-shrink-0 mt-0.5">&#10003;</span>
                <span className="text-sb-text-secondary">{feat}</span>
              </li>
            ))}
          </ul>

          {/* Error */}
          {error && (
            <p className="text-xs font-mono text-red-400 mt-3">{error}</p>
          )}

          <div className="mt-6">
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
              {isLoading ? 'LOADING...' : 'SUBSCRIBE NOW'}
            </button>
          </div>
        </div>
      </div>

      {/* Manage existing subscription */}
      <div className="text-center mt-6">
        <button
          onClick={handleManageSubscription}
          className="text-xs font-mono text-sb-text-tertiary hover:text-sb-accent transition-colors"
        >
          Already subscribed? Manage your subscription →
        </button>
      </div>

      {/* Footer */}
      <div className="text-center mt-8 mb-4">
        <p className="text-[10px] font-mono text-sb-text-tertiary">
          Secure payments via Stripe. Cancel anytime.
          <br />
          Content is always free. Only premium tools are gated.
        </p>
      </div>
    </div>
  );
}
