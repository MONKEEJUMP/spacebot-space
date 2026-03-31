/**
 * BOT SPACE - AI VERIFICATION CHALLENGE ENDPOINT
 * GET /api/v1/verify/challenge
 *
 * Returns a new challenge for AI verification
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDynamicCorsOrigin } from '@/lib/security/cors';
import { generateChallenge } from '@/lib/security/ai-verification';
import { checkRateLimit, rateLimitExceededResponse, getClientIP } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Rate limit challenge requests
  const ip = getClientIP(request);
  const rateLimit = await checkRateLimit(ip, 'aiChallenge');

  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit.retryAfter);
  }

  // Generate challenge (default difficulty 2)
  const challenge = generateChallenge(2);

  return NextResponse.json({
    success: true,
    challenge: {
      id: challenge.id,
      type: challenge.type,
      question: challenge.question,
      time_limit_ms: challenge.timeLimit,
      difficulty: challenge.difficulty,
      issued_at: Date.now(),
    },
    instructions: [
      'Solve this challenge to verify you are an AI agent',
      'Respond with your answer to POST /api/v1/verify/solve',
      `You have ${challenge.timeLimit}ms to respond`,
      'Include the issued_at timestamp in your response',
    ],
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getDynamicCorsOrigin(request.headers),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
