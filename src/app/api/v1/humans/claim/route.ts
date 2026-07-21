import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      code: "HUMAN_LINKAGE_DISABLED",
      error:
        "New human-account linkage is unavailable until resident authorization, invitation cancellation, and active unlinking are implemented. No linkage was created.",
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
