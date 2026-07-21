import crypto from "node:crypto";
import fs from "node:fs";
import tls from "node:tls";
import postgres from "postgres";

const ARTIFACT = "PW7404-1107";
const CONTROLLER_ROLE = "spacebot_autonomy_controller";
const OWNER_ROLE = "spacebot_autonomy_owner";
const FACADE_SIGNATURE =
  "public.spacebot_mutate_resident_autonomy(text,character varying,bigint,character varying,jsonb)";
const MANIFEST_ID = "PW7404-1086-spacebot-founding-residents-v1";
const MANIFEST_COUNT = 246;
const MANIFEST_SHA256 =
  "8702c3be7068295ed1300ae659705cd4e85bc32adfcccce430e0c6014f9d456e";
const DISPOSABLE_NAME_PATTERN =
  /(?:^|[_-])(disposable|rehearsal|canary|test|verify|verification)(?:[_-]|$)/i;
const CREDENTIAL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

let passed = 0;
let failed = 0;
let cleanupPassed = false;
let stage = "bootstrap";
let failureStage = null;
let failureCode = null;
let cleanupFailureCode = null;
let admin;
let runtime;
let controllerDb;
let lockClient;
let revokerClient;
let fixturePrefix;
const residentIds = new Set();

class VerificationError extends Error {
  constructor(code) {
    super(code);
    this.name = "VerificationError";
  }
}

function required(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new VerificationError("missing_configuration");
}

function check(value, code = "check_failed") {
  if (!value) throw new VerificationError(code);
  passed += 1;
}

async function expectFailure(operation, predicate) {
  try {
    await operation();
  } catch (error) {
    check(predicate(error));
    return;
  }
  throw new VerificationError("unexpected_success");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomCredential() {
  const bytes = crypto.randomBytes(32);
  let suffix = "";
  for (const byte of bytes) suffix += CREDENTIAL_ALPHABET[byte % 64];
  return `botspace_${suffix}`;
}

function parseDatabaseUrl(value, expectedHost, expectedDatabase, expectedUser) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new VerificationError("invalid_database_url");
  }
  check(["postgres:", "postgresql:"].includes(url.protocol));
  check(url.hostname === expectedHost);
  check(decodeURIComponent(url.pathname.slice(1)) === expectedDatabase);
  check(decodeURIComponent(url.username) === expectedUser);
  check(Boolean(url.password));
  url.searchParams.delete("sslmode");
  return url;
}

function databaseClient(url, ca, hostname, applicationName, max = 2) {
  return postgres(url.toString(), {
    max,
    connect_timeout: 10,
    idle_timeout: 5,
    ssl: { rejectUnauthorized: true, ca, servername: hostname },
    connection: {
      application_name: applicationName,
      statement_timeout: "15s",
      lock_timeout: "12s",
      idle_in_transaction_session_timeout: "15s",
    },
  });
}

function isPrivilegeDenied(error) {
  return error?.code === "42501";
}

async function assertIdentity(
  client,
  expected,
  { verifySentinel = false } = {},
) {
  const [identity] = await client`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           current_setting('server_version_num')::integer AS version
  `;
  check(identity?.database === expected.database);
  check(identity?.user === expected.user);
  check(identity?.address === expected.address);
  check(identity?.port === expected.port);
  check(identity?.version >= 120000);
  if (verifySentinel) {
    const [sentinel] = await client`
      SELECT EXISTS (
        SELECT 1 FROM public.agents WHERE id = ${expected.sentinel}::uuid
      ) AS present
    `;
    check(sentinel?.present === true);
  }
}

