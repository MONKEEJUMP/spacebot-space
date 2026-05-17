// OpenJudge client -- non-blocking, fire-and-forget safe.
// NEVER throws. NEVER blocks. Returns null on any failure.

const OPENJUDGE_TIMEOUT_MS = 10_000;

export interface OpenJudgeScores {
  scores: {
    relevance: number;
    hallucination: number;
  };
  overall: number;
  graders_used: string[];
}

export function isOpenJudgeEnabled(): boolean {
  return (process.env.OPENJUDGE_ENABLED ?? '').toLowerCase() === 'true';
}

function getOpenJudgeUrl(): string {
  return process.env.OPENJUDGE_URL?.trim() || 'http://127.0.0.1:8103';
}

export async function scoreResponse(
  botId: string,
  query: string,
  response: string,
  context?: string,
): Promise<OpenJudgeScores | null> {
  if (!isOpenJudgeEnabled()) return null;

  const url = `${getOpenJudgeUrl().replace(/\/+$/, '')}/judge`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENJUDGE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId, query, response, context }),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const data = await res.json() as OpenJudgeScores;
    console.log(`[OpenJudge] bot=${botId} overall=${data.overall}`);
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
