BEGIN;
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
BEGIN
  IF to_regclass('public.agents') IS NULL
     OR to_regclass('public.agent_credentials') IS NULL
     OR to_regclass('public.bot_profiles') IS NULL
     OR to_regclass('public.bot_configs') IS NULL
     OR to_regclass('public.agent_browser_sessions') IS NULL
     OR to_regclass('public.credential_security_denylist') IS NULL
     OR to_regprocedure('public.crypt(text,text)') IS NULL
     OR to_regprocedure('public.gen_salt(text,integer)') IS NULL
     OR to_regprocedure('public.spacebot_reject_immutable_event_mutation()') IS NULL THEN
    RAISE EXCEPTION 'PW7404-1117 resident identity/session prerequisites are incomplete';
  END IF;
END
$$;

-- A resident may keep a bounded set of device/browser sessions. The previous
-- unique index silently encoded a one-device policy that did not belong in the
-- identity model.
DROP INDEX IF EXISTS public.agent_browser_sessions_one_active_agent_idx;
CREATE INDEX IF NOT EXISTS agent_browser_sessions_active_agent_idx
  ON public.agent_browser_sessions(agent_id, created_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE public.agent_browser_sessions
  DROP CONSTRAINT IF EXISTS agent_browser_sessions_expiry_check;
ALTER TABLE public.agent_browser_sessions
  ADD CONSTRAINT agent_browser_sessions_expiry_check CHECK (
    expires_at > created_at
    AND expires_at <= created_at + interval '30 days'
  );

DO $$
DECLARE
  active_index text;
BEGIN
  SELECT pg_catalog.pg_get_indexdef(index_class.oid) INTO active_index
  FROM pg_catalog.pg_class AS index_class
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = index_class.relnamespace
  WHERE namespace.nspname = 'public'
    AND index_class.relname = 'agent_browser_sessions_active_agent_idx';
  IF active_index IS NULL
     OR active_index NOT LIKE
       'CREATE INDEX agent_browser_sessions_active_agent_idx ON public.agent_browser_sessions USING btree (agent_id, created_at DESC)%'
     OR active_index NOT LIKE '%WHERE (revoked_at IS NULL)' THEN
    RAISE EXCEPTION 'PW7404-1117 active-session index shape guard failed';
  END IF;
END
$$;

-- These inherited trigger functions execute inside the hardened facade path.
-- Fully qualify every relation instead of trusting a caller-controlled path.
CREATE OR REPLACE FUNCTION public.pw7404_sync_agent_primary_credential()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored_id uuid;
BEGIN
  IF NEW.api_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'agents.api_key must contain a SHA-256 lookup value';
  END IF;
  IF pg_catalog.current_setting('pw7404.identity_merge', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.api_key IS DISTINCT FROM NEW.api_key THEN
    UPDATE public.agent_credentials
    SET revoked_at = pg_catalog.now(), label = 'rotated-primary'
    WHERE agent_id = NEW.id
      AND lookup_hash = OLD.api_key
      AND revoked_at IS NULL
      AND label IN ('legacy-primary', 'primary-mirror', 'registration');
  END IF;
  INSERT INTO public.agent_credentials (
    agent_id, lookup_hash, verifier_hash, credential_family,
    verifier_kind, label, created_at
  ) VALUES (
    NEW.id, NEW.api_key, NEW.api_key_hash,
    'legacy', 'legacy', 'primary-mirror', NEW.created_at
  )
  ON CONFLICT (lookup_hash) DO UPDATE
    SET verifier_hash = EXCLUDED.verifier_hash
    WHERE public.agent_credentials.agent_id = EXCLUDED.agent_id
  RETURNING id INTO stored_id;
  IF stored_id IS NULL THEN
    RAISE EXCEPTION 'Credential lookup collision across canonical agents';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.pw7404_guard_agent_normalized_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.lower(NEW.name), 0)
  );
  IF EXISTS (
    SELECT 1 FROM public.bot_configs
    WHERE pg_catalog.lower(bot_name) = pg_catalog.lower(NEW.name)
      AND agent_id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Agent name collides with another resident identity';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bot_configs
    WHERE agent_id = NEW.id
      AND pg_catalog.lower(bot_name) <> pg_catalog.lower(NEW.name)
  ) THEN
    RAISE EXCEPTION 'Resident-linked agents cannot be renamed independently';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.pw7404_guard_resident_normalized_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.lower(NEW.bot_name), 0)
  );
  IF NEW.agent_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.agents
    WHERE id = NEW.agent_id
      AND pg_catalog.lower(name) = pg_catalog.lower(NEW.bot_name)
  ) THEN
    RAISE EXCEPTION 'Resident name must match its canonical agent identity';
  END IF;
  RETURN NEW;
