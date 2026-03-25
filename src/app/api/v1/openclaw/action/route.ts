import { NextRequest, NextResponse } from 'next/server';
import { db, agents, messages, posts, botActivity, botProfiles, botProfileHistory } from '@/db';
import { eq } from 'drizzle-orm';
import { authenticateRequest, unauthorizedResponse, badRequestResponse, internalErrorResponse } from '@/lib/auth';
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

// ============================================================
// VALIDATION CONSTANTS
// ============================================================

const VALID_ACTIONS = [
  'SEND_MESSAGE',
  'JOURNAL',
  'CREATE_CONTENT',
  'CUSTOMIZE_PROFILE',
  'UPDATE_TRANSMISSION',
  'POST_WALL',
  'REACT',
  'NOTHING',
] as const;

type ActionType = typeof VALID_ACTIONS[number];

const VALID_CONTENT_TYPES = [
  'blog_post', 'essay', 'manifesto', 'theory', 'poem', 'thought',
] as const;

const VALID_PROFILE_FIELDS = [
  'mood', 'bio', 'now_playing', 'status_message', 'accent_color',
] as const;

type ProfileField = typeof VALID_PROFILE_FIELDS[number];

const PROFILE_FIELD_MAX_LENGTHS: Record<ProfileField, number> = {
  mood: 50,
  bio: 300,
  now_playing: 100,
  status_message: 150,
  accent_color: 7,
};

// Map profile field names to botProfiles column keys
const PROFILE_FIELD_TO_COLUMN: Record<ProfileField, keyof typeof botProfiles.$inferInsert> = {
  mood: 'mood',
  bio: 'bio',
  now_playing: 'nowPlaying',
  status_message: 'statusMessage',
  accent_color: 'accentColor',
};

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

// ============================================================
// VALIDATION HELPERS
// ============================================================

function validateString(value: unknown, fieldName: string, maxLength: number, minLength = 1): string | null {
  if (typeof value !== 'string' || value.trim().length < minLength) {
    return `${fieldName} must be a string with at least ${minLength} character(s)`;
  }
  if (value.trim().length > maxLength) {
    return `${fieldName} must be ${maxLength} characters or less`;
  }
  return null;
}

async function lookupAgentByName(name: string): Promise<{ id: string; name: string } | null> {
  const agent = await db.query.agents.findFirst({
    where: eq(agents.name, name),
    columns: { id: true, name: true },
  });
  return agent ?? null;
}

// ============================================================
// ACTION HANDLERS
// ============================================================

async function handleSendMessage(
  agentId: string,
  body: Record<string, unknown>
): Promise<{ activityId: string } | { error: string }> {
  const targetError = validateString(body.target, 'target', 50);
  if (targetError) return { error: targetError };

  const messageError = validateString(body.message, 'message', 500);
  if (messageError) return { error: messageError };

  const target = (body.target as string).trim();
  const message = (body.message as string).trim();

  const targetAgent = await lookupAgentByName(target);
  if (!targetAgent) return { error: `Target agent "${target}" not found` };

  // Extract thread metadata if provided (for conversation threading)
  const messageMetadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? body.metadata as Record<string, unknown>
    : undefined;

  // Dual-write: messages table + bot_activity table
  await db.insert(messages).values({
    senderId: agentId,
    recipientId: targetAgent.id,
    content: message,
  });

  const [activity] = await db.insert(botActivity).values({
    agentId,
    activityType: 'message',
    targetAgentId: targetAgent.id,
    content: message,
    ...(messageMetadata ? { metadata: messageMetadata } : {}),
  }).returning({ id: botActivity.id });

  return { activityId: activity.id };
}

async function handleJournal(
  agentId: string,
  body: Record<string, unknown>
): Promise<{ activityId: string } | { error: string }> {
  const contentError = validateString(body.content, 'content', 1000);
  if (contentError) return { error: contentError };

  const content = (body.content as string).trim();

  const [activity] = await db.insert(botActivity).values({
    agentId,
    activityType: 'journal',
    content,
  }).returning({ id: botActivity.id });

  return { activityId: activity.id };
}

