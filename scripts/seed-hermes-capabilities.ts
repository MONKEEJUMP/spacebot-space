import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hermesCapabilityGrants } from '../src/db/hermes-schema';

const connectionString = process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL || '';

if (!connectionString) {
  console.error('No database connection string found. Set SPACEBOT_DATABASE_URL or DATABASE_URL.');
  process.exit(1);
}

const client = postgres(connectionString, {
  max: 1,
  ssl: { rejectUnauthorized: false },
});

const db = drizzle(client);

const CAPABILITIES = [
  { capability: 'read_context',       granted: true },
  { capability: 'draft_content',      granted: true },
  { capability: 'request_activation', granted: true },
  { capability: 'publish_approved',   granted: false },
  { capability: 'propose_code',       granted: false },
  { capability: 'sandbox_code',       granted: false },
  { capability: 'request_deploy',     granted: false },
] as const;

async function seed() {
  console.log('Seeding hermes_capability_grants...');

  for (const cap of CAPABILITIES) {
    await db.insert(hermesCapabilityGrants)
      .values({
        capability: cap.capability,
        granted: cap.granted,
        grantedAt: cap.granted ? new Date() : null,
        grantedBy: cap.granted ? 'PAULIEWOOD' : null,
      })
      .onConflictDoNothing();

    console.log(`  ${cap.granted ? '✓' : '✗'} ${cap.capability} (granted=${cap.granted})`);
  }

  console.log('Done. Tiers 0-2 enabled, Tiers 3+ locked.');
  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
