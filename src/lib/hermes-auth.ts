import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/db';
import { hermesAuditLog } from '@/db/hermes-schema';

export function verifyHermesKey(request: NextRequest): boolean {
  const bridgeKey = process.env.HERMES_BRIDGE_KEY;
  if (!bridgeKey) return false;
  const headerKey = request.headers.get('X-Hermes-Key');
  if (!headerKey) return false;
  return headerKey === bridgeKey;
}

export function getKeyHash(request: NextRequest): string {
  const key = request.headers.get('X-Hermes-Key') ?? '';
  return createHash('sha256').update(key).digest('hex').slice(0, 8);
}

export function getClientIp(request: NextRequest): string | null {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

interface LogParams {
  endpoint: string;
  method: string;
  keyHash: string;
  requestBody?: unknown;
  responseCode: number;
  ipAddress?: string | null;
}

export async function logHermesCall(params: LogParams): Promise<void> {
  try {
    await db.insert(hermesAuditLog).values({
      endpoint: params.endpoint,
      method: params.method,
      keyHash: params.keyHash,
      requestBody: (params.requestBody ?? null) as Record<string, unknown> | null,
      responseCode: params.responseCode,
      ipAddress: params.ipAddress ?? null,
    });
  } catch {
    // Audit log failure must not break the request
  }
}

export function hermesResponse(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function hermesError(message: string, status = 401): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
