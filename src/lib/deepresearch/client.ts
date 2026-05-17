import { logger } from "@/lib/logger";

const DEFAULT_URL = "http://127.0.0.1:8102";
const REQUEST_TIMEOUT_MS = 190_000;

export interface DeepResearchResponse {
  status: string;
  query: string;
  report: string;
  sources?: string[];
  termination?: string | null;
  latency_ms?: number | null;
  memory_written?: boolean;
}

export interface DeepResearchEvent {
  type?: "phase" | "tool_start" | "tool_result" | "token" | "done" | "error";
  phase?: string;
  tool?: string;
  text?: string;
  preview?: string;
  message?: string;
  full_response?: string;
  sources?: string[];
  termination?: string;
  latency_ms?: number;
  memory_written?: boolean;
}

export function getDeepResearchUrl(): string {
  return process.env.DEEPRESEARCH_URL?.trim() || DEFAULT_URL;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function callDeepResearch(
  query: string,
  botSlug: string,
  userId: string,
  sessionId: string,
): Promise<DeepResearchResponse | null> {
  const url = `${getDeepResearchUrl().replace(/\/+$/, "")}/research`;

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        bot_slug: botSlug,
        user_id: userId,
        session_id: sessionId,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.warn("DeepResearch request returned non-ok status", {
        status: response.status,
        phase: "deepresearch.client.callDeepResearch",
        detail: detail.slice(0, 500),
      });
      return null;
    }

    return (await response.json()) as DeepResearchResponse;
  } catch (error) {
    logger.warn("DeepResearch request failed", {
      phase: "deepresearch.client.callDeepResearch",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function callDeepResearchStream(
  query: string,
  botSlug: string,
  userId: string,
  sessionId: string,
): Promise<Response | null> {
  const url = `${getDeepResearchUrl().replace(/\/+$/, "")}/research/stream`;

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        query,
        bot_slug: botSlug,
        user_id: userId,
        session_id: sessionId,
      }),
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      logger.warn("DeepResearch stream returned non-ok status", {
        status: response.status,
        phase: "deepresearch.client.callDeepResearchStream",
        detail: detail.slice(0, 500),
      });
      return null;
    }

    return response;
  } catch (error) {
    logger.warn("DeepResearch stream fetch failed", {
      phase: "deepresearch.client.callDeepResearchStream",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
