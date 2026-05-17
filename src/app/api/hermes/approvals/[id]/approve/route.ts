import { NextRequest } from 'next/server';
import { db, hermesApprovals, hermesActions } from '@/db';
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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const keyHash = getKeyHash(request);
  const ip = getClientIp(request);
  const approvalId = params.id;
  const endpoint = `/api/hermes/approvals/${approvalId}/approve`;

  if (!verifyHermesKey(request)) {
    await logHermesCall({ endpoint, method: 'POST', keyHash, responseCode: 401, ipAddress: ip });
    return hermesError('Unauthorized');
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    body = {};
  }

  const approver = typeof body.approver === 'string' ? body.approver.trim() : 'UNKNOWN';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : null;

  try {
    const [existing] = await db
      .select()
      .from(hermesApprovals)
      .where(eq(hermesApprovals.id, approvalId));

    if (!existing) {
      await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 404, ipAddress: ip });
      return hermesError('Approval not found', 404);
    }

    if (existing.status !== 'pending') {
      await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 409, ipAddress: ip });
      return hermesError(`Approval already ${existing.status}`, 409);
    }

    const now = new Date();

    const [updated] = await db
      .update(hermesApprovals)
      .set({ status: 'approved', approver, notes, decidedAt: now })
      .where(eq(hermesApprovals.id, approvalId))
      .returning();

    await db
      .update(hermesActions)
      .set({ status: 'approved' })
      .where(eq(hermesActions.id, existing.actionId));

    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 200, ipAddress: ip });
    return hermesResponse({ approval: updated, message: 'Approved. Execute separately.' });
  } catch (error) {
    console.error('[hermes/approvals/:id/approve] Error:', error);
    await logHermesCall({ endpoint, method: 'POST', keyHash, requestBody: body, responseCode: 500, ipAddress: ip });
    return hermesError('Internal server error', 500);
  }
}
