import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrations = [
  'PW7404-1021-01-reconcile-test-claim-orphan-20260710.sql',
  'PW7404-1021-02-agent-claim-residency-20260710.sql',
].map((name) => join(repoRoot, 'drizzle', 'migrations', name));

for (const migration of migrations) {
  if (!existsSync(migration)) {
    throw new Error(`Required migration is missing: ${migration}`);
  }
}

if (process.argv.includes('--check')) {
  console.log('PW7404-1021 migration order verified:');
  migrations.forEach((migration) => console.log(`- ${migration}`));
  process.exit(0);
}

if (process.env.SPACEBOT_APPLY_CLAIM_RESIDENCY !== 'YES') {
  throw new Error('Set SPACEBOT_APPLY_CLAIM_RESIDENCY=YES to authorize database writes');
}

const psql = process.env.SPACEBOT_PSQL_BIN || 'psql';
const expectedDatabase = process.env.SPACEBOT_EXPECTED_DATABASE;
if (!expectedDatabase) {
  throw new Error('Set SPACEBOT_EXPECTED_DATABASE to prevent wrong-database writes');
}

const databaseProbe = spawnSync(
  psql,
  ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', 'select current_database();'],
  { encoding: 'utf8', env: process.env, stdio: ['ignore', 'pipe', 'inherit'] }
);
if (databaseProbe.error) throw databaseProbe.error;
if (databaseProbe.status !== 0) throw new Error('Database connectivity probe failed');
const actualDatabase = databaseProbe.stdout.trim();
if (actualDatabase !== expectedDatabase) {
  throw new Error(
    `Wrong database target: expected ${expectedDatabase}, received ${actualDatabase}`
  );
}
console.log(`PW7404-1021 database target verified: ${actualDatabase}`);

const receiptSql = `DO $$
 BEGIN
   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='claim_code_expires_at')
      OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bot_configs' AND column_name='agent_id')
      OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='human_agent_links_one_active_agent_idx')
      OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='bot_configs_agent_id_unique_idx')
      OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='humans_email_casefold_unique_idx')
      OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='humans' AND column_name='stripe_subscription_id')
      OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='humans_stripe_subscription_id_unique_idx')
      OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bot_configs_agent_id_agents_id_fk' AND convalidated=true)
      OR EXISTS (SELECT 1 FROM agents WHERE is_claimed=true AND NOT EXISTS (SELECT 1 FROM human_agent_links WHERE agent_id=agents.id AND status='active'))
      OR EXISTS (SELECT 1 FROM bot_configs WHERE agent_id IS NULL)
   THEN
     RAISE EXCEPTION 'PW7404-1021 post-migration invariants failed';
   END IF;
 END
 $$;
 SELECT
   (SELECT count(*) FROM human_agent_links WHERE status='active') AS active_owners,
   (SELECT count(*) FROM bot_configs WHERE agent_id IS NOT NULL) AS resident_links,
   (SELECT count(*) FROM agents WHERE is_claimed=true) AS claimed_agents;`;

const result = spawnSync(
  psql,
  [
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '--single-transaction',
    ...migrations.flatMap((migration) => ['-f', migration]),
    '-c',
    receiptSql,
  ],
  { env: process.env, stdio: 'inherit' }
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Atomic migration and receipt failed (${result.status})`);
}
