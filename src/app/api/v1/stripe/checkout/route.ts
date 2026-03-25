/**
 * POST /api/v1/stripe/checkout
 * Creates a Stripe Checkout session for premium subscription.
 *
 * Requires: Human authentication (JWT)
 * Body: { plan: 'monthly' | 'yearly' }
 *
 * @security Human-only, rate-limited
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireClerkOrBotAuth, clerkUnauthorizedResponse } from '@/lib/security/clerk-auth';
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

// Stripe Price IDs (set in env)
const PRICE_IDS: Record<string, string> = {
  monthly: process.env.STRIPE_PRICE_MONTHLY || '',
  yearly: process.env.STRIPE_PRICE_YEARLY || '',
};

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate (Clerk session or bot API key)
    const authResult = await requireClerkOrBotAuth(request);
    if (!authResult) {
      return clerkUnauthorizedResponse();
    }
    const humanId = authResult.type === 'clerk' ? authResult.userId : authResult.agent.id;

    // 2. Rate limit
    const rateCheck = await checkRateLimit(humanId, 'humanDashboard');
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck.retryAfter);
    }

    // 3. Parse body
    const body = await request.json();
    const plan = body.plan as string;

    if (!plan || !['monthly', 'yearly'].includes(plan)) {
      return NextResponse.json(
        { success: false, error: 'Invalid plan. Must be "monthly" or "yearly".' },
        { status: 400 }
      );
    }

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return NextResponse.json(
        { success: false, error: 'Stripe prices not configured.' },
        { status: 500 }
      );
    }

    // 4. Get or create Stripe customer
    const [human] = await db
      .select({
        id: humans.id,
        email: humans.email,
        name: humans.name,
        stripeCustomerId: humans.stripeCustomerId,
        subscriptionTier: humans.subscriptionTier,
      })
      .from(humans)
      .where(eq(humans.id, humanId))
      .limit(1);

    if (!human) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    // Already premium?
    if (human.subscriptionTier !== 'free_trial') {
      return NextResponse.json(
        { success: false, error: 'You already have an active subscription. Use the billing portal to manage it.' },
        { status: 400 }
      );
    }

    let stripeCustomerId = human.stripeCustomerId;

    if (!stripeCustomerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: human.email,
        name: human.name,
        metadata: {
          humanId: human.id,
        },
      });
      stripeCustomerId = customer.id;

      // Save to DB
      await db
        .update(humans)
        .set({ stripeCustomerId: customer.id })
        .where(eq(humans.id, human.id));
    }

    // 5. Create Checkout Session
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://spacebot.space';

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/live?upgraded=true`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: {
        humanId: human.id,
      },
      subscription_data: {
        metadata: {
          humanId: human.id,
        },
      },
    });

    return NextResponse.json({
      success: true,
      url: session.url,
    });

  } catch (error) {
    console.error('[stripe/checkout] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create checkout session.' },
      { status: 500 }
    );
  }
}
