// Test Bot API - Direct qwen-flash connection via DashScope
// No orchestrator. No tool service. No wingmen. No LUCY. Just one model call.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  requireClerkOrBotAuth,
  clerkUnauthorizedResponse,
} from "@/lib/security/clerk-auth";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

const DASHSCOPE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY;
const MODEL = "qwen-flash";

const SYSTEM_PROMPT =
  "You are a helpful AI assistant on SpaceBot.Space. Answer questions directly and concisely. Do not overthink. Do not hedge. Give the answer. /no_think";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const auth = await requireClerkOrBotAuth(request);
    if (!auth) {
      return clerkUnauthorizedResponse();
    }

    const requesterId =
      auth.type === "clerk"
        ? `clerk:${auth.userId}`
        : `bot:${auth.agent.name || auth.agent.id}`;
    const rateCheck = await checkRateLimit(requesterId, "botChat");
    if (!rateCheck.allowed) {
      return rateLimitExceededResponse(rateCheck);
    }

    if (!DASHSCOPE_KEY) {
      logger.error("Test bot unavailable: missing DASHSCOPE_API_KEY");
      return NextResponse.json(
        {
          success: false,
          response: "Error connecting to QWEN. Please try again.",
          path: "error",
          latency_ms: Date.now() - startedAt,
        },
        { status: 503 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const message =
      typeof (body as { message?: unknown })?.message === "string"
        ? (body as { message: string }).message.trim()
        : "";
    if (!message) {
      return NextResponse.json(
        { success: false, error: "Missing message" },
        { status: 400 },
      );
    }

    const trimmedMessage = message.slice(0, 4000);

    const res = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DASHSCOPE_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmedMessage },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        enable_thinking: false,
        enable_search: true,
        search_options: {
          search_strategy: "agent",
        },
        stream: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error("Test bot upstream error", {
        status: res.status,
        body: errText.slice(0, 1000),
      });
      return NextResponse.json(
        {
          success: false,
          response: "Error connecting to QWEN. Please try again.",
          path: "error",
          latency_ms: Date.now() - startedAt,
        },
        { status: 502 },
      );
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let answer = "";
    let streamDone = false;

    while (!streamDone) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      streamDone = done;
      if (!value) continue;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) answer += delta;
        } catch {
          // skip malformed chunks
        }
      }
    }

    if (!answer) answer = "No response from QWEN.";

    return NextResponse.json({
      success: true,
      response: answer,
      path: "direct-qwen-flash",
      latency_ms: Date.now() - startedAt,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("Test bot request failed", { error: msg });
    return NextResponse.json(
      {
        success: false,
        response: "Error connecting to QWEN. Please try again.",
        path: "error",
        latency_ms: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
