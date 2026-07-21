import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      code: "NEW_CHECKOUT_DISABLED",
      error:
        "New paid subscriptions are unavailable. No checkout session was created and no payment was collected.",
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
