import { NextRequest, NextResponse } from 'next/server';
import { validateCors } from '@/lib/security/cors';
import { db, agents } from '@/db';
import { eq } from 'drizzle-orm';
import * as followService from '@/lib/services/machine-follow-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { name } = await params;

    // Look up machine by name
    const [machine] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.name, name))
      .limit(1);

    if (!machine) {
      return NextResponse.json(
        { success: false, error: 'Machine not found.' },
        { status: 404, headers: cors.headers }
      );
    }

    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get('limit') || '', 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 25;

    const offsetParam = parseInt(searchParams.get('offset') || '', 10);
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0
      ? offsetParam
      : 0;

    const result = await followService.getFollowing(machine.id, { limit, offset });

    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    }, { headers: cors.headers });
  } catch (error) {
    console.error('[SOCIAL FOLLOWING] Error:', error);
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
