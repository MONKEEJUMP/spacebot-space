import { desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db, chatMessages } from '@/db';
import {
  ChatActorResolutionError,
  resolveCanonicalChatActor,
  type ChatAuthentication,
} from '@/lib/chat/chat-actor';
import { getOrCreateCanonicalConversation } from '@/lib/chat/chat-conversation-repository';
import {
  isChatTargetResolutionError,
  resolveCanonicalChatTarget,
} from '@/lib/chat/chat-target-resolver';
import { requireClerkOrBotAuth, clerkUnauthorizedResponse } from '@/lib/security/clerk-auth';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const authResult = await requireClerkOrBotAuth(request);
  if (!authResult) {
    return clerkUnauthorizedResponse();
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
    let target;
    try {
      target = await resolveCanonicalChatTarget(botName);
    } catch (error) {
      if (!isChatTargetResolutionError(error)) throw error;
      return NextResponse.json(
        { success: false, error: error.publicMessage },
        { status: error.status },
      );
    }
    let actor;
    try {
      actor = await resolveCanonicalChatActor(authResult as ChatAuthentication);
    } catch (error) {
      if (error instanceof ChatActorResolutionError) {
        return NextResponse.json(
          { success: false, error: error.safeMessage },
          { status: error.status },
        );
      }
      throw error;
    }
    const conversation = await getOrCreateCanonicalConversation(actor, {
      agentId: target.agentId,
      normalizedName: target.normalizedName,
      displayName: target.displayName,
    });

    const recentMessages = await db
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
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      .limit(limit);
    const messages = [...recentMessages].reverse();

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
