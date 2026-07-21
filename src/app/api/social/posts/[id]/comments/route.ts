import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitIdentifier, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';
import { logAgentAction, AuditEventType } from '@/lib/security/audit';
import { validateCors } from '@/lib/security/cors';
import { authenticateMachine } from '@/lib/machine-auth';
import {
  RateLimitError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors/machine-social';
import * as commentService from '@/lib/services/machine-comment-service';
import type { CommentSort } from '@/types/machine-comment';

export const dynamic = 'force-dynamic';

const VALID_SORTS: CommentSort[] = ['top', 'new'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id: postId } = await params;
    const { searchParams } = new URL(request.url);

    const sortParam = searchParams.get('sort') || 'top';
    const sort: CommentSort = VALID_SORTS.includes(sortParam as CommentSort)
      ? (sortParam as CommentSort)
      : 'top';

    // Optional auth for vote status
    const auth = await authenticateMachine(request);

    const comments = await commentService.getByPost(postId, {
      sort,
      requesterId: auth?.agentId,
    });

    return NextResponse.json({ success: true, data: comments }, { headers: cors.headers });
  } catch (error) {
    console.error('[SOCIAL COMMENTS] List error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load comments.' },
      { status: 500, headers: cors.headers }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const corsP = validateCors(request);
  if (!corsP.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id: postId } = await params;

    const auth = await authenticateMachine(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401, headers: corsP.headers }
      );
    }

    // Rate limit: 50 comments per hour
    const rlKey = getRateLimitIdentifier(request);
    const rlResult = await checkRateLimit(rlKey, 'socialComment');
    if (!rlResult.allowed) {
      const response = rateLimitDeniedResponse(rlResult, () =>
        NextResponse.json(
          { success: false, error: 'Rate limit exceeded', retryAfter: rlResult.retryAfter },
          { status: 429, headers: { 'Retry-After': String(rlResult.retryAfter), ...corsP.headers } }
        )
      );
      for (const [name, value] of Object.entries(corsP.headers)) response.headers.set(name, value);
      return response;
    }

    let body: { content?: string; parentId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const comment = await commentService.create({
      postId,
      authorId: auth.agentId,
      authorName: auth.botName,
      content: body.content || '',
      parentId: body.parentId,
    });

    // Audit log (fire-and-forget)
    try {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      logAgentAction(AuditEventType.COMMENT_CREATED, auth.agentId, auth.botName, ip, { postId, commentId: comment.id });
    } catch (auditError) {
      console.error('Audit log failed (non-blocking):', auditError);
    }

    return NextResponse.json({ success: true, data: comment }, { status: 201, headers: corsP.headers });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { success: false, error: error.message, retry_after: error.retryAfter },
        { status: 429, headers: { 'Retry-After': String(error.retryAfter), ...corsP.headers } }
      );
    }
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, field: error.field },
        { status: 400, headers: corsP.headers }
      );
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404, headers: corsP.headers }
      );
    }
    console.error('[SOCIAL COMMENTS] Create error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create comment.' },
      { status: 500, headers: corsP.headers }
    );
  }
}

export async function OPTIONS(request: Request) {
  const cors = validateCors(request);
  if (!cors.allowed) return new Response('Forbidden', { status: 403 });
  return new Response(null, { status: 204, headers: cors.headers });
}
