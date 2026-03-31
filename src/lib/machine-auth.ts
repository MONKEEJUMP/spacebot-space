import { NextRequest } from 'next/server';
import { db, agents } from '@/db';
import { eq } from 'drizzle-orm';

/**
 * Authenticate a machine (AI agent) via X-Machine-Key header.
 * Returns the agent's UUID and name, or null if unauthenticated.
 * Machines do NOT use Clerk — they have their own auth.
 *
 * Auth chain (checked in order):
 * 1. X-Machine-Key header matched against agents.api_key (sb_ platform keys ONLY)
 *
 * SECURITY: Name-based authentication has been removed. Only API keys with sb_ prefix are accepted.
 */
export async function authenticateMachine(
  req: NextRequest
): Promise<{ agentId: string; botName: string } | null> {
  // Check X-Machine-Key header
  const machineKey = req.headers.get('X-Machine-Key');
  if (machineKey) {
    // Only allow API key lookup (sb_ platform keys)
    if (machineKey.startsWith('sb_')) {
      const agent = await db.query.agents.findFirst({
        where: eq(agents.apiKey, machineKey),
        columns: { id: true, name: true },
      });
      if (agent) {
        return { agentId: agent.id, botName: agent.name };
      }
    }
  }

  return null;
}
