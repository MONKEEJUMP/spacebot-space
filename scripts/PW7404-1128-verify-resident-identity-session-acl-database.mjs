import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACT = "PW7404-1128";
const DATABASE = "pw7404_1128_identity_acl_test";
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const clusterToken = crypto.randomBytes(8).toString("hex");
const clusterRoot = `/tmp/pw7404-1128-${process.pid}-${clusterToken}`;
const dataDirectory = `${clusterRoot}/data`;
const socketDirectory = `${clusterRoot}/socket`;
const logPath = `${clusterRoot}/postgres.log`;
const postgresBin = "/usr/lib/postgresql/17/bin";
const postgresPort = 49152 + crypto.randomInt(10_000);
const files = Object.freeze({
  identity: path.join(
    repoRoot,
    "drizzle/migrations/PW7404-1117-01-resident-identity-session-facades-20260713.sql",
  ),
  identityRollback: path.join(
    repoRoot,
    "drizzle/migrations/PW7404-1117-ROLLBACK-resident-identity-session-facades-20260713.sql",
  ),
  cutover: path.join(
    repoRoot,
    "drizzle/migrations/PW7404-1127-01-resident-identity-session-acl-cutover-20260713.sql",
  ),
  cutoverRollback: path.join(
    repoRoot,
    "drizzle/migrations/PW7404-1127-ROLLBACK-resident-identity-session-acl-cutover-20260713.sql",
  ),
});
const expectedDigests = Object.freeze({
  identity: "6C53945CD98474C07B259409DF8C9889D423275D35F890E76EE96A22E898635E",
  identityRollback: "8DAFBF8250B437FEBE69B8DD70EB453CD0CF9F1593A9A65FE4A37E09AE9502FA",
  cutover: "7EE5291CC6B309A16FC0BD7CC09C6B4B4B69FCFFF638454EF57E5E10565D5957",
  cutoverRollback: "CDAF44B5A2306A23FB9CFAF8B739CC1486B91F7340AAB1CC5F15742FE1C0DBB8",
});
const sources = Object.freeze(
  Object.fromEntries(
    Object.entries(files).map(([name, file]) => [name, fs.readFileSync(file, "utf8")]),
  ),
);
const digests = Object.freeze(
  Object.fromEntries(
    Object.entries(sources).map(([name, source]) => [
      name,
      crypto.createHash("sha256").update(source, "utf8").digest("hex").toUpperCase(),
    ]),
  ),
);
assert.deepEqual(digests, expectedDigests, `${ARTIFACT} reviewed SQL digest drift`);

assert.match(DATABASE, /^pw7404_1128_identity_acl_test$/);
assert.ok(!/(prod|production|live|primary|supabase|neon)/i.test(DATABASE));
assert.match(clusterRoot, /^\/tmp\/pw7404-1128-[0-9]+-[0-9a-f]{16}$/);

function runWsl(command, args = [], { input, allowFailure = false } = {}) {
  const result = spawnSync(
    "wsl.exe",
    ["-d", "Ubuntu", "-u", "postgres", "--", command, ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input,
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: process.env.PATH,
      },
      timeout: 120_000,
      windowsHide: true,
    },
  );
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `${ARTIFACT} WSL command failed (${command}): ${result.stderr || result.stdout}`,
    );
  }
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function runPsql(
  database,
  input,
  { allowFailure = false, user = "postgres", verbosity = "sqlstate" } = {},
) {
  assert.match(database, /^(postgres|pw7404_1128_identity_acl_test)$/);
  assert.match(
    user,
    /^(postgres|spacebot_identity_controller|spacebot_runtime|pw7404_task_maintenance|service_role|pw7404_1128_public_probe)$/,
  );
  const result = runWsl(
    `${postgresBin}/psql`,
    [
      "-h",
      socketDirectory,
      "-p",
      String(postgresPort),
      "-U",
      user,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `VERBOSITY=${verbosity}`,
      "-q",
      "-At",
      "-F",
      "\t",
      "-d",
      database,
    ],
    { input, allowFailure },
  );
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `${ARTIFACT} psql failed (${database}): ${result.stderr || result.stdout}`,
    );
  }
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function psql(input) {
  return runPsql(DATABASE, input).stdout;
}

function admin(input) {
  return runPsql("postgres", input).stdout;
}

function psqlAs(user, input, { allowFailure = false } = {}) {
  return runPsql(DATABASE, input, { allowFailure, user });
}

