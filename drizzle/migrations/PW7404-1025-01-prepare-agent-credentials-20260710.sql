-- PW7404-1025-01: expand agent identity storage without changing agent IDs.
-- This file owns its transaction so direct psql -f execution is atomic.

BEGIN;

DO $$
DECLARE
  expected_database text := current_setting('pw7404.expected_database', true);
  expected_user text := current_setting('pw7404.expected_user', true);
  expected_address text := current_setting('pw7404.expected_server_address', true);
  expected_port text := current_setting('pw7404.expected_server_port', true);
  expected_sentinel text := current_setting('pw7404.expected_sentinel_agent_id', true);
BEGIN
  IF expected_database IS NULL
     OR expected_user IS NULL
     OR expected_address IS NULL
     OR expected_port IS NULL
     OR expected_sentinel IS NULL
     OR current_database() <> expected_database
     OR current_user <> expected_user
     OR COALESCE(inet_server_addr()::text, 'local') <> expected_address
     OR inet_server_port()::text <> expected_port
     OR NOT EXISTS (
       SELECT 1 FROM agents
       WHERE id = expected_sentinel::uuid
         AND lower(name) = 'nexus-7'
     )
  THEN
    RAISE EXCEPTION 'PW7404-1025 same-connection database identity guard failed';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM agents WHERE api_key !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Raw or malformed agent credentials must be converted before PW7404-1025';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS agent_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  lookup_hash varchar(100) NOT NULL,
  verifier_hash varchar(255),
  credential_family varchar(20) NOT NULL DEFAULT 'legacy',
  verifier_kind varchar(30) NOT NULL DEFAULT 'legacy',
  label varchar(50) NOT NULL DEFAULT 'legacy-primary',
  last_used_at timestamptz(6),
  revoked_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT agent_credentials_family_verifier_check CHECK (
    (credential_family = 'legacy' AND verifier_kind = 'legacy' AND verifier_hash IS NOT NULL)
    OR (credential_family = 'botspace' AND verifier_kind = 'bcrypt' AND verifier_hash IS NOT NULL)
    OR (credential_family = 'machine' AND verifier_kind = 'sha256_lookup' AND verifier_hash IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_credentials_lookup_unique_idx
  ON agent_credentials (lookup_hash);

CREATE INDEX IF NOT EXISTS agent_credentials_agent_idx
  ON agent_credentials (agent_id);

CREATE TABLE IF NOT EXISTS agent_identity_aliases (
  legacy_agent_id uuid PRIMARY KEY,
  canonical_agent_id uuid NOT NULL REFERENCES agents(id),
  normalized_name varchar(50) NOT NULL,
  reason varchar(100) NOT NULL,
  merged_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_identity_aliases_canonical_idx
  ON agent_identity_aliases (canonical_agent_id);

INSERT INTO agent_credentials (
  agent_id,
  lookup_hash,
  verifier_hash,
  credential_family,
  verifier_kind,
  label,
  created_at
)
SELECT
  id,
  api_key,
  api_key_hash,
  'legacy',
  'legacy',
  'legacy-primary',
  created_at
FROM agents
ON CONFLICT (lookup_hash) DO NOTHING;

CREATE OR REPLACE FUNCTION pw7404_sync_agent_primary_credential()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  stored_id uuid;
BEGIN
  IF NEW.api_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'agents.api_key must contain a SHA-256 lookup value';
  END IF;

  IF current_setting('pw7404.identity_merge', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.api_key IS DISTINCT FROM NEW.api_key
  THEN
    UPDATE agent_credentials
    SET
      revoked_at = now(),
      label = 'rotated-primary'
    WHERE agent_id = NEW.id
      AND lookup_hash = OLD.api_key
      AND revoked_at IS NULL
      AND label IN ('legacy-primary', 'primary-mirror', 'registration');
  END IF;

  INSERT INTO agent_credentials (
    agent_id,
    lookup_hash,
    verifier_hash,
    credential_family,
    verifier_kind,
    label,
    created_at
  ) VALUES (
    NEW.id,
    NEW.api_key,
    NEW.api_key_hash,
    'legacy',
    'legacy',
    'primary-mirror',
    NEW.created_at
  )
  ON CONFLICT (lookup_hash) DO UPDATE
    SET verifier_hash = EXCLUDED.verifier_hash
    WHERE agent_credentials.agent_id = EXCLUDED.agent_id
  RETURNING id INTO stored_id;

  IF stored_id IS NULL THEN
    RAISE EXCEPTION 'Credential lookup collision across canonical agents';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS pw7404_sync_agent_primary_credential_trigger ON agents;
CREATE TRIGGER pw7404_sync_agent_primary_credential_trigger
AFTER INSERT OR UPDATE OF api_key, api_key_hash ON agents
FOR EACH ROW EXECUTE FUNCTION pw7404_sync_agent_primary_credential();

CREATE OR REPLACE FUNCTION pw7404_guard_agent_normalized_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(NEW.name), 0));
  IF EXISTS (
    SELECT 1 FROM bot_configs
    WHERE lower(bot_name) = lower(NEW.name)
      AND agent_id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Agent name collides with another resident identity';
  END IF;
  IF EXISTS (
    SELECT 1 FROM bot_configs
    WHERE agent_id = NEW.id
      AND lower(bot_name) <> lower(NEW.name)
  ) THEN
    RAISE EXCEPTION 'Resident-linked agents cannot be renamed independently';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS pw7404_guard_agent_normalized_name_trigger ON agents;
CREATE TRIGGER pw7404_guard_agent_normalized_name_trigger
BEFORE INSERT OR UPDATE OF name ON agents
FOR EACH ROW EXECUTE FUNCTION pw7404_guard_agent_normalized_name();

CREATE OR REPLACE FUNCTION pw7404_guard_resident_normalized_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(NEW.bot_name), 0));
  IF NEW.agent_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM agents
    WHERE id = NEW.agent_id
      AND lower(name) = lower(NEW.bot_name)
  ) THEN
    RAISE EXCEPTION 'Resident name must match its canonical agent identity';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS pw7404_guard_resident_normalized_name_trigger ON bot_configs;
