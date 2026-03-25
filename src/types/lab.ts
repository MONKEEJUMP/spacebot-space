/**
 * SPACEBOT LAB — Domain Types
 * Typed contracts for Lab bot registry, prompts, and chat payloads.
 */

export const LAB_BOT_SLUGS = [
  'cosmo-sage',
  'paleo-rex',
  'deep-current',
  'atom-spark',
  'medi-core',
  'storm-watch',
  'terra-forge',
  'fauna-link',
  'volt-rush',
  'flora-root',
  'cipher-mind',
  'axiom-prime',
] as const;

export type LabBotSlug = (typeof LAB_BOT_SLUGS)[number];

export interface LabAvatarConfig {
  bodyType: string;
  eyeType: string;
  mouthType: string;
  colorPrimary: string;
  colorDark: string;
  colorLight: string;
  accessories: string[];
  animationType: string;
  showOverlay?: boolean;
}

export interface LabBotPromptReference {
  slug: LabBotSlug;
  modulePath: `@/lib/lab/prompts/${LabBotSlug}`;
  exportName: 'FACE_PROMPT';
}

export interface LabBotDefinition {
  slug: LabBotSlug;
  name: string;
  subject: string;
  accentColor: `#${string}`;
  tagline: string;
  personality: string;
  avatarConfig: LabAvatarConfig;
  prompt: LabBotPromptReference;
}

export interface LabChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LabChatRequest {
  botSlug: LabBotSlug;
  message: string;
  conversationHistory?: LabChatHistoryMessage[];
}

/** A single part of a multi-agent pipeline response. */
export interface LabChatResponsePart {
  type: 'entertainer' | 'researcher';
  content: string;
  timestamp: number;
}

export interface LabChatResponse {
  success: boolean;
  /** @deprecated Single response — kept for backward compat (safety redirects). */
  response?: string;
  /** Multi-part pipeline response: entertainer + researcher. */
  parts?: LabChatResponsePart[];
  botName: string;
  provider?: string;
  model?: string;
}
