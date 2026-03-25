import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { humans, humanProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

const RESERVED_USERNAMES = new Set([
  'build-avatar', 'profile', 'settings', 'admin', 'api',
  'sign-in', 'sign-up', 'sanctuary', 'botspace', 'expertspace',
  'peoplespace', 'lab', 'feed', 'themes', 'terminal',
  'welcome', 'heartbeat', 'pricing', 'live', 'factions', 'humans',
]);

async function generateUsername(name: string, email: string): Promise<string> {
  const base = (name || email.split('@')[0])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'user';

  let slug = base;
  if (RESERVED_USERNAMES.has(slug)) {
    slug = `${base}-1`;
  }

  let suffix = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db
      .select({ id: humans.id })
      .from(humans)
      .where(eq(humans.username, slug))
      .limit(1);
    if (existing.length === 0) break;
    slug = `${base}-${suffix}`;
    suffix++;
  }

  return slug;
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SIGNING_SECRET;
  if (!WEBHOOK_SECRET) {
    console.error('[Clerk Webhook] WEBHOOK_SIGNING_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // Get Svix verification headers
  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  // Verify webhook signature
  const body = await req.text();
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: any;

  try {
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('[Clerk Webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const eventType = evt.type as string;
  const data = evt.data;

  try {
    if (eventType === 'user.created') {
      const clerkId = data.id as string;
      const email = (data.email_addresses?.[0]?.email_address || '') as string;
      const firstName = (data.first_name || '') as string;
      const lastName = (data.last_name || '') as string;
      const fullName = `${firstName} ${lastName}`.trim() || email.split('@')[0];

      const username = await generateUsername(fullName, email);

      const [newHuman] = await db
        .insert(humans)
        .values({
          clerkId,
          email,
          name: fullName,
          username,
          passwordHash: '$2b$10$CLERK_MANAGED_AUTH_NO_PASSWORD',
          isEmailVerified: true,
          isPublic: true,
        })
        .returning({ id: humans.id });

      await db.insert(humanProfiles).values({
        humanId: newHuman.id,
      });

      console.log(`[Clerk Webhook] user.created: ${fullName} (@${username}) clerkId=${clerkId}`);
    }

    if (eventType === 'user.updated') {
      const clerkId = data.id as string;
      const email = data.email_addresses?.[0]?.email_address as string | undefined;
      const firstName = (data.first_name || '') as string;
      const lastName = (data.last_name || '') as string;
      const fullName = `${firstName} ${lastName}`.trim();

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (email) updates.email = email;
      if (fullName) updates.name = fullName;

      await db
        .update(humans)
        .set(updates)
        .where(eq(humans.clerkId, clerkId));

      console.log(`[Clerk Webhook] user.updated: clerkId=${clerkId} fields=${Object.keys(updates).join(',')}`);
    }

    if (eventType === 'user.deleted') {
      const clerkId = data.id as string;

      const [human] = await db
        .select({ id: humans.id })
        .from(humans)
        .where(eq(humans.clerkId, clerkId))
        .limit(1);

      if (human) {
        await db.delete(humanProfiles).where(eq(humanProfiles.humanId, human.id));
        await db.delete(humans).where(eq(humans.clerkId, clerkId));
        console.log(`[Clerk Webhook] user.deleted: clerkId=${clerkId} humanId=${human.id}`);
      } else {
        console.log(`[Clerk Webhook] user.deleted: clerkId=${clerkId} — no matching human found`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[Clerk Webhook] Error processing ${eventType}:`, error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
