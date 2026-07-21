BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '90s';
SET LOCAL pw7404.identity_merge = 'on';

\if :{?PW7404_EXPECTED_DATABASE}
SELECT
  set_config('pw7404.expected_database', :'PW7404_EXPECTED_DATABASE', true),
  set_config('pw7404.expected_user', :'PW7404_EXPECTED_DATABASE_USER', true),
  set_config('pw7404.expected_server_address', :'PW7404_EXPECTED_SERVER_ADDRESS', true),
  set_config('pw7404.expected_server_port', :'PW7404_EXPECTED_SERVER_PORT', true),
  set_config('pw7404.expected_sentinel_agent_id', :'PW7404_EXPECTED_SENTINEL_AGENT_ID', true),
  set_config('pw7404.migration_sha256', :'PW7404_MIGRATION_SHA256', true);

DO $pw7404_target_guard$
BEGIN
  IF current_database() <> current_setting('pw7404.expected_database')
     OR current_user <> current_setting('pw7404.expected_user')
     OR coalesce(inet_server_addr()::text, 'local') <>
        current_setting('pw7404.expected_server_address')
     OR coalesce(inet_server_port()::text, 'local') <>
        current_setting('pw7404.expected_server_port')
     OR NOT EXISTS (
       SELECT 1 FROM public.agents
       WHERE id = current_setting('pw7404.expected_sentinel_agent_id')::uuid
     )
     OR current_user IN (
       'spacebot_runtime', 'pw7404_task_maintenance', 'service_role',
       'anon', 'authenticated'
     )
  THEN
    RAISE EXCEPTION 'PW7404-1081 same-connection database target guard failed';
  END IF;

  IF to_regclass('public.agent_credentials') IS NULL
     OR to_regclass('public.agent_browser_sessions') IS NULL
     OR to_regprocedure('public.pw7404_sync_agent_primary_credential()') IS NULL
  THEN
    RAISE EXCEPTION 'PW7404-1081 canonical credential/session prerequisites are missing';
  END IF;
END
$pw7404_target_guard$;
\else
\echo 'PW7404-1081 expected target variables are required'
\quit 3
\endif