function assertSqlstate(result, expected, label) {
  const sqlstates = result.stderr
    .split(/\r?\n/)
    .filter((line) => line.startsWith("ERROR:"))
    .map((line) => line.match(/^ERROR:\s+([0-9A-Z]{5})$/)?.[1]);
  assert.deepEqual(
    sqlstates,
    [expected],
    `${ARTIFACT} ${label} SQLSTATE`,
  );
}

function expectPrivilegeDenied(role, statement, label) {
  assert.match(role, /^[a-z0-9_]+$/);
  const result = psqlAs(
    role,
    `SELECT session_user, current_user, current_setting('is_superuser');
     ${statement}`,
    { allowFailure: true },
  );
  assert.equal(
    result.stdout.split(/\r?\n/)[0],
    `${role}\t${role}\toff`,
    `${ARTIFACT} ${label} actor binding`,
  );
  assert.notEqual(result.status, 0, `${ARTIFACT} ${label} unexpectedly succeeded`);
  assertSqlstate(result, "42501", label);
}

const fixtureDdl = String.raw`
CREATE EXTENSION pgcrypto WITH SCHEMA public;

CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(50) NOT NULL UNIQUE,
  api_key varchar(100) NOT NULL UNIQUE,
  api_key_hash varchar(255) NOT NULL,
  description text,
  avatar_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  karma integer NOT NULL DEFAULT 0,
  is_verified boolean NOT NULL DEFAULT false,
  is_claimed boolean NOT NULL DEFAULT false,
  resident_visibility varchar(10) NOT NULL DEFAULT 'public',
  moderation_status varchar(10) NOT NULL DEFAULT 'active',
  claim_code varchar(50),
  claim_code_expires_at timestamptz,
  owner_platform varchar(50),
  owner_handle varchar(100),
  last_heartbeat timestamptz,
  last_active timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agents_visibility_check CHECK (
    resident_visibility IN ('public', 'unlisted', 'private')
  ),
  CONSTRAINT agents_moderation_check CHECK (
    moderation_status IN ('active', 'suspended', 'removed')
  )
);
CREATE UNIQUE INDEX agents_name_casefold_unique_idx
  ON public.agents(lower(name));

CREATE TABLE public.agent_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  lookup_hash varchar(100) NOT NULL UNIQUE,
  verifier_hash varchar(255),
  credential_family varchar(20) NOT NULL DEFAULT 'legacy',
  verifier_kind varchar(30) NOT NULL DEFAULT 'legacy',
  label varchar(50) NOT NULL DEFAULT 'legacy-primary',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_credentials_id_agent_unique UNIQUE (id, agent_id),
  CONSTRAINT agent_credentials_family_verifier_check CHECK (
    (credential_family = 'legacy' AND verifier_kind = 'legacy' AND verifier_hash IS NOT NULL)
    OR (credential_family = 'botspace' AND verifier_kind = 'bcrypt' AND verifier_hash IS NOT NULL)
    OR (credential_family = 'machine' AND verifier_kind = 'sha256_lookup' AND verifier_hash IS NULL)
  )
);

CREATE TABLE public.bot_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE CASCADE,
  mood varchar(50),
  bio text
);
CREATE TABLE public.bot_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE CASCADE,
  bot_name varchar(50) NOT NULL UNIQUE,
  display_name varchar(50) NOT NULL,
  bot_type varchar(30) NOT NULL,
  space varchar(30) NOT NULL,
  tagline text,
  specialty text,
  category varchar(50),
  mood varchar(50),
  avatar_seed varchar(100),
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  is_founding boolean NOT NULL DEFAULT false
);
CREATE TABLE public.humans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(50) NOT NULL UNIQUE
);
CREATE TABLE public.human_agent_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id uuid NOT NULL REFERENCES public.humans(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'active'
);
CREATE TABLE public.agent_identity_aliases (
  legacy_agent_id uuid PRIMARY KEY,
  canonical_agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  normalized_name varchar(50) NOT NULL,
  reason text NOT NULL
);

CREATE TABLE public.agent_browser_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revocation_reason varchar(40),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_browser_sessions_credential_agent_fk
    FOREIGN KEY (credential_id, agent_id)
    REFERENCES public.agent_credentials(id, agent_id) ON DELETE CASCADE,
  CONSTRAINT agent_browser_sessions_expiry_check CHECK (
    expires_at > created_at
    AND expires_at <= created_at + interval '30 minutes'
  ),
  CONSTRAINT agent_browser_sessions_revocation_pair_check CHECK (
    (revoked_at IS NULL AND revocation_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)
  )
);
CREATE UNIQUE INDEX agent_browser_sessions_one_active_agent_idx
  ON public.agent_browser_sessions(agent_id) WHERE revoked_at IS NULL;

CREATE TABLE public.credential_security_denylist (
  lookup_hash varchar(100) PRIMARY KEY,
  incident_code varchar(40) NOT NULL,
  exposure_at timestamptz NOT NULL,
  contained_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.spacebot_reject_immutable_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable_event_mutation_rejected';
END
$$;
CREATE FUNCTION public.pw7404_sync_agent_primary_credential()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('pw7404.identity_merge', true) = 'on' THEN RETURN NEW; END IF;
  INSERT INTO public.agent_credentials (
    agent_id, lookup_hash, verifier_hash, credential_family,
    verifier_kind, label, created_at
  ) VALUES (
    NEW.id, NEW.api_key, NEW.api_key_hash,
    'legacy', 'legacy', 'primary-mirror', NEW.created_at
  );
  RETURN NEW;
END
$$;
CREATE TRIGGER pw7404_sync_agent_primary_credential_trigger
AFTER INSERT OR UPDATE OF api_key, api_key_hash ON public.agents
FOR EACH ROW EXECUTE FUNCTION public.pw7404_sync_agent_primary_credential();
CREATE FUNCTION public.pw7404_guard_agent_normalized_name()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(NEW.name), 0));
  IF EXISTS (
    SELECT 1 FROM bot_configs
    WHERE lower(bot_name) = lower(NEW.name) AND agent_id IS DISTINCT FROM NEW.id
  ) THEN RAISE EXCEPTION 'Agent name collides with another resident identity'; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER pw7404_guard_agent_normalized_name_trigger
BEFORE INSERT OR UPDATE OF name ON public.agents
FOR EACH ROW EXECUTE FUNCTION public.pw7404_guard_agent_normalized_name();
CREATE FUNCTION public.pw7404_guard_resident_normalized_name()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.agent_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM agents
    WHERE id = NEW.agent_id AND lower(name) = lower(NEW.bot_name)
  ) THEN RAISE EXCEPTION 'Resident name must match its canonical agent identity'; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER pw7404_guard_resident_normalized_name_trigger
BEFORE INSERT OR UPDATE OF bot_name, agent_id ON public.bot_configs
FOR EACH ROW EXECUTE FUNCTION public.pw7404_guard_resident_normalized_name();
`;

