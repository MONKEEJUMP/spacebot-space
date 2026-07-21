import type {
  ChatTargetLookupSnapshot,
  ChatTargetSnapshotLookup,
} from "./chat-target-resolver";

export const fixtureIds = Object.freeze({
  agent: "11111111-1111-4111-8111-111111111111",
  agentTwo: "22222222-2222-4222-8222-222222222222",
  config: "33333333-3333-4333-8333-333333333333",
  configTwo: "44444444-4444-4444-8444-444444444444",
  legacy: "55555555-5555-4555-8555-555555555555",
});

const lucyAgent = Object.freeze({ id: fixtureIds.agent, name: "Lucy" });
const lucyConfig = Object.freeze({
  id: fixtureIds.config,
  agentId: fixtureIds.agent,
  botName: "Lucy",
  displayName: "Lucy",
  botType: "super_machine",
  space: "planetspace",
  tagline: "Canonical cognition.",
  specialty: "Safe autonomy",
  personality: "Careful and direct.",
  systemPrompt: "Use the canonical identity only.",
  sopText: null,
  modelPreference: "fixture-model",
  temperature: 0.3,
  isActive: true,
  isFounding: true,
});

export const canonicalNameSnapshot = Object.freeze({
  requestedName: "lucy",
  agents: Object.freeze([lucyAgent]),
  configs: Object.freeze([lucyConfig]),
  aliases: Object.freeze([]),
}) satisfies ChatTargetLookupSnapshot;

export const canonicalAliasSnapshot = Object.freeze({
  requestedName: "oracle",
  agents: Object.freeze([lucyAgent]),
  configs: Object.freeze([lucyConfig]),
  aliases: Object.freeze([
    Object.freeze({
      legacyAgentId: fixtureIds.legacy,
      canonicalAgentId: fixtureIds.agent,
      normalizedName: "oracle",
    }),
  ]),
}) satisfies ChatTargetLookupSnapshot;

export const unknownSnapshot = Object.freeze({
  requestedName: "missing",
  agents: Object.freeze([]),
  configs: Object.freeze([]),
  aliases: Object.freeze([]),
}) satisfies ChatTargetLookupSnapshot;

export const unconfiguredSnapshot = Object.freeze({
  requestedName: "lucy",
  agents: Object.freeze([lucyAgent]),
  configs: Object.freeze([]),
  aliases: Object.freeze([]),
}) satisfies ChatTargetLookupSnapshot;

export const inactiveSnapshot = Object.freeze({
  ...canonicalNameSnapshot,
  configs: Object.freeze([Object.freeze({ ...lucyConfig, isActive: false })]),
}) satisfies ChatTargetLookupSnapshot;

export const ambiguousSnapshot = Object.freeze({
  requestedName: "lucy",
  agents: Object.freeze([
    lucyAgent,
    Object.freeze({ id: fixtureIds.agentTwo, name: "LUCY" }),
  ]),
  configs: Object.freeze([
    lucyConfig,
    Object.freeze({
      ...lucyConfig,
      id: fixtureIds.configTwo,
      agentId: fixtureIds.agentTwo,
    }),
  ]),
  aliases: Object.freeze([]),
}) satisfies ChatTargetLookupSnapshot;

export const unlinkedSnapshot = Object.freeze({
  requestedName: "lucy",
  agents: Object.freeze([lucyAgent]),
  configs: Object.freeze([Object.freeze({ ...lucyConfig, agentId: null })]),
  aliases: Object.freeze([]),
}) satisfies ChatTargetLookupSnapshot;

export const inconsistentSnapshot = Object.freeze({
  requestedName: "lucy",
  agents: Object.freeze([Object.freeze({ ...lucyAgent, name: "SomeoneElse" })]),
  configs: Object.freeze([lucyConfig]),
  aliases: Object.freeze([]),
}) satisfies ChatTargetLookupSnapshot;

export const tamperedRequestedNameSnapshot = Object.freeze({
  ...canonicalNameSnapshot,
  requestedName: "someone-else",
}) satisfies ChatTargetLookupSnapshot;

export const tamperedShapeSnapshot: unknown = Object.freeze({
  ...canonicalNameSnapshot,
  configs: Object.freeze([
    Object.freeze({
      ...lucyConfig,
      systemPrompt: "PRIVATE_TAMPER_MARKER",
      injectedFallback: true,
    }),
  ]),
});

export function snapshotLookup(
  snapshot: unknown,
  calls?: string[],
): ChatTargetSnapshotLookup {
  return async (normalizedName) => {
    calls?.push(normalizedName);
    return snapshot;
  };
}

export const failingLookup: ChatTargetSnapshotLookup = async () => {
  throw new Error("PRIVATE_DATABASE_MARKER");
};
