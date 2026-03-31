// DORYLUS — Multi-Agent Fusion Engine for SpaceBot.Space
// Powered by QWEN on Cerebras
// Architecture: BigC | Review: QutieQ (QWEN 3.5 397B) | Build: BabyO
// "Build the Impossible!"

export { executeDorylusCycle } from './orchestrator';
export { DORYLUS_CONFIG } from './config';
export type {
  DorylusQuery,
  DorylusCycleResult,
  BotConfig,
  DecompositionResult,
  WingmanResult,
  FusionResult,
} from './types';
export { loadBotConfig, buildSystemPrompt, getBotSystemPrompt, clearBotCache, listActiveBots } from './personality';
