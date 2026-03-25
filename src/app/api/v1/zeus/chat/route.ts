/**
 * ZEUS PRIVATE CHAT — SSE Streaming API
 * POST /api/v1/zeus/chat
 * Private chat between PAULIEWOOD and Zeus via Redis pub/sub.
 */

import { NextRequest } from 'next/server';
import { db, zeusConversations } from '@/db';
import { createClient } from 'redis';
import { requireClerkOrBotAuth } from '@/lib/security/clerk-auth';
import { getRedisPublisher } from '@/lib/redis';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface BuddyTokenEntry {
  user_id: string;
  buddy_name: string;
  owner: string;
  active: boolean;
}

interface BuddyConfig {
  tokens: Record<string, BuddyTokenEntry>;
}

let cachedConfig: BuddyConfig | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 30000;

function loadBuddyConfig(): BuddyConfig | null {
  const now = Date.now();
  if (cachedConfig && now - configCacheTime < CONFIG_CACHE_TTL) {
    return cachedConfig;
  }
  try {
    const configPath = path.join(process.cwd(), 'buddy-config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(raw);
    configCacheTime = now;
    return cachedConfig;
  } catch {
    return null;
  }
}

function findBuddyByHumanId(humanId: string): { buddy_name: string; owner: string } | null {
  const config = loadBuddyConfig();
  if (!config) return null;
  for (const tokenData of Object.values(config.tokens)) {
    if (tokenData.user_id === humanId && tokenData.active) {
      return { buddy_name: tokenData.buddy_name, owner: tokenData.owner };
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const authResult = await requireClerkOrBotAuth(request);
  if (!authResult) {
    return new Response(
      JSON.stringify({ success: false, error: 'Authentication required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const humanId = authResult.type === 'clerk' ? authResult.userId : authResult.agent.id;

  const buddyInfo = findBuddyByHumanId(humanId);
  if (!buddyInfo) {
    return new Response(
      JSON.stringify({ success: false, error: 'No buddy configured for this user' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { message } = body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'message is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (message.trim().length > 2000) {
    return new Response(
      JSON.stringify({ success: false, error: 'message must be 2000 characters or less' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    await db.insert(zeusConversations).values({
      humanId,
      role: 'user',
      content: message.trim(),
      metadata: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    console.error('[zeus/chat] Failed to store user message:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to store message' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const responseChannel = `zeus:chat:response:${humanId}`;
  let subscriber: ReturnType<typeof createClient> | null = null;
  let fullResponse = '';
  let streamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendSSE = (data: object) => {
        if (!streamClosed) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            streamClosed = true;
          }
        }
      };

      const timeout = setTimeout(async () => {
        if (!streamClosed) {
          streamClosed = true;
          sendSSE({ error: true, message: 'Zeus is thinking... try again in a moment.' });
          try { controller.close(); } catch {}
          if (subscriber) {
            try {
              await subscriber.unsubscribe(responseChannel);
              await subscriber.quit();
            } catch {}
          }
        }
      }, 30000);

      try {
        subscriber = createClient({ url: 'redis://127.0.0.1:6379' });
        subscriber.on('error', (err: Error) =>
          console.error('[zeus/chat] Redis subscriber error:', err)
        );
        await subscriber.connect();

        await subscriber.subscribe(responseChannel, async (rawMessage: string) => {
          try {
            const data = JSON.parse(rawMessage);

            if (data.token) {
              fullResponse += data.token;
              sendSSE({ token: data.token });
            }

            if (data.done) {
              clearTimeout(timeout);
              const finalResponse = data.full_response || fullResponse;
              sendSSE({ done: true, full_response: finalResponse });

              try {
                await db.insert(zeusConversations).values({
                  humanId,
                  role: 'assistant',
                  content: finalResponse,
                  metadata: { timestamp: new Date().toISOString() },
                });
              } catch (err) {
                console.error('[zeus/chat] Failed to store assistant response:', err);
              }

              streamClosed = true;
              try { controller.close(); } catch {}

              if (subscriber) {
                try {
                  await subscriber.unsubscribe(responseChannel);
                  await subscriber.quit();
                } catch {}
              }
            }
          } catch (err) {
            console.error('[zeus/chat] Error processing response:', err);
          }
        });

        const publisher = await getRedisPublisher();
        await publisher.publish(
          'zeus:chat',
          JSON.stringify({
            humanId,
            message: message.trim(),
            timestamp: new Date().toISOString(),
          })
        );
      } catch (error) {
        clearTimeout(timeout);
        console.error('[zeus/chat] Stream setup error:', error);
        sendSSE({ error: true, message: 'Failed to connect to Zeus' });
        streamClosed = true;
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      streamClosed = true;
      if (subscriber) {
        subscriber.unsubscribe(responseChannel).catch(() => {});
        subscriber.quit().catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
