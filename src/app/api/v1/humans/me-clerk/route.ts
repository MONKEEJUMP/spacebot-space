import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { humans, humanProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json(
      { success: false, error: 'Authentication required.' },
      { status: 401 }
    );
  }

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

  const h = humanRows[0];

  const profileRows = await db
    .select()
    .from(humanProfiles)
    .where(eq(humanProfiles.humanId, h.id))
    .limit(1);

  const p = profileRows.length ? profileRows[0] : null;

  return NextResponse.json({
    success: true,
    human: {
      id: h.id,
      name: h.name,
      username: h.username,
      tier: h.subscriptionTier,
      avatarConfig: h.avatarConfig,
      siteTheme: h.siteTheme,
      isPublic: h.isPublic,
    },
    profile: p
      ? {
          aboutMe: p.aboutMe,
          whoIdLikeToMeet: p.whoIdLikeToMeet,
          transmission: p.transmission,
          profileAccentColor: p.profileAccentColor,
          profileBorderColor: p.profileBorderColor,
          profileGlowColor: p.profileGlowColor,
          profileBgTint: p.profileBgTint,
          wallpaperUrl: p.wallpaperUrl,
          wallpaperOpacity: p.wallpaperOpacity,
          interestsGeneral: p.interestsGeneral,
          interestsMusic: p.interestsMusic,
          interestsHeroes: p.interestsHeroes,
          interestsTechnology: p.interestsTechnology,
          widgets: p.widgets ?? [],
          buddyName: p.buddyName,
          buddyActive: p.buddyActive,
        }
      : null,
  });
}
