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

export async function POST(request: NextRequest) {
  const keyHash = getKeyHash(request);
  const ip = getClientIp(request);
  const endpoint = '/api/hermes/drafts/blog';

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

  const title = typeof body.title === 'string' ? body.title.trim() : null;
  const content = typeof body.content === 'string' ? body.content.trim() : null;
  const category = typeof body.category === 'string' ? body.category.trim() : null;
  const authorBot = typeof body.author_bot === 'string' ? body.author_bot.trim() : null;

  if (!content) {
    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 400, ipAddress: ip });
    return hermesError('content is required', 400);
  }

  try {
    const [task] = await db.insert(hermesTasks).values({
      type: 'draft_blog',
      title,
      payload: { category, author_bot: authorBot },
    }).returning();

    const [action] = await db.insert(hermesActions).values({
      taskId: task.id,
      actionType: 'create_draft',
      target: authorBot,
      payload: { category },
      status: 'pending_approval',
    }).returning();

    const [artifact] = await db.insert(hermesArtifacts).values({
      actionId: action.id,
      artifactType: 'blog_draft',
      title,
      content,
      metadata: { category, author_bot: authorBot },
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
    console.error('[hermes/drafts/blog] Error:', error);
    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 500, ipAddress: ip });
    return hermesError('Internal server error', 500);
  }
}
