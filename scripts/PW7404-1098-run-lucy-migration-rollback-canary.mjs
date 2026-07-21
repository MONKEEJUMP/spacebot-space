import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationPath = path.join(
  repoRoot,
  "drizzle/migrations/PW7404-1086-01-canonical-lucy-autonomy-ledger-20260712.sql",
);
const expectedMigrationSha256 =
  "7B33208B75A2BF554E7BB73489050BDE720A9992858C9874AEE63086D81ECD89";
const urlFile = process.env.SPACEBOT_ADMIN_DATABASE_URL_FILE;
const caPath = process.env.SPACEBOT_DATABASE_CA_PATH;
if (!urlFile || !caPath) {
  throw new Error("Root-only database URL file and CA path are required");
}
const migration = fs.readFileSync(migrationPath, "utf8");
const migrationSha256 = crypto
  .createHash("sha256")
  .update(migration)
  .digest("hex")
  .toUpperCase();
if (migrationSha256 !== expectedMigrationSha256) {
  throw new Error("Migration digest mismatch");
}
const ca = fs.readFileSync(caPath, "utf8");
const caSha256 = crypto
  .createHash("sha256")
  .update(ca)
  .digest("hex")
  .toUpperCase();
if (caSha256 !== process.env.SPACEBOT_EXPECTED_DATABASE_CA_SHA256) {
  throw new Error("Database CA digest mismatch");
}
const databaseUrl = new URL(fs.readFileSync(urlFile, "utf8").trim());
if (databaseUrl.hostname !== process.env.SPACEBOT_EXPECTED_DATABASE_HOSTNAME) {
  throw new Error("Database hostname mismatch");
}
databaseUrl.searchParams.delete("sslmode");
const tlsServername = process.env.SPACEBOT_DATABASE_TLS_SERVERNAME;
if (!tlsServername) throw new Error("Database TLS server name is required");
const sql = postgres(databaseUrl.toString(), {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  ssl: { rejectUnauthorized: true, ca, servername: tlsServername },
});

const expectedTarget = {
  database: process.env.SPACEBOT_EXPECTED_DATABASE,
  user: process.env.SPACEBOT_EXPECTED_DATABASE_USER,
  address: process.env.SPACEBOT_EXPECTED_SERVER_ADDRESS,
  port: process.env.SPACEBOT_EXPECTED_SERVER_PORT,
};
const manifestOverrideCount = Number(
  process.env.SPACEBOT_CANARY_MANIFEST_OVERRIDE_COUNT ?? "0",
);
const manifestOverrideSha256 =
  process.env.SPACEBOT_CANARY_MANIFEST_OVERRIDE_SHA256 ?? "";
const usesManifestOverride = manifestOverrideCount > 0;
if (
  process.env.SPACEBOT_ROLLBACK_CANARY !== "PW7404-1098" ||
  !/(?:candidate|canary|test|shadow)/i.test(expectedTarget.database ?? "")
) {
  throw new Error(
    "PW7404-1098 requires explicit confirmation for a disposable database",
  );
}
if (
  usesManifestOverride &&
  (!expectedTarget.database?.startsWith("pw1051_candidate_") ||
    !Number.isSafeInteger(manifestOverrideCount) ||
    !/^[0-9a-f]{64}$/.test(manifestOverrideSha256))
) {
  throw new Error("Manifest override is restricted to the isolated candidate");
}
for (const [name, value] of Object.entries(expectedTarget)) {
  if (!value || /\s/.test(value))
    throw new Error(`Missing target guard: ${name}`);
}

async function target(client = sql) {
  const [row] = await client`
    SELECT current_database() AS database,
           current_user AS user,
           inet_server_addr()::text AS address,
           inet_server_port()::text AS port
  `;
  return row;
}

async function baseline(client = sql) {
  const [row] = await client`
    SELECT jsonb_build_object(
      'control', to_regclass('public.lucy_autonomy_control'),
      'controlEvents', to_regclass('public.lucy_autonomy_control_events'),
      'runs', to_regclass('public.lucy_autonomy_runs'),
      'delegations', to_regclass('public.resident_autonomy_delegations'),
      'delegationEvents', to_regclass('public.resident_autonomy_delegation_events')
    ) AS state
  `;
  return row.state;
}

