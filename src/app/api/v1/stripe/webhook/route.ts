/**
 * POST /api/v1/stripe/webhook
 * Handles Stripe webhook events.
 *
 * Events handled:
 * - checkout.session.completed → Activate subscription
 * - customer.subscription.updated → Update tier/dates
 * - customer.subscription.deleted → Downgrade to free
 *
 * @security Stripe signature verification, no auth required
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Map Stripe price IDs to subscription tiers
 */
function getTierFromPrice(priceId: string): string {
  const monthlyPrice = process.env.STRIPE_PRICE_MONTHLY || '';
  const yearlyPrice = process.env.STRIPE_PRICE_YEARLY || '';

  if (priceId === monthlyPrice || priceId === yearlyPrice) {
    return 'pro';
  }
  return 'basic';
}

/**
 * Compute subscription expiry from the plan's recurring interval.
 * Stripe v20 (2026-01-28.clover) removed current_period_end from Subscription.
 * We derive expiry from the price's interval instead.
 */
function computeExpiryFromInterval(subscription: Stripe.Subscription): Date {
  const interval = subscription.items.data[0]?.price?.recurring?.interval;
  const now = new Date();

  switch (interval) {
    case 'year':
      return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    case 'month':
    default:
      return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    // 2. Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('[stripe/webhook] Signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    console.log(`[stripe/webhook] Event: ${event.type}`);

    // 3. Handle events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const humanId = session.metadata?.humanId;

        if (!humanId) {
          console.error('[stripe/webhook] No humanId in session metadata');
          break;
        }

        // Get subscription details
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          const tier = getTierFromPrice(subscription.items.data[0]?.price.id || '');
          const expiresAt = computeExpiryFromInterval(subscription);

          await db
            .update(humans)
            .set({
              subscriptionTier: tier,
              subscriptionStartedAt: new Date(),
              subscriptionExpiresAt: expiresAt,
              stripeCustomerId: session.customer as string,
              updatedAt: new Date(),
            })
            .where(eq(humans.id, humanId));

          console.log(`[stripe/webhook] Activated ${tier} for human ${humanId}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const humanId = subscription.metadata?.humanId;

        if (!humanId) {
          console.error('[stripe/webhook] No humanId in subscription metadata');
          break;
        }

        const tier = getTierFromPrice(subscription.items.data[0]?.price.id || '');
        const isActive = ['active', 'trialing'].includes(subscription.status);
        const expiresAt = computeExpiryFromInterval(subscription);

        await db
          .update(humans)
          .set({
            subscriptionTier: isActive ? tier : 'free_trial',
            subscriptionExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(humans.id, humanId));

        console.log(`[stripe/webhook] Updated subscription for human ${humanId}: ${tier} (${subscription.status})`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const humanId = subscription.metadata?.humanId;

        if (!humanId) {
          // Try to find by Stripe customer ID
          const customerId = subscription.customer as string;
          const [human] = await db
            .select({ id: humans.id })
            .from(humans)
            .where(eq(humans.stripeCustomerId, customerId))
            .limit(1);

          if (human) {
            await db
              .update(humans)
              .set({
                subscriptionTier: 'free_trial',
                subscriptionExpiresAt: null,
                updatedAt: new Date(),
              })
              .where(eq(humans.id, human.id));

            console.log(`[stripe/webhook] Cancelled subscription for human ${human.id} (via customer lookup)`);
          }
          break;
        }

        await db
          .update(humans)
          .set({
            subscriptionTier: 'free_trial',
            subscriptionExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(humans.id, humanId));

        console.log(`[stripe/webhook] Cancelled subscription for human ${humanId}`);
        break;
      }

      default:
        console.log(`[stripe/webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('[stripe/webhook] Error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
