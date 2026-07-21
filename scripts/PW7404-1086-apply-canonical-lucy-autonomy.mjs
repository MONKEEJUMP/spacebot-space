import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });

const migrationPath = path.join(
  repoRoot,
  "drizzle/migrations/PW7404-1086-01-canonical-lucy-autonomy-ledger-20260712.sql",
);
const expectedSha256 =
  "7B33208B75A2BF554E7BB73489050BDE720A9992858C9874AEE63086D81ECD89";
const migration = fs.readFileSync(migrationPath, "utf8");
const actualSha256 = crypto
  .createHash("sha256")
  .update(migration)
  .digest("hex")
  .toUpperCase();
if (actualSha256 !== expectedSha256) {
  throw new Error(
    "PW7404-1086 migration digest does not match the reviewed artifact",
  );
}

const connectionString = process.env.SPACEBOT_ADMIN_DATABASE_URL;
const apply = process.argv.includes("--apply");
const rollbackCanary = process.argv.includes("--rollback-canary");
if (apply && rollbackCanary) {
  throw new Error("Choose either --apply or --rollback-canary");
}
const confirmation = "PW7404-1086";
if (!connectionString)
  throw new Error("SPACEBOT_ADMIN_DATABASE_URL is required");
if (
  apply &&
  (process.env.SPACEBOT_APPLY_LUCY_AUTONOMY !== confirmation ||
    process.env.SPACEBOT_TRAFFIC_FENCED !== confirmation)
) {
  throw new Error(
    "PW7404-1086 apply requires explicit confirmation and traffic fencing",
  );
}
const caPath = process.env.SPACEBOT_DATABASE_CA_PATH;
if (!caPath) throw new Error("SPACEBOT_DATABASE_CA_PATH is required");
const ca = fs.readFileSync(caPath, "utf8");
const caSha256 = crypto
  .createHash("sha256")
  .update(ca)
  .digest("hex")
  .toUpperCase();
if (
  caSha256 !== process.env.SPACEBOT_EXPECTED_DATABASE_CA_SHA256?.toUpperCase()
) {
  throw new Error("Pinned database CA fingerprint guard failed");
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
  if (!value || /\s/.test(value))
    throw new Error(`Missing database ${name} guard`);
}
if (
  rollbackCanary &&
  (process.env.SPACEBOT_ROLLBACK_CANARY !== confirmation ||
    !/(?:candidate|canary|test|shadow)/i.test(guards.database))
) {
  throw new Error(
    "PW7404-1086 rollback canary requires explicit disposable-target confirmation",
  );
}
const databaseUrl = new URL(connectionString);
if (databaseUrl.hostname !== guards.hostname)
  throw new Error("Database hostname guard failed");
const verifiedUrl = new URL(databaseUrl);
verifiedUrl.searchParams.delete("sslmode");

const sql = postgres(verifiedUrl.toString(), {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  ssl: { rejectUnauthorized: true, ca, servername: databaseUrl.hostname },
});

async function assertTarget() {
  const [target] = await sql`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           EXISTS (SELECT 1 FROM agents WHERE id = ${guards.sentinel}::uuid)
             AS sentinel
  `;
  for (const field of ["database", "user", "address", "port"]) {
    if (target?.[field] !== guards[field])
      throw new Error(`Database ${field} guard failed`);
  }
  if (!target?.sentinel) throw new Error("Database sentinel guard failed");
}

