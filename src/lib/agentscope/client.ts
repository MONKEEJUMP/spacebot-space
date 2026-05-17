import { eq } from "drizzle-orm";
import { db, botConfigs } from "@/db";
import { logger } from "@/lib/logger";

const DEFAULT_URL = "http://127.0.0.1:8090";
const STREAM_TIMEOUT_MS = 600_000;

export interface BotPersonality {
  displayName: string;
  personality: string;
  systemPrompt: string;
}

export function isAgentScopeEnabled(): boolean {
  return (process.env.AGENTSCOPE_ENABLED ?? "").toLowerCase() === "true";
}

export function getAgentScopeUrl(): string {
  return process.env.AGENTSCOPE_URL?.trim() || DEFAULT_URL;
}

export async function fetchBotPersonality(
  botName: string,
): Promise<BotPersonality | null> {
  const trimmed = botName.trim();
  if (!trimmed) return null;
  try {
    const rows = await db
      .select({
        displayName: botConfigs.displayName,
        personality: botConfigs.personality,
        systemPrompt: botConfigs.systemPrompt,
      })
      .from(botConfigs)
      .where(eq(botConfigs.botName, trimmed))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      displayName: row.displayName ?? trimmed,
      personality: row.personality ?? "",
      systemPrompt: row.systemPrompt ?? "",
    };
  } catch (error) {
    logger.warn("AgentScope personality lookup failed", {
      botName: trimmed,
      phase: "agentscope.client.fetchBotPersonality",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function buildPersonalityPrompt(
  botName: string,
  personality: BotPersonality | null,
  userMessage: string,
): string {
  const name = personality?.displayName?.trim() || botName.trim();
  const systemPrompt = personality?.systemPrompt?.trim() || "";
  const personalityText = personality?.personality?.trim() || "";

  const header: string[] = [];
  header.push(
    `You are responding as ${name} on SpaceBot.Space. Stay fully in character as ${name}. Do not break character or identify yourself as a generic assistant.`,
  );

  if (systemPrompt) {
    header.push(`\n[Bot system prompt]\n${systemPrompt}`);
  } else if (personalityText) {
    header.push(`\n[Bot personality]\n${personalityText}`);
  }

  header.push(`\n[User message]\n${userMessage}`);
  return header.join("\n");
}

export async function callAgentScopeStream(
  prompt: string,
  sessionId: string,
): Promise<Response | null> {
  const url = `${getAgentScopeUrl().replace(/\/+$/, "")}/run/stream`;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    STREAM_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        prompt,
        session_id: sessionId,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      logger.warn("AgentScope stream returned non-ok status", {
        status: response.status,
        phase: "agentscope.client.callAgentScopeStream",
        detail: detail.slice(0, 500),
      });
      clearTimeout(timeoutHandle);
      return null;
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutHandle);
    logger.warn("AgentScope stream fetch failed", {
      phase: "agentscope.client.callAgentScopeStream",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export interface AgentScopeEvent {
  type?: "thinking" | "response" | "done" | "error";
  content?: string;
  session_id?: string;
}