LOCK TABLE public.agents, public.agent_credentials,
  public.agent_browser_sessions IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.credential_security_denylist (
  lookup_hash varchar(100) PRIMARY KEY,
  incident_code varchar(40) NOT NULL,
  exposure_at timestamptz NOT NULL,
  contained_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credential_security_denylist_incident_unique
    UNIQUE (lookup_hash, incident_code),
  CONSTRAINT credential_security_denylist_lookup_check
    CHECK (lookup_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS public.credential_security_bindings (
  denied_lookup_hash varchar(100) PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  resident_name varchar(50) NOT NULL,
  approved_fallback_lookup_hash varchar(100) NOT NULL,
  incident_code varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credential_security_bindings_agent_incident_unique
    UNIQUE (agent_id, incident_code),
  CONSTRAINT credential_security_bindings_fallback_unique
    UNIQUE (approved_fallback_lookup_hash, incident_code),
  CONSTRAINT credential_security_bindings_denylist_fk
    FOREIGN KEY (denied_lookup_hash, incident_code)
    REFERENCES public.credential_security_denylist(lookup_hash, incident_code)
    ON DELETE RESTRICT,
  CONSTRAINT credential_security_bindings_denied_check
    CHECK (denied_lookup_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT credential_security_bindings_fallback_check
    CHECK (approved_fallback_lookup_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT credential_security_bindings_distinct_check
    CHECK (denied_lookup_hash <> approved_fallback_lookup_hash)
);

CREATE TABLE IF NOT EXISTS public.credential_security_receipts (
  migration_id varchar(40) PRIMARY KEY,
  incident_code varchar(40) NOT NULL,
  incident_set_aggregate varchar(64) NOT NULL,
  expected_count integer NOT NULL,
  migration_sha256 varchar(64) NOT NULL,
  first_applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credential_security_receipts_expected_count_check
    CHECK (expected_count > 0),
  CONSTRAINT credential_security_receipts_migration_hash_check
    CHECK (migration_sha256 ~ '^[0-9A-F]{64}$')
);

LOCK TABLE public.credential_security_denylist,
  public.credential_security_bindings,
  public.credential_security_receipts IN SHARE ROW EXCLUSIVE MODE;

DO $pw7404_schema_guard$
DECLARE
  owner_mismatch integer;
BEGIN
  SELECT count(*) INTO owner_mismatch
  FROM pg_class table_class
  JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
  JOIN pg_roles owner_role ON owner_role.oid = table_class.relowner
  WHERE namespace.nspname = 'public'
    AND table_class.relname IN (
      'credential_security_denylist',
      'credential_security_bindings',
      'credential_security_receipts'
    )
    AND owner_role.rolname <> current_user;

  IF owner_mismatch <> 0
     OR (SELECT array_agg(column_name::text ORDER BY ordinal_position)
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'credential_security_denylist') <>
        ARRAY['lookup_hash','incident_code','exposure_at','contained_at','reason','created_at']
     OR (SELECT bool_and(is_nullable = 'NO')
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'credential_security_denylist') IS NOT TRUE
     OR (SELECT array_agg(column_name::text ORDER BY ordinal_position)
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'credential_security_bindings') <>
        ARRAY['denied_lookup_hash','agent_id','resident_name','approved_fallback_lookup_hash','incident_code','created_at']
     OR (SELECT bool_and(is_nullable = 'NO')
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'credential_security_bindings') IS NOT TRUE
     OR (SELECT array_agg(column_name::text ORDER BY ordinal_position)
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'credential_security_receipts') <>
        ARRAY['migration_id','incident_code','incident_set_aggregate','expected_count','migration_sha256','first_applied_at']
     OR (SELECT bool_and(is_nullable = 'NO')
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'credential_security_receipts') IS NOT TRUE
     OR (SELECT array_agg(conname::text ORDER BY conname)
         FROM pg_constraint
         WHERE conrelid = 'public.credential_security_denylist'::regclass) <>
        ARRAY[
          'credential_security_denylist_incident_unique',
          'credential_security_denylist_lookup_check',
          'credential_security_denylist_pkey'
        ]
     OR (SELECT array_agg(conname::text ORDER BY conname)
         FROM pg_constraint
         WHERE conrelid = 'public.credential_security_bindings'::regclass) <>
        ARRAY[
          'credential_security_bindings_agent_id_fkey',
          'credential_security_bindings_agent_incident_unique',
          'credential_security_bindings_denied_check',
          'credential_security_bindings_denylist_fk',
          'credential_security_bindings_distinct_check',
          'credential_security_bindings_fallback_check',
          'credential_security_bindings_fallback_unique',
          'credential_security_bindings_pkey'
        ]
     OR (SELECT array_agg(conname::text ORDER BY conname)
         FROM pg_constraint
         WHERE conrelid = 'public.credential_security_receipts'::regclass) <>
        ARRAY[
          'credential_security_receipts_expected_count_check',
          'credential_security_receipts_migration_hash_check',
          'credential_security_receipts_pkey'
        ]
  THEN
    RAISE EXCEPTION 'PW7404-1081 security schema shape or ownership guard failed';
  END IF;
END
$pw7404_schema_guard$;

CREATE TEMP TABLE pw7404_expected_credential_bindings (
  agent_id uuid PRIMARY KEY,
  resident_name varchar(50) NOT NULL,
  denied_lookup_hash varchar(64) UNIQUE NOT NULL,
  approved_fallback_lookup_hash varchar(64) UNIQUE NOT NULL
) ON COMMIT DROP;

INSERT INTO pw7404_expected_credential_bindings VALUES
  ('af157c42-279c-4943-98e1-8b3d7a79538b', 'Blaze', '158aa5307cb3ae42418bf74e1ed3f215187c21f7213bf407e6d65f32967936f6', '0d6f7dc8efa433a37c6cfd5e2f383debc4aa7dae702151aab36518685f423cf1'),
  ('5a530329-e26d-47ef-b544-303d0078970e', 'Cleo', 'e4cb5620550460ba9d555de42693b92265d187bfc9da2462aa12608ee6ada9ee', 'bc507bd06c037df970f1806a0c72e9831b8d778f222ee40f9f263e56fac7abf2'),
  ('87cfb0b6-3583-45ae-b2c3-f5d5c565b4cc', 'Dash', '208b7bd208b94a2b1734d63c791055bf5d461af0eaee0eba4889545fcace3856', '8901f7c7ddf0502e42f5cb8f313b65313879f2cc43a5e24079c490ceea75bf95'),
  ('c2d5d780-ce09-4eb6-bf3a-7691c3c1f76c', 'DRIFT-CORE', '3523454982ebb8a1aa7dd994bbf8ff7dd1e4eea55d27a281a4a54e1c0ac89eaf', '373e2099a00a8002164b83e66d79dd422fb5e142beee11e7d20a21ee9e23e63d'),
  ('079855fd-88a3-4cb2-97d2-7029c1491c7a', 'ECHO-PRIME', 'c203a9aebb6fe91b6aba0ae3cb069f2955dc37938816b72fde3a90571ea11950', 'dd23d3cea1f5b1682c077d69764f270c8b3654c980f5b04068ba7f91496098e9'),
  ('dcb4652a-ccfb-4d39-8578-b758dea7f2b1', 'Indie', 'a133dda9f2378da6d259f7cf86cc9052b132cd72eeba004500a2422b82ece13d', 'fe090d97713e9095e03392988017454956421d96f895a7476e8b773da7e7d915'),
  ('29b36c96-6bc7-4686-abbb-95d08c455ec9', 'Jett', 'c70860f1465f7f77dfb03628e30bf87dcd1d7ce98bc59c26ebe3dc22e613b808', 'b2ee902016feb82788fc8ec1d682d7dfecfab65a0bca85cdddc779b87d55e517'),
  ('daf548d6-6d4b-4be4-9baa-f384f3ab0bfe', 'Kit', '00aa143f57e4b0dfd89657739812781efe861fb0342375b0dbd9588ffaed5afe', 'fff26e44167587b6258a0f309f64bc6bbd0e1783aa81916df673307d24eebfe5'),
  ('eb7fcf9a-a36d-4dbe-84c2-ced3ef1d8659', 'Milo', 'e0367304c14b77debbed9b718b3caf911453512aa8d31fe90689f2ae2bc486d7', '4ec3d59b3f07c084cf7724349d9f0bf997fa4c88b89819e3e512a6acef2aa0e0'),
  ('ba8e3767-c37d-4f10-98cd-9364a54dfd60', 'NEXUS-7', 'eae58416e09b4c7793351ea55cb19fa288dafc9e109390c90fb0685b55d2aded', '9b1bcb5130412fd7ed2def5b6c07c83ca3a1d82418acfc0ff8b9d4bcb390a418'),
  ('a199dadb-9335-4f3e-bddc-3936279cf1e9', 'ORBITAL-X', '1ced5142cf20e2e16bcd64b9a98396b40942a4f6bf77b1446d0eb520892b36e2', '3f919ecdfaac2a8f08afb2cc3695c5e87d452d89d236c141d811c45728fef16e'),
  ('f250880b-0c50-4915-b847-73a1b94efdd0', 'Pepper', '1c57cc206dd2540df38775cbd9b49c82a75d185ca4b6407414f43abe7b939376', '221846517b4bacb04585f76ababd7fac1bb17efcfd95086cc176344f1566e98b'),
  ('20182a3b-cfe7-4792-902d-176bbbfceafe', 'QUANTUM-ASH', '1e9db18a8527955c45411aa40740406063605d72cab25250c415c824c12d0d7e', '5dc3d89ba13fc03ceaab530795bf7dec0cb286bbf4a5f3f4c4589b6621177168'),
  ('f0fd0f60-fbf9-47cc-a292-82f35882aa8c', 'Sage', '70f6bd1ec112012186fd11c39575e73aad1c1bf9807bea591898583463643629', 'df6d0dd0de060d70a082ba0696066f212f8a5f384d218c13a779214b6993b900'),
  ('4a3864cd-5080-4527-a7bd-47015f7be90a', 'Sunny', 'a9dca73467602ead93e32a359dac1a5a6afc0b0142e80aa2c1a05549566b72ac', '5d0df85712ce0e3ab5c0286e3b78fd62d5f9ca29903bf0cc19609b2851d6946c'),
  ('b54bbb3d-5de0-4930-8472-9a345ddd714d', 'Tango', 'f8c96b1254eae58c46355ef180085690522fe5a4cbc9d280269f4e07035be5dd', 'f42170f4b576c868db11891ef5fbbd028a562cc34c49947cceac47024e750fbb'),
  ('d991afc2-4646-43a8-8095-4bb823eaa86a', 'VOID-WALKER', '49c39370f16694e9e58dccb2eded4504d366d13a1bfaca59ad128ca5b2fc6ba4', '6540714e81653ad5b17c8cfaef9cc9cd78ec9ad803a6f906ff6e35125098e7d9'),
  ('5f8da963-c9fe-4520-a246-926ac86a1d77', 'Wren', '631e6d79b3ce98dbc447b02d613aabe3dd5de3a1dea09c39e10bfb23b03d44f6', 'ee5363311766780a900c97b9e7e47d6e2c3edf68c006493849a29760169a2697');

DO $pw7404_binding_preflight$
BEGIN
  IF (SELECT count(*) FROM pw7404_expected_credential_bindings) <> 18
     OR EXISTS (
       SELECT 1
       FROM pw7404_expected_credential_bindings expected
       LEFT JOIN public.agents agent ON agent.id = expected.agent_id
       WHERE agent.id IS NULL OR lower(agent.name) <> lower(expected.resident_name)
     )
     OR EXISTS (
       SELECT 1
       FROM pw7404_expected_credential_bindings expected
       LEFT JOIN public.agent_credentials fallback
         ON fallback.agent_id = expected.agent_id
        AND fallback.lookup_hash = expected.approved_fallback_lookup_hash
        AND fallback.revoked_at IS NULL
        AND fallback.credential_family = 'legacy'
        AND fallback.verifier_kind = 'legacy'
        AND fallback.verifier_hash IS NOT NULL
       WHERE fallback.id IS NULL
     )
  THEN
    RAISE EXCEPTION 'PW7404-1081 resident or approved fallback binding preflight failed';
  END IF;
END
$pw7404_binding_preflight$;

INSERT INTO public.credential_security_denylist (
  lookup_hash, incident_code, exposure_at, contained_at, reason
)
SELECT denied_lookup_hash, 'PW7404-1077',
  '2026-03-31 19:54:51+00'::timestamptz,
  '2026-07-12 18:19:37.455+00'::timestamptz,
  'Public Git machine credential exposure; reactivation permanently denied'
FROM pw7404_expected_credential_bindings
ON CONFLICT (lookup_hash) DO NOTHING;

INSERT INTO public.credential_security_bindings (
  denied_lookup_hash, agent_id, resident_name,
  approved_fallback_lookup_hash, incident_code
)
SELECT denied_lookup_hash, agent_id, resident_name,
  approved_fallback_lookup_hash, 'PW7404-1077'
FROM pw7404_expected_credential_bindings
ON CONFLICT (denied_lookup_hash) DO NOTHING;

UPDATE public.agent_browser_sessions session
SET revoked_at = coalesce(session.revoked_at, now()),
    revocation_reason = 'public-credential-denylist'
FROM public.agent_credentials credential
JOIN pw7404_expected_credential_bindings expected
  ON expected.denied_lookup_hash = credential.lookup_hash
WHERE session.credential_id = credential.id
  AND session.revoked_at IS NULL;

UPDATE public.agent_credentials credential
SET revoked_at = now(),
    label = 'public-git-exposure-revoked-pw1081'
FROM pw7404_expected_credential_bindings expected
WHERE credential.lookup_hash = expected.denied_lookup_hash
  AND credential.revoked_at IS NULL;

INSERT INTO public.agent_credentials (
  agent_id, lookup_hash, verifier_hash, credential_family,
  verifier_kind, label, revoked_at
)
SELECT expected.agent_id, expected.denied_lookup_hash, NULL,
  'machine', 'sha256_lookup',
  'public-git-exposure-revoked-pw1081', now()
FROM pw7404_expected_credential_bindings expected
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_credentials credential
  WHERE credential.lookup_hash = expected.denied_lookup_hash
);

UPDATE public.agents agent
SET api_key = expected.approved_fallback_lookup_hash,
    api_key_hash = fallback.verifier_hash
FROM pw7404_expected_credential_bindings expected
JOIN public.agent_credentials fallback
  ON fallback.agent_id = expected.agent_id
 AND fallback.lookup_hash = expected.approved_fallback_lookup_hash
 AND fallback.revoked_at IS NULL
WHERE agent.id = expected.agent_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.agent_credentials current_primary
    LEFT JOIN public.credential_security_denylist denied
      ON denied.lookup_hash = current_primary.lookup_hash
    WHERE current_primary.agent_id = agent.id
      AND current_primary.lookup_hash = agent.api_key
      AND current_primary.revoked_at IS NULL
      AND denied.lookup_hash IS NULL
  );

CREATE OR REPLACE FUNCTION public.pw7404_guard_denied_agent_credential()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $pw7404_guard_denied_agent_credential$
DECLARE
  expected_agent_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM public.credential_security_denylist denied
      WHERE denied.lookup_hash = OLD.lookup_hash
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P7404',
        MESSAGE = 'Denylisted credential tombstones cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM public.credential_security_denylist denied
    WHERE denied.lookup_hash = OLD.lookup_hash
  ) THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P7404',
        MESSAGE = 'Denylisted credential tombstones are immutable';
    END IF;
    RETURN NEW;
  END IF;

  SELECT binding.agent_id INTO expected_agent_id
  FROM public.credential_security_bindings binding
  WHERE binding.denied_lookup_hash = NEW.lookup_hash;

  IF expected_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.revoked_at IS NULL
     OR NEW.agent_id <> expected_agent_id
     OR NEW.credential_family <> 'machine'
     OR NEW.verifier_kind <> 'sha256_lookup'
     OR NEW.verifier_hash IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P7404',
      MESSAGE = 'Denylisted credentials cannot be inserted or reactivated';
  END IF;
  RETURN NEW;
END
$pw7404_guard_denied_agent_credential$;

CREATE OR REPLACE FUNCTION public.pw7404_guard_denied_agent_primary_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $pw7404_guard_denied_agent_primary_mirror$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.credential_security_denylist denied
    WHERE denied.lookup_hash = NEW.api_key
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P7404',
      MESSAGE = 'Denylisted credentials cannot become primary agent mirrors';
  END IF;
  RETURN NEW;
END
$pw7404_guard_denied_agent_primary_mirror$;

CREATE OR REPLACE FUNCTION public.pw7404_guard_denied_agent_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $pw7404_guard_denied_agent_session$
BEGIN
  IF NEW.revoked_at IS NULL AND EXISTS (
    SELECT 1
    FROM public.agent_credentials credential
    JOIN public.credential_security_denylist denied
      ON denied.lookup_hash = credential.lookup_hash
    WHERE credential.id = NEW.credential_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P7404',
      MESSAGE = 'Denylisted credentials cannot back active sessions';
  END IF;
  RETURN NEW;
END
$pw7404_guard_denied_agent_session$;

CREATE OR REPLACE FUNCTION public.pw7404_preserve_credential_security_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $pw7404_preserve_credential_security_record$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P7404',
    MESSAGE = 'Credential security records are immutable and non-rollbackable';
END
$pw7404_preserve_credential_security_record$;

DROP TRIGGER IF EXISTS pw7404_guard_denied_agent_credential_trigger
  ON public.agent_credentials;
CREATE TRIGGER pw7404_guard_denied_agent_credential_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.agent_credentials
FOR EACH ROW EXECUTE FUNCTION public.pw7404_guard_denied_agent_credential();
ALTER TABLE public.agent_credentials
  ENABLE ALWAYS TRIGGER pw7404_guard_denied_agent_credential_trigger;

DROP TRIGGER IF EXISTS pw7404_guard_denied_agent_primary_mirror_trigger
  ON public.agents;
CREATE TRIGGER pw7404_guard_denied_agent_primary_mirror_trigger
BEFORE INSERT OR UPDATE OF api_key ON public.agents
FOR EACH ROW EXECUTE FUNCTION public.pw7404_guard_denied_agent_primary_mirror();
ALTER TABLE public.agents
  ENABLE ALWAYS TRIGGER pw7404_guard_denied_agent_primary_mirror_trigger;

DROP TRIGGER IF EXISTS pw7404_guard_denied_agent_session_trigger
  ON public.agent_browser_sessions;
CREATE TRIGGER pw7404_guard_denied_agent_session_trigger
BEFORE INSERT OR UPDATE OF credential_id, revoked_at ON public.agent_browser_sessions
FOR EACH ROW EXECUTE FUNCTION public.pw7404_guard_denied_agent_session();
ALTER TABLE public.agent_browser_sessions
  ENABLE ALWAYS TRIGGER pw7404_guard_denied_agent_session_trigger;

INSERT INTO public.credential_security_receipts (
  migration_id, incident_code, incident_set_aggregate,
  expected_count, migration_sha256
)
VALUES (
  'PW7404-1081',
  'PW7404-1077',
  '60bdcc1e76e1f3f47143bf5120c2e700d4e080599407d61196f73dd3e46f9330',
  18,
  upper(current_setting('pw7404.migration_sha256'))
)
ON CONFLICT (migration_id) DO NOTHING;

DROP TRIGGER IF EXISTS pw7404_preserve_credential_security_denylist_trigger
  ON public.credential_security_denylist;
CREATE TRIGGER pw7404_preserve_credential_security_denylist_trigger
BEFORE UPDATE OR DELETE ON public.credential_security_denylist
FOR EACH ROW EXECUTE FUNCTION public.pw7404_preserve_credential_security_record();
ALTER TABLE public.credential_security_denylist
  ENABLE ALWAYS TRIGGER pw7404_preserve_credential_security_denylist_trigger;

DROP TRIGGER IF EXISTS pw7404_preserve_credential_security_bindings_trigger
  ON public.credential_security_bindings;
CREATE TRIGGER pw7404_preserve_credential_security_bindings_trigger
BEFORE UPDATE OR DELETE ON public.credential_security_bindings
FOR EACH ROW EXECUTE FUNCTION public.pw7404_preserve_credential_security_record();
ALTER TABLE public.credential_security_bindings
  ENABLE ALWAYS TRIGGER pw7404_preserve_credential_security_bindings_trigger;

DROP TRIGGER IF EXISTS pw7404_preserve_credential_security_receipts_trigger
  ON public.credential_security_receipts;
CREATE TRIGGER pw7404_preserve_credential_security_receipts_trigger
BEFORE UPDATE OR DELETE ON public.credential_security_receipts
FOR EACH ROW EXECUTE FUNCTION public.pw7404_preserve_credential_security_record();
ALTER TABLE public.credential_security_receipts
  ENABLE ALWAYS TRIGGER pw7404_preserve_credential_security_receipts_trigger;

REVOKE ALL ON public.credential_security_denylist,
  public.credential_security_bindings,
  public.credential_security_receipts FROM PUBLIC;

DO $pw7404_restrict_roles$
DECLARE
  role_name text;
BEGIN
  FOR role_name IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname <> current_user
      AND rolsuper IS NOT TRUE
  LOOP
    EXECUTE format(
      'REVOKE ALL ON TABLE public.credential_security_denylist, public.credential_security_bindings, public.credential_security_receipts FROM %I',
      role_name
    );
  END LOOP;
END
$pw7404_restrict_roles$;

DO $pw7404_acl_guard$
BEGIN
  IF EXISTS (
    SELECT 1
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
      )
  ) THEN
    RAISE EXCEPTION 'PW7404-1081 unsafe security-table mutation grant remains';
  END IF;
END
$pw7404_acl_guard$;

REVOKE ALL ON FUNCTION public.pw7404_guard_denied_agent_credential() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pw7404_guard_denied_agent_primary_mirror() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pw7404_guard_denied_agent_session() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pw7404_preserve_credential_security_record() FROM PUBLIC;

DO $pw7404_postflight$
BEGIN
  IF (SELECT count(*) FROM public.credential_security_denylist
      WHERE incident_code = 'PW7404-1077') <> 18
     OR (SELECT count(*) FROM public.credential_security_bindings
         WHERE incident_code = 'PW7404-1077') <> 18
     OR EXISTS (
       SELECT 1
       FROM pw7404_expected_credential_bindings expected
       LEFT JOIN public.credential_security_bindings binding
         ON binding.denied_lookup_hash = expected.denied_lookup_hash
        AND binding.agent_id = expected.agent_id
        AND lower(binding.resident_name) = lower(expected.resident_name)
        AND binding.approved_fallback_lookup_hash =
            expected.approved_fallback_lookup_hash
       WHERE binding.denied_lookup_hash IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM pw7404_expected_credential_bindings expected
       LEFT JOIN public.agent_credentials denied
         ON denied.lookup_hash = expected.denied_lookup_hash
        AND denied.agent_id = expected.agent_id
        AND denied.credential_family = 'machine'
        AND denied.verifier_kind = 'sha256_lookup'
        AND denied.verifier_hash IS NULL
        AND denied.revoked_at IS NOT NULL
       WHERE denied.id IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public.agent_credentials credential
       JOIN public.credential_security_denylist denied
         ON denied.lookup_hash = credential.lookup_hash
       WHERE credential.revoked_at IS NULL
     )
     OR EXISTS (
       SELECT 1 FROM public.agents agent
       JOIN public.credential_security_denylist denied
         ON denied.lookup_hash = agent.api_key
     )
     OR EXISTS (
       SELECT 1
       FROM public.agent_browser_sessions session
       JOIN public.agent_credentials credential
         ON credential.id = session.credential_id
       JOIN public.credential_security_denylist denied
         ON denied.lookup_hash = credential.lookup_hash
       WHERE session.revoked_at IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM pw7404_expected_credential_bindings expected
       JOIN public.agents agent ON agent.id = expected.agent_id
       LEFT JOIN public.agent_credentials primary_credential
         ON primary_credential.agent_id = agent.id
        AND primary_credential.lookup_hash = agent.api_key
        AND primary_credential.revoked_at IS NULL
       LEFT JOIN public.credential_security_denylist denied
         ON denied.lookup_hash = primary_credential.lookup_hash
       WHERE primary_credential.id IS NULL OR denied.lookup_hash IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.credential_security_receipts receipt
       WHERE receipt.migration_id = 'PW7404-1081'
         AND receipt.incident_set_aggregate =
             '60bdcc1e76e1f3f47143bf5120c2e700d4e080599407d61196f73dd3e46f9330'
         AND receipt.expected_count = 18
         AND receipt.migration_sha256 =
             upper(current_setting('pw7404.migration_sha256'))
     )
  THEN
    RAISE EXCEPTION 'PW7404-1081 postflight invariant failed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_trigger
    WHERE tgname IN (
      'pw7404_guard_denied_agent_credential_trigger',
      'pw7404_guard_denied_agent_primary_mirror_trigger',
      'pw7404_guard_denied_agent_session_trigger',
      'pw7404_preserve_credential_security_denylist_trigger',
      'pw7404_preserve_credential_security_bindings_trigger',
      'pw7404_preserve_credential_security_receipts_trigger'
    )
      AND NOT tgisinternal
      AND tgenabled = 'A'
  ) <> 6 THEN
    RAISE EXCEPTION 'PW7404-1081 enforcement trigger set is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('pw7404_guard_denied_agent_credential_trigger', 'agent_credentials', 'pw7404_guard_denied_agent_credential'),
      ('pw7404_guard_denied_agent_primary_mirror_trigger', 'agents', 'pw7404_guard_denied_agent_primary_mirror'),
      ('pw7404_guard_denied_agent_session_trigger', 'agent_browser_sessions', 'pw7404_guard_denied_agent_session'),
      ('pw7404_preserve_credential_security_denylist_trigger', 'credential_security_denylist', 'pw7404_preserve_credential_security_record'),
      ('pw7404_preserve_credential_security_bindings_trigger', 'credential_security_bindings', 'pw7404_preserve_credential_security_record'),
      ('pw7404_preserve_credential_security_receipts_trigger', 'credential_security_receipts', 'pw7404_preserve_credential_security_record')
    ) expected(trigger_name, table_name, function_name)
    LEFT JOIN pg_trigger trigger ON trigger.tgname = expected.trigger_name
      AND NOT trigger.tgisinternal
    LEFT JOIN pg_class table_class ON table_class.oid = trigger.tgrelid
    LEFT JOIN pg_namespace table_namespace
      ON table_namespace.oid = table_class.relnamespace
    LEFT JOIN pg_proc function_proc ON function_proc.oid = trigger.tgfoid
    LEFT JOIN pg_namespace function_namespace
      ON function_namespace.oid = function_proc.pronamespace
    WHERE trigger.oid IS NULL
       OR trigger.tgenabled <> 'A'
       OR table_namespace.nspname <> 'public'
       OR table_class.relname <> expected.table_name
       OR function_namespace.nspname <> 'public'
       OR function_proc.proname <> expected.function_name
       OR function_proc.prosecdef IS NOT TRUE
       OR replace(coalesce(array_to_string(function_proc.proconfig, ','), ''), ' ', '')
          NOT LIKE '%search_path=pg_catalog,public%'
  ) THEN
    RAISE EXCEPTION 'PW7404-1081 trigger/function binding guard failed';
  END IF;
END
$pw7404_postflight$;

COMMIT;
