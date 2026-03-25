import { createClient } from 'redis';

let publisherClient: ReturnType<typeof createClient> | null = null;

export async function getRedisPublisher() {
  if (!publisherClient) {
    publisherClient = createClient({ url: 'redis://127.0.0.1:6379' });
    publisherClient.on('error', (err: Error) => console.error('[Redis Publisher] Error:', err));
    await publisherClient.connect();
  }
  return publisherClient;
}
