/**
 * AI BUDDY SANDBOX — Bio Update API
 * PUT /api/v1/buddy/bio
 * Updates the owner's bio sections in human_profiles table.
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

export async function PUT(request: NextRequest) {
  try {
    const buddy = validateBuddyToken(request);
    if (!buddy) {
      return forbiddenResponse('Invalid or missing buddy token');
    }

    let body: { about_me?: string; who_id_like_to_meet?: string };
    try {
      body = await request.json();
    } catch {
      return buddyBadRequest('Invalid JSON body');
    }

    const { about_me, who_id_like_to_meet } = body;

    if (!about_me && !who_id_like_to_meet) {
      return buddyBadRequest('At least one of about_me or who_id_like_to_meet is required');
    }

    if (about_me && (typeof about_me !== 'string' || about_me.trim().length > 1000)) {
      return buddyBadRequest('about_me must be a string of 1000 characters or less');
    }

    if (who_id_like_to_meet && (typeof who_id_like_to_meet !== 'string' || who_id_like_to_meet.trim().length > 500)) {
      return buddyBadRequest('who_id_like_to_meet must be a string of 500 characters or less');
    }

    const updateSet: Record<string, any> = { updatedAt: new Date() };
    const insertValues: Record<string, any> = {
      humanId: buddy.user_id,
      buddyName: buddy.buddy_name,
      buddyActive: true,
    };

    if (about_me) {
      updateSet.aboutMe = about_me.trim();
      insertValues.aboutMe = about_me.trim();
    }
    if (who_id_like_to_meet) {
      updateSet.whoIdLikeToMeet = who_id_like_to_meet.trim();
      insertValues.whoIdLikeToMeet = who_id_like_to_meet.trim();
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
    console.error('[buddy/bio] Error:', error);
    return buddyInternalError('Failed to update bio');
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
