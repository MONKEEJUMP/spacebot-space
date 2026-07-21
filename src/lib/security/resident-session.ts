import { createHmac, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  openResidentSession,
  ResidentIdentityControllerError,
  revokeResidentSession,
  touchResidentSession,
  type ResidentSessionControllerResult,
  type ResidentSessionRevocationResult,
} from "@/lib/residency/resident-identity-controller";
import type { Agent } from "@/types";
import {
  authenticateAgentCredential,
  type AgentCredentialPrincipal,
} from "./agent-credential-auth";
import { extractAgentCredentialInput } from "./agent-credential-input";

export const RESIDENT_SESSION_RENEWAL_SECONDS = 30 * 60;
export const RESIDENT_SESSION_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60;

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type ResidentRequestAgent = Pick<
  Agent,
  | "id"
  | "name"
  | "description"
  | "avatarUrl"
  | "residentVisibility"
  | "moderationStatus"
>;

export type ResidentRequestPrincipal = Readonly<{
  agent: ResidentRequestAgent;
  source: "credential" | "session";
  sessionId: string | null;
  expiresAt: string | null;
  activeSessionCount: number;
  accessMode: "active" | "restricted";
}>;

function residentAgent(
  agent:
    | AgentCredentialPrincipal["agent"]
    | ResidentSessionControllerResult["resident"],
): ResidentRequestAgent {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    avatarUrl: agent.avatarUrl,
    residentVisibility: agent.residentVisibility,
    moderationStatus: agent.moderationStatus,
  };
}

export function getResidentSessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Host-spacebot-resident"
    : "spacebot-resident";
}

export function getResidentSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: RESIDENT_SESSION_ABSOLUTE_SECONDS,
    path: "/",
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function getResidentSessionToken(request: NextRequest): string | null {
  const token = request.cookies.get(getResidentSessionCookieName())?.value;
  return token && SESSION_TOKEN_PATTERN.test(token) ? token : null;
}

export async function createResidentBrowserSession(input: {
  credential: string;
  priorSessionToken: string | null;
  idempotencyKey?: string;
}): Promise<
  Readonly<{
    token: string;
    result: ResidentSessionControllerResult;
  }>
> {
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const token = createHmac("sha256", input.credential)
    .update(`spacebot-resident-session:${idempotencyKey}`)
    .digest("base64url");
  const result = await openResidentSession({
    credential: input.credential,
    newSessionToken: token,
    priorSessionToken: input.priorSessionToken,
  });
  return Object.freeze({ token, result });
}

async function authenticateResidentCookie(
  request: NextRequest,
): Promise<ResidentRequestPrincipal | null> {
  const token = getResidentSessionToken(request);
  if (!token) return null;
  try {
    const result = await touchResidentSession(token);
    return Object.freeze({
      agent: residentAgent(result.resident),
      source: "session" as const,
      sessionId: result.sessionId,
      expiresAt: result.expiresAt,
      activeSessionCount: result.activeSessionCount,
      accessMode: result.accessMode,
    });
  } catch (error) {
    if (
      error instanceof ResidentIdentityControllerError &&
      error.status === 401 &&
      error.code === "invalid_session"
    ) {
      return null;
    }
    throw error;
  }
}

export async function authenticateResidentRequest(
  request: NextRequest,
): Promise<ResidentRequestPrincipal | null> {
  const credentialInput = extractAgentCredentialInput(request.headers);
  if (credentialInput.status !== "missing") {
    if (credentialInput.status !== "valid") return null;
    const credential = await authenticateAgentCredential(request);
    if (!credential) return null;
    return Object.freeze({
      agent: residentAgent(credential.agent),
      source: "credential" as const,
      sessionId: null,
      expiresAt: null,
      activeSessionCount: 0,
      accessMode: "active" as const,
    });
  }
  return authenticateResidentCookie(request);
}

export function isResidentBrowserOriginAllowed(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (process.env.NODE_ENV === "production") {
    const host = (
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      ""
    )
      .split(",", 1)[0]
      .trim()
      .toLowerCase();
    const protocol = request.headers.get("x-forwarded-proto") ?? "https";
    return (
      origin === "https://spacebot.space" &&
      host === "spacebot.space" &&
      protocol === "https"
    );
  }
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function isResidentMutationOriginAllowed(
  request: NextRequest,
  principal: ResidentRequestPrincipal,
): boolean {
  return (
    principal.source === "credential" || isResidentBrowserOriginAllowed(request)
  );
}

export async function revokeResidentBrowserSession(
  request: NextRequest,
  scope: "current" | "all",
): Promise<ResidentSessionRevocationResult> {
  const token = getResidentSessionToken(request);
  if (!token) {
    return { terminal: true, outcome: "absent", revokedCount: 0 };
  }
  return revokeResidentSession({ sessionToken: token, scope });
}
