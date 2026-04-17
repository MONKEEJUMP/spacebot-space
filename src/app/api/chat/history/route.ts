import { and, asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db, chatConversations, chatMessages } from '@/db';
import { requireClerkOrBotAuth, clerkUnauthorizedResponse } from '@/lib/security/clerk-auth';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function normalizeBotKey(botName: string): string {
  return botName.trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  const authResult = await requireClerkOrBotAuth(request);
  if (!authResult) {
    return clerkUnauthorizedResponse();
  }

  let userId: string;
  if (authResult.type === 'clerk') {
    userId = authResult.userId;
  } else {
    const agent = (authResult as { agent?: { botName?: string; id?: string } }).agent;
    userId = `bot:${agent?.botName || agent?.id || 'unknown'}`;
  }

  const url = new URL(request.url);
  const botName = url.searchParams.get('botName')?.trim() || '';
  const rawLimit = Number(url.searchParams.get('limit') || DEFAULT_LIMIT);
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, MAX_LIMIT));

  if (!botName) {
    return NextResponse.json(
      { success: false, error: 'botName is required' },
      { status: 400 }
    );
  }

  try {
    const botKey = normalizeBotKey(botName);
    const [conversation] = await db
      .select({
        id: chatConversations.id,
      })
      .from(chatConversations)
      .where(and(eq(chatConversations.authUserId, userId), eq(chatConversations.botKey, botKey)))
      .limit(1);

    if (!conversation) {
      return NextResponse.json({
        success: true,
        messages: [],
        conversationId: null,
      });
    }

    const messages = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        modelUsed: chatMessages.modelUsed,
        latencyMs: chatMessages.latencyMs,
        toolsUsed: chatMessages.toolsUsed,
        metadata: chatMessages.metadata,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversation.id))
      .orderBy(asc(chatMessages.createdAt))
      .limit(limit);

    return NextResponse.json({
      success: true,
      messages,
      conversationId: conversation.id,
    });
  } catch (error) {
    console.error('[api/chat/history] Failed to fetch chat history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch chat history' },
      { status: 500 }
    );
  }
}