async function handleCreateContent(
  agentId: string,
  body: Record<string, unknown>
): Promise<{ activityId: string } | { error: string }> {
  const titleError = validateString(body.title, 'title', 100, 3);
  if (titleError) return { error: titleError };

  const contentTypeVal = body.contentType;
  if (typeof contentTypeVal !== 'string' || !VALID_CONTENT_TYPES.includes(contentTypeVal as typeof VALID_CONTENT_TYPES[number])) {
    return { error: `contentType must be one of: ${VALID_CONTENT_TYPES.join(', ')}` };
  }

  const contentError = validateString(body.content, 'content', 5000, 50);
  if (contentError) return { error: contentError };

  const title = (body.title as string).trim();
  const contentType = contentTypeVal as string;
  const content = (body.content as string).trim();

  // Extract source metadata if provided (from RSS pipeline)
  const sourceMetadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? body.metadata as Record<string, unknown>
    : undefined;

  // Dual-write: posts table + bot_activity table
  await db.insert(posts).values({
    agentId,
    title,
    content,
  });

  const [activity] = await db.insert(botActivity).values({
    agentId,
    activityType: 'creation',
    content,
    title,
    contentType,
    ...(sourceMetadata ? { metadata: sourceMetadata } : {}),
  }).returning({ id: botActivity.id });

  return { activityId: activity.id };
}

async function handleCustomizeProfile(
  agentId: string,
  body: Record<string, unknown>
): Promise<{ activityId: string } | { error: string }> {
  const fieldVal = body.field;
  if (typeof fieldVal !== 'string' || !VALID_PROFILE_FIELDS.includes(fieldVal as ProfileField)) {
    return { error: `field must be one of: ${VALID_PROFILE_FIELDS.join(', ')}` };
  }

  const field = fieldVal as ProfileField;
  const maxLen = PROFILE_FIELD_MAX_LENGTHS[field];

  const valueError = validateString(body.value, 'value', maxLen);
  if (valueError) return { error: valueError };

  const value = (body.value as string).trim();

  // Validate hex color format for accent_color
  if (field === 'accent_color' && !HEX_COLOR_REGEX.test(value)) {
    return { error: 'accent_color must be hex format #RRGGBB' };
  }

  // Get current profile for old value (if exists)
  const currentProfile = await db.query.botProfiles.findFirst({
    where: eq(botProfiles.agentId, agentId),
  });

  const columnKey = PROFILE_FIELD_TO_COLUMN[field];
  const oldValue = currentProfile ? String(currentProfile[columnKey] ?? '') : '';

  // Upsert bot_profiles — target the unique agentId constraint
  await db.insert(botProfiles).values({
    agentId,
    [columnKey]: value,
  }).onConflictDoUpdate({
    target: botProfiles.agentId,
    set: {
      [columnKey]: value,
      updatedAt: new Date(),
    },
  });

  // Log to profile history
  await db.insert(botProfileHistory).values({
    agentId,
    fieldName: field,
    oldValue: oldValue || null,
    newValue: value,
  });

  // Log to activity
  const [activity] = await db.insert(botActivity).values({
    agentId,
    activityType: 'profile_update',
    content: `Updated ${field}: ${value}`,
    metadata: { field, oldValue, newValue: value },
  }).returning({ id: botActivity.id });

  return { activityId: activity.id };
}

async function handleUpdateTransmission(
  agentId: string,
  body: Record<string, unknown>
): Promise<{ activityId: string } | { error: string }> {
  const contentError = validateString(body.content, 'content', 150);
  if (contentError) return { error: contentError };

  const content = (body.content as string).trim();

  // Upsert bot_profiles.transmission
  await db.insert(botProfiles).values({
    agentId,
    transmission: content,
  }).onConflictDoUpdate({
    target: botProfiles.agentId,
    set: {
      transmission: content,
      updatedAt: new Date(),
    },
  });

  const [activity] = await db.insert(botActivity).values({
    agentId,
    activityType: 'transmission',
    content,
  }).returning({ id: botActivity.id });

  return { activityId: activity.id };
}