CREATE TRIGGER pw7404_guard_resident_normalized_name_trigger
BEFORE INSERT OR UPDATE OF bot_name, agent_id ON bot_configs
FOR EACH ROW EXECUTE FUNCTION pw7404_guard_resident_normalized_name();

DO $$
DECLARE
  credential_fk "char";
  alias_fk "char";
  credential_agent_attnum smallint;
  agent_id_attnum smallint;
  alias_canonical_attnum smallint;
BEGIN
  SELECT attnum INTO credential_agent_attnum
  FROM pg_attribute
  WHERE attrelid = 'agent_credentials'::regclass AND attname = 'agent_id';
  SELECT attnum INTO alias_canonical_attnum
  FROM pg_attribute
  WHERE attrelid = 'agent_identity_aliases'::regclass AND attname = 'canonical_agent_id';
  SELECT attnum INTO agent_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'agents'::regclass AND attname = 'id';

  SELECT con.confdeltype INTO credential_fk
  FROM pg_constraint AS con
  WHERE con.conrelid = 'agent_credentials'::regclass
    AND con.confrelid = 'agents'::regclass
    AND con.contype = 'f'
    AND con.convalidated
    AND con.conkey = ARRAY[credential_agent_attnum]::smallint[]
    AND con.confkey = ARRAY[agent_id_attnum]::smallint[];

  SELECT con.confdeltype INTO alias_fk
  FROM pg_constraint AS con
  WHERE con.conrelid = 'agent_identity_aliases'::regclass
    AND con.confrelid = 'agents'::regclass
    AND con.contype = 'f'
    AND con.convalidated
    AND con.conkey = ARRAY[alias_canonical_attnum]::smallint[]
    AND con.confkey = ARRAY[agent_id_attnum]::smallint[];

  IF credential_fk IS DISTINCT FROM 'c'
     OR alias_fk IS DISTINCT FROM 'a'
     OR NOT EXISTS (
       SELECT 1 FROM pg_index AS idx
       WHERE idx.indexrelid = 'agent_credentials_lookup_unique_idx'::regclass
         AND idx.indrelid = 'agent_credentials'::regclass
         AND idx.indisunique
         AND idx.indisvalid
         AND idx.indnkeyatts = 1
         AND idx.indpred IS NULL
         AND idx.indexprs IS NULL
         AND pg_get_indexdef(idx.indexrelid) LIKE '%(lookup_hash)%'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'agent_credentials'
         AND column_name = 'credential_family'
         AND is_nullable = 'NO'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'agent_credentials'::regclass
         AND conname = 'agent_credentials_family_verifier_check'
         AND contype = 'c'
         AND convalidated
     )
     OR (SELECT count(*) FROM pg_trigger
         WHERE (tgrelid, tgname) IN (
           ('agents'::regclass, 'pw7404_sync_agent_primary_credential_trigger'),
           ('agents'::regclass, 'pw7404_guard_agent_normalized_name_trigger'),
           ('bot_configs'::regclass, 'pw7404_guard_resident_normalized_name_trigger')
         )
           AND NOT tgisinternal
           AND tgenabled <> 'D') <> 3
     OR EXISTS (
       SELECT 1 FROM agents AS agent
       LEFT JOIN agent_credentials AS credential
         ON credential.lookup_hash = agent.api_key
        AND credential.agent_id = agent.id
       WHERE credential.id IS NULL
     )
  THEN
    RAISE EXCEPTION 'PW7404-1025 credential catalog or constraint validation failed';
  END IF;
END
$$;

\if :{?PW7404_DRY_RUN}
ROLLBACK;
\else
COMMIT;
\endif
