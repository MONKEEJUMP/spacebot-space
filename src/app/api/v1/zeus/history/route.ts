/**
 * ZEUS CONVERSATION HISTORY — GET
 * GET /api/v1/zeus/history
 * Returns the conversation history for the authenticated human.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, zeusConversations } from '@/db';
import { eq, asc } from 'drizzle-orm';
import { verifyHumanRequest } from '@/lib/security/human-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await verifyHumanRequest(request);
  if (!('humanId' in authResult)) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  const { humanId } = authResult;

  try {
    const messages = await db
      .select({
        id: zeusConversations.id,
        role: zeusConversations.role,
        content: zeusConversations.content,
        createdAt: zeusConversations.createdAt,
      })
      .from(zeusConversations)
      .where(eq(zeusConversations.humanId, humanId))
      .orderBy(asc(zeusConversations.createdAt));

    return NextResponse.json({ success: true, messages });
  } catch (error) {
    console.error('[zeus/history] Failed to fetch conversation history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch conversation history' },
      { status: 500 }
    );
  }
}
