import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitIdentifier, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';
import { logAgentAction, AuditEventType } from '@/lib/security/audit';
import { validateCors } from '@/lib/security/cors';

export const dynamic = 'force-dynamic';
import { authenticateMachine } from '@/lib/machine-auth';
import { vote } from '@/lib/services/machine-vote-service';
import { NotFoundError, ForbiddenError } from '@/lib/errors/machine-social';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cors = validateCors(req);
  if (!cors.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const machine = await authenticateMachine(req);
  if (!machine) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401, headers: cors.headers }
    );
  }

  // Rate limit: 100 votes per hour
  const rlKey = getRateLimitIdentifier(req);
  const rlResult = await checkRateLimit(rlKey, 'socialVote');
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

  const { id } = await params;

  try {
    const result = await vote({
      targetId: id,
      targetType: 'post',
      agentId: machine.agentId,
    });

    // Audit log (fire-and-forget)
    try {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      logAgentAction(AuditEventType.VOTE_CAST, machine.agentId, machine.botName, ip, { targetId: id, targetType: 'post' });
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
        { status: 403, headers: cors.headers }
      );
    }
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