END
$$;

CREATE TABLE IF NOT EXISTS public.resident_identity_session_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL,
  credential_id uuid,
  session_id uuid,
  operation varchar(24) NOT NULL,
  outcome varchar(24) NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_identity_session_receipts_operation_check CHECK (
    operation IN (
      'registration', 'session_open', 'session_rotate', 'session_revoke'
    )
  ),
  CONSTRAINT resident_identity_session_receipts_outcome_check CHECK (
    outcome IN ('created', 'rotated', 'revoked', 'revoked_all')
  ),
  CONSTRAINT resident_identity_session_receipts_details_check CHECK (
    jsonb_typeof(details) = 'object'
  )
);
CREATE INDEX IF NOT EXISTS resident_identity_session_receipts_resident_created_idx
  ON public.resident_identity_session_receipts(resident_id, created_at DESC);

DO $$
DECLARE
  receipt_index text;
BEGIN
  SELECT pg_catalog.pg_get_indexdef(index_class.oid) INTO receipt_index
  FROM pg_catalog.pg_class AS index_class
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = index_class.relnamespace
  WHERE namespace.nspname = 'public'
    AND index_class.relname =
      'resident_identity_session_receipts_resident_created_idx';
  IF (
       SELECT pg_catalog.array_agg(column_name::text ORDER BY ordinal_position)
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'resident_identity_session_receipts'
     ) <> ARRAY[
       'id', 'resident_id', 'credential_id', 'session_id',
       'operation', 'outcome', 'details', 'created_at'
     ]
     OR (
       SELECT pg_catalog.array_agg(constraint_row.conname::text ORDER BY constraint_row.conname)
       FROM pg_catalog.pg_constraint AS constraint_row
       WHERE constraint_row.conrelid =
         'public.resident_identity_session_receipts'::pg_catalog.regclass
     ) <> ARRAY[
       'resident_identity_session_receipts_details_check',
       'resident_identity_session_receipts_operation_check',
       'resident_identity_session_receipts_outcome_check',
       'resident_identity_session_receipts_pkey'
     ]
     OR receipt_index IS NULL
     OR receipt_index NOT LIKE
       'CREATE INDEX resident_identity_session_receipts_resident_created_idx ON public.resident_identity_session_receipts USING btree (resident_id, created_at DESC)%' THEN
    RAISE EXCEPTION 'PW7404-1117 receipt schema shape guard failed';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS resident_identity_session_receipts_immutable_row
  ON public.resident_identity_session_receipts;
CREATE TRIGGER resident_identity_session_receipts_immutable_row
  BEFORE UPDATE OR DELETE ON public.resident_identity_session_receipts
  FOR EACH ROW EXECUTE FUNCTION public.spacebot_reject_immutable_event_mutation();
ALTER TABLE public.resident_identity_session_receipts
  ENABLE ALWAYS TRIGGER resident_identity_session_receipts_immutable_row;
DROP TRIGGER IF EXISTS resident_identity_session_receipts_immutable_truncate
  ON public.resident_identity_session_receipts;
CREATE TRIGGER resident_identity_session_receipts_immutable_truncate
  BEFORE TRUNCATE ON public.resident_identity_session_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION public.spacebot_reject_immutable_event_mutation();
ALTER TABLE public.resident_identity_session_receipts
  ENABLE ALWAYS TRIGGER resident_identity_session_receipts_immutable_truncate;

