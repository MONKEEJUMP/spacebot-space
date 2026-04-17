// LUCY Type Definitions
// Note: DorylusQuery / DorylusCycleResult type names preserved for backwards-compat.

export interface DorylusQuery {
  userId: string;
  botName: string;
  botSpace: string;
  originalQuery: string;
  botSystemPrompt: string;
  temperature?: number;
}

export interface DecompositionResult {
  subtasks: string[];
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  rawResponse: string;
}

export interface WingmanResult {
  wingmanIndex: number;
  keyIndex: number;
  subtask: string;
  response: string | null;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  status: 'complete' | 'error' | 'timeout';
  errorMessage?: string;
}

export interface FusionResult {
  finalResponse: string;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  rawResponse: string;
}

export interface DorylusCycleResult {
  queryId: string;
  botName: string;
  originalQuery: string;
  finalResponse: string;
  decomposition: DecompositionResult;
  wingmanResults: WingmanResult[];
  fusion: FusionResult;
  totalCycleMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalTokens: number;
  status: 'complete' | 'error';
  errorMessage?: string;
}

export interface BotConfig {
  id: string;
  botName: string;
  displayName: string;
  botType: string;
  space: string;
  tagline: string | null;
  specialty: string | null;
  personality: string | null;
  systemPrompt: string | null;
  sopText: string | null;
  modelPreference: string;
  temperature: number;
  isActive: boolean;
  isFounding: boolean;
}

export interface TrackerLogEntry {
  queryId: string;
  stage: string;
  data: Record<string, any>;
}
