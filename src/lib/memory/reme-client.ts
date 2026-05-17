// ReMe memory microservice client.
// Talks to the loopback service at REME_SERVICE_URL (default http://localhost:8101).

export interface MemoryRecord {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  distance?: number | null;
}

interface ReadResponse {
  success: boolean;
  memories?: MemoryRecord[];
}

interface WriteResponse {
  success: boolean;
  memory_id?: string;
}

const DEFAULT_TIMEOUT_MS = 4000;

async function postJson<T>(url: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`reme ${url} returned ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export class ReMeClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || process.env.REME_SERVICE_URL || 'http://localhost:8101').replace(/\/$/, '');
  }

  async health(): Promise<{ status: string } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return null;
      return (await res.json()) as { status: string };
    } catch {
      return null;
    }
  }

  async read(workspaceId: string, query: string, topK = 5): Promise<MemoryRecord[]> {
    const data = await postJson<ReadResponse>(`${this.baseUrl}/memory/read`, {
      workspace_id: workspaceId,
      query,
      top_k: topK,
    });
    return data.memories || [];
  }

  async write(workspaceId: string, content: string, metadata?: Record<string, unknown>): Promise<string | null> {
    const data = await postJson<WriteResponse>(`${this.baseUrl}/memory/write`, {
      workspace_id: workspaceId,
      content,
      metadata: metadata || {},
    });
    return data.memory_id || null;
  }

  async list(workspaceId: string): Promise<MemoryRecord[]> {
    const data = await postJson<ReadResponse>(`${this.baseUrl}/memory/list`, {
      workspace_id: workspaceId,
    });
    return data.memories || [];
  }

  async delete(workspaceId: string, memoryId: string): Promise<boolean> {
    const data = await postJson<{ success: boolean }>(`${this.baseUrl}/memory/delete`, {
      workspace_id: workspaceId,
      memory_id: memoryId,
    });
    return Boolean(data?.success);
  }
}

export const remeClient = new ReMeClient();
