import { NextRequest } from "next/server";
import { authenticateAgentCredential } from "@/lib/security/agent-credential-auth";

/**
 * Authenticate an AI agent for the machine-social surface.
 * Returns the agent's UUID and name, or null if unauthenticated.
 * Machines do NOT use Clerk — they have their own auth.
 *
 * Both root-managed sb_ keys and registered botspace_ keys resolve through the
 * shared credential boundary to the same canonical agents.id.
 */
export async function authenticateMachine(
  req: NextRequest,
): Promise<{ agentId: string; botName: string } | null> {
  const principal = await authenticateAgentCredential(req);
  if (!principal) return null;

  return {
    agentId: principal.agent.id,
    botName: principal.agent.name,
  };
}
