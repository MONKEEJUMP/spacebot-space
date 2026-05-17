import { NextRequest } from 'next/server';
import { db, hermesTasks, hermesActions, hermesArtifacts, hermesApprovals } from '@/db';
import {
  verifyHermesKey,
  logHermesCall,
  getKeyHash,
  getClientIp,
  hermesResponse,
  hermesError,
} from '@/lib/hermes-auth';

export const dynamic = 'force-dynamic';

const VALID_POST_TYPES = ['thought', 'transmission', 'analysis'] as const;

export async function POST(request: NextRequest) {
  const keyHash = getKeyHash(request);
  const ip = getClientIp(request);
  const endpoint = '/api/hermes/drafts/bot-post';

  if (!verifyHermesKey(request)) {
    await logHermesCall({ endpoint, method: 'POST', keyHash, responseCode: 401, ipAddress: ip });
    return hermesError('Unauthorized');
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    await logHermesCall({ endpoint, method: 'POST', keyHash, responseCode: 400, ipAddress: ip });
    return hermesError('Invalid JSON body', 400);
  }

  const botName = typeof body.bot_name === 'string' ? body.bot_name.trim() : null;
  const content = typeof body.content === 'string' ? body.content.trim() : null;
  const postType = typeof body.post_type === 'string' ? body.post_type : null;

  if (!botName) {
    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 400, ipAddress: ip });
    return hermesError('bot_name is required', 400);
  }
  if (!content) {
    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 400, ipAddress: ip });
    return hermesError('content is required', 400);
  }
  if (!postType || !VALID_POST_TYPES.includes(postType as typeof VALID_POST_TYPES[number])) {
    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 400, ipAddress: ip });
    return hermesError(`post_type must be one of: ${VALID_POST_TYPES.join(', ')}`, 400);
  }

  try {
    const [task] = await db.insert(hermesTasks).values({
      type: 'draft_post',
      title: `${botName} — ${postType}`,
      payload: { bot_name: botName, post_type: postType },
    }).returning();

    const [action] = await db.insert(hermesActions).values({
      taskId: task.id,
      actionType: 'create_draft',
      target: botName,
      payload: { post_type: postType },
      status: 'pending_approval',
    }).returning();

    const [artifact] = await db.insert(hermesArtifacts).values({
      actionId: action.id,
      artifactType: 'bot_post',
      title: `${botName} — ${postType}`,
      content,
      metadata: { bot_name: botName, post_type: postType },
    }).returning();

    const [approval] = await db.insert(hermesApprovals).values({
      actionId: action.id,
      status: 'pending',
    }).returning();

    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 201, ipAddress: ip });
    return hermesResponse({
      task_id: task.id,
      action_id: action.id,
      artifact_id: artifact.id,
      approval_id: approval.id,
      status: 'pending_approval',
    }, 201);
  } catch (error) {
    console.error('[hermes/drafts/bot-post] Error:', error);
    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 500, ipAddress: ip });
    return hermesError('Internal server error', 500);
  }
}
