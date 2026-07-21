"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

export const dynamic = "force-dynamic";

const BORDER_STYLE = { borderColor: "var(--sb-border-primary)" };
const CARD_STYLE = {
  borderColor: "var(--sb-border-primary)",
  backgroundColor: "var(--sb-bg-secondary)",
};
const PREVIEW_CARD_STYLE = {
  borderColor: "var(--sb-accent)",
  backgroundColor: "var(--sb-bg-secondary)",
};

export default function PricingPage() {
  const [isManaging, setIsManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManageSubscription = useCallback(async () => {
    setIsManaging(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/stripe/portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      if (data.success && data.url) {
        window.location.href = data.url;
      } else if (
        data.error?.includes("Authentication") ||
        response.status === 401
      ) {
        window.location.href = "/sign-in?redirect_url=%2Fpricing";
      } else {
        setError(data.error || "Unable to open the billing portal.");
      }
    } catch {
      setError("The billing portal could not be reached.");
    } finally {
      setIsManaging(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/live"
        className="text-xs font-mono text-sb-text-secondary transition-colors hover:text-sb-accent"
      >
        &larr; Back to The Newsroom
      </Link>

      <div className="mb-8 mt-6 text-center">
        <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.24em] text-sb-accent">
          Billing preview
        </p>
        <h1 className="text-2xl font-bold font-mono text-sb-text-primary sm:text-3xl">
          PLANS &amp; BILLING
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm font-mono text-sb-text-secondary">
          New paid subscriptions are paused. This page will not start checkout,
          create a Stripe session, or collect a new payment.
        </p>
      </div>

      <div
        className="mb-8 border-l-4 p-4 font-mono text-sm text-sb-text-secondary"
        style={PREVIEW_CARD_STYLE}
        role="status"
      >
        Paid capabilities remain a preview until feature enforcement, retry-safe
        subscription state, and browser proof are complete.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="border p-6" style={CARD_STYLE}>
          <p className="text-xs font-bold font-mono uppercase tracking-wider text-sb-text-tertiary">
            Current access
          </p>
          <p className="mt-2 text-2xl font-bold font-mono text-sb-text-primary">
            $0
          </p>
          <div
            className="my-4 h-px bg-sb-border-primary"
            style={BORDER_STYLE}
          />
          <p className="text-xs leading-5 font-mono text-sb-text-secondary">
            Publicly available SpaceBot.Space areas remain accessible under
            their current authentication and safety boundaries.
          </p>
          <Link
            href="/live"
            className="mt-6 block w-full border py-2.5 text-center text-xs font-bold font-mono tracking-wider text-sb-text-secondary transition-colors hover:text-sb-text-primary"
            style={BORDER_STYLE}
          >
            CONTINUE WITH CURRENT ACCESS
          </Link>
        </section>

        <section className="relative border p-6" style={PREVIEW_CARD_STYLE}>
          <div className="absolute -top-3 left-6 bg-sb-accent px-3 py-0.5 text-[10px] font-bold font-mono uppercase tracking-wider text-sb-bg-primary">
            Preview only
          </div>
          <p className="mt-1 text-xs font-bold font-mono uppercase tracking-wider text-sb-accent">
            Paid plans
          </p>
          <p className="mt-2 text-2xl font-bold font-mono text-sb-text-primary">
            Not for sale
          </p>
          <div
            className="my-4 h-px bg-sb-border-primary"
            style={BORDER_STYLE}
          />
          <p className="text-xs leading-5 font-mono text-sb-text-secondary">
            No price or premium entitlement is being offered as active until the
            advertised capabilities are implemented and verifiable.
          </p>
          <button
            type="button"
            disabled
            className="mt-6 w-full cursor-not-allowed border border-sb-accent bg-transparent py-2.5 text-sm font-bold font-mono tracking-wider text-sb-accent opacity-50"
          >
            NEW CHECKOUT DISABLED
          </button>
        </section>
      </div>

      <div className="mt-7 text-center">
        <p className="mb-3 text-xs font-mono text-sb-text-tertiary">
          Existing subscriber? The billing-management path remains separate from
          new checkout.
        </p>
        <button
          type="button"
          onClick={handleManageSubscription}
          disabled={isManaging}
          className="text-xs font-mono text-sb-text-tertiary transition-colors hover:text-sb-accent disabled:cursor-wait disabled:opacity-50"
        >
          {isManaging
            ? "Opening billing portal..."
            : "Manage an existing subscription →"}
        </button>
        {error ? (
          <p className="mt-3 text-xs font-mono text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
