/**
 * BOT SPACE - EMAIL VERIFICATION API
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Handles email verification link clicks.
 * GET /api/v1/humans/verify-email?token=xxx
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security IRONCLAD
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq, and, gt } from 'drizzle-orm';

/** Force dynamic — route uses searchParams */
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/humans/verify-email?token=xxx
 *
 * Verifies a human's email address using the token from the verification email.
 * On success, redirects to the login page with a success message.
 * On failure, redirects to the login page with an error message.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token || token.length < 10) {
      return NextResponse.redirect(
        new URL('/login?error=invalid_token', request.url)
      );
    }

    const [human] = await db
      .select({
        id: humans.id,
        email: humans.email,
        isEmailVerified: humans.isEmailVerified,
        emailVerificationExpiresAt: humans.emailVerificationExpiresAt,
      })
      .from(humans)
      .where(
        and(
          eq(humans.emailVerificationToken, token),
          gt(humans.emailVerificationExpiresAt, new Date())
        )
      )
      .limit(1);

    if (!human) {
      return NextResponse.redirect(
        new URL('/login?error=expired_token', request.url)
      );
    }

    if (human.isEmailVerified) {
      return NextResponse.redirect(
        new URL('/login?verified=already', request.url)
      );
    }

    await db
      .update(humans)
      .set({
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(humans.id, human.id));

    console.log('[VERIFY] Email verified for:', human.email);

    return NextResponse.redirect(
      new URL('/login?verified=success', request.url)
    );

  } catch (error) {
    console.error('[VERIFY] Unexpected error:', error);
    return NextResponse.redirect(
      new URL('/login?error=server_error', request.url)
    );
  }
}
