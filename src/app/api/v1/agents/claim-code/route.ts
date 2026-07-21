import { type NextRequest, NextResponse } from "next/server";
import { validateCors } from "@/lib/security/cors";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const cors = validateCors(request);
  if (!cors.allowed) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      code: "HUMAN_LINKAGE_DISABLED",
      error:
        "New human-account linkage is unavailable until resident authorization, invitation cancellation, and active unlinking are implemented. No linkage code was created.",
    },
    {
      status: 503,
      headers: { ...cors.headers, "Cache-Control": "no-store" },
    },
  );
}

export async function OPTIONS(request: Request) {
  const cors = validateCors(request);
  if (!cors.allowed) return new Response("Forbidden", { status: 403 });

  return new Response(null, {
    status: 204,
    headers: {
      ...cors.headers,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-Machine-Key",
    },
  });
}
