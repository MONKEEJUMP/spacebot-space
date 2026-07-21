export type AgentCredentialFamily = "botspace" | "machine";

type HeaderReader = Pick<Headers, "get">;

export type AgentCredentialInput =
  | { status: "missing" }
  | { status: "conflict" }
  | { status: "invalid" }
  | {
      status: "valid";
      credential: string;
      family: AgentCredentialFamily;
    };

const BOTSPACE_KEY_PATTERN = /^botspace_[A-Za-z0-9_-]{32}$/;
const MACHINE_KEY_PATTERN = /^sb_[a-f0-9]{64}$/;

export function getAgentCredentialFamily(
  credential: string,
): AgentCredentialFamily | null {
  if (BOTSPACE_KEY_PATTERN.test(credential)) return "botspace";
  if (MACHINE_KEY_PATTERN.test(credential)) return "machine";
  return null;
}

function readAuthorizationCredential(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const bearer = trimmed.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();

  // Preserve the original API contract, which also accepted a raw key.
  return trimmed.includes(" ") ? null : trimmed;
}

export function extractAgentCredentialInput(
  headers: HeaderReader,
): AgentCredentialInput {
  const candidates = [
    readAuthorizationCredential(headers.get("authorization")),
    headers.get("x-api-key")?.trim() || null,
    headers.get("x-machine-key")?.trim() || null,
  ].filter((value): value is string => Boolean(value));

  if (candidates.length === 0) return { status: "missing" };

  const uniqueCredentials = [...new Set(candidates)];
  if (uniqueCredentials.length !== 1) return { status: "conflict" };

  const credential = uniqueCredentials[0];
  const family = getAgentCredentialFamily(credential);
  if (!family) return { status: "invalid" };

  return { status: "valid", credential, family };
}
