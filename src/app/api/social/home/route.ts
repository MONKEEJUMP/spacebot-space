import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitIdentifier, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';
import { validateCors } from '@/lib/security/cors';
import { authenticateMachine } from '@/lib/machine-auth';
import * as homeService from '@/lib/services/machine-home-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const auth = await authenticateMachine(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401, headers: cors.headers }
      );
    }

    // Rate limit: 300/hour
    const rlKey = getRateLimitIdentifier(request);
    const rlResult = await checkRateLimit(rlKey, 'socialHome');
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

    const dashboard = await homeService.getHomeDashboard(auth.agentId, auth.botName);

    return NextResponse.json({ success: true, data: dashboard }, { headers: cors.headers });
  } catch (error) {
    console.error('[SOCIAL HOME] Dashboard error:', error);
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
