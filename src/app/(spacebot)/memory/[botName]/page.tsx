'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface MemoryRecord {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface MemoryListResponse {
  success: boolean;
  enabled: boolean;
  workspaceId?: string;
  memories?: MemoryRecord[];
  error?: string;
}

function formatTimestamp(metadata: Record<string, unknown> | undefined): string {
  const ts = metadata?.created_at;
  if (typeof ts !== 'number') return '';
  const ms = ts > 1_000_000_000_000 ? ts : ts * 1000;
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
}

export default function MemoryViewerPage() {
  const params = useParams<{ botName: string }>();
  const botName = params?.botName || '';

  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/memory/${encodeURIComponent(botName)}`, { cache: 'no-store' });
      const data = (await res.json()) as MemoryListResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setEnabled(Boolean(data.enabled));
      setMemories(data.memories || []);
      setWorkspaceId(data.workspaceId || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load memories');
    } finally {
      setLoading(false);
    }
  }, [botName]);

  useEffect(() => {
    if (botName) void load();
  }, [botName, load]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/memory/${encodeURIComponent(botName)}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [botName]);

  return (
    <main className="min-h-screen bg-black text-emerald-300 font-mono p-6">
      <div className="mx-auto max-w-3xl">
        <header className="border-b border-emerald-700 pb-4 mb-6">
          <h1 className="text-2xl text-emerald-400">~/memory/{botName}</h1>
          <p className="text-sm text-emerald-600 mt-1">
            {enabled
              ? `workspace: ${workspaceId || '(resolving)'}`
              : 'Memory is currently disabled (MEMORY_ENABLED=false).'}
          </p>
        </header>

        {error && (
          <div className="mb-4 border border-red-600 bg-red-950/40 text-red-300 p-3 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-emerald-500">Loading memories...</p>
        ) : !enabled ? (
          <p className="text-emerald-600">No memories are being recorded right now.</p>
        ) : memories.length === 0 ? (
          <p className="text-emerald-600">No memories stored yet for this bot.</p>
        ) : (
          <ul className="space-y-3">
            {memories.map((m) => (
              <li
                key={m.id}
                className="border border-emerald-800 rounded p-3 bg-emerald-950/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <pre className="whitespace-pre-wrap break-words text-sm text-emerald-200 flex-1">
                    {m.content}
                  </pre>
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    className="text-xs text-red-400 border border-red-700 px-2 py-1 rounded hover:bg-red-900/40"
                  >
                    delete
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-emerald-700">
                  {formatTimestamp(m.metadata)} · id: {m.id}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6">
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs border border-emerald-700 px-3 py-1 rounded text-emerald-300 hover:bg-emerald-900/40"
          >
            refresh
          </button>
        </div>
      </div>
    </main>
  );
}
