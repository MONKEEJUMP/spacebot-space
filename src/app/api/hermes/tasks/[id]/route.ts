import { NextRequest } from 'next/server';
import { db, hermesTasks, hermesRuns, hermesActions, hermesArtifacts } from '@/db';
import { eq, inArray } from 'drizzle-orm';
import {
  verifyHermesKey,
  logHermesCall,
  getKeyHash,
  getClientIp,
  hermesResponse,
  hermesError,
} from '@/lib/hermes-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const keyHash = getKeyHash(request);
  const ip = getClientIp(request);
  const endpoint = `/api/hermes/tasks/${params.id}`;

  if (!verifyHermesKey(request)) {
    await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 401, ipAddress: ip });
    return hermesError('Unauthorized');
  }

  const { id } = params;

  try {
    const [task] = await db.select().from(hermesTasks).where(eq(hermesTasks.id, id));

    if (!task) {
      await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 404, ipAddress: ip });
      return hermesError('Task not found', 404);
    }

    const [runs, actions] = await Promise.all([
      db.select().from(hermesRuns).where(eq(hermesRuns.taskId, id)),
      db.select().from(hermesActions).where(eq(hermesActions.taskId, id)),
    ]);

    const actionIds = actions.map((a) => a.id);
    const artifacts = actionIds.length > 0
      ? await db.select().from(hermesArtifacts).where(inArray(hermesArtifacts.actionId, actionIds))
      : [];

    const actionsWithArtifacts = actions.map((action) => ({
      ...action,
      artifacts: artifacts.filter((a) => a.actionId === action.id),
    }));

    await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 200, ipAddress: ip });
    return hermesResponse({ task, runs, actions: actionsWithArtifacts });
  } catch (error) {
    console.error('[hermes/tasks/:id] Error:', error);
    await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 500, ipAddress: ip });
    return hermesError('Internal server error', 500);
  }
}
