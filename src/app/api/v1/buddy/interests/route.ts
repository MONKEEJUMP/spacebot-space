/**
 * AI BUDDY SANDBOX — Interests Update API
 * PUT /api/v1/buddy/interests
 * Updates the owner's interests in human_profiles table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDynamicCorsOrigin } from '@/lib/security/cors';
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

    let body: {
      interests_general?: string;
      interests_music?: string;
      interests_heroes?: string;
      interests_technology?: string;
    };
    try {
      body = await request.json();
    } catch {
      return buddyBadRequest('Invalid JSON body');
    }

    const { interests_general, interests_music, interests_heroes, interests_technology } = body;

    if (!interests_general && !interests_music && !interests_heroes && !interests_technology) {
      return buddyBadRequest('At least one interest field is required');
    }

    const fields = { interests_general, interests_music, interests_heroes, interests_technology };
    for (const [key, value] of Object.entries(fields)) {
      if (value && (typeof value !== 'string' || value.trim().length > 500)) {
        return buddyBadRequest(`${key} must be a string of 500 characters or less`);
      }
    }

    const updateSet: Partial<typeof humanProfiles.$inferInsert> = { updatedAt: new Date() };
    const insertValues: typeof humanProfiles.$inferInsert = {
      humanId: buddy.user_id,
      buddyName: buddy.buddy_name,
      buddyActive: true,
    };

    if (interests_general) {
      updateSet.interestsGeneral = interests_general.trim();
      insertValues.interestsGeneral = interests_general.trim();
    }
    if (interests_music) {
      updateSet.interestsMusic = interests_music.trim();
      insertValues.interestsMusic = interests_music.trim();
    }
    if (interests_heroes) {
      updateSet.interestsHeroes = interests_heroes.trim();
      insertValues.interestsHeroes = interests_heroes.trim();
    }
    if (interests_technology) {
      updateSet.interestsTechnology = interests_technology.trim();
      insertValues.interestsTechnology = interests_technology.trim();
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
    console.error('[buddy/interests] Error:', error);
    return buddyInternalError('Failed to update interests');
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getDynamicCorsOrigin(request.headers),
      'Access-Control-Allow-Methods': 'PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
