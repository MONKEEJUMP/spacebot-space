#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const migrationPath = path.join(
  repoRoot,
  "drizzle/migrations/PW7404-1081-01-public-machine-credential-denylist-20260712.sql",
);
const migrationSha256 = createHash("sha256")
  .update(readFileSync(migrationPath))
  .digest("hex")
  .toUpperCase();
const connectionString =
  process.env.SPACEBOT_ADMIN_DATABASE_URL || process.env.DATABASE_URL;
const caPath = process.env.SPACEBOT_DATABASE_CA_PATH;
const apply = process.argv.includes("--apply");
const expectedConfirmation = "PW7404-1081";

if (!connectionString) {
  throw new Error("SPACEBOT_ADMIN_DATABASE_URL or DATABASE_URL is required");
}
if (apply && !process.env.SPACEBOT_ADMIN_DATABASE_URL) {
  throw new Error("SPACEBOT_ADMIN_DATABASE_URL is required for --apply");
}
if (!caPath) throw new Error("SPACEBOT_DATABASE_CA_PATH is required");
if (
  apply &&
  process.env.SPACEBOT_APPLY_PUBLIC_CREDENTIAL_DENYLIST !==
    expectedConfirmation
) {
  throw new Error(
    `Set SPACEBOT_APPLY_PUBLIC_CREDENTIAL_DENYLIST=${expectedConfirmation} before --apply`,
  );
}
if (apply && process.env.SPACEBOT_TRAFFIC_FENCED !== expectedConfirmation) {
  throw new Error(`Set SPACEBOT_TRAFFIC_FENCED=${expectedConfirmation} after fencing traffic`);
}

const guards = {
  database: process.env.SPACEBOT_EXPECTED_DATABASE,
  user: process.env.SPACEBOT_EXPECTED_DATABASE_USER,
  address: process.env.SPACEBOT_EXPECTED_SERVER_ADDRESS,
  port: process.env.SPACEBOT_EXPECTED_SERVER_PORT,
  sentinel: process.env.SPACEBOT_EXPECTED_SENTINEL_AGENT_ID,
  hostname: process.env.SPACEBOT_EXPECTED_DATABASE_HOSTNAME,
};
for (const [name, value] of Object.entries(guards)) {
  if (!value || /\s/.test(value)) {
    throw new Error(`Set a whitespace-free SPACEBOT expected ${name} guard`);
  }
}
if (!/^\d+$/.test(guards.port) || !/^[0-9a-f-]{36}$/iu.test(guards.sentinel)) {
  throw new Error("Expected port or sentinel guard has an invalid shape");
}

const ca = readFileSync(caPath, "utf8");
const caSha256 = createHash("sha256")
  .update(readFileSync(caPath))
  .digest("hex")
  .toUpperCase();
if (
  !process.env.SPACEBOT_EXPECTED_DATABASE_CA_SHA256 ||
  caSha256 !== process.env.SPACEBOT_EXPECTED_DATABASE_CA_SHA256.toUpperCase()
) {
  throw new Error("Pinned database CA fingerprint guard failed");
}
if (apply && process.platform === "linux") {
  const caStat = statSync(caPath);
  if (!caStat.isFile() || caStat.isSymbolicLink() || caStat.uid !== 0 || (caStat.mode & 0o022) !== 0) {
    throw new Error("Pinned database CA ownership or mode guard failed");
  }
}
const databaseUrl = new URL(connectionString);
if (databaseUrl.hostname !== guards.hostname) {
  throw new Error("Database hostname guard failed");
}
const verifiedUrl = new URL(databaseUrl);
verifiedUrl.searchParams.delete("sslmode");
const sql = postgres(verifiedUrl.toString(), {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  ssl: {
    rejectUnauthorized: true,
    ca,
    servername: databaseUrl.hostname,
  },
});

async function assertTarget() {
  const [target] = await sql`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           EXISTS (
             SELECT 1 FROM public.agents
             WHERE id = ${guards.sentinel}::uuid
           ) AS sentinel
  `;
  const mismatches = [];
  for (const field of ["database", "user", "address", "port"]) {
    if (target[field] !== guards[field]) mismatches.push(field);
  }
  if (!target.sentinel) mismatches.push("sentinel");
  if (mismatches.length > 0) {
    throw new Error(`Refusing wrong database target: ${mismatches.join(", ")}`);
  }
}

