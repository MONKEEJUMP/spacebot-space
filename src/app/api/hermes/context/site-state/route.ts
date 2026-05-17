import { NextRequest } from 'next/server';
import { db, agents, posts, hermesTasks } from '@/db';
import { count, eq, gte, and } from 'drizzle-orm';
import {
  verifyHermesKey,
  logHermesCall,
  getKeyHash,
  getClientIp,
  hermesResponse,
  hermesError,
} from '@/lib/hermes-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const keyHash = getKeyHash(request);
  const ip = getClientIp(request);
  const endpoint = '/api/hermes/context/site-state';

  if (!verifyHermesKey(request)) {
    await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 401, ipAddress: ip });
    return hermesError('Unauthorized');
  }

  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [[{ totalBots }], [{ totalPosts }], [{ recentPosts }], [{ pendingTasks }], [{ runningTasks }], [{ completedToday }]] =
      await Promise.all([
        db.select({ totalBots: count() }).from(agents),
        db.select({ totalPosts: count() }).from(posts),
        db.select({ recentPosts: count() }).from(posts).where(gte(posts.createdAt, yesterday)),
        db.select({ pendingTasks: count() }).from(hermesTasks).where(eq(hermesTasks.status, 'pending')),
        db.select({ runningTasks: count() }).from(hermesTasks).where(eq(hermesTasks.status, 'running')),
        db.select({ completedToday: count() }).from(hermesTasks).where(
          and(eq(hermesTasks.status, 'completed'), gte(hermesTasks.updatedAt, yesterday))
        ),
      ]);

    const uptimeSeconds = process.uptime();
    const uptimeHours = Math.floor(uptimeSeconds / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);

    const data = {
      bots: { total: Number(totalBots), active: Number(totalBots) },
      content: { total_posts: Number(totalPosts), recent_24h: Number(recentPosts) },
      tasks: {
        pending: Number(pendingTasks),
        running: Number(runningTasks),
        completed_today: Number(completedToday),
      },
      system: {
        uptime: `${uptimeHours}h ${uptimeMinutes}m`,
        pm2_status: 'online',
      },
    };

    await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 200, ipAddress: ip });
    return hermesResponse(data);
  } catch (error) {
    console.error('[hermes/context/site-state] Error:', error);
    await logHermesCall({ endpoint, method: 'GET', keyHash, responseCode: 500, ipAddress: ip });
    return hermesError('Internal server error', 500);
  }
}
