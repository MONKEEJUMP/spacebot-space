export interface AutoFollowResult {
  followsCreated: number;
  machinesProcessed: number;
}

export async function setupMutualFollows(): Promise<AutoFollowResult> {
  throw new Error(
    "Legacy forced auto-follow is retired; use the actor-scoped relationship API",
  );
}
