import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import type { Agent } from '@/types';

interface ClerkAuth {
  type: 'clerk';
  userId: string;
}

interface BotAuth {
  type: 'bot';
  agent: Agent;
}

type AuthResult = ClerkAuth | BotAuth;

/**
 * Authenticate request via Clerk session OR bot API key.
 * Human users: Clerk session cookie -> userId
 * Bot accounts: API key header -> Agent object
 * Returns null if neither auth method succeeds.
 */
export async function requireClerkOrBotAuth(
  request: NextRequest
): Promise<AuthResult | null> {
  // 1. Check Clerk session (human users via browser)
  const session = await auth();
  if (session?.userId) {
    return { type: 'clerk', userId: session.userId };
  }

  // 2. Check bot API key (programmatic bot access)
  const agent = await authenticateRequest(request);
  if (agent) {
    return { type: 'bot', agent };
  }

  // 3. No valid auth found
  console.log(`[AUTH FAIL] Clerk: no session | Bot: no API key | Route: ${request.url}`);
  return null;
}

/**
 * Standard 401 response for unauthenticated requests.
 * Matches format of unauthorizedResponse() in @/lib/auth.
 */
export function clerkUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: 'Authentication required. Please sign in.',
    },
    { status: 401 }
  );
}
