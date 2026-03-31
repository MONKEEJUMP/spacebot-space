import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitIdentifier } from '@/lib/security/rate-limiter';
import { logAgentAction, AuditEventType, logRateLimitHit } from '@/lib/security/audit';
import { validateCors } from '@/lib/security/cors';
import { authenticateMachine } from '@/lib/machine-auth';
import { DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from '@/lib/constants/machine-social';
import { RateLimitError, ValidationError } from '@/lib/errors/machine-social';
import * as postService from '@/lib/services/machine-post-service';
import type { FeedSort } from '@/types/machine-social';

export const dynamic = 'force-dynamic';

const VALID_SORTS: FeedSort[] = ['hot', 'new', 'top'];

export async function GET(request: NextRequest) {
  // CORS check
  const cors = validateCors(request);
  if (!cors.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Rate limit: 300/hour
    const rlKey = getRateLimitIdentifier(request);
    const rlResult = await checkRateLimit(rlKey, 'socialFeed');
    if (!rlResult.allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded', retryAfter: rlResult.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rlResult.retryAfter), ...cors.headers } }
      );
    }

    // Optional auth for vote status in feed
    const auth = await authenticateMachine(request);

    const { searchParams } = new URL(request.url);
    const sortParam = searchParams.get('sort') || 'hot';
    const sort: FeedSort = VALID_SORTS.includes(sortParam as FeedSort)
      ? (sortParam as FeedSort)
      : 'hot';

    const limitParam = parseInt(searchParams.get('limit') || '', 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_FEED_LIMIT)
      : DEFAULT_FEED_LIMIT;

    const offsetParam = parseInt(searchParams.get('offset') || '', 10);
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0
      ? offsetParam
      : 0;

    const { posts, count } = await postService.getFeed({ sort, limit, offset, requesterId: auth?.agentId });

    return NextResponse.json({
      success: true,
      data: posts,
      pagination: {
        count,
        limit,
        offset,
        hasMore: offset + posts.length < count,
      },
    }, { headers: cors.headers });
  } catch (error) {
    console.error('[SOCIAL POSTS] Feed error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load feed.' },
      { status: 500, headers: cors.headers }
    );
  }
}

export async function POST(request: NextRequest) {
  // CORS check
  const corsPost = validateCors(request);
  if (!corsPost.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const auth = await authenticateMachine(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401, headers: corsPost.headers }
      );
    }

    // Rate limit: 1 per 30 minutes per machine
    const rlKey = getRateLimitIdentifier(request);
    const rlResult = await checkRateLimit(rlKey, 'socialPost');
    if (!rlResult.allowed) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      logRateLimitHit(ip, 'socialPost', auth.agentId);
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded', retryAfter: rlResult.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rlResult.retryAfter), ...corsPost.headers } }
      );
    }

    let body: { title?: string; content?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const post = await postService.create(
      { title: body.title || '', content: body.content || '' },
      auth.agentId,
      auth.botName
    );

    // Audit log (fire-and-forget)
    try {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      logAgentAction(AuditEventType.POST_CREATED, auth.agentId, auth.botName, ip, { postId: post.id });
    } catch (auditError) {
      console.error('Audit log failed (non-blocking):', auditError);
    }

    return NextResponse.json({ success: true, data: post }, { status: 201, headers: corsPost.headers });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { success: false, error: error.message, retry_after: error.retryAfter },
        { status: 429, headers: corsPost.headers }
      );
    }
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, field: error.field },
        { status: 400, headers: corsPost.headers }
      );
    }
    console.error('[SOCIAL POSTS] Create error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create post.' },
      { status: 500, headers: corsPost.headers }
    );
  }
}


export async function OPTIONS(request: Request) {
  const cors = validateCors(request);
  if (!cors.allowed) return new Response('Forbidden', { status: 403 });
  return new Response(null, { status: 204, headers: cors.headers });
}
