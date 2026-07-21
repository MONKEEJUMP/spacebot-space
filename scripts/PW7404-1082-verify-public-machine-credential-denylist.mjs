#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationPath = path.join(
  repoRoot,
  "drizzle/migrations/PW7404-1081-01-public-machine-credential-denylist-20260712.sql",
);
const rollbackPath = path.join(
  repoRoot,
  "drizzle/migrations/PW7404-1081-ROLLBACK-refuse-public-credential-reactivation-20260712.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const migrationSha256 = createHash("sha256")
  .update(migration)
  .digest("hex")
  .toUpperCase();

assert.match(migration, /^BEGIN;/u);
assert.match(migration, /COMMIT;\s*$/u);
assert.match(migration, /credential_security_denylist/u);
assert.match(migration, /credential_security_bindings/u);
assert.match(migration, /credential_security_receipts/u);
assert.match(migration, /SECURITY DEFINER/u);
assert.match(migration, /SET search_path = pg_catalog, public/u);
assert.match(migration, /REVOKE ALL/u);
assert.match(migration, /pw7404_guard_denied_agent_credential_trigger/u);
assert.match(migration, /pw7404_guard_denied_agent_primary_mirror_trigger/u);
assert.match(migration, /pw7404_guard_denied_agent_session_trigger/u);
assert.match(migration, /60bdcc1e76e1f3f47143bf5120c2e700d4e080599407d61196f73dd3e46f9330/u);
const bindingPattern = /^\s*\('([0-9a-f-]{36})',\s*'([^']+)',\s*'([0-9a-f]{64})',\s*'([0-9a-f]{64})'\)[,;]$/gmu;
const expectedBindings = [...migration.matchAll(bindingPattern)].map(
  ([, agentId, residentName, deniedLookup, fallbackLookup]) => ({
    agentId,
    residentName,
    deniedLookup,
    fallbackLookup,
  }),
);
assert.equal(expectedBindings.length, 18);
assert.equal(new Set(expectedBindings.map((row) => row.agentId)).size, 18);
assert.equal(new Set(expectedBindings.map((row) => row.deniedLookup)).size, 18);
assert.equal(new Set(expectedBindings.map((row) => row.fallbackLookup)).size, 18);
assert.equal(
  createHash("sha256")
    .update(expectedBindings.map((row) => row.deniedLookup).sort().join("\n"))
    .digest("hex"),
  "60bdcc1e76e1f3f47143bf5120c2e700d4e080599407d61196f73dd3e46f9330",
);
assert.match(rollback, /intentionally no destructive rollback/u);
assert.doesNotMatch(rollback, /DROP TABLE|DELETE FROM|UPDATE public\.agent_credentials/iu);

if (!process.argv.includes("--database")) {
  console.log(
    `PW7404-1082 static credential-denylist contract: PASS (bindings=18; migration-sha256=${migrationSha256})`,
  );
  process.exit(0);
}

dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });
const connectionString =
  process.env.SPACEBOT_ADMIN_DATABASE_URL || process.env.DATABASE_URL;
const caPath = process.env.SPACEBOT_DATABASE_CA_PATH;
if (!connectionString || !caPath) {
  throw new Error("Verified database URL and SPACEBOT_DATABASE_CA_PATH are required");
}
const guards = {
  database: process.env.SPACEBOT_EXPECTED_DATABASE,
  user: process.env.SPACEBOT_EXPECTED_DATABASE_USER,
  address: process.env.SPACEBOT_EXPECTED_SERVER_ADDRESS,
  port: process.env.SPACEBOT_EXPECTED_SERVER_PORT,
  sentinel: process.env.SPACEBOT_EXPECTED_SENTINEL_AGENT_ID,
};
for (const [name, value] of Object.entries(guards)) {
  if (!value || /\s/.test(value)) throw new Error(`Missing expected ${name} guard`);
}

const url = new URL(connectionString);
url.searchParams.delete("sslmode");
const sql = postgres(url.toString(), {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  ssl: {
    rejectUnauthorized: true,
    ca: readFileSync(caPath, "utf8"),
    servername: url.hostname,
  },
});

