// DORYLUS Chat API — connects frontend to the multi-agent fusion engine
// POST /api/chat — authenticate, load bot personality, execute DORYLUS, return response

import { NextRequest, NextResponse } from 'next/server';
import { requireClerkOrBotAuth, clerkUnauthorizedResponse } from '@/lib/security/clerk-auth';
import { getBotSystemPrompt } from '../../../../dorylus/personality';
import { executeDorylusCycle } from '../../../../dorylus';
import { sanitizeBotResponse } from '../../../../dorylus/sanitize';

export const dynamic = 'force-dynamic';

// Rate limiter: 10 messages per user per minute
const rateLimitMap: Map<string, { count: number; resetAt: number }> = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkUserRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate — Clerk session (human) or bot API key
    const authResult = await requireClerkOrBotAuth(request);
    if (!authResult) {
      return clerkUnauthorizedResponse();
    }

    let userId: string;
    if (authResult.type === 'clerk') {
      userId = authResult.userId;
    } else {
      const agent = (authResult as any).agent;
      userId = `bot:${agent?.botName || agent?.id || 'unknown'}`;
    }

    // 2. Rate limit — 10 per user per minute
    if (!checkUserRateLimit(userId)) {
      return NextResponse.json(
        { success: false, error: 'Rate limited. Please wait a moment before sending another message.' },
        { status: 429 }
      );
    }

    // 3. Parse and validate request body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { botName, message } = body;

    if (!botName || typeof botName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing botName' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing message' },
        { status: 400 }
      );
    }

    // Cap message length to prevent context overflow
    const trimmedMessage = message.slice(0, 2000);

    // 4. Load bot personality from database
    const botData = await getBotSystemPrompt(botName);
    if (!botData) {
      return NextResponse.json(
        { success: false, error: 'Bot not found or inactive' },
        { status: 404 }
      );
    }

    // 5. Execute full DORYLUS cycle (ALPHA-DECOMPOSE → 5 wingmen → ALPHA-FUSE)
    const result = await executeDorylusCycle({
      userId,
      botName,
      botSpace: botData.config.space,
      originalQuery: trimmedMessage,
      botSystemPrompt: botData.systemPrompt,
      temperature: botData.config.temperature,
    });

    // 6. Handle DORYLUS error state — return 200 with fallback response
    //    DORYLUS provides a user-friendly fallback even on error
    if (result.status === 'error') {
      return NextResponse.json({
        success: false,
        response: sanitizeBotResponse(result.finalResponse),
        error: result.errorMessage || 'DORYLUS cycle encountered an error',
        botName: result.botName,
        queryId: result.queryId,
        metrics: {
          totalCycleMs: result.totalCycleMs,
          totalTokens: result.totalTokens,
          wingmenCompleted: result.wingmanResults.filter(w => w.status === 'complete').length,
        },
      });
    }

    // 7. Return successful response
    return NextResponse.json({
      success: true,
      response: sanitizeBotResponse(result.finalResponse),
      botName: result.botName,
      queryId: result.queryId,
      metrics: {
        totalCycleMs: result.totalCycleMs,
        totalTokens: result.totalTokens,
        wingmenCompleted: result.wingmanResults.filter(w => w.status === 'complete').length,
      },
    });

  } catch (error: any) {
    console.error('[DORYLUS CHAT API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
