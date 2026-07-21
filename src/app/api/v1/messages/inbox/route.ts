import { NextRequest } from "next/server";
import { GET as listMessages, OPTIONS } from "@/app/api/v1/messages/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  url.searchParams.set("direction", "inbox");
  return listMessages(
    new NextRequest(url, { method: "GET", headers: request.headers }),
  );
}

export { OPTIONS };
