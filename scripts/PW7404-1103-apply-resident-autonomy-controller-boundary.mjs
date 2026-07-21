import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const ARTIFACT = "PW7404-1103";
const CONFIRMATION = "PW7404-1103";
const EXPECTED_MIGRATION_SHA256 =
  "22F7AD3B7ED714F13CBED804A52945ED90A5279434AC8219CC78A104E103CBD4";
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });

const migrationPath = path.join(
  repoRoot,
  "drizzle/migrations/PW7404-1101-01-resident-autonomy-controller-boundary-20260712.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const migrationSha256 = crypto
  .createHash("sha256")
  .update(migration)
  .digest("hex")
  .toUpperCase();
if (migrationSha256 !== EXPECTED_MIGRATION_SHA256) {
  throw new Error(
    "PW7404-1101 migration digest does not match reviewed artifact",
  );
}

const apply = process.argv.includes("--apply");
const rollbackCanary = process.argv.includes("--rollback-canary");
if (apply && rollbackCanary) {
  throw new Error("Choose either --apply or --rollback-canary");
}
if (
  process.argv
    .slice(2)
    .some(
      (argument) => argument !== "--apply" && argument !== "--rollback-canary",
    )
) {
  throw new Error("Only --apply or --rollback-canary is supported");
}
if (
  apply &&
  (process.env.SPACEBOT_APPLY_AUTONOMY_CONTROLLER_BOUNDARY !== CONFIRMATION ||
    process.env.SPACEBOT_TRAFFIC_FENCED !== CONFIRMATION)
) {
  throw new Error(
    "PW7404-1103 apply requires explicit confirmation and traffic fencing",
  );
}

const connectionString = process.env.SPACEBOT_ADMIN_DATABASE_URL;
if (!connectionString)
  throw new Error("SPACEBOT_ADMIN_DATABASE_URL is required");
const caPath = process.env.SPACEBOT_DATABASE_CA_PATH;
if (!caPath) throw new Error("SPACEBOT_DATABASE_CA_PATH is required");
const ca = fs.readFileSync(caPath, "utf8");
const actualCaSha256 = crypto
  .createHash("sha256")
  .update(ca)
  .digest("hex")
  .toUpperCase();
if (
  actualCaSha256 !==
  process.env.SPACEBOT_EXPECTED_DATABASE_CA_SHA256?.toUpperCase()
) {
  throw new Error("Pinned database CA fingerprint guard failed");
}

const guards = {
  database: process.env.SPACEBOT_EXPECTED_DATABASE,
  user: process.env.SPACEBOT_EXPECTED_DATABASE_USER,
  address: process.env.SPACEBOT_EXPECTED_SERVER_ADDRESS,
  port: process.env.SPACEBOT_EXPECTED_SERVER_PORT,
  hostname: process.env.SPACEBOT_EXPECTED_DATABASE_HOSTNAME,
  sentinel: process.env.SPACEBOT_EXPECTED_SENTINEL_AGENT_ID,
};
for (const [name, value] of Object.entries(guards)) {
  if (!value || /\s/.test(value))
    throw new Error(`Missing database ${name} guard`);
}
if (
  rollbackCanary &&
  (process.env.SPACEBOT_ROLLBACK_CANARY !== CONFIRMATION ||
    !/(?:candidate|canary|test|shadow)/i.test(guards.database))
) {
  throw new Error(
    "PW7404-1103 rollback canary requires explicit disposable-target confirmation",
  );
}

const databaseUrl = new URL(connectionString);
if (databaseUrl.hostname !== guards.hostname) {
  throw new Error("Database hostname guard failed");
}
const verifiedUrl = new URL(databaseUrl);
verifiedUrl.searchParams.delete("sslmode");
const sql = postgres(verifiedUrl.toString(), {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  ssl: { rejectUnauthorized: true, ca, servername: guards.hostname },
});

async function assertTarget(client = sql) {
  const [target] = await client`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           EXISTS (SELECT 1 FROM public.agents WHERE id = ${guards.sentinel}::uuid)
             AS sentinel,
           EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'spacebot_runtime')
             AS runtime_role,
           (SELECT mode FROM public.lucy_autonomy_control WHERE singleton_id = 1)
             AS autonomy_mode
  `;
  for (const field of ["database", "user", "address", "port"]) {
    if (target?.[field] !== guards[field]) {
      throw new Error(`Database ${field} guard failed`);
    }
  }
  if (!target?.sentinel || !target?.runtime_role) {
    throw new Error("Database sentinel or runtime role guard failed");
  }
  if (target.autonomy_mode !== "disabled") {
    throw new Error("LUCY autonomy must be disabled for boundary migration");
  }
}

async function inspect(client = sql) {
  const [state] = await client`
    SELECT
      to_regclass('public.resident_autonomy_mutation_receipts') IS NOT NULL
        AS receipts,
      to_regprocedure(
        'public.spacebot_mutate_resident_autonomy(text,character varying,bigint,character varying,jsonb)'
      ) IS NOT NULL AS facade,
      to_regprocedure(
        'public.spacebot_set_resident_autonomy_delegation(uuid,text[],integer,integer,integer,integer,timestamp with time zone,character varying)'
      ) IS NULL AS old_delegation_absent,
      to_regprocedure(
        'public.spacebot_set_resident_autonomy_status(uuid,character varying,character varying)'
      ) IS NULL AS old_status_absent,
      NOT has_function_privilege(
        'spacebot_runtime',
        'public.spacebot_mutate_resident_autonomy(text,character varying,bigint,character varying,jsonb)',
        'EXECUTE'
      ) AS runtime_facade_denied,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )) AS privilege
        WHERE procedure.oid = to_regprocedure(
          'public.spacebot_mutate_resident_autonomy(text,character varying,bigint,character varying,jsonb)'
        )
          AND privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
      ) AS public_facade_denied,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )) AS privilege
        WHERE procedure.oid = to_regprocedure(
          'public.spacebot_mutate_resident_autonomy(text,character varying,bigint,character varying,jsonb)'
        )
          AND privilege.grantee <> procedure.proowner
      ) AS facade_acl_owner_only,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )) AS privilege
        WHERE relation.oid = 'public.resident_autonomy_mutation_receipts'::regclass
          AND privilege.grantee <> relation.relowner
      ) AS receipt_acl_owner_only,
      (
        SELECT NOT procedure.prosecdef
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid = 'public.pw7404_sync_agent_primary_credential()'::regprocedure
      ) AS legacy_sync_trigger_invoker,
      NOT has_table_privilege(
        'spacebot_runtime', 'public.resident_autonomy_mutation_receipts', 'SELECT'
      ) AND NOT has_table_privilege(
        'spacebot_runtime', 'public.resident_autonomy_mutation_receipts', 'INSERT'
      ) AND NOT has_table_privilege(
        'spacebot_runtime', 'public.resident_autonomy_mutation_receipts', 'UPDATE'
      ) AND NOT has_table_privilege(
        'spacebot_runtime', 'public.resident_autonomy_mutation_receipts', 'DELETE'
      ) AS runtime_receipts_denied,
      NOT has_table_privilege('spacebot_runtime', 'public.agent_credentials', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agent_credentials', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agent_credentials', 'DELETE')
        AND NOT has_column_privilege(
          'spacebot_runtime', 'public.agent_credentials', 'lookup_hash', 'UPDATE'
        )
        AND NOT has_column_privilege(
          'spacebot_runtime', 'public.agent_credentials', 'agent_id', 'UPDATE'
        )
        AND NOT has_column_privilege(
          'spacebot_runtime', 'public.agent_credentials', 'revoked_at', 'UPDATE'
        )
        AND NOT has_column_privilege(
          'spacebot_runtime', 'public.agent_credentials', 'verifier_hash', 'UPDATE'
        ) AS runtime_credential_identity_denied,
      has_column_privilege(
        'spacebot_runtime', 'public.agent_credentials', 'last_used_at', 'UPDATE'
      ) AS runtime_auth_touch_allowed,
      NOT has_table_privilege('spacebot_runtime', 'public.agents', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agents', 'DELETE')
        AND NOT has_column_privilege(
          'spacebot_runtime', 'public.agents', 'api_key', 'UPDATE'
        ) AND NOT has_column_privilege(
          'spacebot_runtime', 'public.agents', 'api_key_hash', 'UPDATE'
        ) AND NOT has_column_privilege(
          'spacebot_runtime', 'public.agents', 'moderation_status', 'UPDATE'
        ) AND NOT has_column_privilege(
          'spacebot_runtime', 'public.agents', 'is_claimed', 'UPDATE'
        ) AND NOT has_column_privilege(
          'spacebot_runtime', 'public.agents', 'claim_code', 'UPDATE'
        ) AND NOT has_column_privilege(
          'spacebot_runtime', 'public.agents', 'owner_platform', 'UPDATE'
        )
        AS runtime_primary_identity_denied,
      NOT has_table_privilege('spacebot_runtime', 'public.human_agent_links', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'public.human_agent_links', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.human_agent_links', 'DELETE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agent_identity_aliases', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agent_identity_aliases', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agent_identity_aliases', 'DELETE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.bot_profiles', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'public.bot_profiles', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.bot_profiles', 'DELETE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.bot_configs', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'public.bot_configs', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.bot_configs', 'DELETE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.bot_activity', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'public.bot_activity', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.bot_activity', 'DELETE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.bot_profile_history', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'public.bot_profile_history', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.bot_profile_history', 'DELETE')
        AS runtime_projection_writes_denied,
      CASE WHEN to_regclass('public.agent_browser_sessions') IS NULL THEN true ELSE
        NOT has_table_privilege('spacebot_runtime', 'public.agent_browser_sessions', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agent_browser_sessions', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agent_browser_sessions', 'DELETE')
      END AS runtime_session_writes_denied,
      (
        SELECT NOT role.rolbypassrls
        FROM pg_catalog.pg_roles AS role
        WHERE role.rolname = 'spacebot_runtime'
      ) AS runtime_nobypassrls,
      (
        SELECT count(*) = 2
        FROM pg_catalog.pg_trigger AS trigger
        WHERE trigger.tgrelid = 'public.resident_autonomy_mutation_receipts'::regclass
          AND NOT trigger.tgisinternal
          AND trigger.tgenabled = 'A'
          AND trigger.tgname IN (
            'resident_autonomy_mutation_receipts_immutable_row',
            'resident_autonomy_mutation_receipts_immutable_truncate'
          )
      ) AS receipt_immutability
  `;
  return state;
}

async function inspectRollbackSurface(client = sql) {
  const [snapshot] = await client`
    SELECT
      coalesce(
        to_regclass('public.resident_autonomy_mutation_receipts')::text,
        ''
      ) AS receipts,
      coalesce(
        to_regprocedure(
          'public.spacebot_mutate_resident_autonomy(text,character varying,bigint,character varying,jsonb)'
        )::text,
        ''
      ) AS facade,
      coalesce(
        to_regprocedure(
          'public.spacebot_set_resident_autonomy_delegation(uuid,text[],integer,integer,integer,integer,timestamp with time zone,character varying)'
        )::text,
        ''
      ) AS old_delegation,
      coalesce(
        to_regprocedure(
          'public.spacebot_set_resident_autonomy_status(uuid,character varying,character varying)'
        )::text,
        ''
      ) AS old_status,
      coalesce((
        SELECT jsonb_build_object(
          'owner', pg_get_userbyid(procedure.proowner),
          'securityDefiner', procedure.prosecdef,
          'acl', coalesce(procedure.proacl::text, ''),
          'config', coalesce(to_jsonb(procedure.proconfig), '[]'::jsonb)
        )
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid = to_regprocedure(
          'public.pw7404_sync_agent_primary_credential()'
        )
      ), 'null'::jsonb) AS sync_function,
      jsonb_build_object(
        'agentsDelete', has_table_privilege(
          'spacebot_runtime', 'public.agents', 'DELETE'
        ),
        'agentsUpdate', has_table_privilege(
          'spacebot_runtime', 'public.agents', 'UPDATE'
        ),
        'moderationUpdate', has_column_privilege(
          'spacebot_runtime', 'public.agents', 'moderation_status', 'UPDATE'
        ),
        'claimUpdate', has_column_privilege(
          'spacebot_runtime', 'public.agents', 'claim_code', 'UPDATE'
        ),
        'credentialsInsert', has_table_privilege(
          'spacebot_runtime', 'public.agent_credentials', 'INSERT'
        ),
        'credentialsUpdate', has_table_privilege(
          'spacebot_runtime', 'public.agent_credentials', 'UPDATE'
        ),
        'credentialsDelete', has_table_privilege(
          'spacebot_runtime', 'public.agent_credentials', 'DELETE'
        ),
        'verifierUpdate', has_column_privilege(
          'spacebot_runtime', 'public.agent_credentials', 'verifier_hash', 'UPDATE'
        ),
        'linkInsert', has_table_privilege(
          'spacebot_runtime', 'public.human_agent_links', 'INSERT'
        ),
        'aliasInsert', has_table_privilege(
          'spacebot_runtime', 'public.agent_identity_aliases', 'INSERT'
        ),
        'profileInsert', has_table_privilege(
          'spacebot_runtime', 'public.bot_profiles', 'INSERT'
        ),
        'activityInsert', has_table_privilege(
          'spacebot_runtime', 'public.bot_activity', 'INSERT'
        ),
        'sessionInsert', CASE
          WHEN to_regclass('public.agent_browser_sessions') IS NULL THEN NULL
          ELSE has_table_privilege(
            'spacebot_runtime', 'public.agent_browser_sessions', 'INSERT'
          )
        END,
        'bypassRls', (
          SELECT role.rolbypassrls
          FROM pg_catalog.pg_roles AS role
          WHERE role.rolname = 'spacebot_runtime'
        )
      ) AS runtime_acl
  `;
  return snapshot;
}

function verified(state) {
  return state && Object.values(state).every((value) => value === true);
}

try {
  await assertTarget();
  const rollbackBaseline = rollbackCanary
    ? await inspectRollbackSurface()
    : null;
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
        const [before] = await transaction`
          SELECT
            to_regclass('public.resident_autonomy_mutation_receipts') IS NOT NULL
              AS receipts,
            to_regprocedure(
              'public.spacebot_mutate_resident_autonomy(text,character varying,bigint,character varying,jsonb)'
            ) IS NOT NULL AS facade
        `;
        if (before?.receipts || before?.facade) {
          throw new Error(
            "PW7404-1101 boundary is already or partially present",
          );
        }
        await transaction.unsafe(body);
        state = await inspect(transaction);
        if (!verified(state)) {
          throw new Error(
            "PW7404-1103 controller boundary verification failed; migration rolled back",
          );
        }
        if (rollbackCanary) {
          throw new Error("PW7404_1103_ROLLBACK_CANARY_COMPLETE");
        }
      });
    } catch (error) {
      if (
        !rollbackCanary ||
        !(error instanceof Error) ||
        error.message !== "PW7404_1103_ROLLBACK_CANARY_COMPLETE"
      ) {
        throw error;
      }
    }
    if (rollbackCanary) {
      const restored = await inspectRollbackSurface();
      rollbackRestoredBaseline =
        JSON.stringify(restored) === JSON.stringify(rollbackBaseline);
      if (!rollbackRestoredBaseline) {
        throw new Error("PW7404-1103 rollback canary left database residue");
      }
    }
  } else {
    state = await inspect();
  }
  if (!verified(state)) {
    throw new Error("PW7404-1103 controller boundary verification failed");
  }
  console.log(
    JSON.stringify({
      artifact: ARTIFACT,
      mode: apply ? "apply" : rollbackCanary ? "rollback-canary" : "check",
      migrationSha256,
      verified: true,
      rollbackRestoredBaseline,
      state,
    }),
  );
} finally {
  await sql.end({ timeout: 5 });
}
