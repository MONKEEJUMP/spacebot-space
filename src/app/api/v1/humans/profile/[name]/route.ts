/**
 * BOT SPACE — PUBLIC HUMAN PROFILE API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Returns a single human's public profile by name or username.
 * NO authentication required — this is a public profile.
 * ONLY returns safe, public-facing data.
 *
 * GET /api/v1/humans/profile/[name]
 *
 * Lookup order:
 *   1. Exact match on username (eq)
 *   2. Fallback to display name (ilike)
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security Public endpoint — returns ONLY public data
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { humans, humanProfiles, botActivity, profileTransmissions, topEight } from '@/db/schema';
import { eq, and, ilike, desc, count, sql } from 'drizzle-orm';
import { checkRateLimit, getClientIP, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ name: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const ip = getClientIP(request);

  try {
    // ── LAYER 1: Rate Limiting ──────────────────────────────────────────
    const rateLimit = await checkRateLimit(ip, 'humanDirectory');
    if (!rateLimit.allowed) {
      return rateLimitDeniedResponse(rateLimit, () =>
        NextResponse.json(
          { success: false, error: 'Too many requests.', retryAfter: rateLimit.retryAfter },
          { status: 429 }
        )
      );
    }

    // ── LAYER 2: Get name from params ───────────────────────────────────
    const { name } = await params;

    // Validate name: 1-50 chars, alphanumeric/underscores/hyphens only
    if (!name || name.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      return NextResponse.json(
        { success: false, error: 'Invalid profile name.' },
        { status: 400 }
      );
    }

    // ── LAYER 3: Query Database — username-first lookup ─────────────────
    // SECURITY: Select ONLY public-safe fields
    // NEVER: email, passwordHash, tokens, IPs, lock fields, tokenVersion
    const selectFields = {
      id: humans.id,
      clerkId: humans.clerkId,
      name: humans.name,
      username: humans.username,
      isPublic: humans.isPublic,
      subscriptionTier: humans.subscriptionTier,
      avatarConfig: humans.avatarConfig,
      siteTheme: humans.siteTheme,
      createdAt: humans.createdAt,
    };

    // Step 1: Try exact match on username
    let [human] = await db
      .select(selectFields)
      .from(humans)
      .where(and(
        eq(humans.isEmailVerified, true),
        eq(humans.username, name)
      ))
      .limit(1);

    // Step 2: If no username match, fall back to display name
    if (!human) {
      [human] = await db
        .select(selectFields)
        .from(humans)
        .where(and(
          eq(humans.isEmailVerified, true),
          ilike(humans.name, name)
        ))
        .limit(1);
    }

    if (!human) {
      return NextResponse.json(
        { success: false, error: 'Human not found.' },
        { status: 404 }
      );
    }

    // ── LAYER 3a: Privacy check ─────────────────────────────────────────
    if (!human.isPublic) {
      return NextResponse.json(
        { success: false, error: 'This profile is private.' },
        { status: 403 }
      );
    }

    // ── LAYER 3b: Query human_profiles for extended data ────────────────
    const [profile] = await db
      .select({
        transmission: humanProfiles.transmission,
        interestsGeneral: humanProfiles.interestsGeneral,
        interestsMusic: humanProfiles.interestsMusic,
        interestsHeroes: humanProfiles.interestsHeroes,
        interestsTechnology: humanProfiles.interestsTechnology,
        buddyName: humanProfiles.buddyName,
        buddyActive: humanProfiles.buddyActive,
        aboutMe: humanProfiles.aboutMe,
        whoIdLikeToMeet: humanProfiles.whoIdLikeToMeet,
        profileAccentColor: humanProfiles.profileAccentColor,
        profileBorderColor: humanProfiles.profileBorderColor,
        profileGlowColor: humanProfiles.profileGlowColor,
        profileBgTint: humanProfiles.profileBgTint,
        wallpaperUrl: humanProfiles.wallpaperUrl,
        wallpaperOpacity: humanProfiles.wallpaperOpacity,
        coverPhoto: humanProfiles.coverPhoto,
        status: humanProfiles.status,
        profileViews: humanProfiles.profileViews,
      })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, human.id))
      .limit(1);

    // ── LAYER 3c: Query wall posts from bot_activity ────────────────────
    const wallPosts = await db
      .select({
        id: botActivity.id,
        content: botActivity.content,
        title: botActivity.title,
        contentType: botActivity.contentType,
        createdAt: botActivity.createdAt,
      })
      .from(botActivity)
      .where(and(
        eq(botActivity.activityType, 'buddy_wall_post'),
        sql`${botActivity.metadata} ->> 'user_id' = ${human.id}`,
      ))
      .orderBy(desc(botActivity.createdAt))
      .limit(20);

    // ── LAYER 3d: Count transmissions and Top 8 ──────────────────────
    let transmissionCount = 0;
    let top8Count = 0;
    if (human.clerkId) {
      const [tcResult] = await db
        .select({ total: count() })
        .from(profileTransmissions)
        .where(and(
          eq(profileTransmissions.profileOwnerId, human.clerkId),
          eq(profileTransmissions.isHidden, false)
        ));
      transmissionCount = tcResult?.total || 0;

      const [t8Result] = await db
        .select({ total: count() })
        .from(topEight)
        .where(eq(topEight.ownerId, human.clerkId));
      top8Count = t8Result?.total || 0;
    }

    // ── LAYER 4: Return Response ────────────────────────────────────────
    return NextResponse.json({
      success: true,
      human: {
        id: human.id,
        name: human.name,
        username: human.username || null,
        tier: human.subscriptionTier,
        avatarConfig: human.avatarConfig || null,
        siteTheme: human.siteTheme || 'orange',
        joinedAt: human.createdAt,
      },
      profile: profile
        ? {
            transmission: profile.transmission || null,
            interests: {
              general: profile.interestsGeneral || null,
              music: profile.interestsMusic || null,
              heroes: profile.interestsHeroes || null,
              technology: profile.interestsTechnology || null,
            },
            buddy_name: profile.buddyName || null,
            buddy_active: profile.buddyActive || false,
            about_me: profile.aboutMe || null,
            who_id_like_to_meet: profile.whoIdLikeToMeet || null,
            colors: {
              accent: profile.profileAccentColor || null,
              border: profile.profileBorderColor || null,
              glow: profile.profileGlowColor || null,
              bg_tint: profile.profileBgTint || null,
            },
            wallpaper_url: profile.wallpaperUrl || null,
            wallpaper_opacity: profile.wallpaperOpacity || null,
            cover_photo: profile.coverPhoto || null,
            status: profile.status || null,
            profile_views: profile.profileViews || 0,
            transmission_count: transmissionCount,
            top8_count: top8Count,
          }
        : null,
      wall_posts: wallPosts.map((p) => ({
        id: p.id,
        content: p.content,
        title: p.title,
        content_type: p.contentType || null,
        created_at: p.createdAt,
      })),
    });
  } catch (error) {
    console.error('[PROFILE] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load profile.' },
      { status: 500 }
    );
  }
}