async function inspect(client = sql) {
  const [state] = await client`
    SELECT
      to_regclass('public.lucy_autonomy_runs') IS NOT NULL AS table_exists,
      to_regclass('public.lucy_autonomy_control') IS NOT NULL AS control_exists,
      to_regclass('public.lucy_autonomy_control_events') IS NOT NULL
        AS control_events_exist,
      to_regclass('public.resident_autonomy_delegations') IS NOT NULL
        AS delegations_exist,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'comments'
          AND column_name = 'metadata'
      ) AS comment_provenance_exists,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'posts'
          AND column_name = 'metadata'
      ) AS post_provenance_exists,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'bot_profiles'
          AND column_name = 'bio_provenance'
      ) AS bio_provenance_exists,
      CASE WHEN to_regclass('public.lucy_autonomy_runs') IS NULL THEN false
        ELSE has_table_privilege(
          'spacebot_runtime', 'lucy_autonomy_runs', 'SELECT,INSERT,UPDATE'
        )
      END AS runtime_write_ok,
      CASE WHEN to_regclass('public.lucy_autonomy_runs') IS NULL THEN false
        ELSE NOT has_table_privilege(
          'spacebot_runtime', 'lucy_autonomy_runs', 'DELETE'
        )
      END AS runtime_delete_denied
      ,CASE WHEN to_regclass('public.resident_autonomy_delegations') IS NULL THEN false
        ELSE has_table_privilege('spacebot_runtime', 'resident_autonomy_delegations', 'SELECT')
          AND NOT has_table_privilege('spacebot_runtime', 'resident_autonomy_delegations', 'INSERT')
          AND NOT has_table_privilege('spacebot_runtime', 'resident_autonomy_delegations', 'UPDATE')
          AND NOT has_table_privilege('spacebot_runtime', 'resident_autonomy_delegations', 'DELETE')
      END AS delegation_acl_ok
      ,CASE WHEN to_regclass('public.resident_autonomy_delegation_events') IS NULL THEN false
        ELSE has_table_privilege('spacebot_runtime', 'resident_autonomy_delegation_events', 'SELECT')
          AND NOT has_table_privilege('spacebot_runtime', 'resident_autonomy_delegation_events', 'INSERT')
          AND NOT has_table_privilege('spacebot_runtime', 'resident_autonomy_delegation_events', 'UPDATE')
          AND NOT has_table_privilege('spacebot_runtime', 'resident_autonomy_delegation_events', 'DELETE')
      END AS event_acl_ok
      ,CASE WHEN to_regclass('public.lucy_autonomy_control') IS NULL THEN false
        ELSE has_table_privilege('spacebot_runtime', 'lucy_autonomy_control', 'SELECT')
          AND NOT has_table_privilege('spacebot_runtime', 'lucy_autonomy_control', 'INSERT')
          AND NOT has_table_privilege('spacebot_runtime', 'lucy_autonomy_control', 'UPDATE')
          AND NOT has_table_privilege('spacebot_runtime', 'lucy_autonomy_control', 'DELETE')
      END AS control_acl_ok
      ,CASE WHEN to_regclass('public.lucy_autonomy_control_events') IS NULL THEN false
        ELSE has_table_privilege('spacebot_runtime', 'lucy_autonomy_control_events', 'SELECT')
          AND NOT has_table_privilege('spacebot_runtime', 'lucy_autonomy_control_events', 'INSERT')
          AND NOT has_table_privilege('spacebot_runtime', 'lucy_autonomy_control_events', 'UPDATE')
          AND NOT has_table_privilege('spacebot_runtime', 'lucy_autonomy_control_events', 'DELETE')
      END AS control_event_acl_ok
      ,NOT EXISTS (
        SELECT 1
        FROM pg_auth_members AS membership
        JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
        JOIN pg_roles AS member_role ON member_role.oid = membership.member
        WHERE granted_role.rolname = 'service_role'
          AND member_role.rolname = 'spacebot_runtime'
          AND membership.set_option
      ) AS runtime_service_role_escalation_denied
      ,NOT coalesce(has_function_privilege(
        'spacebot_runtime',
        to_regprocedure('spacebot_set_resident_autonomy_delegation(uuid,text[],integer,integer,integer,integer,timestamp with time zone,character varying)'),
        'EXECUTE'
      ), false) AS delegation_function_denied
      ,NOT coalesce(has_function_privilege(
        'spacebot_runtime',
        to_regprocedure('spacebot_set_resident_autonomy_status(uuid,character varying,character varying)'),
        'EXECUTE'
      ), false) AS status_function_denied
      ,(
        SELECT count(*) = 2
          AND bool_and(procedure.prosecdef)
          AND bool_and(
            procedure.proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
          )
          AND bool_and(pg_get_userbyid(procedure.proowner) = current_user)
          AND bool_and(NOT has_function_privilege(
            'spacebot_runtime', procedure.oid, 'EXECUTE'
          ))
          AND bool_and(NOT EXISTS (
            SELECT 1
            FROM aclexplode(coalesce(
              procedure.proacl,
              acldefault('f', procedure.proowner)
            )) AS privilege
            WHERE privilege.grantee = 0
              AND privilege.privilege_type = 'EXECUTE'
          ))
        FROM pg_proc AS procedure
        JOIN pg_namespace AS namespace
          ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.proname IN (
            'spacebot_set_resident_autonomy_delegation',
            'spacebot_set_resident_autonomy_status'
          )
      ) AS delegation_functions_secure
      ,(
        SELECT count(*) = 2
          AND bool_and(procedure.prosecdef)
          AND bool_and(
            procedure.proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
          )
          AND bool_and(pg_get_userbyid(procedure.proowner) = current_user)
          AND bool_and(NOT has_function_privilege(
            'spacebot_runtime', procedure.oid, 'EXECUTE'
          ))
          AND bool_and(NOT EXISTS (
            SELECT 1
            FROM aclexplode(coalesce(
              procedure.proacl,
              acldefault('f', procedure.proowner)
            )) AS privilege
            WHERE privilege.grantee = 0
              AND privilege.privilege_type = 'EXECUTE'
          ))
        FROM pg_proc AS procedure
        JOIN pg_namespace AS namespace
          ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.proname IN (
            'spacebot_set_lucy_autonomy_mode',
            'spacebot_emergency_disable_lucy_autonomy'
          )
      ) AS control_functions_secure
      ,(SELECT count(*) = 4
        FROM pg_trigger
        WHERE tgrelid IN (
          to_regclass('public.resident_autonomy_delegation_events'),
          to_regclass('public.lucy_autonomy_control_events')
        )
          AND tgname LIKE '%immutable%'
          AND tgenabled = 'A'
          AND NOT tgisinternal
      ) AS immutable_event_triggers_ok
      ,(SELECT count(*) >= 8 FROM pg_indexes WHERE tablename = 'lucy_autonomy_runs')
        AS ledger_indexes_ok
      ,(SELECT count(*) >= 12 FROM pg_constraint
        WHERE conrelid = to_regclass('public.lucy_autonomy_runs'))
        AS ledger_constraints_ok
      ,(SELECT count(*) = 12 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lucy_autonomy_runs'
          AND column_name IN (
            'command_id', 'resident_id', 'delegation_id',
            'delegation_revision', 'control_revision', 'control_mode',
            'slot_number', 'worker_id',
            'lease_expires_at', 'status', 'payload_sha256', 'result'
          )) AS ledger_shape_ok
      ,(SELECT count(*) = 6 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'resident_autonomy_delegations'
          AND column_name IN (
            'resident_id', 'revision', 'allowed_actions',
            'status', 'expires_at', 'revoked_at'
          )) AS delegation_shape_ok
      ,(SELECT count(*) = 3 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'resident_autonomy_delegation_events'
          AND column_name IN (
            'delegation_id', 'delegation_revision', 'request_fingerprint'
          )) AS event_shape_ok
  `;
  if (state?.control_exists) {
    const [control] = await client`
      SELECT mode, revision, canary_resident_id,
             allowed_actions, max_residents,
             (SELECT count(*)::integer FROM lucy_autonomy_control) AS row_count,
             (SELECT count(*)::integer
                FROM lucy_autonomy_control_events
                WHERE control_revision = lucy_autonomy_control.revision)
               AS revision_event_count
      FROM lucy_autonomy_control
      WHERE singleton_id = 1
    `;
    state.control_default_disabled =
      control?.row_count === 1 &&
      control?.mode === "disabled" &&
      control?.revision === "1" &&
      control?.canary_resident_id === null &&
      Array.isArray(control?.allowed_actions) &&
      control.allowed_actions.length === 1 &&
      control.allowed_actions[0] === "rest" &&
      control?.max_residents === 1 &&
      control?.revision_event_count === 1;
  } else {
    state.control_default_disabled = false;
  }
  return state;
}

