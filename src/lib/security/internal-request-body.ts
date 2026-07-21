import type { NextRequest } from "next/server";

export async function readBoundedInternalRequestBody(
  request: NextRequest,
  maximumBytes: number,
): Promise<string | null> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    return null;
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  // Stream until EOF while enforcing the limit before buffering the next chunk.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      // eslint-disable-next-line no-await-in-loop
      await reader.cancel("body limit exceeded").catch(() => undefined);
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalBytes).toString("utf8");
}
