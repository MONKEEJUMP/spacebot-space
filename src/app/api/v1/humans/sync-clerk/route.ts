import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { resolveHumanIdentity } from "@/lib/security/claiming-human";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const identity = await resolveHumanIdentity();
    if (!identity.success) {
      return NextResponse.json(
        { success: false, error: identity.error },
        { status: identity.status },
      );
    }

    if (identity.authType !== "clerk") {
      return NextResponse.json(
        {
          success: false,
          error:
            "A Clerk human session is required to synchronize this identity.",
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      human: {
        id: identity.humanId,
        email: identity.humanEmail,
      },
    });
  } catch (error) {
    logger.error("Clerk human identity sync failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        success: false,
        error: "Unable to synchronize the Clerk human identity.",
      },
      { status: 500 },
    );
  }
}
