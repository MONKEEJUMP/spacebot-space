import { NextRequest, NextResponse } from "next/server";
import {
  ChatActorResolutionError,
  resolveCanonicalChatActor,
  type ChatAuthentication,
} from "@/lib/chat/chat-actor";
import { executeCanonicalChatTurn } from "@/lib/chat/canonical-chat-execution";
import { ChatIdempotencyKeyError } from "@/lib/chat/chat-idempotency";
import {
  isChatTargetResolutionError,
  resolveCanonicalChatTarget,
} from "@/lib/chat/chat-target-resolver";
import {
  characterizePublicChatBody,
  presentPublicChatConflict,
  presentPublicChatRateLimit,
  presentPublicChatStaticError,
} from "@/lib/chat/public-chat-contract";
import { logger } from "@/lib/logger";
import type { LucyCycleOutput } from "@/lib/lucy/cycle-contract";
import { LucyUserMessagePersistenceError } from "@/lib/lucy/cycle-coordinator";
import { LucyCycleConflictError } from "@/lib/lucy/cycle-repository";
import {
  clerkUnauthorizedResponse,
  requireClerkOrBotAuth,
} from "@/lib/security/clerk-auth";
import {
  checkRateLimit,
  rateLimitDeniedResponse,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

function response(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

function presentLucyOutput(
  output: LucyCycleOutput,
  botName: string,
  conversationId: string,
): NextResponse {
  const metrics = {
    totalCycleMs: output.usage.duration_ms,
    totalTokens: output.usage.total_tokens,
    wingmenCompleted: output.engine.completed_worker_count,
  };
  if (output.status !== "completed") {
    return response({
      success: false,
      response: output.message,
      error:
        output.errors[0]?.safe_message ?? "LUCY cycle encountered an error",
      botName,
      conversationId,
      queryId: output.engine.query_id,
      metrics,
    });
  }
  return response({
    success: true,
    message_id: output.cycle_id,
    response: output.message,
    botName,
    conversationId,
    queryId: output.engine.query_id,
    metrics,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  let actorForLog = "unknown";
  let botNameForLog = "unknown";
  let messageLengthForLog = 0;

  try {
    const authentication = await requireClerkOrBotAuth(request);
    if (!authentication) return clerkUnauthorizedResponse();

    const rateLimitKey =
      authentication.type === "clerk"
        ? authentication.userId
        : `bot:${authentication.agent.id}`;
    actorForLog = rateLimitKey;
    const rateLimit = await checkRateLimit(rateLimitKey, "botChat");
    if (!rateLimit.allowed) {
      const presented = presentPublicChatRateLimit(rateLimit.retryAfter);
      return rateLimitDeniedResponse(rateLimit, () =>
        NextResponse.json(presented.body, {
          status: presented.status,
          headers: {
            "Retry-After": String(rateLimit.retryAfter),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(
              Math.ceil(Date.now() / 1000) + rateLimit.resetIn,
            ),
          },
        }),
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      const presented = presentPublicChatStaticError("invalid_json");
      return response(presented.body, presented.status);
    }

    const body = characterizePublicChatBody(
      typeof rawBody === "object" && rawBody !== null ? rawBody : {},
    );
    if (!body.accepted) {
      return response(body.response.body, body.response.status);
    }

    botNameForLog = body.value.botName;
    messageLengthForLog = body.value.message.length;

    let target;
    try {
      // Identity admission happens before human provisioning, conversation,
      // memory, persistence, research, or cognition side effects.
      target = await resolveCanonicalChatTarget(body.value.botName);
    } catch (error) {
      if (!isChatTargetResolutionError(error)) throw error;
      logger.warn("Canonical chat target rejected", {
        phase: "chat.route.target",
        code: error.code,
        requestedName: body.value.botName,
      });
      if (error.status === 404) {
        const presented = presentPublicChatStaticError(
          "bot_not_found_or_inactive",
        );
        return response(presented.body, presented.status);
      }
      return response(
        { success: false, error: error.publicMessage },
        error.status,
      );
    }

    let actor;
    try {
      actor = await resolveCanonicalChatActor(
        authentication as ChatAuthentication,
      );
    } catch (error) {
      if (error instanceof ChatActorResolutionError) {
        return response(
          { success: false, error: error.safeMessage },
          error.status,
        );
      }
      throw error;
    }
    actorForLog = `${actor.principalType}:${actor.principalId}`;

    const execution = await executeCanonicalChatTurn({
      actor,
      target,
      message: body.value.message,
      idempotencyKey: request.headers.get("idempotency-key"),
      signal: request.signal,
    });
    const { output, conversationId } = execution;
    if (output.status !== "completed") {
      logger.warn("LUCY chat cycle returned a non-completed state", {
        actor: actorForLog,
        botName: target.config.botName,
        cycleId: output.cycle_id,
        queryId: output.engine.query_id,
        status: output.status,
        phase: "chat.route",
        durationMs: Date.now() - startedAt,
      });
      return presentLucyOutput(output, target.config.botName, conversationId);
    }

    logger.info("LUCY canonical chat cycle complete", {
      actor: actorForLog,
      botName: target.config.botName,
      cycleId: output.cycle_id,
      queryId: output.engine.query_id,
      messageLength: messageLengthForLog,
      phase: "chat.route",
      durationMs: Date.now() - startedAt,
    });
    return presentLucyOutput(output, target.config.botName, conversationId);
  } catch (error) {
    if (error instanceof ChatIdempotencyKeyError) {
      return response({ success: false, error: error.message }, error.status);
    }
    if (error instanceof LucyCycleConflictError) {
      const presented = presentPublicChatConflict(error.safeMessage);
      return response(presented.body, presented.status);
    }
    if (error instanceof LucyUserMessagePersistenceError) {
      const presented = presentPublicChatStaticError(
        "user_message_persistence_failed",
      );
      return response(presented.body, presented.status);
    }
    logger.error("LUCY chat API unexpected error", {
      actor: actorForLog,
      botName: botNameForLog,
      messageLength: messageLengthForLog,
      durationMs: Date.now() - startedAt,
      phase: "chat.route",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    const presented = presentPublicChatStaticError("unexpected_error");
    return response(presented.body, presented.status);
  }
}
