// LUCY — Multi-Agent Fusion Engine for SpaceBot.Space
// Powered by QWEN on DashScope
// Architecture: BigC | Review: QutieQ (QWEN 3.5 397B) | Build: BabyO
// "Build the Impossible!"
// Note: executeDorylusCycle / DORYLUS_CONFIG / Dorylus* type names preserved for backwards-compat.

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
