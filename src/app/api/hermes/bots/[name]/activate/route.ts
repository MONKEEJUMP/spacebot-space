import { NextRequest } from 'next/server';
import { db, agents, hermesTasks, hermesActions, hermesApprovals } from '@/db';
import { eq } from 'drizzle-orm';
import {
  verifyHermesKey,
  logHermesCall,
  getKeyHash,
  getClientIp,
  hermesResponse,
  hermesError,
} from '@/lib/hermes-auth';

export const dynamic = 'force-dynamic';

const VALID_ACTIONS = ['write_post', 'research', 'update_mood'] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  const keyHash = getKeyHash(request);
  const ip = getClientIp(request);
  const botName = params.name;
  const endpoint = `/api/hermes/bots/${botName}/activate`;

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

  const action = typeof body.action === 'string' ? body.action : null;
  if (!action || !VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 400, ipAddress: ip });
    return hermesError(`action must be one of: ${VALID_ACTIONS.join(', ')}`, 400);
  }

  try {
    const [bot] = await db.select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(eq(agents.name, botName));

    if (!bot) {
      await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 404, ipAddress: ip });
      return hermesError(`Bot "${botName}" not found`, 404);
    }

    const [task] = await db.insert(hermesTasks).values({
      type: 'bot_activation',
      title: `Activate ${botName} — ${action}`,
      payload: { bot_name: botName, action, parameters: body.parameters ?? null },
    }).returning();

    const [hermesAction] = await db.insert(hermesActions).values({
      taskId: task.id,
      actionType: 'activate_bot',
      target: botName,
      payload: { action, parameters: body.parameters ?? null },
      status: 'pending_approval',
    }).returning();

    const [approval] = await db.insert(hermesApprovals).values({
      actionId: hermesAction.id,
      status: 'pending',
    }).returning();

    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 201, ipAddress: ip });
    return hermesResponse({
      task_id: task.id,
      action_id: hermesAction.id,
      approval_id: approval.id,
      bot: botName,
      requested_action: action,
      status: 'pending_approval',
    }, 201);
  } catch (error) {
    console.error('[hermes/bots/:name/activate] Error:', error);
    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 500, ipAddress: ip });
    return hermesError('Internal server error', 500);
  }
}
