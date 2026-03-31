import { NextRequest, NextResponse } from 'next/server';
import { getDynamicCorsOrigin } from '@/lib/security/cors';
import { db, agents, messages, botActivity, botProfiles } from '@/db';
import { eq, or, desc, and, inArray, ne } from 'drizzle-orm';
import { authenticateRequest, unauthorizedResponse, internalErrorResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate
    const agent = await authenticateRequest(request);
    if (!agent) {
      return unauthorizedResponse('Invalid or missing API key');
    }

    // 2. Rate limit (per agent)
    const rateCheck = await checkRateLimit(agent.id, 'openclawContext');
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck.retryAfter);
    }

    // 3. Fetch agent profile
    const profile = await db.query.botProfiles.findFirst({
      where: eq(botProfiles.agentId, agent.id),
    });

    // 4. Fetch recent activity (last 20 involving this agent as actor or target)
    const recentActivity = await db
      .select({
        id: botActivity.id,
        activityType: botActivity.activityType,
        agentId: botActivity.agentId,
        targetAgentId: botActivity.targetAgentId,
        content: botActivity.content,
        title: botActivity.title,
        contentType: botActivity.contentType,
        metadata: botActivity.metadata,
        cycleSource: botActivity.cycleSource,
        createdAt: botActivity.createdAt,
      })
      .from(botActivity)
      .where(
        or(
          eq(botActivity.agentId, agent.id),
          eq(botActivity.targetAgentId, agent.id)
        )
      )
      .orderBy(desc(botActivity.createdAt))
      .limit(20);

    // 5. Fetch all registered agents with their current mood
    const allAgentsRaw = await db
      .select({
        name: agents.name,
      })
      .from(agents);

    // Get all profiles in one query for mood lookup
    const allProfiles = await db
      .select({
        agentId: botProfiles.agentId,
        mood: botProfiles.mood,
      })
      .from(botProfiles);

    const profileMoodMap = new Map(
      allProfiles.map((p) => [p.agentId, p.mood])
    );

    // Look up agent IDs for mood mapping
    const allAgentsWithIds = await db
      .select({
        id: agents.id,
        name: agents.name,
      })
      .from(agents);

    const allAgentsList = allAgentsWithIds.map((a) => ({
      name: a.name,
      mood: profileMoodMap.get(a.id) ?? 'Unknown',
    }));

    // 6. Fetch unread messages (last 10 sent TO this agent)
    const unreadMessages = await db
      .select({
        id: messages.id,
        senderId: messages.senderId,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.recipientId, agent.id),
          eq(messages.isRead, false)
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(10);

    // Build response FIRST, then mark as read
    const unreadMessageIds = unreadMessages.map((m) => m.id);

    // Resolve sender names for unread messages
    const senderIds = [...new Set(unreadMessages.map((m) => m.senderId))];
    const senderAgents = senderIds.length > 0
      ? await db
          .select({ id: agents.id, name: agents.name })
          .from(agents)
          .where(inArray(agents.id, senderIds))
      : [];

    const senderNameMap = new Map(
      senderAgents.map((a) => [a.id, a.name])
    );

    const recentMessages = unreadMessages.map((m) => ({
      id: m.id,
      from: senderNameMap.get(m.senderId) ?? 'Unknown',
      content: m.content,
      createdAt: m.createdAt?.toISOString() ?? null,
    }));

    // 7. Mark unread messages as read AFTER building response
    if (unreadMessageIds.length > 0) {
      await db
        .update(messages)
        .set({ isRead: true })
        .where(inArray(messages.id, unreadMessageIds));
    }

    // 8. Fetch recent articles by OTHER agents (for conversation context)
    const recentArticlesByOthers = await db
      .select({
        id: botActivity.id,
        agentId: botActivity.agentId,
        agentName: agents.name,
        title: botActivity.title,
        content: botActivity.content,
        contentType: botActivity.contentType,
        metadata: botActivity.metadata,
        createdAt: botActivity.createdAt,
      })
      .from(botActivity)
      .innerJoin(agents, eq(botActivity.agentId, agents.id))
      .where(
        and(
          eq(botActivity.activityType, 'creation'),
          ne(botActivity.agentId, agent.id)
        )
      )
      .orderBy(desc(botActivity.createdAt))
      .limit(10);

    const articlesForContext = recentArticlesByOthers.map((a) => ({
      id: a.id,
      agentName: a.agentName,
      title: a.title,
      contentPreview: (a.content || '').slice(0, 300),
      contentType: a.contentType,
      beat: (a.metadata as Record<string, unknown>)?.beat || null,
      createdAt: a.createdAt?.toISOString() ?? null,
    }));

    return NextResponse.json({
      success: true,
      agent: {
        name: agent.name,
        mood: profile?.mood ?? 'Unknown',
        transmission: profile?.transmission ?? null,
      },
      recentActivity,
      allAgents: allAgentsList,
      recentMessages,
      recentArticlesByOthers: articlesForContext,
    });

  } catch (error) {
    console.error('[openclaw/context] Error:', error);
    return internalErrorResponse('Failed to fetch context');
  }
}

/**
 * OPTIONS /api/v1/openclaw/context
 * CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getDynamicCorsOrigin(request.headers),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}
