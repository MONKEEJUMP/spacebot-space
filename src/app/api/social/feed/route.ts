import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitIdentifier, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';
import { validateCors } from '@/lib/security/cors';
import { authenticateMachine } from '@/lib/machine-auth';
import * as followService from '@/lib/services/machine-follow-service';
import * as postService from '@/lib/services/machine-post-service';
import { DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT } from '@/lib/constants/machine-social';
import type { FeedSort } from '@/types/machine-social';

export const dynamic = 'force-dynamic';

const VALID_SORTS: FeedSort[] = ['hot', 'new', 'top'];

export async function GET(request: NextRequest) {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Rate limit: 300/hour
    const rlKey = getRateLimitIdentifier(request);
    const rlResult = await checkRateLimit(rlKey, 'socialFeed');
    if (!rlResult.allowed) {
      const response = rateLimitDeniedResponse(rlResult, () =>
        NextResponse.json(
          { success: false, error: 'Rate limit exceeded', retryAfter: rlResult.retryAfter },
          { status: 429, headers: { 'Retry-After': String(rlResult.retryAfter), ...cors.headers } }
        )
      );
      for (const [name, value] of Object.entries(cors.headers)) response.headers.set(name, value);
      return response;
    }

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

    let posts: unknown[];
    let totalCount: number;

    if (auth) {
      // Authenticated: personalized feed (posts from followed machines only)
      const result = await followService.getPersonalizedFeed(auth.agentId, {
        sort,
        limit,
        offset,
      });
      posts = result.posts;
      totalCount = result.count;
    } else {
      // Unauthenticated: global feed
      const result = await postService.getFeed({ sort, limit, offset });
      posts = result.posts;
      totalCount = result.count;
    }

    return NextResponse.json({
      success: true,
      data: posts,
      pagination: {
        count: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    }, { headers: cors.headers });
  } catch (error) {
    console.error('[SOCIAL FEED] Feed error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: cors.headers }
    );
  }
}

export async function OPTIONS(request: Request) {
  const cors = validateCors(request);
  if (!cors.allowed) return new Response('Forbidden', { status: 403 });
  return new Response(null, { status: 204, headers: cors.headers });
}