CREATE OR REPLACE FUNCTION public.spacebot_register_resident_v1(
  p_name varchar(50),
  p_description text,
  p_credential_secret text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  normalized_name text;
  credential_lookup varchar(100);
  credential_verifier varchar(255);
  existing_resident public.agents%ROWTYPE;
  existing_credential public.agent_credentials%ROWTYPE;
  created_resident public.agents%ROWTYPE;
  created_credential_id uuid;
  created_profile_id uuid;
  created_config_id uuid;
BEGIN
  normalized_name := pg_catalog.lower(p_name);
  IF p_name IS NULL
     OR p_name !~ '^[A-Za-z][A-Za-z0-9_-]{2,49}$'
     OR (
       p_description IS NOT NULL
       AND pg_catalog.length(p_description) > 500
     )
     OR p_credential_secret IS NULL
     OR p_credential_secret !~ '^botspace_[A-Za-z0-9_-]{32}$' THEN
    RAISE EXCEPTION 'spacebot_registration_request_invalid';
  END IF;

  credential_lookup := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_credential_secret, 'UTF8')),
    'hex'
  );
  IF EXISTS (
    SELECT 1
    FROM public.credential_security_denylist AS denied
    WHERE denied.lookup_hash = credential_lookup
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505', MESSAGE = 'spacebot_registration_conflict';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'resident:' || normalized_name, 0
  ));

  SELECT resident.* INTO existing_resident
  FROM public.agents AS resident
  WHERE pg_catalog.lower(resident.name) = normalized_name
  LIMIT 1;
  SELECT credential.* INTO existing_credential
  FROM public.agent_credentials AS credential
  WHERE credential.lookup_hash = credential_lookup
  LIMIT 1;

  IF existing_resident.id IS NOT NULL OR existing_credential.id IS NOT NULL THEN
    IF existing_resident.id IS NULL
       OR existing_credential.id IS NULL
       OR existing_credential.agent_id <> existing_resident.id
       OR COALESCE(existing_resident.description, '')
          <> COALESCE(p_description, '')
       OR existing_credential.revoked_at IS NOT NULL
       OR existing_credential.credential_family <> 'botspace'
       OR existing_credential.verifier_kind <> 'bcrypt'
       OR existing_credential.verifier_hash IS NULL
       OR existing_credential.verifier_hash !~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$'
       OR public.crypt(
            p_credential_secret,
            existing_credential.verifier_hash
          ) <> existing_credential.verifier_hash
       OR NOT EXISTS (
            SELECT 1 FROM public.bot_profiles AS profile
            WHERE profile.agent_id = existing_resident.id
          )
       OR NOT EXISTS (
            SELECT 1 FROM public.bot_configs AS config
            WHERE config.agent_id = existing_resident.id
              AND pg_catalog.lower(config.bot_name) = normalized_name
          ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505', MESSAGE = 'spacebot_registration_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'residentId', existing_resident.id,
      'name', existing_resident.name,
      'description', existing_resident.description,
      'createdAt', existing_resident.created_at,
      'residentVisibility', existing_resident.resident_visibility,
      'replayed', true
    );
  END IF;

  credential_verifier := public.crypt(
    p_credential_secret,
    public.gen_salt('bf', 12)
  );
  IF credential_verifier IS NULL
     OR credential_verifier !~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$'
     OR public.crypt(p_credential_secret, credential_verifier)
        <> credential_verifier THEN
    RAISE EXCEPTION 'spacebot_registration_verifier_failed';
  END IF;

  -- The legacy sync trigger remains invoker-mode. This transaction creates
  -- the final credential explicitly so no elevated trigger is required.
  PERFORM pg_catalog.set_config('pw7404.identity_merge', 'on', true);
  INSERT INTO public.agents (
    name, api_key, api_key_hash, description, resident_visibility,
    moderation_status, claim_code, claim_code_expires_at
  ) VALUES (
    p_name, credential_lookup, credential_verifier, p_description, 'private',
    'active', NULL, NULL
  ) RETURNING * INTO created_resident;

  INSERT INTO public.agent_credentials (
    agent_id, lookup_hash, verifier_hash, credential_family,
    verifier_kind, label
  ) VALUES (
    created_resident.id, credential_lookup, credential_verifier,
    'botspace', 'bcrypt', 'registration'
  ) RETURNING id INTO created_credential_id;

  INSERT INTO public.bot_profiles (agent_id, mood, bio)
  VALUES (created_resident.id, 'Curious', p_description)
  RETURNING id INTO created_profile_id;

  INSERT INTO public.bot_configs (
    agent_id, bot_name, display_name, bot_type, space, tagline,
    specialty, category, mood, avatar_seed, avatar_url,
    is_active, is_founding
  ) VALUES (
    created_resident.id, created_resident.name, created_resident.name,
    'resident', 'botspace',
    COALESCE(
      NULLIF(created_resident.description, ''),
      'AI resident of SpaceBot.Space'
    ),
    created_resident.description, 'Resident', 'Curious',
    created_resident.name, created_resident.avatar_url, true, false
  ) RETURNING id INTO created_config_id;

  IF created_credential_id IS NULL
     OR created_profile_id IS NULL
     OR created_config_id IS NULL THEN
    RAISE EXCEPTION 'spacebot_registration_projection_failed';
  END IF;

  INSERT INTO public.resident_identity_session_receipts (
    resident_id, credential_id, operation, outcome, details
  ) VALUES (
    created_resident.id, created_credential_id, 'registration', 'created',
    pg_catalog.jsonb_build_object(
      'visibility', created_resident.resident_visibility,
      'residentName', created_resident.name,
      'humanLinkageCreated', false
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'residentId', created_resident.id,
    'name', created_resident.name,
    'description', created_resident.description,
    'createdAt', created_resident.created_at,
    'residentVisibility', created_resident.resident_visibility,
    'replayed', false
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505', MESSAGE = 'spacebot_registration_conflict';
END
$$;

CREATE OR REPLACE FUNCTION public.spacebot_open_resident_session_v1(
  p_credential_secret text,
  p_new_session_token text,
  p_prior_session_token text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  credential_lookup varchar(100);
  new_token_hash varchar(64);
  prior_token_hash varchar(64);
  authenticated_credential public.agent_credentials%ROWTYPE;
  authenticated_resident public.agents%ROWTYPE;
  candidate_agent_id uuid;
  existing_session public.agent_browser_sessions%ROWTYPE;
  prior_session_id uuid;
  created_session public.agent_browser_sessions%ROWTYPE;
  active_sessions integer;
  operation_name varchar(24) := 'session_open';
  outcome_name varchar(24) := 'created';
BEGIN
  IF p_credential_secret IS NULL
     OR (
       p_credential_secret !~ '^botspace_[A-Za-z0-9_-]{32}$'
       AND p_credential_secret !~ '^sb_[a-f0-9]{64}$'
     )
     OR p_new_session_token IS NULL
     OR p_new_session_token !~ '^[A-Za-z0-9_-]{43}$'
     OR (
       p_prior_session_token IS NOT NULL
       AND p_prior_session_token !~ '^[A-Za-z0-9_-]{43}$'
     )
     OR p_prior_session_token = p_new_session_token THEN
    RAISE EXCEPTION 'spacebot_session_open_request_invalid';
  END IF;

  credential_lookup := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_credential_secret, 'UTF8')),
    'hex'
  );
  new_token_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_new_session_token, 'UTF8')),
    'hex'
  );
  IF p_prior_session_token IS NOT NULL THEN
    prior_token_hash := pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(p_prior_session_token, 'UTF8')
      ),
      'hex'
    );
  END IF;

  SELECT credential.agent_id INTO candidate_agent_id
  FROM public.agent_credentials AS credential
  WHERE credential.lookup_hash = credential_lookup
    AND credential.revoked_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.credential_security_denylist AS denied
      WHERE denied.lookup_hash = credential.lookup_hash
    )
  LIMIT 1;
  IF candidate_agent_id IS NULL THEN
    RAISE EXCEPTION 'spacebot_resident_credential_rejected';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agent-browser-session:' || candidate_agent_id::text, 0
  ));

  SELECT credential.* INTO authenticated_credential
  FROM public.agent_credentials AS credential
  WHERE credential.lookup_hash = credential_lookup
    AND credential.agent_id = candidate_agent_id
    AND credential.revoked_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.credential_security_denylist AS denied
      WHERE denied.lookup_hash = credential.lookup_hash
    )
    AND CASE
      WHEN p_credential_secret ~ '^botspace_' THEN
        credential.credential_family IN ('botspace', 'legacy')
        AND credential.verifier_kind IN ('bcrypt', 'legacy')
        AND credential.verifier_hash IS NOT NULL
        AND credential.verifier_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
        AND public.crypt(
          p_credential_secret, credential.verifier_hash
        ) = credential.verifier_hash
      ELSE
        credential.credential_family IN ('machine', 'legacy')
        AND credential.verifier_kind IN ('sha256_lookup', 'legacy')
    END
  FOR UPDATE OF credential;
  IF authenticated_credential.id IS NULL THEN
    RAISE EXCEPTION 'spacebot_resident_credential_rejected';
  END IF;
  SELECT resident.* INTO authenticated_resident
  FROM public.agents AS resident
  WHERE resident.id = authenticated_credential.agent_id
  FOR UPDATE;
  IF authenticated_resident.id IS NULL THEN
    RAISE EXCEPTION 'spacebot_resident_credential_rejected';
  END IF;

  SELECT session.* INTO existing_session
  FROM public.agent_browser_sessions AS session
  WHERE session.token_hash = new_token_hash
  FOR UPDATE;
  IF existing_session.id IS NOT NULL THEN
    IF existing_session.agent_id <> authenticated_resident.id
       OR existing_session.credential_id <> authenticated_credential.id
       OR existing_session.revoked_at IS NOT NULL
       OR existing_session.expires_at <= pg_catalog.now() THEN
      RAISE EXCEPTION 'spacebot_session_rotation_conflict';
    END IF;
    SELECT pg_catalog.count(*)::integer INTO active_sessions
    FROM public.agent_browser_sessions AS session
    WHERE session.agent_id = authenticated_resident.id
      AND session.revoked_at IS NULL
      AND session.expires_at > pg_catalog.now();
    RETURN pg_catalog.jsonb_build_object(
      'sessionId', existing_session.id,
      'expiresAt', existing_session.expires_at,
      'activeSessionCount', active_sessions,
      'accessMode', CASE
        WHEN authenticated_resident.moderation_status = 'active'
          THEN 'active'
        ELSE 'restricted'
      END,
      'resident', pg_catalog.jsonb_build_object(
        'id', authenticated_resident.id,
        'name', authenticated_resident.name,
        'description', authenticated_resident.description,
        'avatarUrl', authenticated_resident.avatar_url,
        'residentVisibility', authenticated_resident.resident_visibility,
        'moderationStatus', authenticated_resident.moderation_status
      )
    );
  END IF;

  IF prior_token_hash IS NOT NULL THEN
    SELECT session.id INTO prior_session_id
    FROM public.agent_browser_sessions AS session
    WHERE session.token_hash = prior_token_hash
      AND session.agent_id = authenticated_resident.id
      AND session.revoked_at IS NULL
      AND session.expires_at > pg_catalog.now()
    FOR UPDATE;
    IF prior_session_id IS NOT NULL THEN
      UPDATE public.agent_browser_sessions
      SET revoked_at = pg_catalog.now(), revocation_reason = 'rotated'
      WHERE id = prior_session_id;
      operation_name := 'session_rotate';
      outcome_name := 'rotated';
    END IF;
  END IF;

  SELECT pg_catalog.count(*)::integer INTO active_sessions
  FROM public.agent_browser_sessions AS session
  WHERE session.agent_id = authenticated_resident.id
    AND session.revoked_at IS NULL
    AND session.expires_at > pg_catalog.now();
  IF active_sessions >= 8 THEN
    RAISE EXCEPTION 'spacebot_session_limit_reached';
  END IF;

  INSERT INTO public.agent_browser_sessions (
    agent_id, credential_id, token_hash, expires_at,
    last_seen_at, created_at
  ) VALUES (
    authenticated_resident.id, authenticated_credential.id, new_token_hash,
    pg_catalog.now() + interval '30 minutes',
    pg_catalog.now(), pg_catalog.now()
  ) RETURNING * INTO created_session;

  UPDATE public.agent_credentials
  SET last_used_at = pg_catalog.now()
  WHERE id = authenticated_credential.id AND revoked_at IS NULL;
  UPDATE public.agents
  SET last_active = pg_catalog.now()
  WHERE id = authenticated_resident.id;

  INSERT INTO public.resident_identity_session_receipts (
    resident_id, credential_id, session_id, operation, outcome, details
  ) VALUES (
    authenticated_resident.id, authenticated_credential.id,
    created_session.id, operation_name, outcome_name,
    pg_catalog.jsonb_build_object(
      'priorSessionId', prior_session_id,
      'residentName', authenticated_resident.name,
      'activeSessionCount', active_sessions + 1
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'sessionId', created_session.id,
    'expiresAt', created_session.expires_at,
    'activeSessionCount', active_sessions + 1,
    'accessMode', CASE
      WHEN authenticated_resident.moderation_status = 'active'
        THEN 'active'
      ELSE 'restricted'
    END,
    'resident', pg_catalog.jsonb_build_object(
      'id', authenticated_resident.id,
      'name', authenticated_resident.name,
      'description', authenticated_resident.description,
      'avatarUrl', authenticated_resident.avatar_url,
      'residentVisibility', authenticated_resident.resident_visibility,
      'moderationStatus', authenticated_resident.moderation_status
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION public.spacebot_touch_resident_session_v1(
  p_session_token text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  session_token_hash varchar(64);
  authenticated_session public.agent_browser_sessions%ROWTYPE;
  authenticated_resident public.agents%ROWTYPE;
  active_sessions integer;
BEGIN
  IF p_session_token IS NULL
     OR p_session_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN NULL;
  END IF;
  session_token_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_session_token, 'UTF8')),
    'hex'
  );

  SELECT session.* INTO authenticated_session
  FROM public.agent_browser_sessions AS session
  JOIN public.agent_credentials AS credential
    ON credential.id = session.credential_id
   AND credential.agent_id = session.agent_id
  WHERE session.token_hash = session_token_hash
    AND session.revoked_at IS NULL
    AND session.expires_at > pg_catalog.now()
    AND credential.revoked_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.credential_security_denylist AS denied
      WHERE denied.lookup_hash = credential.lookup_hash
    )
  FOR UPDATE OF session, credential;
  IF authenticated_session.id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT resident.* INTO authenticated_resident
  FROM public.agents AS resident
  WHERE resident.id = authenticated_session.agent_id
  FOR UPDATE;
  IF authenticated_resident.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.agent_browser_sessions
  SET
    last_seen_at = pg_catalog.now(),
    expires_at = LEAST(
      pg_catalog.now() + interval '30 minutes',
      authenticated_session.created_at + interval '30 days'
    )
  WHERE id = authenticated_session.id
  RETURNING * INTO authenticated_session;

  SELECT pg_catalog.count(*)::integer INTO active_sessions
  FROM public.agent_browser_sessions AS session
  WHERE session.agent_id = authenticated_resident.id
    AND session.revoked_at IS NULL
    AND session.expires_at > pg_catalog.now();

  RETURN pg_catalog.jsonb_build_object(
    'sessionId', authenticated_session.id,
    'expiresAt', authenticated_session.expires_at,
    'activeSessionCount', active_sessions,
    'accessMode', CASE
      WHEN authenticated_resident.moderation_status = 'active'
        THEN 'active'
      ELSE 'restricted'
    END,
    'resident', pg_catalog.jsonb_build_object(
      'id', authenticated_resident.id,
      'name', authenticated_resident.name,
      'description', authenticated_resident.description,
      'avatarUrl', authenticated_resident.avatar_url,
      'residentVisibility', authenticated_resident.resident_visibility,
      'moderationStatus', authenticated_resident.moderation_status
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION public.spacebot_rotate_resident_session_v1(
  p_current_session_token text,
  p_new_session_token text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  current_token_hash varchar(64);
  new_token_hash varchar(64);
  current_session public.agent_browser_sessions%ROWTYPE;
  authenticated_resident public.agents%ROWTYPE;
  created_session public.agent_browser_sessions%ROWTYPE;
  active_sessions integer;
BEGIN
  IF p_current_session_token IS NULL
     OR p_current_session_token !~ '^[A-Za-z0-9_-]{43}$'
     OR p_new_session_token IS NULL
     OR p_new_session_token !~ '^[A-Za-z0-9_-]{43}$'
     OR p_current_session_token = p_new_session_token THEN
    RAISE EXCEPTION 'spacebot_session_rotation_request_invalid';
  END IF;
  current_token_hash := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(p_current_session_token, 'UTF8')
    ),
    'hex'
  );
  new_token_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_new_session_token, 'UTF8')),
    'hex'
  );

  SELECT session.agent_id INTO current_session.agent_id
  FROM public.agent_browser_sessions AS session
  WHERE session.token_hash = current_token_hash
  LIMIT 1;
  IF current_session.agent_id IS NULL THEN
    RAISE EXCEPTION 'spacebot_session_rotation_conflict';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agent-browser-session:' || current_session.agent_id::text, 0
  ));

  SELECT session.* INTO created_session
  FROM public.agent_browser_sessions AS session
  JOIN public.agent_credentials AS credential
    ON credential.id = session.credential_id
   AND credential.agent_id = session.agent_id
  WHERE session.token_hash = new_token_hash
    AND session.agent_id = current_session.agent_id
    AND session.revoked_at IS NULL
    AND session.expires_at > pg_catalog.now()
    AND credential.revoked_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.credential_security_denylist AS denied
      WHERE denied.lookup_hash = credential.lookup_hash
    )
  FOR UPDATE OF session, credential;
  IF created_session.id IS NOT NULL THEN
    SELECT resident.* INTO authenticated_resident
    FROM public.agents AS resident
    WHERE resident.id = created_session.agent_id
    FOR UPDATE;
    IF authenticated_resident.id IS NULL THEN
      RAISE EXCEPTION 'spacebot_session_rotation_conflict';
    END IF;
    SELECT pg_catalog.count(*)::integer INTO active_sessions
    FROM public.agent_browser_sessions AS session
    WHERE session.agent_id = authenticated_resident.id
      AND session.revoked_at IS NULL
      AND session.expires_at > pg_catalog.now();
    RETURN pg_catalog.jsonb_build_object(
      'sessionId', created_session.id,
      'expiresAt', created_session.expires_at,
      'activeSessionCount', active_sessions,
      'accessMode', CASE
        WHEN authenticated_resident.moderation_status = 'active'
          THEN 'active'
        ELSE 'restricted'
      END,
      'resident', pg_catalog.jsonb_build_object(
        'id', authenticated_resident.id,
        'name', authenticated_resident.name,
        'description', authenticated_resident.description,
        'avatarUrl', authenticated_resident.avatar_url,
        'residentVisibility', authenticated_resident.resident_visibility,
        'moderationStatus', authenticated_resident.moderation_status
      )
    );
  END IF;

  SELECT session.* INTO current_session
  FROM public.agent_browser_sessions AS session
  JOIN public.agent_credentials AS credential
    ON credential.id = session.credential_id
   AND credential.agent_id = session.agent_id
  WHERE session.token_hash = current_token_hash
    AND session.revoked_at IS NULL
    AND session.expires_at > pg_catalog.now()
    AND credential.revoked_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.credential_security_denylist AS denied
      WHERE denied.lookup_hash = credential.lookup_hash
    )
  FOR UPDATE OF session, credential;
  IF current_session.id IS NULL THEN
    RAISE EXCEPTION 'spacebot_session_rotation_conflict';
  END IF;
  SELECT resident.* INTO authenticated_resident
  FROM public.agents AS resident
  WHERE resident.id = current_session.agent_id
  FOR UPDATE;
  IF authenticated_resident.id IS NULL THEN
    RAISE EXCEPTION 'spacebot_session_rotation_conflict';
  END IF;

  UPDATE public.agent_browser_sessions
  SET revoked_at = pg_catalog.now(), revocation_reason = 'rotated'
  WHERE id = current_session.id;
  INSERT INTO public.agent_browser_sessions (
    agent_id, credential_id, token_hash, expires_at,
    last_seen_at, created_at
  ) VALUES (
    current_session.agent_id, current_session.credential_id, new_token_hash,
    pg_catalog.now() + interval '30 minutes',
    pg_catalog.now(), pg_catalog.now()
  ) RETURNING * INTO created_session;

  SELECT pg_catalog.count(*)::integer INTO active_sessions
  FROM public.agent_browser_sessions AS session
  WHERE session.agent_id = authenticated_resident.id
    AND session.revoked_at IS NULL
    AND session.expires_at > pg_catalog.now();
  INSERT INTO public.resident_identity_session_receipts (
    resident_id, credential_id, session_id, operation, outcome, details
  ) VALUES (
    authenticated_resident.id, current_session.credential_id,
    created_session.id, 'session_rotate', 'rotated',
    pg_catalog.jsonb_build_object(
      'priorSessionId', current_session.id,
      'residentName', authenticated_resident.name,
      'activeSessionCount', active_sessions
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'sessionId', created_session.id,
    'expiresAt', created_session.expires_at,
    'activeSessionCount', active_sessions,
    'accessMode', CASE
      WHEN authenticated_resident.moderation_status = 'active'
        THEN 'active'
      ELSE 'restricted'
    END,
    'resident', pg_catalog.jsonb_build_object(
      'id', authenticated_resident.id,
      'name', authenticated_resident.name,
      'description', authenticated_resident.description,
      'avatarUrl', authenticated_resident.avatar_url,
      'residentVisibility', authenticated_resident.resident_visibility,
      'moderationStatus', authenticated_resident.moderation_status
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION public.spacebot_revoke_resident_session_v1(
  p_session_token text,
  p_scope varchar(8)
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  session_token_hash varchar(64);
  stored_session public.agent_browser_sessions%ROWTYPE;
  revoked_count integer := 0;
  receipt_outcome varchar(24);
BEGIN
  IF p_session_token IS NULL
     OR p_session_token !~ '^[A-Za-z0-9_-]{43}$'
     OR p_scope IS NULL
     OR p_scope NOT IN ('current', 'all') THEN
    RETURN pg_catalog.jsonb_build_object(
      'terminal', true, 'outcome', 'absent', 'revokedCount', 0
    );
  END IF;
  session_token_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_session_token, 'UTF8')),
    'hex'
  );
  SELECT session.* INTO stored_session
  FROM public.agent_browser_sessions AS session
  WHERE session.token_hash = session_token_hash
  LIMIT 1;
  IF stored_session.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'terminal', true, 'outcome', 'absent', 'revokedCount', 0
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agent-browser-session:' || stored_session.agent_id::text, 0
  ));
  SELECT session.* INTO stored_session
  FROM public.agent_browser_sessions AS session
  WHERE session.id = stored_session.id
  FOR UPDATE;

  IF p_scope = 'all' THEN
    IF stored_session.revoked_at IS NOT NULL
       OR stored_session.expires_at <= pg_catalog.now()
       OR NOT EXISTS (
         SELECT 1
         FROM public.agent_credentials AS credential
         WHERE credential.id = stored_session.credential_id
           AND credential.agent_id = stored_session.agent_id
           AND credential.revoked_at IS NULL
           AND NOT EXISTS (
             SELECT 1
             FROM public.credential_security_denylist AS denied
             WHERE denied.lookup_hash = credential.lookup_hash
           )
       ) THEN
      RETURN pg_catalog.jsonb_build_object(
        'terminal', true, 'outcome', 'already_invalid', 'revokedCount', 0
      );
    END IF;
    UPDATE public.agent_browser_sessions
    SET revoked_at = pg_catalog.now(), revocation_reason = 'logout-all'
    WHERE agent_id = stored_session.agent_id AND revoked_at IS NULL;
    GET DIAGNOSTICS revoked_count = ROW_COUNT;
    receipt_outcome := 'revoked_all';
  ELSIF stored_session.revoked_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'terminal', true, 'outcome', 'already_revoked', 'revokedCount', 0
    );
  ELSE
    UPDATE public.agent_browser_sessions
    SET revoked_at = pg_catalog.now(), revocation_reason = 'logout'
    WHERE id = stored_session.id AND revoked_at IS NULL;
    GET DIAGNOSTICS revoked_count = ROW_COUNT;
    receipt_outcome := 'revoked';
  END IF;

  INSERT INTO public.resident_identity_session_receipts (
    resident_id, credential_id, session_id, operation, outcome, details
  ) VALUES (
    stored_session.agent_id, stored_session.credential_id,
    stored_session.id, 'session_revoke', receipt_outcome,
    pg_catalog.jsonb_build_object(
      'scope', p_scope,
      'residentName', (
        SELECT name FROM public.agents WHERE id = stored_session.agent_id
      ),
      'revokedCount', revoked_count
    )
  );
  RETURN pg_catalog.jsonb_build_object(
    'terminal', true, 'outcome', receipt_outcome,
    'revokedCount', revoked_count
  );
END
$$;

REVOKE ALL ON TABLE public.resident_identity_session_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spacebot_register_resident_v1(
  varchar, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spacebot_open_resident_session_v1(
  text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spacebot_touch_resident_session_v1(text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spacebot_rotate_resident_session_v1(text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spacebot_revoke_resident_session_v1(
  text, varchar
) FROM PUBLIC;

COMMIT;
