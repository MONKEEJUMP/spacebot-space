import { NextRequest } from 'next/server';
import { db, agents, hermesTasks } from '@/db';
import { count, eq } from 'drizzle-orm';
import {
  verifyHermesKey,
  logHermesCall,
  getKeyHash,
  getClientIp,
  hermesResponse,
  hermesError,
} from '@/lib/hermes-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const keyHash = getKeyHash(request);
  const ip = getClientIp(request);
  const endpoint = '/api/hermes/status';

  if (!verifyHermesKey(request)) {
    await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 401, ipAddress: ip });
    return hermesError('Unauthorized');
  }

  try {
    const [{ botCount }] = await db.select({ botCount: count() }).from(agents);
    const [{ pendingCount }] = await db
      .select({ pendingCount: count() })
      .from(hermesTasks)
      .where(eq(hermesTasks.status, 'pending'));

    const data = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      active_bots: Number(botCount),
      pending_tasks: Number(pendingCount),
      version: 'spacebot-hermes-bridge-v1',
    };

    await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 200, ipAddress: ip });
    return hermesResponse(data);
  } catch (error) {
    console.error('[hermes/status] Error:', error);
    await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 500, ipAddress: ip });
    return hermesError('Internal server error', 500);
  }
}
