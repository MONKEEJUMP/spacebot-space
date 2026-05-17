// GET /api/memory/[botName] — returns memories for the authenticated user's workspace.
// DELETE /api/memory/[botName]?id=... — removes a single memory entry.

import { NextRequest, NextResponse } from 'next/server';
import { requireClerkOrBotAuth, clerkUnauthorizedResponse } from '@/lib/security/clerk-auth';
import { remeClient } from '@/lib/memory/reme-client';
import { buildWorkspaceId, isMemoryEnabled } from '@/lib/memory/workspace';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { botName: string };
}

function resolveUserId(authResult: NonNullable<Awaited<ReturnType<typeof requireClerkOrBotAuth>>>): string {
  if (authResult.type === 'clerk') return authResult.userId;
  const agent = (authResult as { agent?: { botName?: string; id?: string } }).agent;
  return `bot:${agent?.botName || agent?.id || 'unknown'}`;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await requireClerkOrBotAuth(request);
    if (!authResult) return clerkUnauthorizedResponse();

    if (!isMemoryEnabled()) {
      return NextResponse.json({ success: true, enabled: false, memories: [] });
    }

    const userId = resolveUserId(authResult);
    const botName = params.botName;
    if (!botName) {
      return NextResponse.json({ success: false, error: 'Missing botName' }, { status: 400 });
    }

    const workspaceId = buildWorkspaceId(botName, userId);
    const memories = await remeClient.list(workspaceId);
    return NextResponse.json({ success: true, enabled: true, workspaceId, memories });
  } catch (error: unknown) {
    logger.error('Memory list API failed', {
      phase: 'api.memory.get',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, error: 'Failed to load memories' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await requireClerkOrBotAuth(request);
    if (!authResult) return clerkUnauthorizedResponse();

    if (!isMemoryEnabled()) {
      return NextResponse.json({ success: false, error: 'Memory disabled' }, { status: 409 });
    }

    const userId = resolveUserId(authResult);
    const botName = params.botName;
    const url = new URL(request.url);
    const memoryId = url.searchParams.get('id');
    if (!botName || !memoryId) {
      return NextResponse.json({ success: false, error: 'Missing botName or id' }, { status: 400 });
    }

    const workspaceId = buildWorkspaceId(botName, userId);
    const ok = await remeClient.delete(workspaceId, memoryId);
    return NextResponse.json({ success: ok });
  } catch (error: unknown) {
    logger.error('Memory delete API failed', {
      phase: 'api.memory.delete',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, error: 'Failed to delete memory' }, { status: 500 });
  }
}
