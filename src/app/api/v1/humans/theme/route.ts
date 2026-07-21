/**
 * SPACEBOT.SPACE — THEME PREFERENCE API
 * PATCH /api/v1/humans/theme
 *
 * Persists the authenticated human's site theme choice.
 *
 * @author PAULIEWOOD! & The Power Trio
 * @security JWT required, rate limited
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveHumanIdentity } from "@/lib/security/claiming-human";
import {
  checkRateLimit,
  getClientIP,
  rateLimitDeniedResponse,
} from "@/lib/security/rate-limiter";
import { db } from "@/db";
import { humans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SITE_THEME_IDS, type SiteThemeId } from "@/types/theme";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/v1/humans/theme
 * Body: { theme: SiteThemeId }
 * Returns: { success: true, theme: SiteThemeId }
 */
export async function PATCH(request: NextRequest) {
  const ip = getClientIP(request);

  try {
    // ── LAYER 1: Rate Limiting ──────────────────────────────────
    const rateLimit = await checkRateLimit(ip, "humanDashboard");
    if (!rateLimit.allowed) {
      return rateLimitDeniedResponse(rateLimit, () =>
        NextResponse.json(
          {
            success: false,
            error: "Too many requests. Please try again later.",
            retryAfter: rateLimit.retryAfter,
          },
          { status: 429 },
        )
      );
    }

    // ── LAYER 2: Authentication ─────────────────────────────────
    const identity = await resolveHumanIdentity();

    if (!identity.success) {
      return NextResponse.json(
        { success: false, error: identity.error },
        { status: identity.status },
      );
    }

    // ── LAYER 3: Parse & Validate Body ──────────────────────────
    let body: { theme?: string };
    try {
      body = (await request.json()) as { theme?: string };
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    if (!body.theme || typeof body.theme !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing required field: theme" },
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
    const [updatedHuman] = await db
      .update(humans)
      .set({ siteTheme: themeId, updatedAt: new Date() })
      .where(eq(humans.id, identity.humanId))
      .returning({ id: humans.id });

    if (!updatedHuman) {
      return NextResponse.json(
        { success: false, error: "No linked human profile found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      theme: themeId,
    });
  } catch (error) {
    logger.error("Human theme persistence failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 },
    );
  }
}
