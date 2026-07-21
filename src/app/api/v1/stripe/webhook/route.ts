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
import { and, eq, isNull, or } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Map Stripe price IDs to subscription tiers
 */
function getTierFromPrice(priceId: string): string | null {
  const monthlyPrice = process.env.STRIPE_PRICE_MONTHLY || '';
  const yearlyPrice = process.env.STRIPE_PRICE_YEARLY || '';

  if (priceId === monthlyPrice || priceId === yearlyPrice) {
    return 'pro';
  }
  return null;
}

/**
 * Read the billing period from the same subscription item used for the tier.
 * Stripe v20 exposes the authoritative period end on SubscriptionItem.
 */
function getSubscriptionExpiry(subscription: Stripe.Subscription): Date | null {
  const periodEnd = subscription.items.data[0]?.current_period_end;

  if (
    typeof periodEnd !== 'number' ||
    !Number.isSafeInteger(periodEnd) ||
    periodEnd <= 0
  ) {
    return null;
  }

  const expiresAt = new Date(periodEnd * 1000);
  return Number.isNaN(expiresAt.getTime()) ? null : expiresAt;
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
      logger.warn('Stripe webhook signature rejected', {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    logger.info('Stripe webhook received', { eventType: event.type });

    // 3. Handle events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const humanId = session.metadata?.humanId;

        if (!humanId) {
          logger.error('Stripe checkout session missing human identity', {
            sessionId: session.id,
          });
          break;
        }

        // Get subscription details
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          const tier = getTierFromPrice(subscription.items.data[0]?.price.id || '');
          const expiresAt = getSubscriptionExpiry(subscription);
          const isActive = ['active', 'trialing'].includes(subscription.status);
          const entitlementTier = isActive && expiresAt && tier ? tier : 'free_trial';

          if (entitlementTier === 'free_trial') {
            logger.error('Stripe subscription has invalid billing period; premium access not granted', {
              priceRecognized: Boolean(tier),
              status: subscription.status,
              subscriptionId: subscription.id,
            });
          }

          const customerId = session.customer as string;
          const [activatedHuman] = await db
            .update(humans)
            .set({
              subscriptionTier: entitlementTier,
              subscriptionStartedAt: entitlementTier === 'free_trial' ? null : new Date(),
              subscriptionExpiresAt: entitlementTier === 'free_trial' ? null : expiresAt,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscription.id,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(humans.id, humanId),
                or(
                  isNull(humans.stripeCustomerId),
                  eq(humans.stripeCustomerId, customerId)
                )
              )
            )
            .returning({ id: humans.id });

          if (!activatedHuman) {
            logger.warn('Stale Stripe checkout completion ignored', {
              humanId,
              subscriptionId: subscription.id,
            });
            break;
          }

          logger.info('Stripe subscription activated', {
            humanId,
            tier: entitlementTier,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const humanId = subscription.metadata?.humanId;

        if (!humanId) {
          logger.error('Stripe subscription missing human identity', {
            subscriptionId: subscription.id,
          });
          break;
        }

        const tier = getTierFromPrice(subscription.items.data[0]?.price.id || '');
        const isActive = ['active', 'trialing'].includes(subscription.status);
        const expiresAt = getSubscriptionExpiry(subscription);
        const entitlementTier = isActive && expiresAt && tier ? tier : 'free_trial';

        if (isActive && (!expiresAt || !tier)) {
          logger.error('Stripe subscription has invalid billing period; premium access revoked', {
            priceRecognized: Boolean(tier),
            subscriptionId: subscription.id,
          });
        }

        const [updatedHuman] = await db
          .update(humans)
          .set({
            subscriptionTier: entitlementTier,
            subscriptionExpiresAt: entitlementTier === 'free_trial' ? null : expiresAt,
            stripeSubscriptionId: subscription.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(humans.id, humanId),
              eq(humans.stripeCustomerId, subscription.customer as string),
              or(
                isNull(humans.stripeSubscriptionId),
                eq(humans.stripeSubscriptionId, subscription.id)
              )
            )
          )
          .returning({ id: humans.id });

        if (!updatedHuman) {
          logger.warn('Stale Stripe subscription update ignored', {
            humanId,
            subscriptionId: subscription.id,
          });
          break;
        }

        logger.info('Stripe subscription updated', {
          humanId,
          status: subscription.status,
          tier: entitlementTier,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const humanId = subscription.metadata?.humanId;
        const customerId = subscription.customer as string;
        const [human] = await db
          .select({ id: humans.id, subscriptionId: humans.stripeSubscriptionId })
          .from(humans)
          .where(
            humanId
              ? and(
                  eq(humans.id, humanId),
                  eq(humans.stripeCustomerId, customerId)
                )
              : eq(humans.stripeCustomerId, customerId)
          )
          .limit(1);

        if (!human || human.subscriptionId !== subscription.id) {
          logger.warn('Stale Stripe subscription deletion ignored', {
            humanId: human?.id || humanId,
            subscriptionId: subscription.id,
          });
          break;
        }

        const [cancelledHuman] = await db
          .update(humans)
          .set({
            subscriptionTier: 'free_trial',
            subscriptionExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(humans.id, human.id),
              eq(humans.stripeSubscriptionId, subscription.id)
            )
          )
          .returning({ id: humans.id });

        if (cancelledHuman) {
          logger.info('Stripe subscription cancelled', { humanId: human.id });
        }
        break;
      }

      default:
        logger.debug('Stripe webhook event ignored', { eventType: event.type });
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    logger.error('Stripe webhook failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
