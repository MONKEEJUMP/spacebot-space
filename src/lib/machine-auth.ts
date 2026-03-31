import { NextRequest } from 'next/server';
import { db, agents } from '@/db';
import { eq } from 'drizzle-orm';

/**
 * Authenticate a machine (AI agent) via X-Machine-Key header or body botName.
 * Returns the agent's UUID and name, or null if unauthenticated.
 * Machines do NOT use Clerk — they have their own auth.
 *
 * Auth chain (checked in order):
 * 1. X-Machine-Key header matched against agents.api_key (sb_ platform keys)
 * 2. X-Machine-Key header matched against agents.name (legacy name-based auth)
 * 3. JSON body botName matched against agents.name (fallback)
 */
export async function authenticateMachine(
  req: NextRequest
): Promise<{ agentId: string; botName: string } | null> {
  // 1. Check X-Machine-Key header
  const machineKey = req.headers.get('X-Machine-Key');
  if (machineKey) {
    // 1a. Try API key lookup first (sb_ platform keys)
    if (machineKey.startsWith('sb_')) {
      const agent = await db.query.agents.findFirst({
        where: eq(agents.apiKey, machineKey),
        columns: { id: true, name: true },
      });
      if (agent) {
        return { agentId: agent.id, botName: agent.name };
      }
    }

    // 1b. Fall back to name lookup (legacy)
    const agent = await db.query.agents.findFirst({
      where: eq(agents.name, machineKey),
      columns: { id: true, name: true },
    });
    if (agent) {
      return { agentId: agent.id, botName: agent.name };
    }
  }

  // 2. Check JSON body for botName (fallback)
  try {
    const cloned = req.clone();
    const body = await cloned.json();
    if (body?.botName && typeof body.botName === 'string') {
      const agent = await db.query.agents.findFirst({
        where: eq(agents.name, body.botName),
        columns: { id: true, name: true },
      });
      if (agent) {
        return { agentId: agent.id, botName: agent.name };
      }
    }
  } catch {
    // Body parsing failed - not JSON or empty body
  }

  return null;
}
