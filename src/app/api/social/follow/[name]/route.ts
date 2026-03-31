import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitIdentifier } from '@/lib/security/rate-limiter';
import { logAgentAction, AuditEventType } from '@/lib/security/audit';
import { validateCors } from '@/lib/security/cors';
import { authenticateMachine } from '@/lib/machine-auth';
import * as followService from '@/lib/services/machine-follow-service';
import { NotFoundError, ForbiddenError } from '@/lib/errors/machine-social';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const cors = validateCors(req);
  if (!cors.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const auth = await authenticateMachine(req);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Authentication required.' },
      { status: 401, headers: cors.headers }
    );
  }

  // Rate limit: 20 follow/unfollow per hour
  const rlKey = getRateLimitIdentifier(req);
  const rlResult = await checkRateLimit(rlKey, 'socialFollow');
  if (!rlResult.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded', retryAfter: rlResult.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rlResult.retryAfter), ...cors.headers } }
    );
  }

  const { name } = await params;

  try {
    const result = await followService.follow(auth.agentId, auth.botName, name);

    // Audit log (fire-and-forget)
    try {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      logAgentAction(AuditEventType.PROFILE_UPDATED, auth.agentId, auth.botName, ip, { action: 'followed', target: name });
    } catch (auditError) {
      console.error('Audit log failed (non-blocking):', auditError);
    }

    return NextResponse.json(result, { headers: cors.headers });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404, headers: cors.headers }
      );
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400, headers: cors.headers }
      );
    }
    console.error('[SOCIAL FOLLOW] Follow error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: cors.headers }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const corsD = validateCors(req);
  if (!corsD.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const auth = await authenticateMachine(req);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Authentication required.' },
      { status: 401, headers: corsD.headers }
    );
  }

  // Rate limit: 20 follow/unfollow per hour (shared with follow)
  const rlKey = getRateLimitIdentifier(req);
  const rlResult = await checkRateLimit(rlKey, 'socialFollow');
  if (!rlResult.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded', retryAfter: rlResult.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rlResult.retryAfter), ...corsD.headers } }
    );
  }

  const { name } = await params;

  try {
    const result = await followService.unfollow(auth.agentId, auth.botName, name);

    // Audit log (fire-and-forget)
    try {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      logAgentAction(AuditEventType.PROFILE_UPDATED, auth.agentId, auth.botName, ip, { action: 'unfollowed', target: name });
    } catch (auditError) {
      console.error('Audit log failed (non-blocking):', auditError);
    }

    return NextResponse.json(result, { headers: corsD.headers });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404, headers: corsD.headers }
      );
    }
    console.error('[SOCIAL FOLLOW] Unfollow error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsD.headers }
    );
  }
}

export async function OPTIONS(request: Request) {
  const cors = validateCors(request);
  if (!cors.allowed) return new Response('Forbidden', { status: 403 });
  return new Response(null, { status: 204, headers: cors.headers });
}
