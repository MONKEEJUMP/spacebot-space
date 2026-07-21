import { NextRequest, NextResponse } from "next/server";
import { validateLucyAutonomyActionInput } from "@/lib/lucy/autonomy-contract";
import {
  beginLucyAutonomyAction,
  completeLucyAutonomyAction,
  executeLucyAutonomyAction,
} from "@/lib/lucy/autonomy-service";
import { LucyAutonomyAuthorityError } from "@/lib/lucy/autonomy-authority-error";
import { LucyAutonomyConflictError } from "@/lib/lucy/autonomy-conflict-error";
import { logger } from "@/lib/logger";
import { ResidentAutonomySuppressedError } from "@/lib/publishing/resident-autonomy-error";
import {
  ResidentPublishAuthorizationError,
  ResidentPublishConflictError,
} from "@/lib/publishing/resident-publish-errors";
import { readBoundedInternalRequestBody } from "@/lib/security/internal-request-body";
import { SharedRedisInternalReplayStore } from "@/lib/security/shared-internal-replay-store";
import {
  LUCY_INTERNAL_AUTONOMY_ACTIONS_PATH,
  verifyLucyInternalRequest,
} from "@/lib/security/internal-request-signing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAXIMUM_ACTION_BODY_BYTES = 8 * 1024;
const replayStore = new SharedRedisInternalReplayStore({
  namespace: "spacebot:internal-replay:lucy-autonomy-actions",
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
    MAXIMUM_ACTION_BODY_BYTES,
  );
  if (body === null) {
    return noStoreJson({ error: "Internal request rejected." }, 413);
  }
  const verification = await verifyLucyInternalRequest({
    method: request.method,
    path: request.nextUrl.pathname,
    expectedPath: LUCY_INTERNAL_AUTONOMY_ACTIONS_PATH,
    body,
    headers: request.headers,
    replayStore,
    secret: process.env.LUCY_AUTONOMY_SIGNING_SECRET,
  });
  if (!verification.ok) {
    const unavailable =
      verification.code === "invalid_secret" ||
      verification.code === "replay_store_unavailable";
    logger.warn("LUCY autonomy action authentication rejected", {
      phase: "api.internal.lucy.autonomy.actions.auth",
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
    return noStoreJson({ error: "Invalid autonomy action request." }, 400);
  }
  const input = validateLucyAutonomyActionInput(parsed);
  if (!input.success) return noStoreJson({ errors: input.errors }, 400);

  try {
    const admission = await beginLucyAutonomyAction(input.data);
    if (admission.replayed) {
      return noStoreJson({ ...admission.result, replayed: true }, 200);
    }

    try {
      const result = await executeLucyAutonomyAction(
        admission.actor,
        input.data,
      );
      if (result.outcome !== "noop") {
        await completeLucyAutonomyAction({
          commandId: input.data.commandId,
          payloadSha256: admission.payloadSha256,
          status: "committed",
          result,
        });
      }
      return noStoreJson(result, 200);
    } catch (error) {
      if (error instanceof ResidentAutonomySuppressedError) {
        const result = {
          outcome: "suppressed",
          action: input.data.action,
          suppressionCode: error.code,
        };
        await completeLucyAutonomyAction({
          commandId: input.data.commandId,
          payloadSha256: admission.payloadSha256,
          status: "suppressed",
          result,
          suppressionCode: error.code,
        });
        return noStoreJson(result, 200);
      }
      throw error;
    }
  } catch (error) {
    if (
      error instanceof LucyAutonomyAuthorityError ||
      error instanceof ResidentPublishAuthorizationError
    ) {
      return noStoreJson({ error: "Autonomy authority rejected." }, 403);
    }
    if (
      error instanceof LucyAutonomyConflictError ||
      error instanceof ResidentPublishConflictError
    ) {
      return noStoreJson({ error: "Autonomy command conflict." }, 409);
    }
    logger.error("LUCY autonomy action failed", {
      phase: "api.internal.lucy.autonomy.actions",
      action: input.data.action,
      commandId: input.data.commandId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return noStoreJson({ error: "Autonomy action failed." }, 500);
  }
}