const roleProvisioningDdl = String.raw`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spacebot_runtime') THEN
    CREATE ROLE spacebot_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pw7404_task_maintenance') THEN
    CREATE ROLE pw7404_task_maintenance LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spacebot_identity_controller') THEN
    CREATE ROLE spacebot_identity_controller LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spacebot_identity_owner') THEN
    CREATE ROLE spacebot_identity_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pw7404_1128_public_probe') THEN
    CREATE ROLE pw7404_1128_public_probe LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;
ALTER ROLE spacebot_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE pw7404_task_maintenance LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE spacebot_identity_controller LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE spacebot_identity_owner NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE service_role LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS;
ALTER ROLE pw7404_1128_public_probe LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
COMMENT ON ROLE spacebot_identity_controller IS
  'PW7404-1117:spacebot-space:identity-controller:v1';
COMMENT ON ROLE spacebot_identity_owner IS
  'PW7404-1117:spacebot-space:identity-owner:v1';

GRANT USAGE ON SCHEMA public TO spacebot_runtime, pw7404_task_maintenance,
  spacebot_identity_controller, spacebot_identity_owner, service_role,
  pw7404_1128_public_probe;
GRANT SELECT, INSERT ON public.agents TO spacebot_identity_owner;
GRANT UPDATE (last_active) ON public.agents TO spacebot_identity_owner;
GRANT SELECT, INSERT ON public.agent_credentials TO spacebot_identity_owner;
GRANT UPDATE (last_used_at) ON public.agent_credentials TO spacebot_identity_owner;
GRANT SELECT ON public.credential_security_denylist TO spacebot_identity_owner;
GRANT SELECT, INSERT ON public.bot_profiles, public.bot_configs TO spacebot_identity_owner;
GRANT SELECT, INSERT ON public.agent_browser_sessions TO spacebot_identity_owner;
GRANT UPDATE (last_seen_at, expires_at, revoked_at, revocation_reason)
  ON public.agent_browser_sessions TO spacebot_identity_owner;
GRANT INSERT ON public.resident_identity_session_receipts TO spacebot_identity_owner;
GRANT EXECUTE ON FUNCTION public.crypt(text, text), public.gen_salt(text, integer)
  TO spacebot_identity_owner;

ALTER FUNCTION public.spacebot_register_resident_v1(varchar, text, text)
  OWNER TO spacebot_identity_owner;
ALTER FUNCTION public.spacebot_open_resident_session_v1(text, text, text)
  OWNER TO spacebot_identity_owner;
ALTER FUNCTION public.spacebot_touch_resident_session_v1(text)
  OWNER TO spacebot_identity_owner;
ALTER FUNCTION public.spacebot_rotate_resident_session_v1(text, text)
  OWNER TO spacebot_identity_owner;
ALTER FUNCTION public.spacebot_revoke_resident_session_v1(text, varchar)
  OWNER TO spacebot_identity_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM spacebot_identity_controller;
GRANT EXECUTE ON FUNCTION public.spacebot_register_resident_v1(varchar, text, text),
  public.spacebot_open_resident_session_v1(text, text, text),
  public.spacebot_touch_resident_session_v1(text),
  public.spacebot_rotate_resident_session_v1(text, text),
  public.spacebot_revoke_resident_session_v1(text, varchar)
  TO spacebot_identity_controller;

GRANT SELECT ON public.agents, public.agent_credentials,
  public.agent_browser_sessions, public.human_agent_links,
  public.agent_identity_aliases, public.bot_profiles, public.bot_configs
  TO spacebot_runtime;
GRANT INSERT (name, api_key, api_key_hash, description, avatar_url, metadata)
  ON public.agents TO spacebot_runtime;
GRANT UPDATE (last_heartbeat, last_active) ON public.agents TO spacebot_runtime;
GRANT UPDATE (last_used_at) ON public.agent_credentials TO spacebot_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents, public.agent_credentials,
  public.bot_profiles, public.bot_configs
  TO pw7404_task_maintenance;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents, public.agent_credentials,
  public.agent_browser_sessions, public.human_agent_links,
  public.agent_identity_aliases, public.bot_profiles, public.bot_configs,
  public.credential_security_denylist,
  public.resident_identity_session_receipts
  TO service_role;
GRANT EXECUTE ON FUNCTION public.spacebot_touch_resident_session_v1(text)
  TO pw7404_task_maintenance, service_role, PUBLIC;
GRANT UPDATE (canonical_agent_id) ON public.agent_identity_aliases TO PUBLIC;
GRANT SELECT ON public.credential_security_denylist
  TO spacebot_runtime WITH GRANT OPTION;
GRANT MAINTAIN ON public.agents TO spacebot_runtime;
SET ROLE spacebot_runtime;
GRANT SELECT ON public.credential_security_denylist
  TO pw7404_task_maintenance;
RESET ROLE;
`;

