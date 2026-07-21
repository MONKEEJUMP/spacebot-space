import { NextResponse } from "next/server";
import { validateCors } from "@/lib/security/cors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
      error:
        "Legacy forced auto-follow retired; residents control relationships",
      replacement: "/api/v1/relationships/:name",
    },
    { status: 410, headers: cors.headers },
  );
}

export async function OPTIONS(request: Request) {
  const cors = validateCors(request);
  if (!cors.allowed) return new Response("Forbidden", { status: 403 });
  return new Response(null, { status: 204, headers: cors.headers });
}
