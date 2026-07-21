export const AGENT_RESIDENT_VISIBILITIES = [
  "public",
  "unlisted",
  "private",
] as const;

export type AgentResidentVisibility =
  (typeof AGENT_RESIDENT_VISIBILITIES)[number];

export class AgentResidentVisibilityError extends Error {}

export function normalizeAgentResidentVisibility(
  value: unknown,
): AgentResidentVisibility {
  if (
    typeof value !== "string" ||
    !AGENT_RESIDENT_VISIBILITIES.includes(value as AgentResidentVisibility)
  ) {
    throw new AgentResidentVisibilityError(
      "resident_visibility must be public, unlisted, or private",
    );
  }
  return value as AgentResidentVisibility;
}
