import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { ensureVerifiedClerkHuman } from '@/lib/security/claiming-human';
import { logger } from '@/lib/logger';

interface ClerkEmailAddress {
  id: string;
  email_address: string;
  verification?: { status?: string };
}

interface ClerkUserPayload {
  id: string;
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
  first_name?: string | null;
  last_name?: string | null;
}

interface ClerkWebhookPayload {
  type: string;
  data: ClerkUserPayload;
}

function getVerifiedPrimaryEmail(data: ClerkUserPayload): string | null {
  if (!data.primary_email_address_id) return null;
  const primary = data.email_addresses?.find(
    (address) => address.id === data.primary_email_address_id
  );
  if (!primary || primary.verification?.status !== 'verified') return null;
  return primary.email_address.trim().toLowerCase() || null;
}

export async function POST(req: Request) {
  const webhookSecret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!webhookSecret) {
    logger.error('Clerk webhook secret is not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  let event: ClerkWebhookPayload;
  try {
    const verified = new Webhook(webhookSecret).verify(await req.text(), {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
    event = verified as ClerkWebhookPayload;
  } catch (error) {
    logger.warn('Clerk webhook signature rejected', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    if (event.type === 'user.created' || event.type === 'user.updated') {
      const email = getVerifiedPrimaryEmail(event.data);
      if (!email) {
        logger.info('Clerk user deferred until primary email is verified', {
          clerkId: event.data.id,
          eventType: event.type,
        });
        return NextResponse.json({ received: true, deferred: true });
      }

      const fullName = [event.data.first_name, event.data.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
      const identity = await ensureVerifiedClerkHuman({
        clerkId: event.data.id,
        email,
        fullName,
      });
      if (!identity.success) {
        throw new Error(`Identity provisioning rejected (${identity.status}): ${identity.error}`);
      }

      logger.info('Clerk human identity synchronized', {
        clerkId: event.data.id,
        eventType: event.type,
        humanId: identity.humanId,
      });
    }

    if (event.type === 'user.deleted') {
      // Preserve human-agent ownership and content. A future verified Clerk
      // account must use an explicit recovery process; email reuse alone must
      // never inherit the deleted identity's agents or billing access.
      await db
        .update(humans)
        .set({
          clerkId: null,
          email: sql`concat('deleted+', ${humans.id}::text, '@deleted.spacebot.invalid')`,
          isEmailVerified: false,
          isPublic: false,
          emailVerificationToken: null,
          emailVerificationExpiresAt: null,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
          tokenVersion: sql`${humans.tokenVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(humans.clerkId, event.data.id));
      logger.info('Deleted Clerk identity detached from preserved human record', {
        clerkId: event.data.id,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Clerk webhook processing failed', {
      error: error instanceof Error ? error.message : String(error),
      eventType: event.type,
    });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
