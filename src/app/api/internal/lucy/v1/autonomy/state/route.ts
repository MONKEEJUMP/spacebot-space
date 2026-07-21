import { NextRequest, NextResponse } from "next/server";
import { validateLucyAutonomyStateInput } from "@/lib/lucy/autonomy-contract";
import { LucyAutonomyStateError } from "@/lib/lucy/autonomy-state-error";
import { reserveLucyAutonomyState } from "@/lib/lucy/autonomy-service";
import { logger } from "@/lib/logger";
import { readBoundedInternalRequestBody } from "@/lib/security/internal-request-body";
import { SharedRedisInternalReplayStore } from "@/lib/security/shared-internal-replay-store";
import {
  LUCY_INTERNAL_AUTONOMY_STATE_PATH,
  verifyLucyInternalRequest,
} from "@/lib/security/internal-request-signing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAXIMUM_STATE_BODY_BYTES = 1024;
const replayStore = new SharedRedisInternalReplayStore({
  namespace: "spacebot:internal-replay:lucy-autonomy-state",
});

function noStoreJson(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (
    request.nextUrl.search !== "" ||
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    ) ||
    ![null, "identity"].includes(request.headers.get("content-encoding"))
  ) {
    return noStoreJson({ error: "Internal request rejected." }, 400);
  }
  const body = await readBoundedInternalRequestBody(
    request,
    MAXIMUM_STATE_BODY_BYTES,
  );
  if (body === null) {
    return noStoreJson({ error: "Internal request rejected." }, 413);
  }
  const verification = await verifyLucyInternalRequest({
    method: request.method,
    path: request.nextUrl.pathname,
    expectedPath: LUCY_INTERNAL_AUTONOMY_STATE_PATH,
    body,
    headers: request.headers,
    replayStore,
    secret: process.env.LUCY_AUTONOMY_SIGNING_SECRET,
  });
  if (!verification.ok) {
    const unavailable =
      verification.code === "invalid_secret" ||
      verification.code === "replay_store_unavailable";
    logger.warn("LUCY autonomy state authentication rejected", {
      phase: "api.internal.lucy.autonomy.state.auth",
      rejectionCode: verification.code,
    });
    return noStoreJson(
      { error: "Internal request rejected." },
      unavailable ? 503 : 401,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return noStoreJson({ error: "Invalid autonomy state request." }, 400);
  }
  const input = validateLucyAutonomyStateInput(parsed);
  if (!input.success) return noStoreJson({ errors: input.errors }, 400);

  try {
    const snapshot = await reserveLucyAutonomyState(input.data.workerId);
    return noStoreJson(snapshot, 200);
  } catch (error) {
    logger.error("LUCY autonomy state reservation failed", {
      phase: "api.internal.lucy.autonomy.state",
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return noStoreJson(
      { error: "Autonomy state is unavailable." },
      error instanceof LucyAutonomyStateError ? 503 : 500,
    );
  }
}
