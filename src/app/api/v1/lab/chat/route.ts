import { NextRequest, NextResponse } from "next/server";
import {
  ChatActorResolutionError,
  canonicalActorKey,
  resolveCanonicalChatActor,
  type ChatAuthentication,
} from "@/lib/chat/chat-actor";
import { executeCanonicalChatTurn } from "@/lib/chat/canonical-chat-execution";
import { ChatIdempotencyKeyError } from "@/lib/chat/chat-idempotency";
import {
  LabTargetResolutionError,
  resolveCanonicalLabTarget,
} from "@/lib/lab/canonical-lab-target";
import { buildLabSafetyRedirect, evaluateLabSafety } from "@/lib/lab/safety";
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
  getClientIP,
  rateLimitDeniedResponse,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 100_000;

type LabChatRequestBody = Readonly<{
  botSlug?: unknown;
  message?: unknown;
  conversationHistory?: unknown;
}>;

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

function modelReceipt(output: LucyCycleOutput): Readonly<{
  provider: string;
  model: string;
}> {
  return Object.freeze({
    provider: output.version.provider ?? output.engine.name,
    model: output.version.cognition,
  });
}

function presentJson(
  output: LucyCycleOutput,
  botName: string,
  conversationId: string,
): NextResponse {
  const receipt = modelReceipt(output);
  return json({
    success: output.status === "completed",
    response: output.message,
    parts: [
      {
        type: "researcher",
        content: output.message,
        timestamp: Date.now(),
      },
    ],
    botName,
    conversationId,
    provider: receipt.provider,
    model: receipt.model,
    status: output.status,
  });
}

function presentSse(output: LucyCycleOutput, botName: string): Response {
  const encoder = new TextEncoder();
  const receipt = modelReceipt(output);
  const events = [
    {
      type: "researcher",
      content: output.message,
      botName,
      provider: receipt.provider,
      model: receipt.model,
      status: output.status,
    },
    { type: "done" },
  ];
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const startedAt = Date.now();
  let actorForLog = "unknown";
  let botForLog = "unknown";

  try {
    const authentication = await requireClerkOrBotAuth(request);
    if (!authentication) return clerkUnauthorizedResponse();

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return json({ success: false, error: "Invalid request body" }, 400);
    }
    const body =
      typeof rawBody === "object" && rawBody !== null
        ? (rawBody as LabChatRequestBody)
        : {};
    const message =
      typeof body.message === "string"
        ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH)
        : "";
    if (!message) {
      return json({ success: false, error: "message is required" }, 400);
    }

    // conversationHistory remains accepted for older clients, but the
    // server-owned canonical conversation is authoritative.

    const { labBot, target } = await resolveCanonicalLabTarget(body.botSlug);
    botForLog = labBot.slug;
    const actor = await resolveCanonicalChatActor(
      authentication as ChatAuthentication,
    );
    actorForLog = canonicalActorKey(actor);

    const rateLimit = await checkRateLimit(
      `${actorForLog}:${getClientIP(request)}`,
      "humanLabChat",
    );
    if (!rateLimit.allowed) {
      return rateLimitDeniedResponse(rateLimit, () =>
        json(
          {
            success: false,
            error: "Too many Lab requests. Please try again later.",
            retryAfter: rateLimit.retryAfter,
          },
          429,
        ),
      );
    }

    const safetyDecision = evaluateLabSafety(message);
    if (safetyDecision.isBlocked) {
      return json({
        success: true,
        response: buildLabSafetyRedirect(labBot.name),
        botName: labBot.name,
      });
    }

    const execution = await executeCanonicalChatTurn({
      actor,
      target,
      message,
      idempotencyKey: request.headers.get("idempotency-key"),
      signal: request.signal,
    });

    logger.info("Canonical Lab resident chat complete", {
      actor: actorForLog,
      botName: labBot.slug,
      cycleId: execution.output.cycle_id,
      replayed: execution.replayed,
      status: execution.output.status,
      durationMs: Date.now() - startedAt,
      phase: "lab.chat",
    });

    if ((request.headers.get("accept") ?? "").includes("text/event-stream")) {
      return presentSse(execution.output, labBot.name);
    }
    return presentJson(execution.output, labBot.name, execution.conversationId);
  } catch (error) {
    if (error instanceof LabTargetResolutionError) {
      return json({ success: false, error: error.safeMessage }, error.status);
    }
    if (error instanceof ChatActorResolutionError) {
      return json({ success: false, error: error.safeMessage }, error.status);
    }
    if (error instanceof ChatIdempotencyKeyError) {
      return json({ success: false, error: error.message }, error.status);
    }
    if (error instanceof LucyCycleConflictError) {
      return json({ success: false, error: error.safeMessage }, error.status);
    }
    if (error instanceof LucyUserMessagePersistenceError) {
      return json(
        { success: false, error: "Your message could not be saved." },
        503,
      );
    }

    logger.error("Canonical Lab chat unexpected error", {
      actor: actorForLog,
      botName: botForLog,
      durationMs: Date.now() - startedAt,
      phase: "lab.chat",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return json(
      {
        success: false,
        error: "Lab chat is temporarily unavailable. Please try again.",
      },
      500,
    );
  }
}
