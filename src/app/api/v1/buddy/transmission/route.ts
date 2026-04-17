/**
 * AI BUDDY SANDBOX — Transmission Update API
 * PUT /api/v1/buddy/transmission
 * Updates the owner's transmission (pinned status) in human_profiles table.
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

    let body: { transmission?: string };
    try {
      body = await request.json();
    } catch {
      return buddyBadRequest('Invalid JSON body');
    }

    const { transmission } = body;

    if (transmission === undefined || transmission === null) {
      return buddyBadRequest('transmission is required');
    }

    if (typeof transmission !== 'string') {
      return buddyBadRequest('transmission must be a string');
    }

    if (transmission.trim().length > 150) {
      return buddyBadRequest('transmission must be 150 characters or less');
    }

    await db.insert(humanProfiles).values({
      humanId: buddy.user_id,
      transmission: transmission.trim(),
      buddyName: buddy.buddy_name,
      buddyActive: true,
    }).onConflictDoUpdate({
      target: humanProfiles.humanId,
      set: {
        transmission: transmission.trim(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      buddy: buddy.buddy_name,
      transmission: transmission.trim(),
    });
  } catch (error) {
    console.error('[buddy/transmission] Error:', error);
    return buddyInternalError('Failed to update transmission');
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
