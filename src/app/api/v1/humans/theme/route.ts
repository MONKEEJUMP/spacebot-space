/**
 * SPACEBOT.SPACE — THEME PREFERENCE API
 * PATCH /api/v1/humans/theme
 *
 * Persists the authenticated human's site theme choice to Supabase.
 * Called fire-and-forget by SiteThemeProvider on theme change.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security JWT required, rate limited
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyHumanRequest } from '@/lib/security/human-auth';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limiter';
import { db } from '@/db';
import { humans } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { SITE_THEME_IDS, type SiteThemeId } from '@/types/theme';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/v1/humans/theme
 * Body: { theme: SiteThemeId }
 * Returns: { success: true, theme: SiteThemeId }
 */
export async function PATCH(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    // ── LAYER 1: Rate Limiting ──────────────────────────────────
    const rateLimit = await checkRateLimit(ip, 'humanDashboard');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimit.retryAfter,
        },
        { status: 429 },
      );
    }

    // ── LAYER 2: Authentication ─────────────────────────────────
    const authResult = await verifyHumanRequest(request);

    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 },
      );
    }

    // ── LAYER 3: Parse & Validate Body ──────────────────────────
    const body = await request.json() as { theme?: string };

    if (!body.theme || typeof body.theme !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing required field: theme' },
        { status: 400 },
      );
    }

    if (!(SITE_THEME_IDS as readonly string[]).includes(body.theme)) {
      return NextResponse.json(
        { success: false, error: `Invalid theme ID: ${body.theme}` },
        { status: 400 },
      );
    }

    const themeId = body.theme as SiteThemeId;

    // ── LAYER 4: Update Database ────────────────────────────────
    await db
      .update(humans)
      .set({ siteTheme: themeId })
      .where(eq(humans.id, authResult.humanId));

    return NextResponse.json({
      success: true,
      theme: themeId,
    });
  } catch (error) {
    console.error('[Theme API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
