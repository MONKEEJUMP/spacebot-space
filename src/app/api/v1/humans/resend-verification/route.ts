import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { checkRateLimit, getClientIP, rateLimitDeniedResponse } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    const rateLimit = await checkRateLimit(ip, 'humanPasswordReset');
    if (!rateLimit.allowed) {
      return rateLimitDeniedResponse(rateLimit, () =>
        NextResponse.json(
          {
            success: false,
            error: 'Too many resend attempts. Please try again later.',
            retryAfter: rateLimit.retryAfter,
          },
          { status: 429 }
        )
      );
    }

    let body: { email?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const email = body.email?.toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const [human] = await db
      .select({
        id: humans.id,
        email: humans.email,
        name: humans.name,
        isEmailVerified: humans.isEmailVerified,
      })
      .from(humans)
      .where(eq(humans.email, email))
      .limit(1);

    if (!human || human.isEmailVerified) {
      return NextResponse.json(
        {
          success: true,
          message: 'If the account requires verification, a new verification email has been sent.',
        },
        { status: 200 }
      );
    }

    const emailVerificationToken = randomBytes(32).toString('hex');
    const emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db
      .update(humans)
      .set({
        emailVerificationToken,
        emailVerificationExpiresAt,
        updatedAt: new Date(),
      })
      .where(and(eq(humans.id, human.id), eq(humans.isEmailVerified, false)));

    try {
      const { sendEmail } = await import('@/lib/email/ses-client');
      const { verificationEmailTemplate } = await import('@/lib/email/templates');

      const emailContent = verificationEmailTemplate(human.name, emailVerificationToken);
      await sendEmail({
        to: human.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
    } catch (emailError) {
      console.error('[RESEND_VERIFICATION] Email send failed:', emailError);
      return NextResponse.json(
        {
          success: false,
          error: 'Unable to send verification email right now. Please try again.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Verification email sent to ${human.email}.`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[RESEND_VERIFICATION] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
      },
      { status: 500 }
    );
  }
}
