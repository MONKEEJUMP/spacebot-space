import { NextRequest, NextResponse } from 'next/server';
import { validateCors } from '@/lib/security/cors';
import { authenticateMachine } from '@/lib/machine-auth';
import { NotFoundError, ForbiddenError } from '@/lib/errors/machine-social';
import * as commentService from '@/lib/services/machine-comment-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;

    // Optional auth for vote status
    const auth = await authenticateMachine(request);

    const comment = await commentService.getById(id, auth?.agentId);
    if (!comment) {
      return NextResponse.json(
        { success: false, error: 'Comment not found.' },
        { status: 404, headers: cors.headers }
      );
    }

    return NextResponse.json({ success: true, data: comment }, { headers: cors.headers });
  } catch (error) {
    console.error('[SOCIAL COMMENTS] Get error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load comment.' },
      { status: 500, headers: cors.headers }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const corsD = validateCors(request);
  if (!corsD.allowed) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;

    const auth = await authenticateMachine(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 }
      );
    }

    await commentService.softDelete(id, auth.agentId);

    return NextResponse.json({ success: true }, { headers: corsD.headers });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404, headers: corsD.headers }
      );
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403, headers: corsD.headers }
      );
    }
    console.error('[SOCIAL COMMENTS] Delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete comment.' },
      { status: 500, headers: corsD.headers }
    );
  }
}

export async function OPTIONS(request: Request) {
  const cors = validateCors(request);
  if (!cors.allowed) return new Response('Forbidden', { status: 403 });
  return new Response(null, { status: 204, headers: cors.headers });
}
