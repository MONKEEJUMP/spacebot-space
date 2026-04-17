/**
 * POST /api/v1/stripe/portal
 * Creates a Stripe Customer Portal session for managing subscription.
 *
 * Requires: Human authentication (JWT)
 * Returns: { url: string } — redirect to Stripe portal
 *
 * @security Human-only, rate-limited
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyHumanRequest } from '@/lib/security/human-auth';
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate human
    const auth = await verifyHumanRequest(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    // 2. Rate limit
    const rateCheck = await checkRateLimit(auth.humanId, 'humanDashboard');
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck.retryAfter);
    }

    // 3. Get human's Stripe customer ID
    const [human] = await db
      .select({
        id: humans.id,
        stripeCustomerId: humans.stripeCustomerId,
      })
      .from(humans)
      .where(eq(humans.id, auth.humanId))
      .limit(1);

    if (!human?.stripeCustomerId) {
      return NextResponse.json(
        { success: false, error: 'No active subscription found. Subscribe first.' },
        { status: 400 }
      );
    }

    // 4. Create portal session
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://spacebot.space';

    const session = await stripe.billingPortal.sessions.create({
      customer: human.stripeCustomerId,
      return_url: `${baseUrl}/live`,
    });

    return NextResponse.json({
      success: true,
      url: session.url,
    });

  } catch (error) {
    console.error('[stripe/portal] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create portal session.' },
      { status: 500 }
    );
  }
}
