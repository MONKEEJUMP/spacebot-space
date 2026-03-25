/**
 * BOT SPACE — PUBLIC HUMAN PROFILE API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Returns a single human's public profile by name.
 * NO authentication required — this is a public profile.
 * ONLY returns safe, public-facing data.
 *
 * GET /api/v1/humans/profile/[name]
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security Public endpoint — returns ONLY public data
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { humans, humanProfiles, botActivity } from '@/db/schema';
import { eq, and, ilike, desc } from 'drizzle-orm';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ name: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const ip = getClientIP(request);

  try {
    // ── LAYER 1: Rate Limiting ──────────────────────────────────
    const rateLimit = await checkRateLimit(ip, 'humanDirectory');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests.', retryAfter: rateLimit.retryAfter },
        { status: 429 }
      );
    }

    // ── LAYER 2: Get name from params ───────────────────────────
    const { name } = await params;

    // Validate name: 1-30 chars, alphanumeric/underscores/hyphens only
    if (!name || name.length > 30 || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      return NextResponse.json(
        { success: false, error: 'Invalid profile name.' },
        { status: 400 }
      );
    }

    // ── LAYER 3: Query Database ─────────────────────────────────
    // SECURITY: Select ONLY public-safe fields
    // NEVER: email, passwordHash, tokens, IPs, lock fields, tokenVersion
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
      .where(and(
        eq(humans.isEmailVerified, true),
        ilike(humans.name, name)
      ))
      .limit(1);

    if (!human) {
      return NextResponse.json(
        { success: false, error: 'Human not found.' },
        { status: 404 }
      );
    }

    // ── LAYER 3b: Query human_profiles for extended data ────────
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
      })
      .from(humanProfiles)
      .where(eq(humanProfiles.humanId, human.id))
      .limit(1);

    // ── LAYER 3c: Query wall posts from bot_activity ────────────
    const wallPosts = await db
      .select({
        id: botActivity.id,
        content: botActivity.content,
        title: botActivity.title,
        contentType: botActivity.contentType,
        metadata: botActivity.metadata,
        createdAt: botActivity.createdAt,
      })
      .from(botActivity)
      .where(eq(botActivity.activityType, 'buddy_wall_post'))
      .orderBy(desc(botActivity.createdAt))
      .limit(20);

    // ── LAYER 4: Return Response ────────────────────────────────
    return NextResponse.json({
      success: true,
      human: {
        id: human.id,
        name: human.name,
        tier: human.subscriptionTier,
        avatarConfig: human.avatarConfig || null,
        siteTheme: human.siteTheme || 'dark',
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
          }
        : null,
      wall_posts: wallPosts.map((p) => ({
        id: p.id,
        content: p.content,
        title: p.title,
        content_type: p.contentType || null,
        metadata: p.metadata,
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
