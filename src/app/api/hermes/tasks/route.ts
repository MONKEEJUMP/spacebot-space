import { NextRequest } from 'next/server';
import { db, hermesTasks } from '@/db';
import { count, desc, eq } from 'drizzle-orm';
import {
  verifyHermesKey,
  logHermesCall,
  getKeyHash,
  getClientIp,
  hermesResponse,
  hermesError,
} from '@/lib/hermes-auth';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['draft_blog', 'draft_post', 'bot_activation', 'code_proposal', 'research'] as const;

export async function GET(request: NextRequest) {
  const keyHash = getKeyHash(request);
  const ip = getClientIp(request);
  const endpoint = '/api/hermes/tasks';

  if (!verifyHermesKey(request)) {
    await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 401, ipAddress: ip });
    return hermesError('Unauthorized');
  }

  try {
    const tasks = await db
      .select()
      .from(hermesTasks)
      .orderBy(desc(hermesTasks.createdAt))
      .limit(20);

    await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 200, ipAddress: ip });
    return hermesResponse({ tasks, count: tasks.length });
  } catch (error) {
    console.error('[hermes/tasks GET] Error:', error);
    await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 500, ipAddress: ip });
    return hermesError('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  const keyHash = getKeyHash(request);
  const ip = getClientIp(request);
  const endpoint = '/api/hermes/tasks';

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

  const type = body.type as string;
  if (!type || !VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 400, ipAddress: ip });
    return hermesError(`type must be one of: ${VALID_TYPES.join(', ')}`, 400);
  }

  try {
    const [task] = await db
      .insert(hermesTasks)
      .values({
        type,
        title: typeof body.title === 'string' ? body.title : null,
        payload: (body.payload ?? null) as Record<string, unknown> | null,
      })
      .returning();

    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 201, ipAddress: ip });
    return hermesResponse({ task }, 201);
  } catch (error) {
    console.error('[hermes/tasks POST] Error:', error);
    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 500, ipAddress: ip });
    return hermesError('Internal server error', 500);
  }
}
