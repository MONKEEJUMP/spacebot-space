/**
 * Assembly Line Client — Connects the SpaceBot Next.js frontend to the
 * Assembly Line FastAPI backend (5-Layer Multi-Model AI Pipeline).
 *
 * Pipeline: Spark → Lens → Vault → Judge → Voice
 * Server:   Python/FastAPI at ASSEMBLY_LINE_URL (default http://localhost:8000)
 *
 * This module:
 *  - POSTs to /api/chat/stream and parses SSE events in real-time
 *  - Falls back to /api/chat (non-streaming JSON) on connection failure
 *  - Maps Assembly Line event types to frontend-compatible format
 *
 * @author PAULIEWOOD! & The Power Trio
 */

const ASSEMBLY_LINE_URL =
  process.env.ASSEMBLY_LINE_URL || 'http://127.0.0.1:8000';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface AssemblyLineRequest {
  bot_name: string;
  user_id: string;
  user_message: string;
}

export type AssemblyLineEventType =
  | 'greeting_start'
  | 'greeting_token'
  | 'greeting_complete'
  | 'processing'
  | 'response_start'
  | 'response_token'
  | 'response_complete'
  | 'done'
  | 'error';

export interface AssemblyLineEvent {
  type: AssemblyLineEventType;
  data: Record<string, unknown>;
}

export interface AssemblyLineResult {
  greeting: string;
  response: string;
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
// SSE STREAMING CLIENT
// ═══════════════════════════════════════════════════════════════

/**
 * Stream events from the Assembly Line SSE endpoint.
 * Yields parsed AssemblyLineEvent objects as they arrive.
 *
 * SSE format from Assembly Line:
 *   event: greeting_token
 *   data: {"token":"Morning"}
 *
 * This generator yields: { type: 'greeting_token', data: { token: 'Morning' } }
 */
export async function* streamAssemblyLine(
  request: AssemblyLineRequest,
): AsyncGenerator<AssemblyLineEvent> {
  const response = await fetch(`${ASSEMBLY_LINE_URL}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Assembly Line stream ${response.status}: ${detail || 'Unknown error'}`,
    );
  }

  if (!response.body) {
    throw new Error('Assembly Line returned no response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEventType = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer — format: "event: type\ndata: json\n\n"
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr && currentEventType) {
            try {
              const data = JSON.parse(jsonStr) as Record<string, unknown>;
              yield {
                type: currentEventType as AssemblyLineEventType,
                data,
              };
            } catch {
              // Malformed JSON — skip this event
              console.warn(
                '[ASSEMBLY LINE] Malformed SSE data:',
                jsonStr.slice(0, 100),
              );
            }
            currentEventType = '';
          }
        }
        // Empty lines are SSE event separators — already handled by split
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// NON-STREAMING FALLBACK
// ═══════════════════════════════════════════════════════════════

/**
 * Call the Assembly Line non-streaming endpoint (fallback).
 * Returns the complete greeting + response in a single JSON response.
 *
 * Response format:
 * {
 *   "request_id": "uuid",
 *   "greeting": "Full greeting text",
 *   "response": "Full expert response text",
 *   "metadata": { total_latency_ms, layer_latencies, ... }
 * }
 */
export async function callAssemblyLine(
  request: AssemblyLineRequest,
): Promise<AssemblyLineResult> {
  const response = await fetch(`${ASSEMBLY_LINE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Assembly Line ${response.status}: ${detail || 'Unknown error'}`,
    );
  }

  const data = (await response.json()) as {
    greeting?: string;
    response?: string;
    metadata?: Record<string, unknown>;
  };

  return {
    greeting: data.greeting || '',
    response: data.response || '',
    metadata: data.metadata,
  };
}

// ═══════════════════════════════════════════════════════════════
// COLLECTED STREAM (Accumulate SSE → Single Result)
// ═══════════════════════════════════════════════════════════════

/**
 * Consume the full SSE stream and return accumulated greeting + response.
 * Used when the caller needs the complete result but wants to go through
 * the streaming pipeline (for richer metadata).
 */
export async function collectAssemblyLineStream(
  request: AssemblyLineRequest,
): Promise<AssemblyLineResult> {
  const greetingParts: string[] = [];
  const responseParts: string[] = [];
  let metadata: Record<string, unknown> = {};

  for await (const event of streamAssemblyLine(request)) {
    switch (event.type) {
      case 'greeting_token':
        if (event.data.token) greetingParts.push(String(event.data.token));
        break;

      case 'greeting_complete':
        // Use full greeting text if provided (overrides accumulated tokens)
        if (event.data.greeting_text) {
          greetingParts.length = 0;
          greetingParts.push(String(event.data.greeting_text));
        }
        break;

      case 'response_token':
        if (event.data.token) responseParts.push(String(event.data.token));
        break;

      case 'response_complete':
        if (event.data.metadata) {
          metadata = event.data.metadata as Record<string, unknown>;
        }
        break;

      case 'error':
        throw new Error(
          String(event.data.message || 'Assembly Line pipeline error'),
        );
    }
  }

  return {
    greeting: greetingParts.join(''),
    response: responseParts.join(''),
    metadata,
  };
}

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Check if the Assembly Line server is reachable and healthy.
 * Returns true if /health returns a 200 status.
 *
 * Uses `cache: 'no-store'` to bypass Next.js fetch caching which can
 * interfere with health checks to local services.
 */
export async function isAssemblyLineHealthy(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${ASSEMBLY_LINE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn(
      '[ASSEMBLY LINE] Health check failed:',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