const rollbackMarker = "PW7404_1098_FORCED_ROLLBACK";
let proof;
try {
  const actualTarget = await target();
  for (const [name, expected] of Object.entries(expectedTarget)) {
    if (actualTarget?.[name] !== expected) {
      throw new Error(`Database target guard failed: ${name}`);
    }
  }
  const before = await baseline();
  try {
    await sql.begin(async (transaction) => {
      await transaction.unsafe("SET LOCAL lock_timeout = '5s'");
      await transaction.unsafe("SET LOCAL statement_timeout = '90s'");
      await transaction.unsafe(
        "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public",
      );
      let body = migration
        .replace(/^BEGIN;\s*$/m, "")
        .replace(/^COMMIT;\s*$/m, "");
      if (usesManifestOverride) {
        body = body
          .replace(
            "selected_count <> 246 OR selected_sha256 <> '8702c3be7068295ed1300ae659705cd4e85bc32adfcccce430e0c6014f9d456e'",
            `selected_count <> ${manifestOverrideCount} OR selected_sha256 <> '${manifestOverrideSha256}'`,
          )
          .replace(
            "granted_delegations <> 246 OR matching_events <> 246",
            `granted_delegations <> ${manifestOverrideCount} OR matching_events <> ${manifestOverrideCount}`,
          );
      }
      await transaction.unsafe(body);
      const [state] = await transaction`
        SELECT
          ((SELECT count(*) = 1 FROM lucy_autonomy_control)
            AND EXISTS (
              SELECT 1 FROM lucy_autonomy_control
              WHERE singleton_id = 1 AND mode = 'disabled' AND revision = 1
                AND canary_resident_id IS NULL
                AND allowed_actions = ARRAY['rest']::text[]
                AND max_residents = 1
            )) AS disabled_default,
          (SELECT count(*) = 1 FROM lucy_autonomy_control_events
            WHERE control_revision = 1 AND event_type = 'initialized')
            AS initial_event,
          (SELECT count(*) = ${
            usesManifestOverride ? manifestOverrideCount : 246
          } FROM resident_autonomy_delegations
            WHERE manifest_id = 'PW7404-1086-spacebot-founding-residents-v1')
            AS founding_delegations,
          (SELECT count(*) = ${
            usesManifestOverride ? manifestOverrideCount : 246
          }
             FROM resident_autonomy_delegation_events AS event
             JOIN resident_autonomy_delegations AS delegation
               ON delegation.id = event.delegation_id
            WHERE delegation.manifest_id = 'PW7404-1086-spacebot-founding-residents-v1'
              AND event.event_type = 'granted') AS founding_events,
          (SELECT count(*) = 4 FROM pg_trigger
            WHERE tgrelid IN (
                'resident_autonomy_delegation_events'::regclass,
                'lucy_autonomy_control_events'::regclass
              )
              AND tgname IN (
                'resident_autonomy_delegation_events_immutable_row',
                'resident_autonomy_delegation_events_immutable_truncate',
                'lucy_autonomy_control_events_immutable_row',
                'lucy_autonomy_control_events_immutable_truncate'
              )
              AND tgenabled = 'A' AND NOT tgisinternal) AS immutable_triggers,
          NOT has_table_privilege(
            'spacebot_runtime', 'lucy_autonomy_control', 'INSERT,UPDATE,DELETE'
          ) AS runtime_control_write_denied,
          NOT has_function_privilege(
            'spacebot_runtime',
            'spacebot_set_lucy_autonomy_mode(bigint,character varying,uuid,character varying,text,character varying)',
            'EXECUTE'
          ) AS runtime_mode_change_denied,
          NOT has_function_privilege(
            'spacebot_runtime',
            'spacebot_emergency_disable_lucy_autonomy(character varying,text,character varying)',
            'EXECUTE'
          ) AS runtime_emergency_change_denied,
          (NOT has_function_privilege(
            'spacebot_runtime',
            'spacebot_set_resident_autonomy_delegation(uuid,text[],integer,integer,integer,integer,timestamp with time zone,character varying)',
            'EXECUTE'
          ) AND NOT has_function_privilege(
            'spacebot_runtime',
            'spacebot_set_resident_autonomy_status(uuid,character varying,character varying)',
            'EXECUTE'
          )) AS runtime_delegation_change_denied,
          (SELECT count(*) = 0 FROM lucy_autonomy_runs) AS zero_runs
      `;
      if (!Object.values(state).every((value) => value === true)) {
        throw new Error(
          `Migration canary invariant failed: ${JSON.stringify(state)}`,
        );
      }
      proof = state;
      throw new Error(rollbackMarker);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== rollbackMarker) {
      throw error;
    }
  }
  const after = await baseline();
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error("Rollback canary left database residue");
  }
  console.log(
    JSON.stringify({
      artifact: "PW7404-1098",
      migrationSha256,
      caSha256,
      target: actualTarget,
      proof,
      manifestOverride: usesManifestOverride
        ? { count: manifestOverrideCount, sha256: manifestOverrideSha256 }
        : null,
      rollbackRestoredBaseline: true,
    }),
  );
} finally {
  await sql.end({ timeout: 5 });
}
