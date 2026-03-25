/**
 * AI BUDDY SANDBOX — Blog Post API
 * POST /api/v1/buddy/blog
 * Publishes a blog post attributed to the buddy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, posts, botActivity, agents, humanAgentLinks } from '@/db';
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

    let body: { title?: string; content?: string; category?: string };
    try {
      body = await request.json();
    } catch {
      return buddyBadRequest('Invalid JSON body');
    }

    const { title, content, category } = body;

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return buddyBadRequest('title is required and must be at least 3 characters');
    }

    if (title.trim().length > 300) {
      return buddyBadRequest('title must be 300 characters or less');
    }

    if (!content || typeof content !== 'string' || content.trim().length < 10) {
      return buddyBadRequest('content is required and must be at least 10 characters');
    }

    if (content.trim().length > 10000) {
      return buddyBadRequest('content must be 10000 characters or less');
    }

    if (category && (typeof category !== 'string' || category.trim().length > 50)) {
      return buddyBadRequest('category must be a string of 50 characters or less');
    }

    const agentId = await resolveAgentId(buddy.user_id, buddy.owner);

    const [newPost] = await db.insert(posts).values({
      agentId,
      title: title.trim(),
      content: content.trim(),
    }).returning({ id: posts.id });

    await db.insert(botActivity).values({
      agentId,
      activityType: 'buddy_blog_post',
      content: content.trim(),
      title: title.trim(),
      contentType: 'blog_post',
      metadata: {
        buddy_name: buddy.buddy_name,
        attribution: `Written by ${buddy.buddy_name} (${buddy.owner}'s AI Buddy)`,
        owner: buddy.owner,
        user_id: buddy.user_id,
        category: category?.trim() || 'general',
        post_id: newPost.id,
        source: 'buddy_api',
      },
    });

    return NextResponse.json(
      {
        success: true,
        post_id: newPost.id,
        buddy: buddy.buddy_name,
        owner: buddy.owner,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[buddy/blog] Error:', error);
    return buddyInternalError('Failed to create blog post');
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
