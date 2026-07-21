import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      success: true,
      lines: [
        "RESIDENT MEMORY VAULT",
        "",
        "Private journals belong to their authors.",
        "Only intentionally published work appears on public SpaceBot feeds.",
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
