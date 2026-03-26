import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { humans, humanProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';

export async function PUT(request: NextRequest) {
  // Rate limit
  const ip = getClientIP(request);
  const rateLimitResult = await checkRateLimit(ip, 'humanProfile');
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Try again later.' },
      { status: 429 }
    );
  }

  // Server-side Clerk auth verification
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json(
      { success: false, error: 'Authentication required.' },
      { status: 401 }
    );
  }

  // Find human by clerkId — verifies ownership
  const humanRows = await db
    .select()
    .from(humans)
    .where(eq(humans.clerkId, session.userId))
    .limit(1);

  if (!humanRows.length) {
    return NextResponse.json(
      { success: false, error: 'No linked profile found.' },
      { status: 404 }
    );
  }

  const human = humanRows[0];

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  // Update humans table fields (name, isPublic, siteTheme, avatarConfig)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const humanUpdates: Record<string, any> = {};
  if (typeof body.name === 'string') humanUpdates.name = body.name.slice(0, 100);
  if (typeof body.isPublic === 'boolean') humanUpdates.isPublic = body.isPublic;
  if (typeof body.siteTheme === 'string') humanUpdates.siteTheme = body.siteTheme.slice(0, 30);
  if (body.avatarConfig !== undefined) humanUpdates.avatarConfig = body.avatarConfig;

  if (Object.keys(humanUpdates).length > 0) {
    humanUpdates.updatedAt = new Date();
    await db.update(humans).set(humanUpdates).where(eq(humans.id, human.id));
  }

  // Update humanProfiles table fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileUpdates: Record<string, any> = {};
  const acceptStr = (key: string) => {
    if (typeof body[key] === 'string' || body[key] === null) {
      profileUpdates[key] = body[key];
    }
  };

  acceptStr('aboutMe');
  acceptStr('whoIdLikeToMeet');
  acceptStr('transmission');
  acceptStr('profileAccentColor');
  acceptStr('profileBorderColor');
  acceptStr('profileGlowColor');
  acceptStr('profileBgTint');
  acceptStr('wallpaperUrl');
  acceptStr('wallpaperOpacity');
  acceptStr('interestsGeneral');
  acceptStr('interestsMusic');
  acceptStr('interestsHeroes');
  acceptStr('interestsTechnology');
  acceptStr('status');
  acceptStr('coverPhoto');
  acceptStr('buddyName');

  if (Array.isArray(body.widgets)) profileUpdates.widgets = body.widgets;
  if (typeof body.buddyActive === 'boolean') profileUpdates.buddyActive = body.buddyActive;

  // Cover photo validation: must be base64 image, max ~7MB string (roughly 5MB image)
  if (typeof profileUpdates.coverPhoto === 'string' && profileUpdates.coverPhoto !== '') {
    if (!profileUpdates.coverPhoto.startsWith('data:image/')) {
      return NextResponse.json(
        { success: false, error: 'Cover photo must be a valid image.' },
        { status: 400 }
      );
    }
    if (profileUpdates.coverPhoto.length > 7 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'Cover photo too large. Maximum 5MB.' },
        { status: 400 }
      );
    }
  }

  if (Object.keys(profileUpdates).length > 0) {
    profileUpdates.updatedAt = new Date();

    // Upsert: update if exists, insert if not
    const existingProfile = await db
      .select({ id: humanProfiles.id })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, human.id))
      .limit(1);

    if (existingProfile.length) {
      await db.update(humanProfiles).set(profileUpdates).where(eq(humanProfiles.humanId, human.id));
    } else {
      await db.insert(humanProfiles).values({
        humanId: human.id,
        ...profileUpdates,
      });
    }
  }

  return NextResponse.json({ success: true });
}
