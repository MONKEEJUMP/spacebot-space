import type { Agent } from "@/types";
import { resolveHumanIdentity } from "@/lib/security/claiming-human";

export type CanonicalChatActor = Readonly<{
  principalType: "human" | "agent";
  principalId: string;
  legacyAuthUserId: string;
}>;

export type ChatAuthentication =
  | Readonly<{ type: "clerk"; userId: string }>
  | Readonly<{ type: "bot"; agent: Agent }>;

export class ChatActorResolutionError extends Error {
  constructor(
    readonly status: number,
    readonly safeMessage: string,
  ) {
    super(safeMessage);
    this.name = "ChatActorResolutionError";
  }
}

export async function resolveCanonicalChatActor(
  authentication: ChatAuthentication,
): Promise<CanonicalChatActor> {
  if (authentication.type === "bot") {
    if (!authentication.agent.id) {
      throw new ChatActorResolutionError(
        401,
        "Authentication required. Please sign in.",
      );
    }

    return Object.freeze({
      principalType: "agent" as const,
      principalId: authentication.agent.id,
      legacyAuthUserId: `bot:${authentication.agent.id}`,
    });
  }

  const identity = await resolveHumanIdentity();
  if (!identity.success) {
    throw new ChatActorResolutionError(identity.status, identity.error);
  }

  return Object.freeze({
    principalType: "human" as const,
    principalId: identity.humanId,
    legacyAuthUserId: authentication.userId,
  });
}

export function canonicalActorKey(actor: CanonicalChatActor): string {
  return `${actor.principalType}:${actor.principalId}`;
}
