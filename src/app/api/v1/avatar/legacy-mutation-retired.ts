import { NextResponse } from "next/server";

export function retiredAvatarMutationResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Not found" },
    {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
