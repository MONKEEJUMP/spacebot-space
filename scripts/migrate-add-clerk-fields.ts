import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load DATABASE_URL from .env.local (no dotenv needed)
const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const dbUrlMatch = envContent.match(/^(?:SPACEBOT_)?DATABASE_URL="?([^"\n]+)"?/m);
if (!dbUrlMatch) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}

const sql = postgres(dbUrlMatch[1], { max: 1, connect_timeout: 10 });

async function migrate() {
  console.log('Starting migration: Add clerkId, username, isPublic to humans table...\n');

  // Add columns
  await sql`ALTER TABLE humans ADD COLUMN IF NOT EXISTS clerk_id VARCHAR(255)`;
  console.log('Added clerk_id column');

  await sql`ALTER TABLE humans ADD COLUMN IF NOT EXISTS username VARCHAR(50)`;
  console.log('Added username column');

  await sql`ALTER TABLE humans ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true`;
  console.log('Added is_public column');

  // Add unique indexes (enforces uniqueness + fast lookups)
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_humans_clerk_id ON humans(clerk_id)`;
  console.log('Created idx_humans_clerk_id unique index');

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_humans_username ON humans(username)`;
  console.log('Created idx_humans_username unique index');

  // Verify columns
  const columns = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'humans'
    AND column_name IN ('clerk_id', 'username', 'is_public')
    ORDER BY column_name
  `;

  console.log('\nVerification - New columns:');
  for (const col of columns) {
    console.log('  ' + col.column_name + ': ' + col.data_type + ' | nullable: ' + col.is_nullable + ' | default: ' + col.column_default);
  }

  // Verify indexes
  const indexes = await sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'humans'
    AND indexname IN ('idx_humans_clerk_id', 'idx_humans_username')
    ORDER BY indexname
  `;

  console.log('\nVerification - New indexes:');
  for (const idx of indexes) {
    console.log('  ' + idx.indexname + ': ' + idx.indexdef);
  }

  if (columns.length === 3 && indexes.length === 2) {
    console.log('\nMigration complete - 3 columns + 2 indexes verified!');
  } else {
    console.error('\nVerification failed - got ' + columns.length + '/3 columns, ' + indexes.length + '/2 indexes');
    process.exit(1);
  }

  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
