/**
 * AI BUDDY SANDBOX — Theme Update API
 * PUT /api/v1/buddy/theme
 * Updates the owner's profile theme in human_profiles table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, humanProfiles } from '@/db';
import {
  validateBuddyToken,
  forbiddenResponse,
  buddyBadRequest,
  buddyInternalError,
} from '@/lib/buddy/validate-token';

export const dynamic = 'force-dynamic';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const RGBA_REGEX = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/;

export async function PUT(request: NextRequest) {
  try {
    const buddy = validateBuddyToken(request);
    if (!buddy) {
      return forbiddenResponse('Invalid or missing buddy token');
    }

    let body: {
      profile_accent_color?: string;
      profile_border_color?: string;
      profile_glow_color?: string;
      profile_bg_tint?: string;
      wallpaper_url?: string;
      wallpaper_opacity?: number;
    };
    try {
      body = await request.json();
    } catch {
      return buddyBadRequest('Invalid JSON body');
    }

    const {
      profile_accent_color,
      profile_border_color,
      profile_glow_color,
      profile_bg_tint,
      wallpaper_url,
      wallpaper_opacity,
    } = body;

    if (
      !profile_accent_color &&
      !profile_border_color &&
      !profile_glow_color &&
      !profile_bg_tint &&
      !wallpaper_url &&
      wallpaper_opacity === undefined
    ) {
      return buddyBadRequest('At least one theme field is required');
    }

    if (profile_accent_color && !HEX_COLOR_REGEX.test(profile_accent_color)) {
      return buddyBadRequest('profile_accent_color must be hex format #RRGGBB');
    }
    if (profile_border_color && !HEX_COLOR_REGEX.test(profile_border_color)) {
      return buddyBadRequest('profile_border_color must be hex format #RRGGBB');
    }
    if (profile_glow_color && !HEX_COLOR_REGEX.test(profile_glow_color)) {
      return buddyBadRequest('profile_glow_color must be hex format #RRGGBB');
    }
    if (profile_bg_tint && !RGBA_REGEX.test(profile_bg_tint) && !HEX_COLOR_REGEX.test(profile_bg_tint)) {
      return buddyBadRequest('profile_bg_tint must be a valid rgba() string or hex color');
    }
    if (wallpaper_url) {
      if (typeof wallpaper_url !== 'string' || wallpaper_url.length > 500) {
        return buddyBadRequest('wallpaper_url must be a string of 500 characters or less');
      }
      if (!wallpaper_url.startsWith('https://')) {
        return buddyBadRequest('wallpaper_url must be an HTTPS URL');
      }
    }
    if (wallpaper_opacity !== undefined) {
      if (typeof wallpaper_opacity !== 'number' || wallpaper_opacity < 0 || wallpaper_opacity > 1) {
        return buddyBadRequest('wallpaper_opacity must be a number between 0.00 and 1.00');
      }
    }

    const updateSet: Record<string, any> = { updatedAt: new Date() };
    const insertValues: Record<string, any> = {
      humanId: buddy.user_id,
      buddyName: buddy.buddy_name,
      buddyActive: true,
    };

    if (profile_accent_color) {
      updateSet.profileAccentColor = profile_accent_color;
      insertValues.profileAccentColor = profile_accent_color;
    }
    if (profile_border_color) {
      updateSet.profileBorderColor = profile_border_color;
      insertValues.profileBorderColor = profile_border_color;
    }
    if (profile_glow_color) {
      updateSet.profileGlowColor = profile_glow_color;
      insertValues.profileGlowColor = profile_glow_color;
    }
    if (profile_bg_tint) {
      updateSet.profileBgTint = profile_bg_tint;
      insertValues.profileBgTint = profile_bg_tint;
    }
    if (wallpaper_url) {
      updateSet.wallpaperUrl = wallpaper_url;
      insertValues.wallpaperUrl = wallpaper_url;
    }
    if (wallpaper_opacity !== undefined) {
      updateSet.wallpaperOpacity = String(wallpaper_opacity);
      insertValues.wallpaperOpacity = String(wallpaper_opacity);
    }

    await db.insert(humanProfiles).values(insertValues).onConflictDoUpdate({
      target: humanProfiles.humanId,
      set: updateSet,
    });

    return NextResponse.json({
      success: true,
      buddy: buddy.buddy_name,
      updated_fields: Object.keys(updateSet).filter(k => k !== 'updatedAt'),
    });
  } catch (error) {
    console.error('[buddy/theme] Error:', error);
    return buddyInternalError('Failed to update theme');
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