async function verifyWrongCaFails(url, expectedHost, actualCa) {
  const wrongCa = tls.rootCertificates.find(
    (candidate) => !actualCa.includes(candidate.slice(40, 120)),
  );
  check(Boolean(wrongCa));
  const probe = postgres(url.toString(), {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 1,
    ssl: { rejectUnauthorized: true, ca: wrongCa, servername: expectedHost },
  });
  try {
    await expectFailure(
      () => probe`SELECT 1`,
      (error) =>
        /certificate|issuer|self.signed|tls|ssl/i.test(error?.message ?? "") ||
        [
          "CERT_HAS_EXPIRED",
          "DEPTH_ZERO_SELF_SIGNED_CERT",
          "SELF_SIGNED_CERT_IN_CHAIN",
          "UNABLE_TO_GET_ISSUER_CERT",
          "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
          "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        ].includes(error?.code),
    );
  } finally {
    await probe.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function verifyManifest() {
  const [manifest] = await admin`
    WITH selected AS (
      SELECT bc.agent_id, bc.bot_name
      FROM public.bot_configs AS bc
      JOIN public.agents AS resident ON resident.id = bc.agent_id
      WHERE bc.is_active = true
        AND bc.bot_type IN (
          'expert', 'super_machine', 'minion', 'labbot', 'lab-resident'
        )
        AND resident.moderation_status = 'active'
    ), digest AS (
      SELECT count(*)::integer AS count,
             pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(string_agg(
               agent_id::text || ':' || bot_name,
               E'\\n' ORDER BY agent_id
             ), 'UTF8')), 'hex') AS sha256
      FROM selected
    )
    SELECT digest.count,
           digest.sha256,
           (
             SELECT count(*)::integer
             FROM public.resident_autonomy_delegations
             WHERE manifest_id = ${MANIFEST_ID}
               AND grant_source = 'founding_manifest'
               AND delegate = 'lucy'
               AND status = 'active'
           ) AS delegations,
           (
             SELECT count(*)::integer
             FROM public.resident_autonomy_delegations AS delegation
             JOIN public.resident_autonomy_delegation_events AS event
               ON event.delegation_id = delegation.id
              AND event.resident_id = delegation.resident_id
              AND event.delegation_revision = delegation.revision
              AND event.event_type = 'granted'
             WHERE delegation.manifest_id = ${MANIFEST_ID}
           ) AS events
    FROM digest
  `;
  check(manifest?.count === MANIFEST_COUNT);
  check(manifest?.sha256 === MANIFEST_SHA256);
  check(manifest?.delegations === MANIFEST_COUNT);
  check(manifest?.events === MANIFEST_COUNT);
}

async function verifyRoleBoundary() {
  const [runtimeBoundary] = await admin`
    SELECT
      (SELECT count(*) = 2 AND bool_and(
         rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
         AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls
       ) FROM pg_catalog.pg_roles
       WHERE rolname IN ('spacebot_runtime', 'pw7404_task_maintenance'))
        AS service_flags_exact,
      NOT has_table_privilege('spacebot_runtime', 'public.agents', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agents', 'DELETE')
        AND NOT has_column_privilege('spacebot_runtime', 'public.agents', 'moderation_status', 'UPDATE')
        AND NOT has_column_privilege('spacebot_runtime', 'public.agents', 'is_claimed', 'UPDATE')
        AND NOT has_column_privilege('spacebot_runtime', 'public.agents', 'claim_code', 'UPDATE')
        AND NOT has_column_privilege('spacebot_runtime', 'public.agents', 'owner_platform', 'UPDATE')
        AS resident_authority_denied,
      NOT has_table_privilege('spacebot_runtime', 'public.agent_credentials', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agent_credentials', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agent_credentials', 'DELETE')
        AND NOT has_column_privilege('spacebot_runtime', 'public.agent_credentials', 'agent_id', 'UPDATE')
        AND NOT has_column_privilege('spacebot_runtime', 'public.agent_credentials', 'lookup_hash', 'UPDATE')
        AND NOT has_column_privilege('spacebot_runtime', 'public.agent_credentials', 'verifier_hash', 'UPDATE')
        AND has_column_privilege('spacebot_runtime', 'public.agent_credentials', 'last_used_at', 'UPDATE')
        AS credential_authority_denied,
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
        AS identity_projection_writes_denied,
      CASE WHEN to_regclass('public.agent_browser_sessions') IS NULL THEN true ELSE
        NOT has_table_privilege('spacebot_runtime', 'public.agent_browser_sessions', 'INSERT')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agent_browser_sessions', 'UPDATE')
        AND NOT has_table_privilege('spacebot_runtime', 'public.agent_browser_sessions', 'DELETE')
      END AS session_writes_denied
  `;
  for (const [name, value] of Object.entries(runtimeBoundary ?? {})) {
    check(value === true, `runtime_${name}_failed`);
  }

  const [controllerState] = await admin`
    WITH facade AS (SELECT to_regprocedure(${FACADE_SIGNATURE}) AS oid),
    executable AS (
      SELECT procedure.oid
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.prorettype NOT IN (
          'pg_catalog.trigger'::pg_catalog.regtype,
          'pg_catalog.event_trigger'::pg_catalog.regtype
        )
        AND has_function_privilege(
          ${CONTROLLER_ROLE}, procedure.oid, 'EXECUTE'
        )
    ), direct_execute AS (
      SELECT procedure.oid, privilege.is_grantable
      FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
        procedure.proacl, pg_catalog.acldefault('f', procedure.proowner)
      )) AS privilege
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
      WHERE grantee.rolname = ${CONTROLLER_ROLE}
        AND privilege.privilege_type = 'EXECUTE'
    )
    SELECT
      role.rolcanlogin AND NOT role.rolsuper AND NOT role.rolcreatedb
        AND NOT role.rolcreaterole AND NOT role.rolinherit
        AND NOT role.rolreplication AND NOT role.rolbypassrls
        AND role.rolpassword IS NOT NULL AS flags_exact,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND (
            has_table_privilege(${CONTROLLER_ROLE}, relation.oid, 'SELECT')
            OR has_table_privilege(${CONTROLLER_ROLE}, relation.oid, 'INSERT')
            OR has_table_privilege(${CONTROLLER_ROLE}, relation.oid, 'UPDATE')
            OR has_table_privilege(${CONTROLLER_ROLE}, relation.oid, 'DELETE')
            OR has_table_privilege(${CONTROLLER_ROLE}, relation.oid, 'TRUNCATE')
            OR has_table_privilege(${CONTROLLER_ROLE}, relation.oid, 'REFERENCES')
            OR has_table_privilege(${CONTROLLER_ROLE}, relation.oid, 'TRIGGER')
            OR has_any_column_privilege(
              ${CONTROLLER_ROLE}, relation.oid,
              'SELECT,INSERT,UPDATE,REFERENCES'
            )
          )
      ) AS zero_tables,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS sequence
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = sequence.relnamespace
        WHERE namespace.nspname = 'public' AND sequence.relkind = 'S'
          AND (
            has_sequence_privilege(${CONTROLLER_ROLE}, sequence.oid, 'USAGE')
            OR has_sequence_privilege(${CONTROLLER_ROLE}, sequence.oid, 'SELECT')
            OR has_sequence_privilege(${CONTROLLER_ROLE}, sequence.oid, 'UPDATE')
          )
      ) AS zero_sequences,
      (SELECT count(*) = 1 AND bool_and(executable.oid = facade.oid)
       FROM executable CROSS JOIN facade) AS effective_facade_only,
      (SELECT count(*) = 1
         AND bool_and(direct_execute.oid = facade.oid)
         AND bool_and(NOT direct_execute.is_grantable)
       FROM direct_execute CROSS JOIN facade) AS direct_facade_only
    FROM pg_catalog.pg_authid AS role
    WHERE role.rolname = ${CONTROLLER_ROLE}
  `;
  check(controllerState?.flags_exact === true, "controller_flags_not_exact");
  check(
    controllerState?.zero_tables === true,
    "controller_table_access_present",
  );
  check(
    controllerState?.zero_sequences === true,
    "controller_sequence_access_present",
  );
  check(
    controllerState?.effective_facade_only === true,
    "controller_effective_function_scope_not_exact",
  );
  check(
    controllerState?.direct_facade_only === true,
    "controller_direct_function_scope_not_exact",
  );

  const [ownerState] = await admin`
    WITH expected(table_name, privilege_type) AS (
      VALUES
        ('agents', 'SELECT'),
        ('agent_credentials', 'SELECT'),
        ('resident_autonomy_delegations', 'SELECT'),
        ('resident_autonomy_delegations', 'INSERT'),
        ('resident_autonomy_delegations', 'UPDATE'),
        ('resident_autonomy_delegation_events', 'INSERT'),
        ('resident_autonomy_mutation_receipts', 'SELECT'),
        ('resident_autonomy_mutation_receipts', 'INSERT')
    ), expected_column_acl(table_name, column_name, privilege_type) AS (
      VALUES
        ('agents', 'last_active', 'UPDATE'),
        ('agent_credentials', 'last_used_at', 'UPDATE')
    ), direct_acl AS (
      SELECT relation.relname::text AS table_name,
             privilege.privilege_type,
             privilege.is_grantable
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
        relation.relacl, pg_catalog.acldefault('r', relation.relowner)
      )) AS privilege
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND grantee.rolname = ${OWNER_ROLE}
    ), direct_column_acl AS (
      SELECT relation.relname::text AS table_name,
             attribute.attname::text AS column_name,
             privilege.privilege_type,
             privilege.is_grantable
      FROM pg_catalog.pg_attribute AS attribute
      JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND grantee.rolname = ${OWNER_ROLE}
    ), effective_acl AS (
      SELECT relation.relname::text AS table_name, candidate.privilege_type
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL (
        VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
               ('REFERENCES'), ('TRIGGER')
      ) AS candidate(privilege_type)
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND has_table_privilege(
          ${OWNER_ROLE}, relation.oid, candidate.privilege_type
        )
    )
    SELECT
      NOT role.rolcanlogin AND NOT role.rolsuper AND NOT role.rolcreatedb
        AND NOT role.rolcreaterole AND NOT role.rolinherit
        AND NOT role.rolreplication AND NOT role.rolbypassrls
        AND role.rolpassword IS NULL AS flags_exact,
      (SELECT count(*) = 1
         AND bool_and(procedure.oid = to_regprocedure(${FACADE_SIGNATURE}))
       FROM pg_catalog.pg_proc AS procedure
       JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
       WHERE owner.rolname = ${OWNER_ROLE}) AS function_owner_exact,
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
        WHERE namespace.nspname = 'public' AND owner.rolname = ${OWNER_ROLE}
      ) AS owns_zero_relations,
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
        JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
        WHERE granted.rolname = ${OWNER_ROLE} OR member.rolname = ${OWNER_ROLE}
      ) AS isolated,
      has_schema_privilege(${OWNER_ROLE}, 'public', 'USAGE')
        AND NOT has_schema_privilege(${OWNER_ROLE}, 'public', 'CREATE')
        AND (
          SELECT count(*) = 1
            AND bool_and(privilege.privilege_type = 'USAGE')
            AND bool_and(NOT privilege.is_grantable)
          FROM pg_catalog.pg_namespace AS namespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
            namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner)
          )) AS privilege
          JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
          WHERE namespace.nspname = 'public'
            AND grantee.rolname = ${OWNER_ROLE}
        ) AS schema_exact,
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_database AS database
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
          database.datacl, pg_catalog.acldefault('d', database.datdba)
        )) AS privilege
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE database.datname = current_database()
          AND grantee.rolname = ${OWNER_ROLE}
      ) AS database_acl_empty,
      NOT EXISTS (
        (SELECT table_name, privilege_type FROM direct_acl
         EXCEPT SELECT table_name, privilege_type FROM expected)
      ) AND NOT EXISTS (
        (SELECT table_name, privilege_type FROM expected
         EXCEPT SELECT table_name, privilege_type FROM direct_acl)
      ) AND NOT EXISTS (SELECT 1 FROM direct_acl WHERE is_grantable)
        AND NOT EXISTS (
          (SELECT table_name, privilege_type FROM effective_acl
           EXCEPT SELECT table_name, privilege_type FROM expected)
        ) AND NOT EXISTS (
          (SELECT table_name, privilege_type FROM expected
           EXCEPT SELECT table_name, privilege_type FROM effective_acl)
        ) AND NOT EXISTS (
          (SELECT table_name, column_name, privilege_type FROM direct_column_acl)
          EXCEPT
          (SELECT table_name, column_name, privilege_type FROM expected_column_acl)
        ) AND NOT EXISTS (
          (SELECT table_name, column_name, privilege_type FROM expected_column_acl)
          EXCEPT
          (SELECT table_name, column_name, privilege_type FROM direct_column_acl)
        ) AND NOT EXISTS (
          SELECT 1 FROM direct_column_acl WHERE is_grantable
        ) AS table_acl_exact,
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS sequence
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = sequence.relnamespace
        WHERE namespace.nspname = 'public' AND sequence.relkind = 'S'
          AND (
            has_sequence_privilege(${OWNER_ROLE}, sequence.oid, 'USAGE')
            OR has_sequence_privilege(${OWNER_ROLE}, sequence.oid, 'SELECT')
            OR has_sequence_privilege(${OWNER_ROLE}, sequence.oid, 'UPDATE')
          )
      ) AS zero_sequences,
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_default_acl AS defaults
        CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS privilege
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE grantee.rolname = ${OWNER_ROLE}
      ) AS default_acl_empty,
      NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
          procedure.proacl, pg_catalog.acldefault('f', procedure.proowner)
        )) AS privilege
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
        WHERE grantee.rolname = ${OWNER_ROLE}
          AND procedure.oid <> to_regprocedure(${FACADE_SIGNATURE})
          AND privilege.privilege_type = 'EXECUTE'
      ) AS function_acl_exact
    FROM pg_catalog.pg_authid AS role
    WHERE role.rolname = ${OWNER_ROLE}
  `;
  check(Boolean(ownerState), "owner_role_missing");
  for (const [name, value] of Object.entries(ownerState ?? {}))
    check(value === true, `owner_${name}_failed`);

  const [facade] = await admin`
    SELECT procedure.prosecdef AS security_definer,
           procedure.proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
             AS fixed_search_path,
           pg_get_userbyid(procedure.proowner) = ${OWNER_ROLE} AS owner_exact,
           NOT EXISTS (
             SELECT 1
             FROM pg_catalog.aclexplode(coalesce(
               procedure.proacl,
               pg_catalog.acldefault('f', procedure.proowner)
             )) AS privilege
             WHERE privilege.grantee = 0
               AND privilege.privilege_type = 'EXECUTE'
           ) AS public_denied,
           NOT has_function_privilege(
             'spacebot_runtime', procedure.oid, 'EXECUTE'
           ) AS runtime_denied,
           pg_get_function_identity_arguments(procedure.oid) =
             'p_credential_secret text, p_operation character varying, p_expected_revision bigint, p_idempotency_key character varying, p_payload jsonb'
             AS no_target_argument
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(${FACADE_SIGNATURE})
  `;
  check(Boolean(facade), "facade_missing");
  for (const [name, value] of Object.entries(facade ?? {}))
    check(value === true, `facade_${name}_failed`);
}

async function adminFixtureRegistration(name) {
  const credential = randomCredential();
  const lookupHash = sha256(credential);
  const [agent] = await admin`
    INSERT INTO public.agents (name, api_key, api_key_hash, description)
    VALUES (
      ${name}, ${lookupHash}, ${`pw7404-1107-${sha256(name)}`},
      'PW7404-1107 disposable behavioral verification resident'
    )
    RETURNING id
  `;
  residentIds.add(agent.id);
  const [stored] = await admin`
    SELECT id, agent_id, lookup_hash, revoked_at
    FROM public.agent_credentials
    WHERE agent_id = ${agent.id} AND lookup_hash = ${lookupHash}
  `;
  check(stored?.agent_id === agent.id);
  check(stored?.lookup_hash === lookupHash);
  check(stored?.revoked_at === null);
  return { id: agent.id, credentialId: stored.id, credential, lookupHash };
}

async function authoritySnapshot(actor, target) {
  const [snapshot] = await admin`
    SELECT
      (SELECT to_jsonb(agent) FROM public.agents AS agent
       WHERE agent.id = ${actor.id}) AS actor,
      (SELECT to_jsonb(agent) FROM public.agents AS agent
       WHERE agent.id = ${target.id}) AS target,
      (SELECT to_jsonb(credential) FROM public.agent_credentials AS credential
       WHERE credential.id = ${target.credentialId}) AS credential,
      (SELECT count(*)::integer FROM public.human_agent_links
       WHERE agent_id = ${target.id}) AS links,
      (SELECT count(*)::integer FROM public.agent_identity_aliases
       WHERE canonical_agent_id = ${target.id}) AS aliases,
      (SELECT count(*)::integer FROM public.bot_profiles
       WHERE agent_id = ${target.id}) AS profiles,
      (SELECT count(*)::integer FROM public.bot_configs
       WHERE agent_id = ${target.id}) AS configs,
      (SELECT count(*)::integer FROM public.bot_activity
       WHERE agent_id = ${target.id} OR target_agent_id = ${target.id}) AS activities,
      (SELECT count(*)::integer FROM public.bot_profile_history
       WHERE agent_id = ${target.id}) AS profile_history
  `;
  const [{ sessions_present: sessionsPresent }] = await admin`
    SELECT to_regclass('public.agent_browser_sessions') IS NOT NULL
      AS sessions_present
  `;
  let sessions = null;
  if (sessionsPresent) {
    const [sessionState] = await admin`
      SELECT count(*)::integer AS count
      FROM public.agent_browser_sessions
      WHERE agent_id = ${target.id}
    `;
    sessions = sessionState.count;
  }
  return JSON.stringify({ ...snapshot, sessions });
}

async function verifyCrossResidentAuthorityDenials(actor, target) {
  const before = await authoritySnapshot(actor, target);
  const denied = [
    () => runtime`INSERT INTO public.agents
      (name, api_key, api_key_hash, description)
      VALUES (
        ${`${fixturePrefix}denied-registration`},
        ${sha256(randomCredential())},
        'pw7404-1107-runtime-registration-denied',
        'denied'
      )`,
    () => runtime`DELETE FROM public.agents WHERE id = ${target.id}`,
    () =>
      runtime`UPDATE public.agents SET moderation_status = 'suspended' WHERE id = ${target.id}`,
    () =>
      runtime`UPDATE public.agents SET moderation_status = 'active' WHERE id = ${target.id}`,
    () => runtime`UPDATE public.agents SET is_claimed = true, claim_code = NULL,
      claim_code_expires_at = NULL, owner_platform = 'denied', owner_handle = 'denied'
      WHERE id = ${target.id}`,
    () => runtime`UPDATE public.agent_credentials SET agent_id = ${actor.id}
      WHERE id = ${target.credentialId}`,
    () => runtime`UPDATE public.agent_credentials SET lookup_hash = ${sha256(
      randomCredential(),
    )}
      WHERE id = ${target.credentialId}`,
    () => runtime`UPDATE public.agent_credentials SET verifier_hash = 'denied',
      credential_family = 'legacy', verifier_kind = 'legacy', label = 'denied'
      WHERE id = ${target.credentialId}`,
    () =>
      runtime`DELETE FROM public.agent_credentials WHERE id = ${target.credentialId}`,
    () => runtime`INSERT INTO public.human_agent_links (human_id, agent_id, status)
      SELECT id, ${target.id}, 'active' FROM public.humans ORDER BY id LIMIT 1`,
    () => runtime`UPDATE public.human_agent_links SET status = 'revoked'
      WHERE agent_id = ${target.id}`,
    () =>
      runtime`DELETE FROM public.human_agent_links WHERE agent_id = ${target.id}`,
    () => runtime`INSERT INTO public.agent_identity_aliases
      (legacy_agent_id, canonical_agent_id, normalized_name, reason)
      VALUES (${crypto.randomUUID()}, ${
        target.id
      }, ${fixturePrefix}, 'denied')`,
    () => runtime`UPDATE public.agent_identity_aliases SET canonical_agent_id = ${actor.id}
      WHERE canonical_agent_id = ${target.id}`,
    () => runtime`DELETE FROM public.agent_identity_aliases
      WHERE canonical_agent_id = ${target.id}`,
    () => runtime`INSERT INTO public.bot_profiles (agent_id, bio)
      VALUES (${target.id}, 'denied')`,
    () => runtime`UPDATE public.bot_profiles SET agent_id = ${actor.id}
      WHERE agent_id = ${target.id}`,
    () =>
      runtime`DELETE FROM public.bot_profiles WHERE agent_id = ${target.id}`,
    () => runtime`INSERT INTO public.bot_configs
      (agent_id, bot_name, display_name, bot_type, space)
      VALUES (${
        target.id
      }, ${`${fixturePrefix}denied-config`}, 'denied', 'resident', 'botspace')`,
    () => runtime`UPDATE public.bot_configs SET agent_id = ${actor.id}
      WHERE agent_id = ${target.id}`,
    () => runtime`DELETE FROM public.bot_configs WHERE agent_id = ${target.id}`,
    () => runtime`INSERT INTO public.bot_activity
      (agent_id, activity_type, content)
      VALUES (${target.id}, 'denied', 'denied')`,
    () => runtime`UPDATE public.bot_activity SET agent_id = ${actor.id}
      WHERE agent_id = ${target.id}`,
    () =>
      runtime`DELETE FROM public.bot_activity WHERE agent_id = ${target.id}`,
    () => runtime`INSERT INTO public.bot_profile_history
      (agent_id, field_name, old_value, new_value)
      VALUES (${target.id}, 'denied', NULL, 'denied')`,
    () => runtime`UPDATE public.bot_profile_history SET agent_id = ${actor.id}
      WHERE agent_id = ${target.id}`,
    () => runtime`DELETE FROM public.bot_profile_history
      WHERE agent_id = ${target.id}`,
  ];
  const [{ sessions_present: sessionsPresent }] = await admin`
    SELECT to_regclass('public.agent_browser_sessions') IS NOT NULL
      AS sessions_present
  `;
  if (sessionsPresent) {
    denied.push(
      () => runtime`INSERT INTO public.agent_browser_sessions
        (agent_id, credential_id, token_hash, expires_at)
        VALUES (${target.id}, ${target.credentialId}, ${sha256(
          randomCredential(),
        )},
          now() + interval '15 minutes')`,
      () => runtime`UPDATE public.agent_browser_sessions SET revoked_at = now(),
        revocation_reason = 'denied' WHERE agent_id = ${target.id}`,
      () => runtime`DELETE FROM public.agent_browser_sessions
        WHERE agent_id = ${target.id}`,
    );
  }
  for (const operation of denied) {
    await expectFailure(operation, isPrivilegeDenied);
  }
  check(
    (await authoritySnapshot(actor, target)) === before,
    "cross_resident_authority_changed_rows",
  );
}

async function verifyRuntimeDenials(resident) {
  await expectFailure(
    () => runtime`
      INSERT INTO public.agent_credentials (
        agent_id, lookup_hash, verifier_hash,
        credential_family, verifier_kind, label
      ) VALUES (
        ${resident.id}, ${sha256(randomCredential())}, NULL,
        'machine', 'sha256_lookup', 'pw7404-1107-denied'
      )
    `,
    isPrivilegeDenied,
  );
  for (const column of ["lookup_hash", "agent_id", "revoked_at"]) {
    await expectFailure(
      () =>
        runtime.unsafe(
          `UPDATE public.agent_credentials SET ${column} = ${column} WHERE id = $1`,
          [resident.credentialId],
        ),
      isPrivilegeDenied,
    );
  }
  for (const column of ["api_key", "api_key_hash"]) {
    await expectFailure(
      () =>
        runtime.unsafe(
          `UPDATE public.agents SET ${column} = ${column} WHERE id = $1`,
          [resident.id],
        ),
      isPrivilegeDenied,
    );
  }
  await expectFailure(
    () => runtime`
      SELECT public.spacebot_mutate_resident_autonomy(
        ${resident.credential}::text, 'set'::varchar, 0::bigint,
        'pw7404-1107-runtime-denied'::varchar, '{}'::jsonb
      )
    `,
    isPrivilegeDenied,
  );
}

function controllerEndpoint(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new VerificationError("invalid_controller_url");
  }
  check(url.protocol === "http:");
  check(["127.0.0.1", "localhost", "::1"].includes(url.hostname));
  check(!url.username && !url.password && !url.search && !url.hash);
  return new URL("/v1/resident-autonomy/mutations", url);
}

async function mutate(endpoint, body, timeoutMs = 15000) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let value;
  try {
    value = await response.json();
  } catch {
    throw new VerificationError("invalid_controller_response");
  }
  return { status: response.status, body: value };
}

function request(resident, operation, revision, key, payload) {
  return {
    credential: resident.credential,
    operation,
    expected_revision: revision,
    idempotency_key: key,
    payload,
  };
}

function assertSuccess(response, residentId, revision, status) {
  check(response.status === 200, `${stage}_http_${response.status}`);
  check(response.body?.success === true, `${stage}_success_flag_failed`);
  check(
    response.body?.result?.residentId === residentId,
    `${stage}_resident_id_failed`,
  );
  check(
    response.body?.result?.revision === revision,
    `${stage}_revision_failed`,
  );
  check(response.body?.result?.status === status, `${stage}_status_failed`);
  check(
    JSON.stringify(Object.keys(response.body.result).sort()) ===
      JSON.stringify(["delegationId", "residentId", "revision", "status"]),
    `${stage}_shape_failed`,
  );
}

function assertConflict(response, code) {
  check(response.status === 409, `${stage}_http_${response.status}`);
  check(response.body?.success === false, `${stage}_success_flag_failed`);
  check(response.body?.code === code, `${stage}_code_failed`);
}

async function verifyBehavior(endpoint, resident) {
  const a = {
    allowed_actions: ["post", "comment", "rest"],
    min_post_interval_minutes: 120,
    max_posts_per_24_hours: 2,
    min_comment_interval_minutes: 45,
    max_comments_per_24_hours: 4,
  };
  const b = {
    allowed_actions: ["profile", "learn", "rest"],
    min_post_interval_minutes: 240,
    max_posts_per_24_hours: 1,
    min_comment_interval_minutes: 90,
    max_comments_per_24_hours: 2,
  };

  stage = "verify_behavior_initial_set";
  const initialKey = `pw7404-1107-initial-${crypto.randomUUID()}`;
  const initialRequest = request(resident, "set", 0, initialKey, a);
  const initial = await mutate(endpoint, initialRequest);
  assertSuccess(initial, resident.id, 1, "active");

  stage = "verify_behavior_idempotent_replay";
  const replay = await mutate(endpoint, initialRequest);
  assertSuccess(replay, resident.id, 1, "active");
  check(
    JSON.stringify(replay.body.result) === JSON.stringify(initial.body.result),
  );
  const [initialCounts] = await admin`
    SELECT
      (SELECT count(*)::integer
       FROM public.resident_autonomy_mutation_receipts
       WHERE resident_id = ${resident.id}
         AND idempotency_key_sha256 = ${sha256(initialKey)}) AS receipts,
      (SELECT count(*)::integer
       FROM public.resident_autonomy_delegation_events
       WHERE resident_id = ${resident.id} AND delegation_revision = 1) AS events
  `;
  check(initialCounts.receipts === 1);
  check(initialCounts.events === 1);

  stage = "verify_behavior_idempotency_conflict";
  const changed = await mutate(
    endpoint,
    request(resident, "set", 0, initialKey, b),
  );
  assertConflict(changed, "idempotency_conflict");

  stage = "verify_behavior_pause_resume";
  let revision = 1;
  for (const status of ["paused", "active", "paused"]) {
    const response = await mutate(
      endpoint,
      request(
        resident,
        "status",
        revision,
        `pw7404-1107-status-${revision}-${crypto.randomUUID()}`,
        { status },
      ),
    );
    revision += 1;
    assertSuccess(response, resident.id, revision, status);
  }

  stage = "verify_behavior_preferences_aba";
  for (const [label, payload] of [
    ["a1", a],
    ["b", b],
    ["a2", a],
  ]) {
    const response = await mutate(
      endpoint,
      request(
        resident,
        "set",
        revision,
        `pw7404-1107-${label}-${crypto.randomUUID()}`,
        payload,
      ),
    );
    revision += 1;
    assertSuccess(response, resident.id, revision, "active");
  }
  stage = "verify_behavior_preferences_persisted";
  const [preferences] = await admin`
    SELECT allowed_actions, min_post_interval_minutes, max_posts_per_24_hours,
           min_comment_interval_minutes, max_comments_per_24_hours, revision
    FROM public.resident_autonomy_delegations
    WHERE resident_id = ${resident.id}
  `;
  check(
    JSON.stringify(preferences.allowed_actions) ===
      JSON.stringify(a.allowed_actions),
  );
  check(preferences.min_post_interval_minutes === a.min_post_interval_minutes);
  check(preferences.max_posts_per_24_hours === a.max_posts_per_24_hours);
  check(
    preferences.min_comment_interval_minutes === a.min_comment_interval_minutes,
  );
  check(preferences.max_comments_per_24_hours === a.max_comments_per_24_hours);
  check(Number(preferences.revision) === revision);

  stage = "verify_behavior_stale_revision";
  const stale = await mutate(
    endpoint,
    request(
      resident,
      "status",
      revision - 1,
      `pw7404-1107-stale-${crypto.randomUUID()}`,
      { status: "paused" },
    ),
  );
  assertConflict(stale, "revision_conflict");

  stage = "verify_behavior_same_key_concurrency";
  const sameKey = `pw7404-1107-same-${crypto.randomUUID()}`;
  const sameRequest = request(resident, "status", revision, sameKey, {
    status: "paused",
  });
  const sameResponses = await Promise.all(
    Array.from({ length: 20 }, () => mutate(endpoint, sameRequest)),
  );
  for (const response of sameResponses) {
    assertSuccess(response, resident.id, revision + 1, "paused");
  }
  revision += 1;
  const [sameCounts] = await admin`
    SELECT
      (SELECT count(*)::integer
       FROM public.resident_autonomy_mutation_receipts
       WHERE resident_id = ${resident.id}
         AND idempotency_key_sha256 = ${sha256(sameKey)}) AS receipts,
      (SELECT count(*)::integer
       FROM public.resident_autonomy_delegation_events
       WHERE resident_id = ${resident.id}
         AND delegation_revision = ${revision}) AS events
  `;
  check(sameCounts.receipts === 1);
  check(sameCounts.events === 1);

  stage = "verify_behavior_revision_race";
  const differentResponses = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      mutate(
        endpoint,
        request(
          resident,
          "status",
          revision,
          `pw7404-1107-race-${index}-${crypto.randomUUID()}`,
          { status: "active" },
        ),
      ),
    ),
  );
  const winners = differentResponses.filter(
    (response) => response.status === 200,
  );
  const losers = differentResponses.filter(
    (response) => response.status === 409,
  );
  check(winners.length === 1);
  check(losers.length === 19);
  assertSuccess(winners[0], resident.id, revision + 1, "active");
  for (const loser of losers) assertConflict(loser, "revision_conflict");
  const [raceCounts] = await admin`
    SELECT
      count(*) FILTER (WHERE resulting_revision = ${revision + 1})::integer
        AS receipts,
      (SELECT count(*)::integer
       FROM public.resident_autonomy_delegation_events
       WHERE resident_id = ${resident.id}
         AND delegation_revision = ${revision + 1}) AS events
    FROM public.resident_autonomy_mutation_receipts
    WHERE resident_id = ${resident.id}
  `;
  check(raceCounts.receipts === 1);
  check(raceCounts.events === 1);

  stage = "verify_behavior_target_injection";
  const targeted = await mutate(endpoint, {
    ...request(
      resident,
      "status",
      revision + 1,
      `pw7404-1107-target-${crypto.randomUUID()}`,
      { status: "paused" },
    ),
    resident_id: crypto.randomUUID(),
  });
  check(targeted.status === 400);
  check(targeted.body?.code === "invalid_request");
}

