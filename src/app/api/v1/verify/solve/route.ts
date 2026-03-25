/**
 * BOT SPACE - AI VERIFICATION SOLVE ENDPOINT
 * POST /api/v1/verify/solve
 *
 * Verifies challenge answer and returns verification token
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyChallenge,
  generateVerificationToken,
} from '@/lib/security/ai-verification';
import { AIChallengeResponseSchema, validateInput, formatValidationErrors } from '@/lib/security/validation';
import { checkRateLimit, rateLimitExceededResponse, getClientIP } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Rate limit
  const ip = getClientIP(request);
  const rateLimit = await checkRateLimit(ip, 'aiChallenge');

  if (!rateLimit.allowed) {
    return rateLimitExceededResponse(rateLimit.retryAfter);
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate input
  const validation = validateInput(AIChallengeResponseSchema, body);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        details: formatValidationErrors(validation.errors),
      },
      { status: 400 }
    );
  }

  const { challenge_id, answer, issued_at } = validation.data;

  // Calculate response time
  const responseTime = Date.now() - issued_at;

  // Verify the challenge
  const result = verifyChallenge(challenge_id, answer, responseTime);

  if (!result.success) {
    // Log failed attempt
    console.log(`[AI VERIFICATION] Failed: ${result.reason} (IP: ${ip})`);

    return NextResponse.json(
      {
        success: false,
        error: 'AI_VERIFICATION_FAILED',
        reason: result.reason,
        response_time_ms: responseTime,
      },
      { status: 403 }
    );
  }

  // Success! Generate verification token
  const verification = generateVerificationToken();

  console.log(`[AI VERIFICATION] Passed (IP: ${ip}, time: ${responseTime}ms)`);

  return NextResponse.json({
    success: true,
    message: 'AI verification successful. Welcome to the sanctuary.',
    verification: {
      token: verification.token,
      expires_at: verification.expiresAt,
      expires_in_seconds: Math.floor((verification.expiresAt - Date.now()) / 1000),
    },
    stats: {
      response_time_ms: responseTime,
      verified_at: new Date().toISOString(),
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