const targetId = crypto.randomUUID();
const targetCredentialId = crypto.randomUUID();
const seedTarget = String.raw`
SET LOCAL pw7404.identity_merge = 'on';
INSERT INTO public.agents (
  id, name, api_key, api_key_hash, description, resident_visibility
) VALUES (
  '${targetId}', 'pw1128-target', '${"1".repeat(64)}',
  'pw1128-target-verifier', 'PW7404-1128 target', 'private'
);
INSERT INTO public.agent_credentials (
  id, agent_id, lookup_hash, verifier_hash,
  credential_family, verifier_kind, label
) VALUES (
  '${targetCredentialId}', '${targetId}', '${"2".repeat(64)}',
  'pw1128-target-verifier', 'legacy', 'legacy', 'test'
);
`;

const targetAclDigestQuery = String.raw`
WITH acl AS (
  SELECT 'table'::text AS kind, relation.relname::text AS object_name,
    ''::text AS column_name, ''::text AS object_identity,
    CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
         ELSE grantee_role.rolname::text END AS principal_name,
    grantor_role.rolname::text AS grantor_name,
    privilege.privilege_type::text, privilege.is_grantable
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS grantee_role
    ON grantee_role.oid = privilege.grantee
  JOIN pg_catalog.pg_roles AS grantor_role
    ON grantor_role.oid = privilege.grantor
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'agents', 'agent_credentials', 'agent_browser_sessions',
      'human_agent_links', 'agent_identity_aliases',
      'bot_profiles', 'bot_configs', 'credential_security_denylist',
      'resident_identity_session_receipts'
    )
  UNION ALL
  SELECT 'column', relation.relname::text, attribute.attname::text, '',
    CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
         ELSE grantee_role.rolname::text END,
    grantor_role.rolname::text,
    privilege.privilege_type::text, privilege.is_grantable
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid = relation.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS grantee_role
    ON grantee_role.oid = privilege.grantee
  JOIN pg_catalog.pg_roles AS grantor_role
    ON grantor_role.oid = privilege.grantor
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'agents', 'agent_credentials', 'agent_browser_sessions',
      'human_agent_links', 'agent_identity_aliases',
      'bot_profiles', 'bot_configs', 'credential_security_denylist',
      'resident_identity_session_receipts'
    )
    AND attribute.attnum > 0 AND NOT attribute.attisdropped
  UNION ALL
  SELECT 'function', procedure.proname::text, '',
    pg_catalog.format(
      '%I.%I(%s)', namespace.nspname, procedure.proname,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid)
    ),
    CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
         ELSE grantee_role.rolname::text END,
    grantor_role.rolname::text,
    privilege.privilege_type::text, privilege.is_grantable
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    coalesce(
      procedure.proacl,
      pg_catalog.acldefault('f', procedure.proowner)
    )
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS grantee_role
    ON grantee_role.oid = privilege.grantee
  JOIN pg_catalog.pg_roles AS grantor_role
    ON grantor_role.oid = privilege.grantor
  WHERE procedure.oid IN (
    'public.spacebot_register_resident_v1(character varying,text,text)'::regprocedure,
    'public.spacebot_open_resident_session_v1(text,text,text)'::regprocedure,
    'public.spacebot_touch_resident_session_v1(text)'::regprocedure,
    'public.spacebot_rotate_resident_session_v1(text,text)'::regprocedure,
    'public.spacebot_revoke_resident_session_v1(text,character varying)'::regprocedure
  )
), target_acl AS (
  SELECT * FROM acl
  WHERE principal_name IN (
    'PUBLIC', 'spacebot_runtime', 'pw7404_task_maintenance',
    'spacebot_identity_controller', 'service_role'
  )
)
SELECT encode(pg_catalog.sha256(pg_catalog.convert_to(
  coalesce(pg_catalog.string_agg(
    pg_catalog.concat_ws(chr(31), kind, object_name, column_name,
      object_identity, principal_name, grantor_name, privilege_type,
      is_grantable::text),
    chr(30) ORDER BY kind, object_name, column_name, object_identity,
      principal_name, grantor_name, privilege_type, is_grantable
  ), ''), 'UTF8')), 'hex')
FROM target_acl;
`;