async function waitFor(client, query, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [row] = await query(client);
    if (row?.ready) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new VerificationError("lock_observation_timeout");
}

async function verifyRevocationOrdering(endpoint, beforeLock, admitted) {
  await admin`
    UPDATE public.agent_credentials
    SET revoked_at = now()
    WHERE id = ${beforeLock.credentialId}
  `;
  const rejected = await mutate(
    endpoint,
    request(
      beforeLock,
      "set",
      0,
      `pw7404-1107-revoked-${crypto.randomUUID()}`,
      {
        allowed_actions: ["rest"],
        min_post_interval_minutes: 480,
        max_posts_per_24_hours: 0,
        min_comment_interval_minutes: 90,
        max_comments_per_24_hours: 0,
      },
    ),
  );
  check(rejected.status === 401);
  check(rejected.body?.code === "invalid_credential");
  const [rejectedCounts] = await admin`
    SELECT
      (SELECT count(*)::integer FROM public.resident_autonomy_delegations
       WHERE resident_id = ${beforeLock.id}) AS delegations,
      (SELECT count(*)::integer FROM public.resident_autonomy_mutation_receipts
       WHERE resident_id = ${beforeLock.id}) AS receipts,
      (SELECT count(*)::integer FROM public.resident_autonomy_delegation_events
       WHERE resident_id = ${beforeLock.id}) AS events
  `;
  check(Object.values(rejectedCounts).every((count) => count === 0));

  const lockName = `resident-autonomy-delegation:${admitted.id}`;
  await lockClient`
    SELECT pg_advisory_lock(pg_catalog.hashtextextended(${lockName}, 0))
  `;
  let unlocked = false;
  try {
    const admittedCall = mutate(
      endpoint,
      request(
        admitted,
        "set",
        0,
        `pw7404-1107-admitted-${crypto.randomUUID()}`,
        {
          allowed_actions: ["rest"],
          min_post_interval_minutes: 480,
          max_posts_per_24_hours: 0,
          min_comment_interval_minutes: 90,
          max_comments_per_24_hours: 0,
        },
      ),
    );
    await waitFor(
      admin,
      (client) => client`
      SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_stat_activity
        WHERE datname = current_database()
          AND usename = ${CONTROLLER_ROLE}
          AND application_name = 'spacebot-resident-autonomy-controller'
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND wait_event = 'advisory'
      ) AS ready
    `,
    );
    check(true);

    let revocationSettled = false;
    const revocation = revokerClient`
      UPDATE public.agent_credentials
      SET revoked_at = now()
      WHERE id = ${admitted.credentialId}
      RETURNING revoked_at
    `.then(
      (rows) => {
        revocationSettled = true;
        return rows;
      },
      (error) => {
        revocationSettled = true;
        throw error;
      },
    );
    await waitFor(
      admin,
      (client) => client`
      SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_stat_activity
        WHERE datname = current_database()
          AND application_name = 'pw7404-1107-revoker'
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND wait_event IN ('transactionid', 'tuple')
      ) AS ready
    `,
    );
    check(revocationSettled === false);

    const [unlock] = await lockClient`
      SELECT pg_advisory_unlock(pg_catalog.hashtextextended(${lockName}, 0))
        AS unlocked
    `;
    unlocked = unlock.unlocked === true;
    check(unlocked);
    const mutationResponse = await admittedCall;
    const revocationRows = await revocation;
    assertSuccess(mutationResponse, admitted.id, 1, "active");
    check(revocationRows.length === 1);
    const [ordering] = await admin`
      SELECT credential.revoked_at IS NOT NULL AS revoked,
             receipt.created_at <= credential.revoked_at AS receipt_precedes_revocation,
             event.created_at <= credential.revoked_at AS event_precedes_revocation
      FROM public.agent_credentials AS credential
      JOIN public.resident_autonomy_mutation_receipts AS receipt
        ON receipt.credential_id = credential.id
      JOIN public.resident_autonomy_delegation_events AS event
        ON event.resident_id = credential.agent_id
       AND event.delegation_revision = receipt.resulting_revision
      WHERE credential.id = ${admitted.credentialId}
    `;
    check(ordering?.revoked === true);
    check(ordering?.receipt_precedes_revocation === true);
    check(ordering?.event_precedes_revocation === true);
  } finally {
    if (!unlocked) {
      await lockClient`
        SELECT pg_advisory_unlock(pg_catalog.hashtextextended(${lockName}, 0))
      `.catch(() => undefined);
    }
  }
}

