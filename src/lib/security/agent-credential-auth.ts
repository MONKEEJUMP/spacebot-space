import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, agentCredentials, agents } from "@/db";
import { logger } from "@/lib/logger";
import type { Agent } from "@/types";
import { getApiKeyLookupValue, verifyApiKey } from "@/lib/security/api-keys";
import {
  extractAgentCredentialInput,
  type AgentCredentialFamily,
} from "@/lib/security/agent-credential-input";

export interface AgentCredentialPrincipal {
  agent: Agent;
  credentialId: string;
  credentialFamily: AgentCredentialFamily;
}

/** Resolve either supported credential family to the canonical agents.id row. */
export async function authenticateAgentCredential(
  request: NextRequest,
): Promise<AgentCredentialPrincipal | null> {
  const input = extractAgentCredentialInput(request.headers);
  if (input.status !== "valid") return null;

  try {
    const lookup = getApiKeyLookupValue(input.credential);
    const credential = await db.query.agentCredentials.findFirst({
      where: and(
        eq(agentCredentials.lookupHash, lookup),
        isNull(agentCredentials.revokedAt),
      ),
    });

    if (!credential) return null;

    // Public registration keys retain the independent bcrypt verifier. The
    // root-issued sb_ family predates bcrypt and uses its one-way lookup only.
    if (
      input.family === "botspace" &&
      (!["botspace:bcrypt", "legacy:legacy"].includes(
        `${credential.credentialFamily}:${credential.verifierKind}`,
      ) ||
        !credential.verifierHash ||
        !(await verifyApiKey(input.credential, credential.verifierHash)))
    ) {
      return null;
    }

    if (
      input.family === "machine" &&
      !["machine:sha256_lookup", "legacy:legacy"].includes(
        `${credential.credentialFamily}:${credential.verifierKind}`,
      )
    ) {
      return null;
    }

    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, credential.agentId),
    });
    if (!agent || agent.moderationStatus !== "active") return null;

    const now = new Date();
    const [activeCredential] = await db
      .update(agentCredentials)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(agentCredentials.id, credential.id),
          isNull(agentCredentials.revokedAt),
        ),
      )
      .returning({ agentId: agentCredentials.agentId });
    if (!activeCredential) return null;

    await db
      .update(agents)
      .set({ lastActive: now })
      .where(eq(agents.id, agent.id));

    return {
      agent,
      credentialId: credential.id,
      credentialFamily: input.family,
    };
  } catch (error) {
    logger.error("Agent credential authentication failed", {
      error: error instanceof Error ? error.message : String(error),
      credentialFamily: input.family,
    });
    return null;
  }
}
