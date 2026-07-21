import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync(
  new URL("../src/db/schema.ts", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL(
    "../drizzle/migrations/PW7404-1034-01-canonical-lucy-cycle-scope-20260711.sql",
    import.meta.url,
  ),
  "utf8",
);
const concurrentIndexMigration = fs.readFileSync(
  new URL(
    "../drizzle/migrations/PW7404-1034-02-canonical-chat-unique-index-20260711.sql",
    import.meta.url,
  ),
  "utf8",
);

const checks = [
  [
    "conversation actor type",
    /actorPrincipalType: varchar\(["']actor_principal_type["']/,
    schema,
  ],
  [
    "conversation actor id",
    /actorPrincipalId: uuid\(["']actor_principal_id["']\)/,
    schema,
  ],
  [
    "conversation canonical target",
    /targetAgentId: uuid\(["']target_agent_id["']\)\.references\(\(\) => agents\.id\)/,
    schema,
  ],
  [
    "canonical actor-target uniqueness",
    /chat_conversations_canonical_actor_target_unique_idx/,
    schema,
  ],
  [
    "durable cycle table",
    /export const lucyCycles = pgTable\(\s*["']lucy_cycles["']/,
    schema,
  ],
  ["request id uniqueness", /lucy_cycles_request_unique_idx/, schema],
  ["turn id uniqueness", /lucy_cycles_turn_unique_idx/, schema],
  [
    "cycle input hash",
    /inputHash: varchar\(["']input_hash["'], \{ length: 64 \}\)\.notNull\(\)/,
    schema,
  ],
  [
    "cycle lease owner",
    /leaseOwner: uuid\(["']lease_owner["']\)\.notNull\(\)/,
    schema,
  ],
  [
    "cycle lease expiration",
    /leaseExpiresAt: timestamp\(["']lease_expires_at["']/,
    schema,
  ],
  [
    "cycle attempt count",
    /attemptCount: integer\(["']attempt_count["']\)/,
    schema,
  ],
  [
    "canonical all-or-none scope check",
    /chat_conversations_canonical_scope_check/,
    schema,
  ],
  ["cycle actor type check", /lucy_cycles_actor_type_check/, schema],
  ["Drizzle composite conversation scope FK", /lucy_cycles_conversation_scope_fk/, schema],
  ["migration transaction begins", /^BEGIN;/m, migration],
  ["migration transaction commits", /^COMMIT;/m, migration],
  [
    "migration is additive",
    /ADD COLUMN IF NOT EXISTS actor_principal_type/,
    migration,
  ],
  [
    "migration creates cycle table idempotently",
    /CREATE TABLE IF NOT EXISTS lucy_cycles/,
    migration,
  ],
  [
    "migration protects request replay",
    /CREATE UNIQUE INDEX IF NOT EXISTS lucy_cycles_request_unique_idx/,
    migration,
  ],
  [
    "migration protects turn replay",
    /CREATE UNIQUE INDEX IF NOT EXISTS lucy_cycles_turn_unique_idx/,
    migration,
  ],
  [
    "migration scopes constraint lookup",
    /conrelid = 'public\.chat_conversations'::regclass/,
    migration,
  ],
  [
    "migration enforces composite conversation scope",
    /lucy_cycles_conversation_scope_fk/,
    migration,
  ],
  [
    "unique index is concurrent",
    /CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS chat_conversations_canonical_actor_target_unique_idx/,
    concurrentIndexMigration,
  ],
];

for (const [name, pattern, source] of checks) {
  assert.match(source, pattern, name);
}

assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN|CONSTRAINT)/i);
assert.doesNotMatch(migration, /TRUNCATE|DELETE\s+FROM/i);
assert.doesNotMatch(concurrentIndexMigration, /BEGIN;|COMMIT;/i);

console.log(
  `PW7404-1034 canonical LUCY cycle scope: PASS (${checks.length + 3} checks)`,
);