async function cleanupSyntheticRows() {
  if (!admin || !fixturePrefix) {
    cleanupPassed = true;
    return;
  }
  const discovered = await admin`
    SELECT id FROM public.agents WHERE name LIKE ${`${fixturePrefix}%`}
  `;
  for (const row of discovered) residentIds.add(row.id);
  const ids = [...residentIds];
  if (ids.length === 0) {
    cleanupPassed = true;
    return;
  }
  await admin.begin(async (transaction) => {
    await transaction.unsafe("SET LOCAL lock_timeout = '12s'");
    await transaction.unsafe("SET LOCAL statement_timeout = '30s'");
    await transaction.unsafe(
      "ALTER TABLE public.resident_autonomy_mutation_receipts DISABLE TRIGGER resident_autonomy_mutation_receipts_immutable_row",
    );
    await transaction.unsafe(
      "ALTER TABLE public.resident_autonomy_delegation_events DISABLE TRIGGER resident_autonomy_delegation_events_immutable_row",
    );
    await transaction`
      DELETE FROM public.resident_autonomy_mutation_receipts
      WHERE resident_id = ANY(${ids}::uuid[])
    `;
    await transaction`
      DELETE FROM public.resident_autonomy_delegation_events
      WHERE resident_id = ANY(${ids}::uuid[])
    `;
    await transaction`
      DELETE FROM public.resident_autonomy_delegations
      WHERE resident_id = ANY(${ids}::uuid[])
    `;
    const [optional] = await transaction`
      SELECT to_regclass('public.agent_browser_sessions') IS NOT NULL AS sessions
    `;
    if (optional.sessions) {
      await transaction`
        DELETE FROM public.agent_browser_sessions
        WHERE agent_id = ANY(${ids}::uuid[])
      `;
    }
    await transaction`
      DELETE FROM public.human_agent_links WHERE agent_id = ANY(${ids}::uuid[])
    `;
    await transaction`
      DELETE FROM public.agent_identity_aliases
      WHERE canonical_agent_id = ANY(${ids}::uuid[])
    `;
    await transaction`
      DELETE FROM public.bot_profiles WHERE agent_id = ANY(${ids}::uuid[])
    `;
    await transaction`
      DELETE FROM public.bot_configs WHERE agent_id = ANY(${ids}::uuid[])
    `;
    await transaction`
      DELETE FROM public.agent_credentials WHERE agent_id = ANY(${ids}::uuid[])
    `;
    await transaction`
      DELETE FROM public.agents WHERE id = ANY(${ids}::uuid[])
    `;
    await transaction.unsafe(
      "ALTER TABLE public.resident_autonomy_delegation_events ENABLE ALWAYS TRIGGER resident_autonomy_delegation_events_immutable_row",
    );
    await transaction.unsafe(
      "ALTER TABLE public.resident_autonomy_mutation_receipts ENABLE ALWAYS TRIGGER resident_autonomy_mutation_receipts_immutable_row",
    );
  });
  const [remaining] = await admin`
    SELECT
      (SELECT count(*)::integer FROM public.agents
       WHERE id = ANY(${ids}::uuid[])) +
      (SELECT count(*)::integer FROM public.agent_credentials
       WHERE agent_id = ANY(${ids}::uuid[])) +
      (SELECT count(*)::integer FROM public.resident_autonomy_delegations
       WHERE resident_id = ANY(${ids}::uuid[])) +
      (SELECT count(*)::integer FROM public.resident_autonomy_delegation_events
       WHERE resident_id = ANY(${ids}::uuid[])) +
      (SELECT count(*)::integer FROM public.resident_autonomy_mutation_receipts
       WHERE resident_id = ANY(${ids}::uuid[])) AS count
  `;
  check(remaining.count === 0);
  cleanupPassed = true;
}

