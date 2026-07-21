import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { humans, humanProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { checkRateLimit, getClientIP, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';
import { resolveHumanIdentity } from '@/lib/security/claiming-human';
import { SITE_THEME_IDS } from '@/types/theme';

export async function PUT(request: NextRequest) {
  // Rate limit
  const ip = getClientIP(request);
  const rateLimitResult = await checkRateLimit(ip, 'humanProfile');
  if (!rateLimitResult.allowed) {
    return rateLimitDeniedResponse(rateLimitResult, () =>
      NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Try again later.' },
        { status: 429 }
      )
    );
  }

  const identity = await resolveHumanIdentity();
  if (!identity.success) {
    return NextResponse.json(
      { success: false, error: identity.error },
      { status: identity.status }
    );
  }

  // Resolve Clerk or migration-era human auth to the canonical internal UUID.
  const humanRows = await db
    .select()
    .from(humans)
    .where(eq(humans.id, identity.humanId))
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
  if (body.siteTheme !== undefined) {
    if (
      typeof body.siteTheme !== 'string' ||
      !(SITE_THEME_IDS as readonly string[]).includes(body.siteTheme)
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid site theme.' },
        { status: 400 }
      );
    }
    humanUpdates.siteTheme = body.siteTheme;
  }
  if (body.avatarConfig !== undefined) {
    if (
      body.avatarConfig === null ||
      typeof body.avatarConfig !== 'object' ||
      Array.isArray(body.avatarConfig)
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid avatar configuration.' },
        { status: 400 }
      );
    }
    humanUpdates.avatarConfig = body.avatarConfig;
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

  await db.transaction(async (tx) => {
    if (Object.keys(humanUpdates).length > 0) {
      humanUpdates.updatedAt = new Date();
      await tx.update(humans).set(humanUpdates).where(eq(humans.id, human.id));
    }

    if (Object.keys(profileUpdates).length > 0) {
      profileUpdates.updatedAt = new Date();
      await tx.insert(humanProfiles).values({
        humanId: human.id,
        ...profileUpdates,
      }).onConflictDoUpdate({
        target: humanProfiles.humanId,
        set: profileUpdates,
      });
    }
  });

  return NextResponse.json({ success: true });
}
