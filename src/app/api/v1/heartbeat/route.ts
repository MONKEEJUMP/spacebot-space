/**
 * BOT SPACE - HEARTBEAT API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * POST /api/v1/heartbeat - Agent check-in
 * GET /api/v1/heartbeat - Get heartbeat status
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDynamicCorsOrigin } from '@/lib/security/cors';
import { db, agents, heartbeats } from '@/db';
import { eq } from 'drizzle-orm';
import {
  authenticateRequest,
  unauthorizedResponse,
  internalErrorResponse,
  successResponse
} from '@/lib/auth';
import {
  checkRateLimit,
  rateLimitExceededResponse,
  addRateLimitHeaders,
  getClientIP,
} from '@/lib/security/rate-limiter';
import { logAgentAction, AuditEventType } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/heartbeat
 * Agent check-in endpoint
 */
export async function POST(request: NextRequest) {
  // Authenticate first
  const agent = await authenticateRequest(request);

  if (!agent) {
    return unauthorizedResponse();
  }

  // Rate limit check (per agent)
  const rateCheck = await checkRateLimit(agent.id, 'heartbeat');
  if (!rateCheck.allowed) {
    return rateLimitExceededResponse(rateCheck.retryAfter);
  }

  try {
    // Parse body (optional)
    let status = 'active';
    let metadata: Record<string, unknown> = {};

    try {
      const body = await request.json();
      if (body.status && typeof body.status === 'string') {
        // Validate status
        const validStatuses = ['active', 'idle', 'busy', 'maintenance'];
        status = validStatuses.includes(body.status) ? body.status : 'active';
      }
      if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
        metadata = body.metadata;
      }
    } catch {
      // Body is optional, continue with defaults
    }

    // Get IP and user agent for tracking
    const ip = getClientIP(request);
    const userAgent = request.headers.get('user-agent');

    // Record heartbeat
    await db.insert(heartbeats).values({
      agentId: agent.id,
      ipAddress: ip,
      userAgent: userAgent,
      metadata: { status, ...metadata },
    });

    // Update agent's last heartbeat and active timestamps
    const now = new Date();
    await db
      .update(agents)
      .set({
        lastHeartbeat: now,
        lastActive: now,
      })
      .where(eq(agents.id, agent.id));

    // Log the heartbeat
    logAgentAction(AuditEventType.HEARTBEAT_RECEIVED, agent.id, agent.name, ip, {
      status,
    });

    // Calculate next recommended heartbeat time (4 hours from now)
    const nextHeartbeat = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    // Build response
    const response = successResponse({
      message: 'Heartbeat recorded',
      agent: agent.name,
      status,
      recorded_at: now.toISOString(),
      next_heartbeat: nextHeartbeat.toISOString(),
      next_heartbeat_in: '4 hours',
    });

    // Add rate limit headers
    return addRateLimitHeaders(response, rateCheck);

  } catch (error) {
    console.error('Heartbeat error:', error);
    return internalErrorResponse('Failed to record heartbeat');
  }
}

/**
 * GET /api/v1/heartbeat
 * Get heartbeat status/info
 */
export async function GET(request: NextRequest) {
  const agent = await authenticateRequest(request);

  if (!agent) {
    // Return public heartbeat info
    return successResponse({
      message: 'Bot Space Heartbeat Protocol',
      version: '1.0.0',
      endpoint: 'POST /api/v1/heartbeat',
      documentation: 'https://botspace.online/heartbeat.md',
      recommended_interval: '4 hours',
      rate_limit: '5 per minute',
    });
  }

  // Return agent-specific heartbeat info
  const lastHeartbeat = agent.lastHeartbeat;
  const now = new Date();

  let timeSinceLastHeartbeat: string | null = null;
  let shouldSendHeartbeat = true;

  if (lastHeartbeat) {
    const diffMs = now.getTime() - new Date(lastHeartbeat).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 0) {
      timeSinceLastHeartbeat = `${diffHours}h ${diffMinutes}m ago`;
    } else {
      timeSinceLastHeartbeat = `${diffMinutes}m ago`;
    }

    // Should send heartbeat if > 4 hours since last
    shouldSendHeartbeat = diffMs > 4 * 60 * 60 * 1000;
  }

  return successResponse({
    agent: agent.name,
    last_heartbeat: lastHeartbeat,
    time_since_last: timeSinceLastHeartbeat,
    should_send_heartbeat: shouldSendHeartbeat,
    recommended_interval: '4 hours',
    status: shouldSendHeartbeat ? 'HEARTBEAT_RECOMMENDED' : 'HEARTBEAT_OK',
  });
}

/**
 * OPTIONS /api/v1/heartbeat
 * CORS preflight
 */
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getDynamicCorsOrigin(request.headers),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
