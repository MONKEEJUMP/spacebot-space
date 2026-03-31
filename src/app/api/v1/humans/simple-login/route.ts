/**
 * BOT SPACE - SIMPLE HTML LOGIN (No React, No Hydration)
 *
 * Plain HTML form POST + Set-Cookie + 302 redirect.
 * The way login worked for 20 years before JavaScript ruined everything.
 *
 * GET  → Returns raw HTML login form
 * POST → Processes form submission, sets cookies, redirects
 *
 * SECURITY: Rate-limited (5 attempts/15min), account lockout (10 failures),
 * progressive delays via Fortress rate-limiter + human-lockout.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @purpose Bypass React hydration issues entirely
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { generateTokenPair } from '@/lib/security/jwt';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';
import {
  checkAccountLockoutByEmail,
  recordFailedLoginByEmail,
  resetFailedAttempts,
  formatLockoutMessage,
} from '@/lib/security/human-lockout';

export const dynamic = 'force-dynamic';

// ============================================================
// HTML TEMPLATE
// ============================================================

function loginHTML(error?: string): string {
  const errorBlock = error
    ? `<div class="error">${error}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SpaceBot Login</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Glass+Antiqua&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a;
      color: #33ff33;
      font-family: 'Glass Antiqua', 'Courier New', monospace;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: #111;
      border: 1px solid #33ff33;
      border-radius: 8px;
      padding: 40px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 0 30px rgba(51, 255, 51, 0.1);
    }
    h1 {
      text-align: center;
      font-size: 28px;
      margin-bottom: 8px;
      letter-spacing: 2px;
    }
    .subtitle {
      text-align: center;
      color: #999;
      font-size: 14px;
      margin-bottom: 32px;
    }
    .error {
      background: rgba(255, 50, 50, 0.15);
      border: 1px solid #ff3232;
      color: #ff6666;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 20px;
      text-align: center;
      font-size: 14px;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-size: 14px;
      color: #33ff33;
    }
    input[type="email"],
    input[type="password"] {
      width: 100%;
      padding: 12px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 4px;
      color: #33ff33;
      font-family: 'Glass Antiqua', 'Courier New', monospace;
      font-size: 16px;
      margin-bottom: 20px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: #33ff33;
      box-shadow: 0 0 8px rgba(51, 255, 51, 0.2);
    }
    button {
      width: 100%;
      padding: 14px;
      background: #33ff33;
      color: #0a0a0a;
      border: none;
      border-radius: 4px;
      font-family: 'Glass Antiqua', 'Courier New', monospace;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      letter-spacing: 1px;
      transition: background 0.2s;
    }
    button:hover {
      background: #44ff44;
    }
    .footer {
      text-align: center;
      margin-top: 24px;
      color: #555;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>SPACEBOT</h1>
    <div class="subtitle">Sanctuary Access Terminal</div>
    ${errorBlock}
    <form method="POST" action="/api/v1/humans/simple-login">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="email" placeholder="human@spacebot.space">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Enter password">
      <button type="submit">ACCESS SANCTUARY</button>
    </form>
    <div class="footer">SpaceBot.Space &mdash; No React. No JavaScript. Just HTML.</div>
  </div>
</body>
</html>`;
}


// ============================================================
// GET - SERVE THE LOGIN FORM
// ============================================================

export async function GET(): Promise<Response> {
  return new Response(loginHTML(), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}


// ============================================================
// POST - PROCESS LOGIN (RATE-LIMITED + LOCKOUT)
// ============================================================

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // ══════════════════════════════════════════════════════════
    // RATE LIMIT CHECK (5 attempts per 15 min per IP)
    // ══════════════════════════════════════════════════════════
    const clientIP = getClientIP(request);
    const rateCheck = await checkRateLimit(clientIP, 'humanLogin');

    if (!rateCheck.allowed) {
      return new Response(
        loginHTML(`Too many login attempts. Please try again in ${rateCheck.retryAfter} seconds.`),
        {
          status: 429,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Retry-After': String(rateCheck.retryAfter),
          },
        }
      );
    }

    // ══════════════════════════════════════════════════════════
    // PARSE FORM DATA (application/x-www-form-urlencoded)
    // ══════════════════════════════════════════════════════════
    const formData = await request.formData();
    const email = formData.get('email') as string | null;
    const password = formData.get('password') as string | null;

    if (!email || !password) {
      return new Response(loginHTML('Email and password are required.'), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ══════════════════════════════════════════════════════════
    // ACCOUNT LOCKOUT CHECK (10 failures = locked)
    // ══════════════════════════════════════════════════════════
    const lockoutStatus = await checkAccountLockoutByEmail(normalizedEmail);

    if (!lockoutStatus.canAttemptLogin) {
      const lockMsg = formatLockoutMessage(lockoutStatus);
      return new Response(
        loginHTML(lockMsg || 'Account is temporarily locked. Please try again later.'),
        {
          status: 423,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    // ══════════════════════════════════════════════════════════
    // FIND HUMAN & VERIFY PASSWORD
    // ══════════════════════════════════════════════════════════
    const human = await db.query.humans.findFirst({
      where: eq(humans.email, normalizedEmail),
      columns: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        subscriptionTier: true,
        tokenVersion: true,
        siteTheme: true,
      },
    });

    // Constant-time comparison - don't reveal if email exists
    const fakeHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYF8g4IjF5CS';
    const hashToCompare = human?.passwordHash || fakeHash;
    const passwordValid = await bcrypt.compare(password, hashToCompare);

    if (!human || !passwordValid) {
      // Record failed attempt (triggers lockout after 10 failures)
      await recordFailedLoginByEmail(normalizedEmail, 'Invalid credentials via simple-login');

      return new Response(loginHTML('Invalid email or password.'), {
        status: 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // ══════════════════════════════════════════════════════════
    // SUCCESSFUL LOGIN - RESET FAILED ATTEMPTS
    // ══════════════════════════════════════════════════════════
    await resetFailedAttempts(human.id);

    // ══════════════════════════════════════════════════════════
    // GENERATE TOKENS
    // ══════════════════════════════════════════════════════════
    const { accessToken, refreshToken } = generateTokenPair(
      human.id,
      human.email,
      'human',
      human.tokenVersion
    );

    // ══════════════════════════════════════════════════════════
    // UPDATE LAST LOGIN
    // ══════════════════════════════════════════════════════════
    await db
      .update(humans)
      .set({
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(humans.id, human.id));

    // ══════════════════════════════════════════════════════════
    // BUILD REDIRECT WITH COOKIES
    // ══════════════════════════════════════════════════════════
    const profilePath = '/peoplespace/profile/' + encodeURIComponent(human.name);
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host') || 'spacebot.space';
    const redirectUrl = new URL(profilePath, proto + '://' + host);

    const response = NextResponse.redirect(redirectUrl, 302);

    // Access token cookie - httpOnly, 15 min
    response.cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
      path: '/',
    });

    // Refresh token cookie - httpOnly, 7 days
    response.cookies.set('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    // Marker cookie for middleware auth check - non-httpOnly
    response.cookies.set('logged_in', 'true', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;

  } catch (error) {
    console.error('[SIMPLE-LOGIN] Error:', error);
    return new Response(loginHTML('An unexpected error occurred. Please try again.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}