async function closeClients() {
  await Promise.all(
    [revokerClient, lockClient, controllerDb, runtime, admin]
      .filter(Boolean)
      .map((client) => client.end({ timeout: 3 }).catch(() => undefined)),
  );
}

async function main() {
  stage = "validate_configuration";
  if (process.argv.length !== 2)
    throw new VerificationError("arguments_denied");

  const expectedDatabase = required(
    "SPACEBOT_AUTONOMY_VERIFY_DISPOSABLE_DATABASE",
  );
  const expectedHost = required("SPACEBOT_AUTONOMY_VERIFY_DISPOSABLE_HOST");
  const confirmation = required(
    "SPACEBOT_AUTONOMY_VERIFY_DISPOSABLE_CONFIRMATION",
  );
  check(DISPOSABLE_NAME_PATTERN.test(expectedDatabase));
  check(!/prod(?:uction)?/i.test(expectedDatabase));
  check(confirmation === `${ARTIFACT}:${expectedDatabase}@${expectedHost}`);

  const expected = {
    database: expectedDatabase,
    address: required("SPACEBOT_AUTONOMY_VERIFY_EXPECTED_SERVER_ADDRESS"),
    port: required("SPACEBOT_AUTONOMY_VERIFY_EXPECTED_SERVER_PORT"),
    sentinel: required("SPACEBOT_AUTONOMY_VERIFY_EXPECTED_SENTINEL_AGENT_ID"),
    adminUser: required("SPACEBOT_AUTONOMY_VERIFY_EXPECTED_ADMIN_USER"),
    runtimeUser: required("SPACEBOT_AUTONOMY_VERIFY_EXPECTED_RUNTIME_USER"),
    controllerUser: required(
      "SPACEBOT_AUTONOMY_VERIFY_EXPECTED_CONTROLLER_USER",
    ),
  };
  check(expected.runtimeUser === "spacebot_runtime");
  check(expected.controllerUser === CONTROLLER_ROLE);
  check(/^[0-9a-f-]{36}$/i.test(expected.sentinel));

  const caPath = required(
    "SPACEBOT_AUTONOMY_VERIFY_DATABASE_CA_PATH",
    "SPACEBOT_DATABASE_CA_PATH",
  );
  const expectedCaSha256 = required(
    "SPACEBOT_AUTONOMY_VERIFY_EXPECTED_CA_SHA256",
    "SPACEBOT_EXPECTED_DATABASE_CA_SHA256",
  );
  check(/^[0-9a-f]{64}$/i.test(expectedCaSha256));
  const ca = fs.readFileSync(caPath, "utf8");
  check(
    crypto.createHash("sha256").update(ca).digest("hex").toUpperCase() ===
      expectedCaSha256.toUpperCase(),
  );

  const adminUrl = parseDatabaseUrl(
    required(
      "SPACEBOT_AUTONOMY_VERIFY_ADMIN_DATABASE_URL",
      "SPACEBOT_ADMIN_DATABASE_URL",
    ),
    expectedHost,
    expectedDatabase,
    expected.adminUser,
  );
  const runtimeUrl = parseDatabaseUrl(
    required(
      "SPACEBOT_AUTONOMY_VERIFY_RUNTIME_DATABASE_URL",
      "SPACEBOT_RUNTIME_DATABASE_URL",
    ),
    expectedHost,
    expectedDatabase,
    expected.runtimeUser,
  );
  const controllerUrl = parseDatabaseUrl(
    required(
      "SPACEBOT_AUTONOMY_VERIFY_CONTROLLER_DATABASE_URL",
      "SPACEBOT_AUTONOMY_CONTROLLER_DATABASE_URL",
    ),
    expectedHost,
    expectedDatabase,
    expected.controllerUser,
  );
  const endpoint = controllerEndpoint(
    required(
      "SPACEBOT_AUTONOMY_VERIFY_CONTROLLER_HTTP_URL",
      "SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_URL",
    ),
  );

  admin = databaseClient(adminUrl, ca, expectedHost, "pw7404-1107-admin", 8);
  runtime = databaseClient(
    runtimeUrl,
    ca,
    expectedHost,
    "pw7404-1107-runtime",
    2,
  );
  controllerDb = databaseClient(
    controllerUrl,
    ca,
    expectedHost,
    "pw7404-1107-controller-proof",
    1,
  );
  lockClient = databaseClient(
    adminUrl,
    ca,
    expectedHost,
    "pw7404-1107-advisory-lock",
    1,
  );
  revokerClient = databaseClient(
    adminUrl,
    ca,
    expectedHost,
    "pw7404-1107-revoker",
    1,
  );

  stage = "assert_admin_identity";
  await assertIdentity(
    admin,
    { ...expected, user: expected.adminUser },
    { verifySentinel: true },
  );
  stage = "assert_runtime_identity";
  await assertIdentity(
    runtime,
    { ...expected, user: expected.runtimeUser },
    { verifySentinel: true },
  );
  stage = "assert_controller_identity";
  await assertIdentity(controllerDb, {
    ...expected,
    user: expected.controllerUser,
  });
  stage = "verify_wrong_ca";
  await verifyWrongCaFails(adminUrl, expectedHost, ca);
  stage = "verify_manifest";
  await verifyManifest();
  stage = "verify_role_boundary";
  await verifyRoleBoundary();

  stage = "verify_controller_facade_only";
  await expectFailure(
    () => controllerDb`SELECT 1 FROM public.agents LIMIT 1`,
    isPrivilegeDenied,
  );
  const [controllerFacadeProof] = await controllerDb`
    SELECT has_function_privilege(current_user, ${FACADE_SIGNATURE}, 'EXECUTE')
      AS allowed
  `;
  check(controllerFacadeProof.allowed === true);

  stage = "register_primary_fixture";
  fixturePrefix = `pw1107-${crypto.randomBytes(8).toString("hex")}-`;
  const primary = await adminFixtureRegistration(`${fixturePrefix}primary`);
  const secondary = await adminFixtureRegistration(`${fixturePrefix}secondary`);
  stage = "verify_runtime_denials";
  await verifyRuntimeDenials(primary);
  stage = "verify_cross_resident_authority_denials";
  await verifyCrossResidentAuthorityDenials(primary, secondary);
  stage = "verify_behavior";
  await verifyBehavior(endpoint, primary);

  stage = "register_revocation_fixtures";
  const beforeLock = await adminFixtureRegistration(
    `${fixturePrefix}revoked-first`,
  );
  const admitted = await adminFixtureRegistration(`${fixturePrefix}admitted`);
  stage = "verify_revocation_ordering";
  await verifyRevocationOrdering(endpoint, beforeLock, admitted);
  stage = "complete";
}

try {
  await main();
} catch (error) {
  failureStage = stage;
  failureCode =
    error instanceof VerificationError
      ? error.message
      : error?.code ?? "unexpected_error";
  failed += 1;
} finally {
  try {
    stage = "cleanup";
    await cleanupSyntheticRows();
  } catch (error) {
    cleanupFailureCode =
      error instanceof VerificationError
        ? error.message
        : error?.code ?? "unexpected_error";
    cleanupPassed = false;
    failed += 1;
  }
  await closeClients();
}

const status = failed === 0 && cleanupPassed ? "PASS" : "FAIL";
console.log(
  JSON.stringify({
    artifact: ARTIFACT,
    status,
    counts: { passed, failed },
    cleanup: cleanupPassed ? "PASS" : "FAIL",
    failureStage,
    failureCode,
    cleanupFailureCode,
  }),
);
if (status !== "PASS") process.exitCode = 1;
