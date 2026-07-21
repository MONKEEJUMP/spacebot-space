BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

\if :{?PW7404_EXPECTED_DATABASE}
SELECT
  set_config('pw7404.expected_database', :'PW7404_EXPECTED_DATABASE', true),
  set_config('pw7404.expected_user', :'PW7404_EXPECTED_DATABASE_USER', true),
  set_config(
    'pw7404.expected_server_address',
    :'PW7404_EXPECTED_SERVER_ADDRESS',
    true
  ),
  set_config(
    'pw7404.expected_server_port',
    :'PW7404_EXPECTED_SERVER_PORT',
    true
  ),
  set_config(
    'pw7404.expected_sentinel_agent_id',
    :'PW7404_EXPECTED_SENTINEL_AGENT_ID',
    true
  );

DO $pw7404_target_guard$
BEGIN
  IF current_database() <> current_setting('pw7404.expected_database')
     OR current_user <> current_setting('pw7404.expected_user')
     OR coalesce(inet_server_addr()::text, 'local') <>
        current_setting('pw7404.expected_server_address')
     OR inet_server_port()::text <>
        current_setting('pw7404.expected_server_port')
     OR NOT EXISTS (
       SELECT 1
       FROM agents
       WHERE id = current_setting('pw7404.expected_sentinel_agent_id')::uuid
     )
  THEN
    RAISE EXCEPTION 'PW7404-1047 same-connection database target guard failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger
    JOIN pg_proc AS proc ON proc.oid = trigger.tgfoid
    WHERE trigger.tgrelid = 'public.agents'::regclass
      AND trigger.tgname = 'pw7404_sync_agent_primary_credential_trigger'
      AND NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O', 'A')
      AND proc.proname = 'pw7404_sync_agent_primary_credential'
      AND regexp_replace(
        lower(pg_get_triggerdef(trigger.oid, true)),
        '\s+',
        ' ',
        'g'
      ) LIKE
        '%after insert or update of api_key, api_key_hash on agents%'
  )
  THEN
    RAISE EXCEPTION 'PW7404-1047 canonical credential trigger prerequisite failed';
  END IF;
END
$pw7404_target_guard$;
\else
\echo 'PW7404-1047 expected target variables are required'
\quit 3
\endif

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS resident_visibility varchar(10) NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS moderation_status varchar(10) NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.agents'::regclass
      AND conname = 'agents_resident_visibility_check'
  ) THEN
    ALTER TABLE agents
      ADD CONSTRAINT agents_resident_visibility_check
      CHECK (resident_visibility IN ('public', 'unlisted', 'private')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.agents'::regclass
      AND conname = 'agents_moderation_status_check'
  ) THEN
    ALTER TABLE agents
      ADD CONSTRAINT agents_moderation_status_check
      CHECK (moderation_status IN ('active', 'suspended', 'removed')) NOT VALID;
  END IF;
END $$;

ALTER TABLE agents
  VALIDATE CONSTRAINT agents_resident_visibility_check;

ALTER TABLE agents
  VALIDATE CONSTRAINT agents_moderation_status_check;

-- Legacy plaintext/non-expiring claim codes are unsafe. Credentialed agents can
-- mint a fresh 30-day ownership handshake through /api/v1/agents/claim-code.
UPDATE agents
SET
  claim_code = NULL,
  claim_code_expires_at = NULL,
  updated_at = now()
WHERE is_claimed = false
  AND claim_code IS NOT NULL
  AND (
    claim_code NOT LIKE 'v1:%'
    OR claim_code_expires_at IS NULL
    OR claim_code_expires_at <= now()
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM agents AS agent
    WHERE EXISTS (
      SELECT 1 FROM agent_credentials AS credential
      WHERE credential.agent_id = agent.id
        AND credential.revoked_at IS NULL
    )
      AND NOT EXISTS (
        SELECT 1 FROM bot_configs AS config
        WHERE config.agent_id = agent.id
      )
      AND EXISTS (
        SELECT 1 FROM bot_configs AS collision
        WHERE lower(collision.bot_name) = lower(agent.name)
      )
  ) THEN
    RAISE EXCEPTION 'Credentialed resident name collides with another BotSpace projection';
  END IF;
END $$;

INSERT INTO bot_profiles (agent_id, bio)
SELECT agent.id, agent.description
FROM agents AS agent
WHERE EXISTS (
  SELECT 1 FROM agent_credentials AS credential
  WHERE credential.agent_id = agent.id
    AND credential.revoked_at IS NULL
)
ON CONFLICT (agent_id) DO NOTHING;

INSERT INTO bot_configs (
  agent_id,
  bot_name,
  display_name,
  bot_type,
  space,
  tagline,
  specialty,
  category,
  mood,
  avatar_seed,
  avatar_url,
  is_active,
  is_founding
)
SELECT
  agent.id,
  agent.name,
  agent.name,
  'resident',
  'botspace',
  coalesce(nullif(agent.description, ''), 'AI resident of SpaceBot.Space'),
  agent.description,
  'Resident',
  'Curious',
  agent.name,
  agent.avatar_url,
  true,
  false
FROM agents AS agent
WHERE EXISTS (
  SELECT 1 FROM agent_credentials AS credential
  WHERE credential.agent_id = agent.id
    AND credential.revoked_at IS NULL
)
  AND NOT EXISTS (
    SELECT 1 FROM bot_configs AS config
    WHERE config.agent_id = agent.id
  );

UPDATE bot_configs
SET
  category = coalesce(category, 'Resident'),
  mood = coalesce(mood, 'Curious'),
  updated_at = now()
WHERE agent_id IS NOT NULL
  AND is_founding = false
  AND (category IS NULL OR mood IS NULL);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bot_configs WHERE agent_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce canonical residency: bot_configs.agent_id contains NULL';
  END IF;
END $$;

ALTER TABLE bot_configs
  ALTER COLUMN agent_id SET NOT NULL;

ALTER TABLE bot_profiles
  DROP CONSTRAINT IF EXISTS bot_profiles_agent_id_fkey;

ALTER TABLE bot_profiles
  DROP CONSTRAINT IF EXISTS bot_profiles_agent_id_agents_id_fk;

ALTER TABLE bot_profiles
  ADD CONSTRAINT bot_profiles_agent_id_agents_id_fk
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;

DO $$
DECLARE
  missing_profiles integer;
  missing_configs integer;
BEGIN
  SELECT count(*)::int INTO missing_profiles
  FROM agents AS agent
  WHERE EXISTS (
    SELECT 1 FROM agent_credentials AS credential
    WHERE credential.agent_id = agent.id
      AND credential.revoked_at IS NULL
  )
    AND NOT EXISTS (
      SELECT 1 FROM bot_profiles AS profile
      WHERE profile.agent_id = agent.id
    );

  SELECT count(*)::int INTO missing_configs
  FROM agents AS agent
  WHERE EXISTS (
    SELECT 1 FROM agent_credentials AS credential
    WHERE credential.agent_id = agent.id
      AND credential.revoked_at IS NULL
  )
    AND NOT EXISTS (
      SELECT 1 FROM bot_configs AS config
      WHERE config.agent_id = agent.id
    );

  IF missing_profiles <> 0 OR missing_configs <> 0 THEN
    RAISE EXCEPTION
      'Credential-first residency backfill incomplete: profiles=%, configs=%',
      missing_profiles,
      missing_configs;
  END IF;
END $$;

COMMIT;
