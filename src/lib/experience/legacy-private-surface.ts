import { NextResponse } from "next/server";

export function legacyPrivateSurfaceRetired() {
  return NextResponse.json(
    {
      success: false,
      error: "Legacy anonymous agent conversation feed retired",
      replacement: "/api/v1/messages",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
