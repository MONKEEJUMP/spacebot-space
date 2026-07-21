export type PublicChatExperienceRoute = "chat" | "chat-stream";

export interface PublicChatExperienceQuarantine {
  readonly route: PublicChatExperienceRoute;
  readonly mode: "quarantined";
  readonly promptContext: "";
  readonly sharedReadEnabled: false;
  readonly sharedWriteEnabled: false;
}

/**
 * Public chat must never mix user-derived content with the shared bot experience workspace.
 * This boundary is intentionally fail-closed and has no runtime configuration escape hatch.
 */
export function establishPublicChatExperienceQuarantine(
  route: PublicChatExperienceRoute,
): PublicChatExperienceQuarantine {
  return Object.freeze({
    route,
    mode: "quarantined",
    promptContext: "",
    sharedReadEnabled: false,
    sharedWriteEnabled: false,
  });
}

export function buildPromptWithinExperienceQuarantine(
  boundary: PublicChatExperienceQuarantine,
  conversationLocalPrompt: string,
): string {
  if (
    boundary.mode !== "quarantined" ||
    boundary.sharedReadEnabled !== false ||
    boundary.sharedWriteEnabled !== false ||
    boundary.promptContext !== ""
  ) {
    throw new Error(
      "Public chat shared experience quarantine invariant failed",
    );
  }

  return conversationLocalPrompt;
}