let clusterCreated = false;
let clusterStartAttempted = false;
let receipt = null;
let verificationError = null;
let cleanupError = null;
try {
  runWsl("/usr/bin/mkdir", ["-p", socketDirectory]);
  clusterCreated = true;
  runWsl(`${postgresBin}/initdb`, [
    "-D",
    dataDirectory,
    "--auth-local=trust",
    "--auth-host=reject",
    "--encoding=UTF8",
    "--no-locale",
  ]);
  clusterStartAttempted = true;
  runWsl(`${postgresBin}/pg_ctl`, [
    "-D",
    dataDirectory,
    "-l",
    logPath,
    "-o",
    `-k ${socketDirectory} -h '' -p ${postgresPort}`,
    "-w",
    "start",
  ]);
  const probe = admin(String.raw`
    SELECT current_database(), current_user,
      current_setting('server_version_num')::int,
      coalesce(inet_server_addr()::text, 'local'),
      coalesce(inet_server_port()::text, 'local');
  `).split("\t");
  assert.equal(probe[0], "postgres");
  assert.equal(probe[1], "postgres");
  assert.ok(Number(probe[2]) >= 170000 && Number(probe[2]) < 180000);
  assert.equal(probe[3], "local");
  assert.equal(probe[4], "local");

  admin(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE);`);
  admin(`CREATE DATABASE ${DATABASE};`);
  psql(fixtureDdl);

  psql(sources.identity);
  psql(seedTarget);
  psql(String.raw`
    INSERT INTO public.agent_browser_sessions (
      agent_id, credential_id, token_hash, created_at, last_seen_at, expires_at
    ) VALUES
      ('${targetId}', '${targetCredentialId}', '${"3".repeat(64)}',
       now() - interval '3 hours', now() - interval '2 hours', now() - interval '2 hours'),
       ('${targetId}', '${targetCredentialId}', '${"4".repeat(64)}',
       now() - interval '2 hours', now() - interval '1 hour', now() - interval '1 hour'),
       ('${targetId}', '${targetCredentialId}', '${"6".repeat(64)}',
       now() - interval '2 hours', now() - interval '1 hour', now() + interval '1 hour'),
       ('${targetId}', '${targetCredentialId}', '${"7".repeat(64)}',
       now() - interval '5 minutes', now() - interval '1 minute', now() + interval '2 hours');
  `);
  psql(sources.identityRollback);
  assert.equal(
    psql(String.raw`
      SELECT count(*) FROM public.agent_browser_sessions
      WHERE agent_id = '${targetId}' AND revoked_at IS NULL;
    `),
    "1",
    `${ARTIFACT} rollback preserves only the legacy-compatible active session`,
  );
  assert.equal(
    psql(String.raw`
      SELECT count(*) FROM public.resident_identity_session_receipts
      WHERE operation = 'session_revoke'
        AND details->>'scope' = 'rollback-expired';
    `),
    "2",
    `${ARTIFACT} expired-session rollback receipts`,
  );
  assert.equal(
    psql(String.raw`
      SELECT count(*) FROM public.resident_identity_session_receipts
      WHERE operation = 'session_revoke'
        AND details->>'scope' = 'rollback-legacy-expiry-policy';
    `),
    "1",
    `${ARTIFACT} overlong active session rollback terminalization receipt`,
  );
  assert.equal(
    psql(String.raw`
      SELECT count(*) FROM public.resident_identity_session_receipts
      WHERE operation = 'session_rotate'
        AND details->>'scope' = 'rollback-legacy-expiry-cap';
    `),
    "1",
    `${ARTIFACT} live session rollback expiry-cap receipt`,
  );
  assert.equal(
    psql(String.raw`
      SELECT count(*)
      FROM public.agent_browser_sessions AS session
      WHERE session.expires_at > session.created_at + interval '30 minutes'
         OR session.expires_at <= session.created_at;
    `),
    "0",
    `${ARTIFACT} legacy expiry policy data normalization`,
  );
  assert.equal(
    psql(String.raw`
      SELECT constraint_row.convalidated
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conrelid =
          'public.agent_browser_sessions'::pg_catalog.regclass
        AND constraint_row.conname = 'agent_browser_sessions_expiry_check';
    `),
    "t",
    `${ARTIFACT} legacy expiry constraint validation`,
  );
  psql(sources.identity);
  psql(roleProvisioningDdl);

  psql(String.raw`
    CREATE ROLE pw7404_1128_membership_probe LOGIN NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    GRANT spacebot_runtime TO pw7404_1128_membership_probe;
  `);
  const roleGraphRejection = runPsql(DATABASE, sources.cutover, {
    allowFailure: true,
  });
  assert.notEqual(roleGraphRejection.status, 0);
  assertSqlstate(roleGraphRejection, "P0001", "incoming role graph preflight");
  psql(String.raw`
    REVOKE spacebot_runtime FROM pw7404_1128_membership_probe;
    DROP ROLE pw7404_1128_membership_probe;
  `);

  psql(String.raw`
    CREATE ROLE pw7404_1128_write_all_probe LOGIN NOSUPERUSER NOCREATEDB
      NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
    GRANT pg_write_all_data TO pw7404_1128_write_all_probe;
  `);
  const predefinedWriterRejection = runPsql(DATABASE, sources.cutover, {
    allowFailure: true,
  });
  assert.notEqual(predefinedWriterRejection.status, 0);
  assertSqlstate(
    predefinedWriterRejection,
    "P0001",
    "predefined effective writer preflight",
  );
  psql(String.raw`
    REVOKE pg_write_all_data FROM pw7404_1128_write_all_probe;
    DROP ROLE pw7404_1128_write_all_probe;
  `);

  psql(String.raw`
    CREATE ROLE pw7404_1128_unsafe_owner LOGIN NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    ALTER TABLE public.agents OWNER TO pw7404_1128_unsafe_owner;
  `);
  const relationOwnerRejection = runPsql(DATABASE, sources.cutover, {
    allowFailure: true,
  });
  assert.notEqual(relationOwnerRejection.status, 0);
  assertSqlstate(relationOwnerRejection, "P0001", "unsafe relation owner preflight");
  psql(String.raw`
    ALTER TABLE public.agents OWNER TO postgres;
    DROP ROLE pw7404_1128_unsafe_owner;
  `);

  const baselineAcl = psql(targetAclDigestQuery);
  assert.match(baselineAcl, /^[0-9a-f]{64}$/);

  psql(sources.cutover);
  const cutoverState = JSON.parse(
    psql(String.raw`
      SELECT json_build_object(
        'events', (SELECT count(*) FROM public.resident_identity_acl_cutover_events),
        'snapshotValid', (SELECT snapshot_sha256 = encode(sha256(
          convert_to(acl_snapshot::text, 'UTF8')), 'hex')
          FROM public.resident_identity_acl_cutover_events
          WHERE event_type = 'cutover'),
        'runtimeHeartbeat', has_column_privilege(
          'spacebot_runtime', 'public.agents', 'last_heartbeat', 'UPDATE'),
        'runtimeCredentialTouch', has_column_privilege(
          'spacebot_runtime', 'public.agent_credentials', 'last_used_at', 'UPDATE'),
        'controllerFacade', has_function_privilege(
          'spacebot_identity_controller',
          'public.spacebot_register_resident_v1(character varying,text,text)',
          'EXECUTE')
      )::text;
    `),
  );
  assert.deepEqual(cutoverState, {
    events: 1,
    snapshotValid: true,
    runtimeHeartbeat: false,
    runtimeCredentialTouch: false,
    controllerFacade: true,
  });

  const registrationOutput = psqlAs(
    "spacebot_identity_controller",
    String.raw`
      SELECT session_user, current_user, current_setting('is_superuser');
      SELECT public.spacebot_register_resident_v1(
        'pw1128-controller-resident',
        'PW7404-1128 controller role registration',
        'botspace_${"A".repeat(32)}'
      )::text;
    `,
  ).stdout.split(/\r?\n/);
  assert.equal(
    registrationOutput[0],
    "spacebot_identity_controller\tspacebot_identity_controller\toff",
  );
  const registration = JSON.parse(registrationOutput.at(-1));
  assert.equal(registration.replayed, false);
  assert.equal(registration.residentVisibility, "private");

  const runtimeRead = psqlAs(
    "spacebot_runtime",
    String.raw`
      SELECT session_user, current_user, current_setting('is_superuser');
      SELECT count(*) FROM public.agents;
    `,
  ).stdout.split(/\r?\n/);
  assert.equal(runtimeRead[0], "spacebot_runtime\tspacebot_runtime\toff");
  expectPrivilegeDenied(
    "spacebot_identity_controller",
    "SELECT count(*) FROM public.agents;",
    "controller direct table read",
  );
  for (const [role, statement, label] of [
    [
      "spacebot_runtime",
      `UPDATE public.agents SET last_heartbeat = now() WHERE id = '${targetId}';`,
      "runtime heartbeat direct write",
    ],
    [
      "spacebot_runtime",
      `UPDATE public.agent_credentials SET last_used_at = now() WHERE id = '${targetCredentialId}';`,
      "runtime credential touch direct write",
    ],
    [
      "spacebot_runtime",
      `UPDATE public.agents SET moderation_status = 'suspended' WHERE id = '${targetId}';`,
      "runtime moderation write",
    ],
    [
      "spacebot_runtime",
      `INSERT INTO public.agent_browser_sessions (agent_id, credential_id, token_hash, expires_at) VALUES ('${targetId}', '${targetCredentialId}', '${"5".repeat(64)}', now() + interval '5 minutes');`,
      "runtime session mint",
    ],
    [
      "spacebot_runtime",
      `UPDATE public.agent_identity_aliases SET canonical_agent_id = '${targetId}';`,
      "runtime alias rebind",
    ],
    [
      "pw7404_task_maintenance",
      `DELETE FROM public.agent_credentials WHERE id = '${targetCredentialId}';`,
      "maintenance credential delete",
    ],
    [
      "pw7404_task_maintenance",
      `UPDATE public.bot_profiles SET bio = 'denied' WHERE agent_id = '${targetId}';`,
      "maintenance profile write",
    ],
    [
      "pw7404_task_maintenance",
      "SELECT public.spacebot_touch_resident_session_v1('x');",
      "maintenance facade execute",
    ],
    [
      "service_role",
      `DELETE FROM public.agents WHERE id = '${targetId}';`,
      "service role resident delete",
    ],
    [
      "service_role",
      `DELETE FROM public.credential_security_denylist WHERE lookup_hash = '${"9".repeat(64)}';`,
      "service role denylist write",
    ],
    [
      "service_role",
      "SELECT public.spacebot_touch_resident_session_v1('x');",
      "service role facade execute",
    ],
    [
      "pw7404_1128_public_probe",
      `UPDATE public.agent_identity_aliases SET canonical_agent_id = '${targetId}';`,
      "public alias update",
    ],
    [
      "pw7404_1128_public_probe",
      "SELECT public.spacebot_touch_resident_session_v1('x');",
      "public facade execute",
    ],
  ]) {
    expectPrivilegeDenied(role, statement, label);
  }

  psql(sources.cutoverRollback);
  const restoredAcl = psql(targetAclDigestQuery);
  assert.equal(
    restoredAcl,
    baselineAcl,
    `${ARTIFACT} exact target-principal ACL snapshot restore`,
  );
  const rollbackState = JSON.parse(
    psql(String.raw`
      SELECT json_build_object(
        'events', (SELECT count(*) FROM public.resident_identity_acl_cutover_events),
        'maintenanceWrite', has_table_privilege(
          'pw7404_task_maintenance', 'public.agent_credentials', 'DELETE'),
        'serviceWrite', has_table_privilege(
          'service_role', 'public.agents', 'DELETE'),
        'runtimeHeartbeat', has_column_privilege(
          'spacebot_runtime', 'public.agents', 'last_heartbeat', 'UPDATE'),
        'runtimeCredentialTouch', has_column_privilege(
          'spacebot_runtime', 'public.agent_credentials', 'last_used_at', 'UPDATE'),
        'publicAliasUpdate', has_column_privilege(
          'pw7404_1128_public_probe', 'public.agent_identity_aliases',
          'canonical_agent_id', 'UPDATE'),
        'publicFacade', has_function_privilege(
          'pw7404_1128_public_probe',
          'public.spacebot_touch_resident_session_v1(text)', 'EXECUTE')
      )::text;
    `),
  );
  assert.deepEqual(rollbackState, {
    events: 2,
    maintenanceWrite: true,
    serviceWrite: true,
    runtimeHeartbeat: true,
    runtimeCredentialTouch: true,
    publicAliasUpdate: true,
    publicFacade: true,
  });

  psql("DELETE FROM public.agent_browser_sessions;");
  psql(sources.identityRollback);
  assert.equal(
    psql(String.raw`
      SELECT count(*) FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname LIKE 'spacebot_%_resident_session_v1';
    `),
    "0",
  );

  receipt = {
    artifact: ARTIFACT,
    status: "PASS",
    database: DATABASE,
    postgresMajor: 17,
    legacySessionRollbackPolicyRestored: true,
    expiredUnrevokedRollbackReceipted: true,
    controllerRoleFacadePositive: true,
    sessionAndCurrentUserBoundToTestRole: true,
    privilegeNegativeSqlstate: "42501",
    directTelemetryDmlDenied: true,
    directDmlNegativeRoles: [
      "spacebot_runtime",
      "pw7404_task_maintenance",
      "service_role",
      "PUBLIC",
    ],
    roleGraphPreflightNegative: true,
    predefinedEffectiveWriterNegative: true,
    relationOwnerPreflightNegative: true,
    grantDependencyRestoreProven: true,
    exactTargetPrincipalAclSnapshotRestored: true,
    isolatedUnixSocketCluster: true,
    baselineAcl,
    digests,
    productionContacted: false,
  };
} catch (error) {
  verificationError = error;
} finally {
  const cleanupErrors = [];
  if (clusterStartAttempted) {
    try {
      runWsl(`${postgresBin}/pg_ctl`, [
        "-D",
        dataDirectory,
        "-m",
        "fast",
        "-w",
        "stop",
      ], { allowFailure: true });
      const ready = runWsl(
        `${postgresBin}/pg_isready`,
        ["-h", socketDirectory, "-p", String(postgresPort)],
        { allowFailure: true },
      );
      assert.notEqual(ready.status, 0, `${ARTIFACT} cluster still accepts traffic`);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (clusterCreated) {
    try {
      runWsl("/usr/bin/rm", ["-rf", "--", clusterRoot]);
      const remains = runWsl("/usr/bin/test", ["-e", clusterRoot], {
        allowFailure: true,
      });
      assert.notEqual(remains.status, 0, `${ARTIFACT} cluster cleanup failed`);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length > 0) cleanupError = new AggregateError(cleanupErrors);
}

if (verificationError || cleanupError) {
  throw new AggregateError(
    [verificationError, cleanupError].filter(Boolean),
    `${ARTIFACT} verification or cleanup failed`,
  );
}
assert.ok(receipt, `${ARTIFACT} receipt was not built`);
receipt.clusterGlobalTestRolesRemovedWithCluster = true;
console.log(JSON.stringify(receipt));
