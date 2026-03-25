/**
 * AI BUDDY SANDBOX — Profile API
 * GET /api/v1/buddy/profile
 * Returns current state of owner's profile from human_profiles table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, humans, humanProfiles, botActivity } from '@/db';
import { eq, desc } from 'drizzle-orm';
import {
  validateBuddyToken,
  forbiddenResponse,
  buddyInternalError,
} from '@/lib/buddy/validate-token';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const buddy = validateBuddyToken(request);
    if (!buddy) {
      return forbiddenResponse('Invalid or missing buddy token');
    }

    const [human] = await db
      .select({
        id: humans.id,
        name: humans.name,
        subscriptionTier: humans.subscriptionTier,
        avatarConfig: humans.avatarConfig,
        siteTheme: humans.siteTheme,
        createdAt: humans.createdAt,
      })
      .from(humans)
      .where(eq(humans.id, buddy.user_id))
      .limit(1);

    if (!human) {
      return NextResponse.json(
        { success: false, error: 'Owner profile not found' },
        { status: 404 }
      );
    }

    const [profile] = await db
      .select()
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, buddy.user_id))
      .limit(1);

    const recentWallPosts = await db
      .select({
        id: botActivity.id,
        content: botActivity.content,
        title: botActivity.title,
        metadata: botActivity.metadata,
        createdAt: botActivity.createdAt,
      })
      .from(botActivity)
      .where(eq(botActivity.activityType, 'buddy_wall_post'))
      .orderBy(desc(botActivity.createdAt))
      .limit(10);

    return NextResponse.json({
      success: true,
      user: {
        id: human.id,
        username: human.name,
        tier: human.subscriptionTier,
        avatar_config: human.avatarConfig || null,
        site_theme: human.siteTheme || 'dark',
        joined_at: human.createdAt,
      },
      profile: profile
        ? {
            about_me: profile.aboutMe,
            who_id_like_to_meet: profile.whoIdLikeToMeet,
            theme: {
              accent_color: profile.profileAccentColor,
              border_color: profile.profileBorderColor,
              glow_color: profile.profileGlowColor,
              bg_tint: profile.profileBgTint,
            },
            wallpaper: {
              url: profile.wallpaperUrl,
              opacity: profile.wallpaperOpacity,
            },
            interests: {
              general: profile.interestsGeneral,
              music: profile.interestsMusic,
              heroes: profile.interestsHeroes,
              technology: profile.interestsTechnology,
            },
            transmission: profile.transmission,
            widgets: profile.widgets,
            buddy_name: profile.buddyName,
            buddy_active: profile.buddyActive,
            updated_at: profile.updatedAt,
          }
        : null,
      wall_posts: recentWallPosts.map((a) => ({
        id: a.id,
        content: a.content,
        title: a.title,
        created_at: a.createdAt,
        metadata: a.metadata,
      })),
      buddy: {
        name: buddy.buddy_name,
        owner: buddy.owner,
      },
    });
  } catch (error) {
    console.error('[buddy/profile] Error:', error);
    return buddyInternalError('Failed to fetch profile');
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