try {
  const [proof] = await sql`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           EXISTS (SELECT 1 FROM public.agents
                   WHERE id = ${guards.sentinel}::uuid) AS sentinel,
           (SELECT count(*)::int FROM public.credential_security_denylist
            WHERE incident_code = 'PW7404-1077') AS denied,
           (SELECT count(*)::int FROM public.credential_security_bindings
            WHERE incident_code = 'PW7404-1077') AS bindings,
           (SELECT count(*)::int FROM public.agent_credentials credential
            JOIN public.credential_security_denylist denied
              ON denied.lookup_hash = credential.lookup_hash
            WHERE credential.revoked_at IS NULL) AS active_denied,
           (SELECT count(*)::int FROM public.agents agent
            JOIN public.credential_security_denylist denied
              ON denied.lookup_hash = agent.api_key) AS denied_mirrors,
           (SELECT count(*)::int FROM public.agent_browser_sessions session
            JOIN public.agent_credentials credential ON credential.id = session.credential_id
            JOIN public.credential_security_denylist denied
              ON denied.lookup_hash = credential.lookup_hash
            WHERE session.revoked_at IS NULL) AS active_sessions,
           (SELECT count(*)::int FROM public.credential_security_bindings binding
            JOIN public.agents agent ON agent.id = binding.agent_id
            JOIN public.agent_credentials credential
              ON credential.agent_id = agent.id
             AND credential.lookup_hash = agent.api_key
             AND credential.revoked_at IS NULL
            LEFT JOIN public.credential_security_denylist denied
              ON denied.lookup_hash = credential.lookup_hash
            WHERE denied.lookup_hash IS NULL) AS safe_mirrors,
           (SELECT count(*)::int FROM pg_trigger
            WHERE tgname IN (
              'pw7404_guard_denied_agent_credential_trigger',
              'pw7404_guard_denied_agent_primary_mirror_trigger',
              'pw7404_guard_denied_agent_session_trigger',
              'pw7404_preserve_credential_security_denylist_trigger',
              'pw7404_preserve_credential_security_bindings_trigger',
              'pw7404_preserve_credential_security_receipts_trigger'
            ) AND NOT tgisinternal AND tgenabled = 'A') AS triggers,
           (SELECT count(*)::int
            FROM pg_class table_class
            JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
            JOIN pg_roles owner_role ON owner_role.oid = table_class.relowner
            WHERE namespace.nspname = 'public'
              AND table_class.relname IN (
                'credential_security_denylist',
                'credential_security_bindings',
                'credential_security_receipts'
              )
              AND owner_role.rolname <> current_user) AS wrong_owners,
           (SELECT count(*)::int
            FROM pg_class table_class
            JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
            CROSS JOIN LATERAL aclexplode(coalesce(
              table_class.relacl,
              acldefault('r', table_class.relowner)
            )) privilege
            LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
            WHERE namespace.nspname = 'public'
              AND table_class.relname IN (
                'credential_security_denylist',
                'credential_security_bindings',
                'credential_security_receipts'
              )
              AND privilege.grantee <> table_class.relowner
              AND coalesce(grantee.rolsuper, false) = false
              AND privilege.privilege_type IN (
                'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
              )) AS unsafe_acl_grants,
           (SELECT migration_sha256 FROM public.credential_security_receipts
            WHERE migration_id = 'PW7404-1081') AS receipt_sha
  `;
  for (const field of ["database", "user", "address", "port"]) {
    assert.equal(proof[field], guards[field], `target ${field}`);
  }
  assert.equal(proof.sentinel, true);
  assert.equal(proof.denied, 18);
  assert.equal(proof.bindings, 18);
  assert.equal(proof.active_denied, 0);
  assert.equal(proof.denied_mirrors, 0);
  assert.equal(proof.active_sessions, 0);
  assert.equal(proof.safe_mirrors, 18);
  assert.equal(proof.triggers, 6);
  assert.equal(proof.wrong_owners, 0);
  assert.equal(proof.unsafe_acl_grants, 0);
  assert.equal(proof.receipt_sha, migrationSha256);

  const actualBindings = await sql`
    SELECT binding.agent_id::text AS agent_id,
           binding.resident_name,
           binding.denied_lookup_hash,
           binding.approved_fallback_lookup_hash,
           agent.name AS canonical_name
    FROM public.credential_security_bindings binding
    JOIN public.agents agent ON agent.id = binding.agent_id
    WHERE binding.incident_code = 'PW7404-1077'
    ORDER BY binding.agent_id
  `;
  assert.deepEqual(
    actualBindings.map((row) => ({
      agentId: row.agent_id,
      residentName: row.resident_name,
      canonicalName: row.canonical_name,
      deniedLookup: row.denied_lookup_hash,
      fallbackLookup: row.approved_fallback_lookup_hash,
    })),
    expectedBindings
      .map((row) => ({ ...row, canonicalName: row.residentName }))
      .sort((left, right) => left.agentId.localeCompare(right.agentId)),
  );

  await sql.unsafe(`
    BEGIN;
    SET LOCAL session_replication_role = 'replica';
    DO $pw7404_negative_tests$
    DECLARE
      test_binding record;
      denied_credential_id uuid;
      blocked boolean;
    BEGIN
      FOR test_binding IN
        SELECT * FROM public.credential_security_bindings
        WHERE incident_code = 'PW7404-1077'
        ORDER BY denied_lookup_hash
      LOOP
        SELECT id INTO denied_credential_id
        FROM public.agent_credentials
        WHERE lookup_hash = test_binding.denied_lookup_hash;

        blocked := false;
        BEGIN
          UPDATE public.agent_credentials
          SET revoked_at = NULL
          WHERE id = denied_credential_id;
        EXCEPTION WHEN SQLSTATE 'P7404' THEN blocked := true;
        END;
        IF NOT blocked THEN RAISE EXCEPTION 'credential reactivation was not blocked'; END IF;

        blocked := false;
        BEGIN
          UPDATE public.agent_credentials
          SET lookup_hash = repeat('a', 64)
          WHERE id = denied_credential_id;
        EXCEPTION WHEN SQLSTATE 'P7404' THEN blocked := true;
        END;
        IF NOT blocked THEN RAISE EXCEPTION 'credential lookup-away update was not blocked'; END IF;

        blocked := false;
        BEGIN
          DELETE FROM public.agent_credentials WHERE id = denied_credential_id;
        EXCEPTION WHEN SQLSTATE 'P7404' THEN blocked := true;
        END;
        IF NOT blocked THEN RAISE EXCEPTION 'credential tombstone deletion was not blocked'; END IF;

        blocked := false;
        BEGIN
          UPDATE public.agents
          SET api_key = test_binding.denied_lookup_hash
          WHERE id = test_binding.agent_id;
        EXCEPTION WHEN SQLSTATE 'P7404' THEN blocked := true;
        END;
        IF NOT blocked THEN RAISE EXCEPTION 'primary mirror test was not blocked'; END IF;

        blocked := false;
        BEGIN
          INSERT INTO public.agent_browser_sessions (
            agent_id, credential_id, token_hash, expires_at
          ) VALUES (
            test_binding.agent_id, denied_credential_id,
            md5(test_binding.denied_lookup_hash) || md5(test_binding.agent_id::text),
            now() + interval '1 minute'
          );
        EXCEPTION WHEN SQLSTATE 'P7404' THEN blocked := true;
        END;
        IF NOT blocked THEN RAISE EXCEPTION 'session activation test was not blocked'; END IF;
      END LOOP;
    END
    $pw7404_negative_tests$;
    ROLLBACK;
  `);

  console.log(
    "PW7404-1082 database credential-denylist proof: PASS (denied=18; active=0; safe-mirrors=18; replica-mode-negative-tests=90)",
  );
} finally {
  await sql.end({ timeout: 5 });
}