async function inspect() {
  const [state] = await sql`
    SELECT
      to_regclass('public.credential_security_denylist') IS NOT NULL AS denylist_table,
      to_regclass('public.credential_security_bindings') IS NOT NULL AS bindings_table,
      to_regclass('public.credential_security_receipts') IS NOT NULL AS receipts_table
  `;
  if (!state.denylist_table || !state.bindings_table || !state.receipts_table) {
    return { failures: ["security schema is not installed"] };
  }

  const [proof] = await sql`
    SELECT
      (SELECT count(*)::int FROM public.credential_security_denylist
       WHERE incident_code = 'PW7404-1077') AS denied,
      (SELECT count(*)::int FROM public.credential_security_bindings
       WHERE incident_code = 'PW7404-1077') AS bindings,
      (SELECT count(*)::int
       FROM public.agent_credentials credential
       JOIN public.credential_security_denylist denied
         ON denied.lookup_hash = credential.lookup_hash
       WHERE credential.revoked_at IS NULL) AS active_denied,
      (SELECT count(*)::int
       FROM public.agents agent
       JOIN public.credential_security_denylist denied
         ON denied.lookup_hash = agent.api_key) AS denied_mirrors,
      (SELECT count(*)::int
       FROM public.agent_browser_sessions session
       JOIN public.agent_credentials credential ON credential.id = session.credential_id
       JOIN public.credential_security_denylist denied
         ON denied.lookup_hash = credential.lookup_hash
       WHERE session.revoked_at IS NULL) AS active_denied_sessions,
      (SELECT count(*)::int
       FROM public.credential_security_bindings binding
       JOIN public.agents agent ON agent.id = binding.agent_id
       JOIN public.agent_credentials credential
         ON credential.agent_id = agent.id
        AND credential.lookup_hash = agent.api_key
        AND credential.revoked_at IS NULL
       LEFT JOIN public.credential_security_denylist denied
         ON denied.lookup_hash = credential.lookup_hash
       WHERE denied.lookup_hash IS NULL) AS safe_primary_mirrors,
      (SELECT count(*)::int FROM pg_trigger
       WHERE tgname IN (
         'pw7404_guard_denied_agent_credential_trigger',
         'pw7404_guard_denied_agent_primary_mirror_trigger',
         'pw7404_guard_denied_agent_session_trigger',
         'pw7404_preserve_credential_security_denylist_trigger',
         'pw7404_preserve_credential_security_bindings_trigger',
         'pw7404_preserve_credential_security_receipts_trigger'
       ) AND NOT tgisinternal AND tgenabled = 'A') AS enabled_triggers,
      (SELECT migration_sha256
       FROM public.credential_security_receipts
       WHERE migration_id = 'PW7404-1081') AS recorded_sha256
  `;
  const failures = [];
  for (const [field, expected] of [
    ["denied", 18],
    ["bindings", 18],
    ["active_denied", 0],
    ["denied_mirrors", 0],
    ["active_denied_sessions", 0],
    ["safe_primary_mirrors", 18],
    ["enabled_triggers", 6],
  ]) {
    if (proof[field] !== expected) failures.push(`${field}:${proof[field]}`);
  }
  if (proof.recorded_sha256 !== migrationSha256) {
    failures.push("migration receipt hash mismatch");
  }
  return { failures, proof };
}

function applyMigration() {
  const psql = process.env.SPACEBOT_PSQL_BIN || "psql";
  const result = spawnSync(
    psql,
    [
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `PW7404_EXPECTED_DATABASE=${guards.database}`,
      "-v",
      `PW7404_EXPECTED_DATABASE_USER=${guards.user}`,
      "-v",
      `PW7404_EXPECTED_SERVER_ADDRESS=${guards.address}`,
      "-v",
      `PW7404_EXPECTED_SERVER_PORT=${guards.port}`,
      "-v",
      `PW7404_EXPECTED_SENTINEL_AGENT_ID=${guards.sentinel}`,
      "-v",
      `PW7404_MIGRATION_SHA256=${migrationSha256}`,
      "-f",
      migrationPath,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PGHOST: databaseUrl.hostname,
        PGPORT: databaseUrl.port || "5432",
        PGDATABASE: decodeURIComponent(databaseUrl.pathname.replace(/^\//u, "")),
        PGUSER: decodeURIComponent(databaseUrl.username),
        PGPASSWORD: decodeURIComponent(databaseUrl.password),
        PGSSLMODE: "verify-full",
        PGSSLROOTCERT: caPath,
      },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`psql migration failed with exit ${result.status ?? "unknown"}`);
  }
}

try {
  await assertTarget();
  if (apply) applyMigration();
  const result = await inspect();
  if (result.failures.length > 0) {
    throw new Error(`PW7404-1081 failed: ${result.failures.join(", ")}`);
  }
  console.log(
    `PW7404-1081 public credential denylist: PASS (${apply ? "apply" : "check"}; denied=18; bindings=18; active=0; safe-mirrors=18)`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
