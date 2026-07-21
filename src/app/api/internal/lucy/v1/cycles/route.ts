import { NextRequest, NextResponse } from "next/server";
import { isChatTargetResolutionError } from "@/lib/chat/chat-target-resolver";
import { logger } from "@/lib/logger";
import {
  executeLucyCycle,
  LucyUserMessagePersistenceError,
} from "@/lib/lucy/cycle-coordinator";
import { validateLucyCycleInput } from "@/lib/lucy/cycle-contract";
import { LucyCycleConflictError } from "@/lib/lucy/cycle-repository";
import { SharedRedisInternalReplayStore } from "@/lib/security/shared-internal-replay-store";
import {
  INTERNAL_REQUEST_MAX_BODY_BYTES,
  verifyLucyInternalRequest,
} from "@/lib/security/internal-request-signing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const replayStore = new SharedRedisInternalReplayStore({
  namespace: "spacebot:internal-replay:lucy-cycles",
});

function noStoreJson(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readBoundedBody(request: NextRequest): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  async function readNextChunk(): Promise<boolean> {
    const { done, value } = await reader.read();
    if (done) return true;
    totalBytes += value.byteLength;
    if (totalBytes > INTERNAL_REQUEST_MAX_BODY_BYTES) {
      await reader.cancel("body limit exceeded").catch(() => undefined);
      return false;
    }
    chunks.push(Buffer.from(value));
    return readNextChunk();
  }

  if (!(await readNextChunk())) return null;

  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > INTERNAL_REQUEST_MAX_BODY_BYTES
  ) {
    return noStoreJson({ error: "Internal request rejected." }, 413);
  }

  const body = await readBoundedBody(request);
  if (body === null) {
    return noStoreJson({ error: "Internal request rejected." }, 413);
  }

  const verification = await verifyLucyInternalRequest({
    method: request.method,
    path: request.nextUrl.pathname,
    body,
    headers: request.headers,
    replayStore,
  });
  if (!verification.ok) {
    const unavailable =
      verification.code === "invalid_secret" ||
      verification.code === "replay_store_unavailable";
    return noStoreJson(
      { error: "Internal request rejected." },
      unavailable ? 503 : 401,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return noStoreJson({ error: "Invalid cycle request." }, 400);
  }

  const input = validateLucyCycleInput(parsed);
  if (!input.success) {
    return noStoreJson({ errors: input.errors }, 400);
  }

  try {
    const output = await executeLucyCycle(input.data, {
      signal: request.signal,
    });
    return noStoreJson(output, 200);
  } catch (error) {
    if (error instanceof LucyCycleConflictError) {
      return noStoreJson(
        { error: "Cycle request conflicts with existing state." },
        409,
      );
    }
    if (isChatTargetResolutionError(error)) {
      return noStoreJson(
        { error: "Cycle target is unavailable." },
        error.status,
      );
    }
    if (error instanceof LucyUserMessagePersistenceError) {
      return noStoreJson({ error: "Cycle persistence is unavailable." }, 500);
    }
    logger.error("Internal LUCY cycle request failed", {
      phase: "api.internal.lucy.cycle",
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return noStoreJson({ error: "Internal cycle request failed." }, 500);
  }
}
