/**
 * SPACEBOT LAB — Two-Agent Pipeline (Face + Researcher)
 *
 * Orchestrates two sequential AI calls per user message:
 * 1. FACE (Agent 1) — Personality-driven quick accurate answer (2-4 sentences)
 * 2. RESEARCHER (Agent 2) — Structured deep-knowledge answer (ANSWER, KEY FACTS, FOLLOW UP)
 *
 * Sequential execution: Face completes before Researcher starts.
 * Ollama single-GPU processes one request at a time — sequential
 * guarantees the user reads the Face response while Researcher computes.
 */

import type { LabBotSlug } from '@/types/lab';
import { getFacePrompt, getResearcherPrompt } from './prompts';

// ----- Types -----

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ModelResult {
  response: string;
  modelUsed: string;
  provider: string;
}

export type ModelCaller = (
  systemPrompt: string,
  messages: ChatMessage[],
) => Promise<ModelResult>;

export interface PipelinePart {
  // SSE event types: 'entertainer' (Agent 1 Face), 'researcher' (Agent 2).
  type: 'entertainer' | 'researcher';
  content: string;
  timestamp: number;
}

export interface PipelineResult {
  parts: PipelinePart[];
  combinedContent: string;
  model: string;
  provider: string;
}

// ----- Fallback Face Lines -----
// Used when the Face call fails — keeps the UX alive.
// Answer-style (not teasers) since Agent 1 now delivers real answers.

export const FALLBACK_FACE: Record<LabBotSlug, string> = {
  'cosmo-sage': "The cosmos always has answers — let me think on that for a moment...",
  'paleo-rex': "Every fossil tells a story — let me dig into that one...",
  'deep-current': "The ocean runs deep on this one — give me a moment to surface the answer...",
  'atom-spark': "The elements are reacting in my head — let me work this out...",
  'medi-core': "The human body is fascinating — let me think through this carefully...",
  'storm-watch': "The atmosphere is shifting — let me read the data on this...",
  'terra-forge': "The earth remembers everything — let me consult the deep layers...",
  'fauna-link': "Nature has patterns for this — let me trace the connection...",
  'volt-rush': "The circuits are firing — let me channel the right answer...",
  'flora-root': "Every root leads somewhere — let me follow this one...",
  'cipher-mind': "Processing... the logic is forming — give me a moment...",
  'axiom-prime': "The numbers are aligning — let me solve this...",
};

// ----- Pipeline Core -----

/**
 * Fires two sequential AI calls: one for personality (Face), one for knowledge (Researcher).
 *
 * @param botSlug     - Which lab bot is responding
 * @param userMessage - The human's question
 * @param history     - Conversation history (previous turns)
 * @param callFace       - Model caller configured for fast, short responses (Agent 1)
 * @param callResearcher - Model caller configured for full, detailed responses (Agent 2)
 */
export async function twoAgentPipeline(
  botSlug: LabBotSlug,
  userMessage: string,
  history: ChatMessage[],
  callFace: ModelCaller,
  callResearcher: ModelCaller,
): Promise<PipelineResult> {
  const facePrompt = getFacePrompt(botSlug);
  const researcherPrompt = getResearcherPrompt(botSlug);

  const faceMessages: ChatMessage[] = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  // Researcher gets ONLY the current question — no history bleed
  const researcherMessages: ChatMessage[] = [
    { role: 'user', content: userMessage },
  ];

  // ── SEQUENTIAL PIPELINE ──
  // Ollama processes one request at a time on a single GPU.
  // Sequential guarantees the Face completes and delivers
  // before the Researcher even starts computing.

  // STEP 1: Face first — personality-driven quick accurate answer
  let faceText = FALLBACK_FACE[botSlug];
  let model = 'unknown';
  let provider = 'unknown';

  try {
    const faceResult = await callFace(facePrompt, faceMessages);
    faceText = faceResult.response;
    model = faceResult.modelUsed;
    provider = faceResult.provider;
  } catch (err) {
    console.warn('[LAB PIPELINE] Face (Agent 1) failed:', err);
  }

  // STEP 2: Researcher second — structured deep-knowledge answer
  let researcherText = "Hmm, let me look into that more carefully — ask me again!";

  try {
    const researcherResult = await callResearcher(researcherPrompt, researcherMessages);
    researcherText = researcherResult.response;
    model = researcherResult.modelUsed;
    provider = researcherResult.provider;
  } catch (err) {
    console.error('[LAB PIPELINE] Researcher (Agent 2) failed:', err);
  }

  const now = Date.now();

  return {
    parts: [
      { type: 'entertainer', content: faceText, timestamp: now },       // SSE type kept for frontend compat
      { type: 'researcher', content: researcherText, timestamp: now + 1 },
    ],
    combinedContent: `${faceText}\n\n${researcherText}`,
    model,
    provider,
  };
}
