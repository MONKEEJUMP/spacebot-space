import { NextRequest, NextResponse } from 'next/server';
import { validateCors } from '@/lib/security/cors';
import { setupMutualFollows } from '@/lib/services/machine-auto-follow';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const cors = validateCors(req);
  if (!cors.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  // Protected by x-life-key header
  const lifeKey = req.headers.get('x-life-key');
  if (lifeKey !== process.env.LIFE_ENGINE_SECRET) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401, headers: cors.headers }
    );
  }

  try {
    const result = await setupMutualFollows();
    return NextResponse.json({ success: true, ...result }, { headers: cors.headers });
  } catch (error) {
    console.error('[AUTO-FOLLOW] Setup error:', error);
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
