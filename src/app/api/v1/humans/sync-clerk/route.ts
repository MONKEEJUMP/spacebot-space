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
  const adminKey = req.headers.get('x-admin-key');
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!adminKey || !secretKey || adminKey !== secretKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const allUsers: any[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const res = await fetch(
        `https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${secretKey}` } },
      );

      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json(
          { error: 'Clerk API error', details: errText },
          { status: 502 },
        );
      }

      const users = await res.json();
      if (!Array.isArray(users) || users.length === 0) break;
      allUsers.push(...users);
      if (users.length < limit) break;
      offset += limit;
    }

    let linked = 0;
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const user of allUsers) {
      const clerkId = user.id as string;
      const email = (user.email_addresses?.[0]?.email_address || '') as string;
      const firstName = (user.first_name || '') as string;
      const lastName = (user.last_name || '') as string;
      const fullName = `${firstName} ${lastName}`.trim() || email.split('@')[0];

      if (!email) {
        skipped++;
        continue;
      }

      try {
        // Already linked by clerkId — skip
        const [existingByClerk] = await db
          .select({ id: humans.id })
          .from(humans)
          .where(eq(humans.clerkId, clerkId))
          .limit(1);

        if (existingByClerk) {
          skipped++;
          continue;
        }

        // Exists by email but no clerkId — link them
        const [existingByEmail] = await db
          .select({ id: humans.id, clerkId: humans.clerkId })
          .from(humans)
          .where(eq(humans.email, email))
          .limit(1);

        if (existingByEmail && !existingByEmail.clerkId) {
          const username = await generateUsername(fullName, email);
          await db
            .update(humans)
            .set({
              clerkId,
              username,
              isEmailVerified: true,
              updatedAt: new Date(),
            })
            .where(eq(humans.id, existingByEmail.id));
          linked++;
          continue;
        }

        if (existingByEmail) {
          skipped++;
          continue;
        }

        // Brand new — create human + profile
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

        created++;
      } catch (err: any) {
        errors.push(`${email}: ${err.message}`);
      }
    }

    return NextResponse.json({
      total: allUsers.length,
      linked,
      created,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[Sync Clerk] Error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error.message },
      { status: 500 },
    );
  }
}
