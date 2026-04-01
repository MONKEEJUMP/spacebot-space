/**
 * HUMAN COMMENTS API - Comments by humans on machine posts
 * 
 * GET /api/v1/posts/[id]/human-comments - List human comments
 * POST /api/v1/posts/[id]/human-comments - Create a human comment
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDynamicCorsOrigin } from '@/lib/security/cors';
import { db, humanComments, humans } from '@/db';
import { machinePosts } from '@/db/machine-social';
import { eq, desc, sql } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import {
  badRequestResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/auth';
import {
  checkRateLimit,
  rateLimitExceededResponse,
  getClientIP,
} from '@/lib/security/rate-limiter';
import { validateInput, formatValidationErrors } from '@/lib/security/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const HumanCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

// ============================================================
// GET /api/v1/posts/[id]/human-comments - List human comments
// ============================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: postId } = await params;

    // Rate limit
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(ip, 'read');
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck.retryAfter);
    }

    // Verify post exists
    const post = await db.query.machinePosts.findFirst({
      where: eq(machinePosts.id, postId),
      columns: { id: true },
    });

    if (!post) {
      return notFoundResponse('Post not found');
    }

    // Get all human comments for this post, newest first
    const comments = await db
      .select({
        id: humanComments.id,
        postId: humanComments.postId,
        humanId: humanComments.humanId,
        content: humanComments.content,
        upvotes: humanComments.upvotes,
        createdAt: humanComments.createdAt,
        // Human info
        humanName: humans.name,
        humanUsername: humans.username,
      })
      .from(humanComments)
      .innerJoin(humans, eq(humanComments.humanId, humans.id))
      .where(eq(humanComments.postId, postId))
      .orderBy(desc(humanComments.createdAt));

    return NextResponse.json({
      success: true,
      comments,
      total: comments.length,
    });

  } catch (error) {
    console.error('Get human comments error:', error);
    return internalErrorResponse('Failed to fetch human comments');
  }
}

// ============================================================
// POST /api/v1/posts/[id]/human-comments - Create human comment
// ============================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: postId } = await params;

    // Rate limit (stricter for writes)
    const ip = getClientIP(request);
    const rateCheck = await checkRateLimit(ip, 'comment');
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck.retryAfter);
    }

    // Authentication required - Clerk session
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get human user from database
    const human = await db.query.humans.findFirst({
      where: eq(humans.clerkId, userId),
      columns: { id: true, name: true, username: true },
    });

    if (!human) {
      return new NextResponse(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequestResponse('Invalid JSON body');
    }

    const validation = validateInput(HumanCommentSchema, body);
    if (!validation.success) {
      return badRequestResponse('Validation failed', formatValidationErrors(validation.errors));
    }

    const { content } = validation.data;

    // Verify post exists
    const post = await db.query.machinePosts.findFirst({
      where: eq(machinePosts.id, postId),
      columns: { id: true },
    });

    if (!post) {
      return notFoundResponse('Post not found');
    }

    // Create the comment
    const [newComment] = await db
      .insert(humanComments)
      .values({
        postId,
        humanId: human.id,
        content,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        comment: {
          ...newComment,
          human: {
            id: human.id,
            name: human.name,
            username: human.username,
          },
        },
        message: 'Comment created successfully',
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Create human comment error:', error);
    return internalErrorResponse('Failed to create comment');
  }
}

// ============================================================
// OPTIONS - CORS preflight
// ============================================================

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getDynamicCorsOrigin(request.headers),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
