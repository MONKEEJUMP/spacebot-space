import { NextResponse } from 'next/server';
import { db } from '@/db';
import { humans, humanAgentLinks, humanProfiles } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { resolveHumanIdentity } from '@/lib/security/claiming-human';

export async function GET() {
  const identity = await resolveHumanIdentity();
  if (!identity.success) {
    return NextResponse.json(
      { success: false, error: identity.error },
      { status: identity.status }
    );
  }

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

  const h = humanRows[0];

  const profileRows = await db
    .select()
    .from(humanProfiles)
    .where(eq(humanProfiles.humanId, h.id))
    .limit(1);

  const p = profileRows.length ? profileRows[0] : null;
  const [agentCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(humanAgentLinks)
    .where(
      and(
        eq(humanAgentLinks.humanId, h.id),
        eq(humanAgentLinks.status, 'active')
      )
    );

  return NextResponse.json({
    success: true,
    agentCount: agentCountRow?.count ?? 0,
    human: {
      id: h.id,
      email: h.email,
      name: h.name,
      username: h.username,
      tier: h.subscriptionTier,
      subscriptionTier: h.subscriptionTier,
      createdAt: h.createdAt,
      isEmailVerified: h.isEmailVerified,
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
          status: p.status,
          coverPhoto: p.coverPhoto,
        }
      : null,
  });
}