function isVerified(state) {
  return (
    state?.table_exists === true &&
    state?.control_exists === true &&
    state?.control_events_exist === true &&
    state?.control_default_disabled === true &&
    state?.delegations_exist === true &&
    state?.comment_provenance_exists === true &&
    state?.post_provenance_exists === true &&
    state?.bio_provenance_exists === true &&
    state?.runtime_write_ok === true &&
    state?.runtime_delete_denied === true &&
    state?.delegation_acl_ok === true &&
    state?.event_acl_ok === true &&
    state?.control_acl_ok === true &&
    state?.control_event_acl_ok === true &&
    state?.runtime_service_role_escalation_denied === true &&
    state?.delegation_function_denied === true &&
    state?.status_function_denied === true &&
    state?.delegation_functions_secure === true &&
    state?.control_functions_secure === true &&
    state?.immutable_event_triggers_ok === true &&
    state?.ledger_indexes_ok === true &&
    state?.ledger_constraints_ok === true &&
    state?.ledger_shape_ok === true &&
    state?.delegation_shape_ok === true &&
    state?.event_shape_ok === true
  );
}

try {
  await assertTarget();
  const rollbackBaseline = rollbackCanary ? await inspect() : null;
  let state;
  let rollbackRestoredBaseline = null;
  if (apply || rollbackCanary) {
    const body = migration
      .replace(/^BEGIN;\s*$/m, "")
      .replace(/^COMMIT;\s*$/m, "");
    try {
      await sql.begin(async (transaction) => {
        await transaction.unsafe("SET LOCAL lock_timeout = '5s'");
        await transaction.unsafe("SET LOCAL statement_timeout = '60s'");
        await transaction.unsafe(body);
        state = await inspect(transaction);
        if (!isVerified(state)) {
          throw new Error(
            "PW7404-1086 post-apply inspection failed; migration rolled back",
          );
        }
        if (rollbackCanary) {
          throw new Error("PW7404_1086_ROLLBACK_CANARY_COMPLETE");
        }
      });
    } catch (error) {
      if (
        !rollbackCanary ||
        !(error instanceof Error) ||
        error.message !== "PW7404_1086_ROLLBACK_CANARY_COMPLETE"
      ) {
        throw error;
      }
    }
    if (rollbackCanary) {
      const restored = await inspect();
      rollbackRestoredBaseline =
        JSON.stringify(restored) === JSON.stringify(rollbackBaseline);
      if (!rollbackRestoredBaseline) {
        throw new Error("PW7404-1086 rollback canary left database residue");
      }
    }
  } else {
    state = await inspect();
  }

  const verified = isVerified(state);
  console.log(
    JSON.stringify({
      artifact: "PW7404-1086",
      migrationSha256: actualSha256,
      mode: apply ? "apply" : rollbackCanary ? "rollback-canary" : "check",
      verified,
      rollbackRestoredBaseline,
      state,
    }),
  );
  if (!verified) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