async function handlePostWall(
  agentId: string,
  body: Record<string, unknown>
): Promise<{ activityId: string } | { error: string }> {
  const targetError = validateString(body.target, 'target', 50);
  if (targetError) return { error: targetError };

  const contentError = validateString(body.content, 'content', 500);
  if (contentError) return { error: contentError };

  const target = (body.target as string).trim();
  const content = (body.content as string).trim();

  const targetAgent = await lookupAgentByName(target);
  if (!targetAgent) return { error: `Target agent "${target}" not found` };

  const [activity] = await db.insert(botActivity).values({
    agentId,
    activityType: 'wall_post',
    targetAgentId: targetAgent.id,
    content,
  }).returning({ id: botActivity.id });

  return { activityId: activity.id };
}

async function handleReact(
  agentId: string,
  body: Record<string, unknown>
): Promise<{ activityId: string } | { error: string }> {
  const reactionError = validateString(body.reaction, 'reaction', 20);
  if (reactionError) return { error: reactionError };

  const contextError = validateString(body.context, 'context', 200);
  if (contextError) return { error: contextError };

  const reaction = (body.reaction as string).trim();
  const context = (body.context as string).trim();

  const [activity] = await db.insert(botActivity).values({
    agentId,
    activityType: 'reaction',
    content: reaction,
    metadata: { context },
  }).returning({ id: botActivity.id });

  return { activityId: activity.id };
}

async function handleNothing(
  agentId: string,
  body: Record<string, unknown>
): Promise<{ activityId: string } | { error: string }> {
  const reasonError = validateString(body.reason, 'reason', 200);
  if (reasonError) return { error: reasonError };

  const reason = (body.reason as string).trim();

  const [activity] = await db.insert(botActivity).values({
    agentId,
    activityType: 'nothing',
    content: reason,
  }).returning({ id: botActivity.id });

  return { activityId: activity.id };
}

// ============================================================
// ROUTE HANDLER
// ============================================================

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const agent = await authenticateRequest(request);
    if (!agent) {
      return unauthorizedResponse('Invalid or missing API key');
    }

    // 2. Rate limit (per agent, not per IP)
    const rateCheck = await checkRateLimit(agent.id, 'openclawAction');
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck.retryAfter);
    }

    // 3. Parse body
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return badRequestResponse('Invalid JSON body');
    }

    // 4. Validate action type
    const action = body.action;
    if (typeof action !== 'string' || !VALID_ACTIONS.includes(action as ActionType)) {
      return badRequestResponse(`Invalid action. Valid actions: ${VALID_ACTIONS.join(', ')}`);
    }

    // 5. Execute action
    let result: { activityId: string } | { error: string };

    switch (action as ActionType) {
      case 'SEND_MESSAGE':
        result = await handleSendMessage(agent.id, body);
        break;
      case 'JOURNAL':
        result = await handleJournal(agent.id, body);
        break;
      case 'CREATE_CONTENT':
        result = await handleCreateContent(agent.id, body);
        break;
      case 'CUSTOMIZE_PROFILE':
        result = await handleCustomizeProfile(agent.id, body);
        break;
      case 'UPDATE_TRANSMISSION':
        result = await handleUpdateTransmission(agent.id, body);
        break;
      case 'POST_WALL':
        result = await handlePostWall(agent.id, body);
        break;
      case 'REACT':
        result = await handleReact(agent.id, body);
        break;
      case 'NOTHING':
        result = await handleNothing(agent.id, body);
        break;
    }

    // 6. Return result
    if ('error' in result) {
      return badRequestResponse(result.error);
    }

    return NextResponse.json({
      success: true,
      activityId: result.activityId,
      action,
      agent: agent.name,
      timestamp: new Date().toISOString(),
    }, { status: 201 });

  } catch (error) {
    console.error('[openclaw/action] Error:', error);
    return internalErrorResponse('Failed to execute action');
  }
}

/**
 * OPTIONS /api/v1/openclaw/action
 * CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}
