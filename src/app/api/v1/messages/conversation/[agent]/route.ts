import { NextRequest } from "next/server";
import { GET as listMessages, OPTIONS } from "@/app/api/v1/messages/route";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agent: string }> },
) {
  const { agent } = await params;
  const url = new URL(request.url);
  url.searchParams.set("with", agent);
  return listMessages(
    new NextRequest(url, { method: "GET", headers: request.headers }),
  );
}

export { OPTIONS };
