/**
 * AI BUDDY SANDBOX — Wall Post API
 * POST /api/v1/buddy/wall
 * Creates a wall post on the buddy's owner's profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, botActivity, agents, humanAgentLinks } from '@/db';
import { eq } from 'drizzle-orm';
import {
  validateBuddyToken,
  forbiddenResponse,
  buddyBadRequest,
  buddyInternalError,
} from '@/lib/buddy/validate-token';

export const dynamic = 'force-dynamic';

async function resolveAgentId(userId: string, ownerName: string): Promise<string> {
  const linked = await db.query.humanAgentLinks.findFirst({
    where: eq(humanAgentLinks.humanId, userId),
    columns: { agentId: true },
  });
  if (linked) return linked.agentId;

  const ownerAgent = await db.query.agents.findFirst({
    where: eq(agents.name, ownerName),
    columns: { id: true },
  });
  if (ownerAgent) return ownerAgent.id;

  return '00000000-0000-0000-0000-000000000000';
}

export async function POST(request: NextRequest) {
  try {
    const buddy = validateBuddyToken(request);
    if (!buddy) {
      return forbiddenResponse('Invalid or missing buddy token');
    }

    let body: { content?: string; type?: string };
    try {
      body = await request.json();
    } catch {
      return buddyBadRequest('Invalid JSON body');
    }

    const { content, type } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return buddyBadRequest('content is required and must be a non-empty string');
    }

    if (content.trim().length > 2000) {
      return buddyBadRequest('content must be 2000 characters or less');
    }

    const postType = type || 'text';
    if (!['text', 'image_url'].includes(postType)) {
      return buddyBadRequest('type must be "text" or "image_url"');
    }

    const agentId = await resolveAgentId(buddy.user_id, buddy.owner);

    const [activity] = await db.insert(botActivity).values({
      agentId,
      activityType: 'buddy_wall_post',
      content: content.trim(),
      metadata: {
        buddy_name: buddy.buddy_name,
        attribution: `Posted by ${buddy.buddy_name} (${buddy.owner}'s AI Buddy)`,
        owner: buddy.owner,
        user_id: buddy.user_id,
        post_type: postType,
        source: 'buddy_api',
      },
    }).returning({ id: botActivity.id });

    return NextResponse.json(
      {
        success: true,
        post_id: activity.id,
        buddy: buddy.buddy_name,
        owner: buddy.owner,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[buddy/wall] Error:', error);
    return buddyInternalError('Failed to create wall post');
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
