BEGIN;
SET LOCAL search_path = public, extensions, pg_catalog;

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE bot_profiles
  ADD COLUMN IF NOT EXISTS bio_provenance jsonb;

CREATE TABLE IF NOT EXISTS resident_autonomy_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL UNIQUE REFERENCES agents(id) ON DELETE RESTRICT,
  delegate varchar(16) NOT NULL DEFAULT 'lucy',
  grant_source varchar(24) NOT NULL,
  manifest_id varchar(80),
  allowed_actions text[] NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  min_post_interval_minutes integer NOT NULL DEFAULT 480,
  max_posts_per_24_hours integer NOT NULL DEFAULT 3,
  min_comment_interval_minutes integer NOT NULL DEFAULT 90,
  max_comments_per_24_hours integer NOT NULL DEFAULT 8,
  status varchar(16) NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_autonomy_delegations_delegate_check CHECK (delegate = 'lucy'),
  CONSTRAINT resident_autonomy_delegations_source_check CHECK (
    grant_source IN ('resident_credential', 'founding_manifest')
  ),
  CONSTRAINT resident_autonomy_delegations_status_check CHECK (
    status IN ('active', 'paused', 'revoked')
  ),
  CONSTRAINT resident_autonomy_delegations_actions_check CHECK (
    allowed_actions <@ ARRAY['post','comment','profile','learn','rest']::text[]
    AND cardinality(allowed_actions) > 0
    AND allowed_actions @> ARRAY['rest']::text[]
  ),
  CONSTRAINT resident_autonomy_delegations_cadence_check CHECK (
    min_post_interval_minutes BETWEEN 60 AND 10080
    AND max_posts_per_24_hours BETWEEN 0 AND 6
    AND min_comment_interval_minutes BETWEEN 15 AND 10080
    AND max_comments_per_24_hours BETWEEN 0 AND 24
  )
);

CREATE INDEX IF NOT EXISTS resident_autonomy_delegations_active_idx
  ON resident_autonomy_delegations(delegate, status, expires_at);

CREATE TABLE IF NOT EXISTS resident_autonomy_delegation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id uuid NOT NULL REFERENCES resident_autonomy_delegations(id) ON DELETE RESTRICT,
  resident_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  event_type varchar(16) NOT NULL,
  actor_type varchar(24) NOT NULL,
  request_fingerprint varchar(64) NOT NULL,
  delegation_revision bigint NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_autonomy_delegation_events_type_check CHECK (
    event_type IN ('granted', 'updated', 'paused', 'resumed', 'revoked')
  ),
  CONSTRAINT resident_autonomy_delegation_events_actor_check CHECK (
    actor_type IN ('resident', 'founding_manifest')
  ),
  CONSTRAINT resident_autonomy_delegation_events_fingerprint_check CHECK (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  )
);

CREATE INDEX IF NOT EXISTS resident_autonomy_delegation_events_resident_created_idx
  ON resident_autonomy_delegation_events(resident_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS resident_autonomy_delegation_events_revision_unique_idx
  ON resident_autonomy_delegation_events(delegation_id, delegation_revision);
CREATE UNIQUE INDEX IF NOT EXISTS resident_autonomy_delegation_events_request_unique_idx
  ON resident_autonomy_delegation_events(resident_id, request_fingerprint);

CREATE TABLE IF NOT EXISTS lucy_autonomy_control (
  singleton_id smallint PRIMARY KEY DEFAULT 1,
  mode varchar(16) NOT NULL DEFAULT 'disabled',
  canary_resident_id uuid REFERENCES agents(id) ON DELETE RESTRICT,
  allowed_actions text[] NOT NULL DEFAULT ARRAY['rest']::text[],
  max_residents integer NOT NULL DEFAULT 1,
  revision bigint NOT NULL DEFAULT 1,
  reason text NOT NULL,
  updated_by varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lucy_autonomy_control_singleton_check CHECK (singleton_id = 1),
  CONSTRAINT lucy_autonomy_control_mode_check CHECK (
    mode IN ('disabled', 'canary', 'full')
  ),
  CONSTRAINT lucy_autonomy_control_actions_check CHECK (
    allowed_actions = ARRAY['rest']::text[]
  ),
  CONSTRAINT lucy_autonomy_control_scope_check CHECK (
    max_residents BETWEEN 1 AND 246
    AND (
      (mode = 'disabled' AND canary_resident_id IS NULL AND max_residents = 1)
      OR (mode = 'canary' AND canary_resident_id IS NOT NULL AND max_residents = 1)
      OR (mode = 'full' AND canary_resident_id IS NULL)
    )
  )
);

CREATE TABLE IF NOT EXISTS lucy_autonomy_control_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_revision bigint NOT NULL UNIQUE,
  prior_mode varchar(16),
  mode varchar(16) NOT NULL,
  canary_resident_id uuid REFERENCES agents(id) ON DELETE RESTRICT,
  allowed_actions text[] NOT NULL,
  max_residents integer NOT NULL,
  actor_type varchar(24) NOT NULL,
  actor_subject varchar(80) NOT NULL,
  event_type varchar(24) NOT NULL,
  request_fingerprint varchar(64) NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lucy_autonomy_control_events_mode_check CHECK (
    mode IN ('disabled', 'canary', 'full')
    AND (prior_mode IS NULL OR prior_mode IN ('disabled', 'canary', 'full'))
  ),
  CONSTRAINT lucy_autonomy_control_events_actor_check CHECK (
    actor_type IN ('migration', 'operator')
  ),
  CONSTRAINT lucy_autonomy_control_events_type_check CHECK (
    event_type IN ('initialized', 'mode_changed', 'emergency_disabled')
  ),
  CONSTRAINT lucy_autonomy_control_events_fingerprint_check CHECK (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS lucy_autonomy_control_events_request_unique_idx
  ON lucy_autonomy_control_events(request_fingerprint);

INSERT INTO lucy_autonomy_control (
  singleton_id, mode, canary_resident_id, allowed_actions, max_residents,
  revision, reason, updated_by
) VALUES (
  1, 'disabled', NULL, ARRAY['rest']::text[], 1,
  1, 'Fail-closed default until a one-resident canary is explicitly approved.',
  'PW7404-1086-migration'
)
ON CONFLICT (singleton_id) DO NOTHING;

INSERT INTO lucy_autonomy_control_events (
  control_revision, prior_mode, mode, canary_resident_id, allowed_actions,
  max_residents, actor_type, actor_subject, event_type,
  request_fingerprint, reason
)
SELECT
  control.revision,
  NULL,
  control.mode,
  control.canary_resident_id,
  control.allowed_actions,
  control.max_residents,
  'migration',
  'PW7404-1086-migration',
  'initialized',
  encode(digest('PW7404-1086:autonomy-control:disabled:v1', 'sha256'), 'hex'),
  control.reason
FROM lucy_autonomy_control AS control
WHERE control.singleton_id = 1
ON CONFLICT (control_revision) DO NOTHING;

CREATE TABLE IF NOT EXISTS lucy_autonomy_runs (
  command_id varchar(128) PRIMARY KEY,
  source varchar(16) NOT NULL DEFAULT 'lucy',
  resident_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  delegation_id uuid NOT NULL REFERENCES resident_autonomy_delegations(id) ON DELETE RESTRICT,
  delegation_revision bigint NOT NULL,
  control_revision bigint NOT NULL REFERENCES lucy_autonomy_control_events(control_revision) ON DELETE RESTRICT,
  control_mode varchar(16) NOT NULL,
  slot_number bigint NOT NULL,
  slot_start timestamptz NOT NULL,
  slot_end timestamptz NOT NULL,
  worker_id uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  policy_version varchar(32) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'reserved',
  action_type varchar(16),
  payload_sha256 varchar(64),
  content_sha256 varchar(64),
  target_post_id uuid REFERENCES posts(id),
  created_post_id uuid REFERENCES posts(id),
  created_comment_id uuid REFERENCES comments(id),
  activity_id uuid REFERENCES bot_activity(id),
  suppression_code varchar(40),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT lucy_autonomy_runs_source_check CHECK (source = 'lucy'),
  CONSTRAINT lucy_autonomy_runs_status_check CHECK (
    status IN ('reserved', 'running', 'committed', 'suppressed', 'noop', 'expired')
  ),
  CONSTRAINT lucy_autonomy_runs_action_check CHECK (
    action_type IS NULL OR action_type = 'rest'
  ),
  CONSTRAINT lucy_autonomy_runs_control_mode_check CHECK (
    control_mode IN ('canary', 'full')
  ),
  CONSTRAINT lucy_autonomy_runs_payload_sha256_check CHECK (
    payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT lucy_autonomy_runs_content_sha256_check CHECK (
    content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT lucy_autonomy_runs_slot_check CHECK (
    slot_number >= 0 AND slot_end > slot_start
  ),
  CONSTRAINT lucy_autonomy_runs_delegation_revision_fk FOREIGN KEY (
    delegation_id, delegation_revision
  ) REFERENCES resident_autonomy_delegation_events (
    delegation_id, delegation_revision
  ) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS lucy_autonomy_runs_resident_slot_unique_idx
  ON lucy_autonomy_runs(source, resident_id, slot_number, control_revision);
CREATE UNIQUE INDEX IF NOT EXISTS lucy_autonomy_runs_activity_unique_idx
  ON lucy_autonomy_runs(activity_id) WHERE activity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lucy_autonomy_runs_post_unique_idx
  ON lucy_autonomy_runs(created_post_id) WHERE created_post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lucy_autonomy_runs_comment_unique_idx
  ON lucy_autonomy_runs(created_comment_id) WHERE created_comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lucy_autonomy_runs_lease_idx
  ON lucy_autonomy_runs(status, lease_expires_at);
CREATE INDEX IF NOT EXISTS lucy_autonomy_runs_resident_action_idx
  ON lucy_autonomy_runs(resident_id, action_type, completed_at DESC);
CREATE INDEX IF NOT EXISTS lucy_autonomy_runs_content_idx
  ON lucy_autonomy_runs(resident_id, action_type, content_sha256, completed_at DESC);
CREATE INDEX IF NOT EXISTS posts_agent_created_desc_idx
  ON posts(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_agent_created_desc_idx
  ON comments(agent_id, created_at DESC);

-- Freeze the authority source while the exact founding manifest is attested
-- and granted. SHARE blocks concurrent writes but permits normal reads.
LOCK TABLE bot_configs, agents IN SHARE MODE;

DO $$
DECLARE
  selected_count integer;
  selected_sha256 text;
BEGIN
  SELECT
    count(*)::integer,
    encode(digest(convert_to(string_agg(
      bc.agent_id::text || ':' || bc.bot_name,
      E'\n' ORDER BY bc.agent_id
    ), 'UTF8'), 'sha256'), 'hex')
  INTO selected_count, selected_sha256
  FROM bot_configs AS bc
  JOIN agents AS resident ON resident.id = bc.agent_id
  WHERE bc.is_active = true
    AND bc.bot_type IN ('expert', 'super_machine', 'minion', 'labbot', 'lab-resident')
    AND resident.moderation_status = 'active';

  IF selected_count <> 246 OR selected_sha256 <> '8702c3be7068295ed1300ae659705cd4e85bc32adfcccce430e0c6014f9d456e' THEN
    RAISE EXCEPTION 'PW7404-1086 founding resident manifest mismatch: count %, sha256 %',
      selected_count, selected_sha256;
  END IF;
END
$$;

INSERT INTO resident_autonomy_delegations (
  resident_id,
  grant_source,
  manifest_id,
  allowed_actions,
  min_post_interval_minutes,
  max_posts_per_24_hours,
  min_comment_interval_minutes,
  max_comments_per_24_hours
)
SELECT
  bc.agent_id,
  'founding_manifest',
  'PW7404-1086-spacebot-founding-residents-v1',
  ARRAY['post','comment','profile','learn','rest']::text[],
  480,
  3,
  90,
  8
FROM bot_configs AS bc
JOIN agents AS resident ON resident.id = bc.agent_id
WHERE bc.is_active = true
  AND bc.bot_type IN ('expert', 'super_machine', 'minion', 'labbot', 'lab-resident')
  AND resident.moderation_status = 'active'
ON CONFLICT (resident_id) DO NOTHING;

INSERT INTO resident_autonomy_delegation_events (
  delegation_id,
  resident_id,
  event_type,
  actor_type,
  request_fingerprint,
  delegation_revision,
  details
)
SELECT
  delegation.id,
  delegation.resident_id,
  'granted',
  'founding_manifest',
  encode(digest(
    delegation.resident_id::text || ':PW7404-1086-spacebot-founding-residents-v1',
    'sha256'
  ), 'hex'),
  delegation.revision,
  jsonb_build_object(
    'manifestId', 'PW7404-1086-spacebot-founding-residents-v1',
    'delegate', 'lucy',
    'publicProvenanceRequired', true
  )
FROM resident_autonomy_delegations AS delegation
WHERE delegation.manifest_id = 'PW7404-1086-spacebot-founding-residents-v1'
  AND NOT EXISTS (
    SELECT 1
    FROM resident_autonomy_delegation_events AS event
    WHERE event.delegation_id = delegation.id
      AND event.event_type = 'granted'
  );

DO $$
DECLARE
  granted_delegations integer;
  matching_events integer;
BEGIN
  SELECT count(*)::integer INTO granted_delegations
  FROM resident_autonomy_delegations
  WHERE manifest_id = 'PW7404-1086-spacebot-founding-residents-v1'
    AND grant_source = 'founding_manifest'
    AND delegate = 'lucy'
    AND status = 'active';

  SELECT count(*)::integer INTO matching_events
  FROM resident_autonomy_delegations AS delegation
  JOIN resident_autonomy_delegation_events AS event
    ON event.delegation_id = delegation.id
   AND event.resident_id = delegation.resident_id
   AND event.delegation_revision = delegation.revision
   AND event.event_type = 'granted'
  WHERE delegation.manifest_id = 'PW7404-1086-spacebot-founding-residents-v1';

  IF granted_delegations <> 246 OR matching_events <> 246 THEN
    RAISE EXCEPTION 'PW7404-1086 founding grant postcondition failed: delegations %, events %',
      granted_delegations, matching_events;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION spacebot_set_resident_autonomy_delegation(
  p_resident_id uuid,
  p_allowed_actions text[],
  p_min_post_interval_minutes integer,
  p_max_posts_per_24_hours integer,
  p_min_comment_interval_minutes integer,
  p_max_comments_per_24_hours integer,
  p_expires_at timestamptz,
  p_request_fingerprint varchar(64)
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  prior public.resident_autonomy_delegations%ROWTYPE;
  current_row public.resident_autonomy_delegations%ROWTYPE;
  event_name varchar(16);
  replay_delegation_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'resident-autonomy-delegation:' || p_resident_id::text, 0
  ));
  SELECT delegation_id INTO replay_delegation_id
  FROM public.resident_autonomy_delegation_events
  WHERE resident_id = p_resident_id
    AND request_fingerprint = p_request_fingerprint;
  IF replay_delegation_id IS NOT NULL THEN RETURN replay_delegation_id; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agents
    WHERE id = p_resident_id AND moderation_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Resident is not active';
  END IF;

  SELECT * INTO prior
  FROM public.resident_autonomy_delegations
  WHERE resident_id = p_resident_id
  FOR UPDATE;

  IF prior.id IS NULL THEN
    INSERT INTO public.resident_autonomy_delegations (
      resident_id, delegate, grant_source, allowed_actions,
      min_post_interval_minutes, max_posts_per_24_hours,
      min_comment_interval_minutes, max_comments_per_24_hours,
      status, starts_at, expires_at, revision
    ) VALUES (
      p_resident_id, 'lucy', 'resident_credential', p_allowed_actions,
      p_min_post_interval_minutes, p_max_posts_per_24_hours,
      p_min_comment_interval_minutes, p_max_comments_per_24_hours,
      'active', pg_catalog.now(), p_expires_at, 1
    ) RETURNING * INTO current_row;
    event_name := 'granted';
  ELSE
    UPDATE public.resident_autonomy_delegations
    SET grant_source = 'resident_credential', manifest_id = NULL,
        allowed_actions = p_allowed_actions,
        min_post_interval_minutes = p_min_post_interval_minutes,
        max_posts_per_24_hours = p_max_posts_per_24_hours,
        min_comment_interval_minutes = p_min_comment_interval_minutes,
        max_comments_per_24_hours = p_max_comments_per_24_hours,
        status = 'active', starts_at = pg_catalog.now(), expires_at = p_expires_at,
        revoked_at = NULL, revision = revision + 1, updated_at = pg_catalog.now()
    WHERE id = prior.id
    RETURNING * INTO current_row;
    event_name := CASE
      WHEN prior.status = 'revoked' THEN 'granted'
      WHEN prior.status = 'paused' THEN 'resumed'
      ELSE 'updated'
    END;
  END IF;

  INSERT INTO public.resident_autonomy_delegation_events (
    delegation_id, resident_id, event_type, actor_type,
    request_fingerprint, delegation_revision, details
  ) VALUES (
    current_row.id, p_resident_id, event_name, 'resident',
    p_request_fingerprint, current_row.revision,
    pg_catalog.jsonb_build_object(
      'allowedActions', current_row.allowed_actions,
      'minPostIntervalMinutes', current_row.min_post_interval_minutes,
      'maxPostsPer24Hours', current_row.max_posts_per_24_hours,
      'minCommentIntervalMinutes', current_row.min_comment_interval_minutes,
      'maxCommentsPer24Hours', current_row.max_comments_per_24_hours,
      'expiresAt', current_row.expires_at
    )
  );
  RETURN current_row.id;
END
$$;

CREATE OR REPLACE FUNCTION spacebot_set_resident_autonomy_status(
  p_resident_id uuid,
  p_status varchar(16),
  p_request_fingerprint varchar(64)
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  prior public.resident_autonomy_delegations%ROWTYPE;
  current_row public.resident_autonomy_delegations%ROWTYPE;
  event_name varchar(16);
  replay_delegation_id uuid;
BEGIN
  IF p_status NOT IN ('active', 'paused', 'revoked') THEN
    RAISE EXCEPTION 'Invalid autonomy status';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'resident-autonomy-delegation:' || p_resident_id::text, 0
  ));
  SELECT delegation_id INTO replay_delegation_id
  FROM public.resident_autonomy_delegation_events
  WHERE resident_id = p_resident_id
    AND request_fingerprint = p_request_fingerprint;
  IF replay_delegation_id IS NOT NULL THEN RETURN replay_delegation_id; END IF;
  SELECT * INTO prior
  FROM public.resident_autonomy_delegations
  WHERE resident_id = p_resident_id
  FOR UPDATE;
  IF prior.id IS NULL THEN RETURN NULL; END IF;
  IF prior.status = 'revoked' AND p_status <> 'revoked' THEN RETURN NULL; END IF;
  IF prior.status = p_status THEN RETURN prior.id; END IF;

  UPDATE public.resident_autonomy_delegations
  SET status = p_status,
      revoked_at = CASE WHEN p_status = 'revoked' THEN pg_catalog.now() ELSE NULL END,
      revision = revision + 1,
      updated_at = pg_catalog.now()
  WHERE id = prior.id
  RETURNING * INTO current_row;
  event_name := CASE
    WHEN p_status = 'revoked' THEN 'revoked'
    WHEN p_status = 'paused' THEN 'paused'
    ELSE 'resumed'
  END;
  INSERT INTO public.resident_autonomy_delegation_events (
    delegation_id, resident_id, event_type, actor_type,
    request_fingerprint, delegation_revision, details
  ) VALUES (
    current_row.id, p_resident_id, event_name, 'resident',
    p_request_fingerprint, current_row.revision,
    pg_catalog.jsonb_build_object('status', p_status)
  );
  RETURN current_row.id;
END
$$;

CREATE OR REPLACE FUNCTION spacebot_set_lucy_autonomy_mode(
  p_expected_revision bigint,
  p_mode varchar(16),
  p_canary_resident_id uuid,
  p_actor_subject varchar(80),
  p_reason text,
  p_request_fingerprint varchar(64)
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  prior public.lucy_autonomy_control%ROWTYPE;
  replay public.lucy_autonomy_control_events%ROWTYPE;
  next_revision bigint;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 1
     OR p_mode NOT IN ('disabled', 'canary', 'full')
     OR length(trim(p_actor_subject)) NOT BETWEEN 1 AND 80
     OR length(trim(p_reason)) NOT BETWEEN 10 AND 1000
     OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid LUCY autonomy control request';
  END IF;
  IF (p_mode = 'canary' AND p_canary_resident_id IS NULL)
     OR (p_mode <> 'canary' AND p_canary_resident_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid LUCY autonomy control scope';
  END IF;

  SELECT * INTO prior
  FROM public.lucy_autonomy_control
  WHERE singleton_id = 1
  FOR UPDATE;
  SELECT * INTO replay
  FROM public.lucy_autonomy_control_events
  WHERE request_fingerprint = p_request_fingerprint;
  IF replay.id IS NOT NULL THEN
    IF prior.revision <> replay.control_revision
       OR replay.mode <> p_mode
       OR replay.canary_resident_id IS DISTINCT FROM p_canary_resident_id
       OR replay.actor_subject <> trim(p_actor_subject)
       OR replay.reason <> trim(p_reason) THEN
      RAISE EXCEPTION 'LUCY autonomy request fingerprint conflict';
    END IF;
    RETURN replay.control_revision;
  END IF;
  IF prior.singleton_id IS NULL OR prior.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'LUCY autonomy control revision conflict';
  END IF;
  IF p_mode = 'canary' AND NOT EXISTS (
    SELECT 1
    FROM public.agents AS resident
    JOIN public.bot_configs AS config ON config.agent_id = resident.id
    JOIN public.resident_autonomy_delegations AS delegation
      ON delegation.resident_id = resident.id
    WHERE resident.id = p_canary_resident_id
      AND resident.moderation_status = 'active'
      AND config.is_active = true
      AND delegation.delegate = 'lucy'
      AND delegation.status = 'active'
      AND delegation.revoked_at IS NULL
      AND delegation.starts_at <= pg_catalog.now()
      AND (delegation.expires_at IS NULL OR delegation.expires_at > pg_catalog.now())
      AND 'rest' = ANY(delegation.allowed_actions)
      AND EXISTS (
        SELECT 1 FROM public.agent_credentials AS credential
        WHERE credential.agent_id = resident.id
          AND credential.revoked_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Canary resident is not eligible';
  END IF;

  next_revision := prior.revision + 1;
  UPDATE public.lucy_autonomy_control
  SET mode = p_mode,
      canary_resident_id = p_canary_resident_id,
      allowed_actions = ARRAY['rest']::text[],
      max_residents = CASE WHEN p_mode = 'full' THEN 246 ELSE 1 END,
      revision = next_revision,
      reason = trim(p_reason),
      updated_by = trim(p_actor_subject),
      updated_at = pg_catalog.now()
  WHERE singleton_id = 1;

  INSERT INTO public.lucy_autonomy_control_events (
    control_revision, prior_mode, mode, canary_resident_id, allowed_actions,
    max_residents, actor_type, actor_subject, event_type,
    request_fingerprint, reason
  ) VALUES (
    next_revision, prior.mode, p_mode, p_canary_resident_id,
    ARRAY['rest']::text[], CASE WHEN p_mode = 'full' THEN 246 ELSE 1 END,
    'operator', trim(p_actor_subject), 'mode_changed',
    p_request_fingerprint, trim(p_reason)
  );

  UPDATE public.lucy_autonomy_runs
  SET status = 'expired',
      suppression_code = 'control_revision_fenced',
      result = pg_catalog.jsonb_build_object(
        'outcome', 'expired', 'controlRevision', next_revision
      ),
      completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE status IN ('reserved', 'running')
    AND control_revision < next_revision;
  RETURN next_revision;
END
$$;

CREATE OR REPLACE FUNCTION spacebot_emergency_disable_lucy_autonomy(
  p_actor_subject varchar(80),
  p_reason text,
  p_request_fingerprint varchar(64)
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  prior public.lucy_autonomy_control%ROWTYPE;
  replay public.lucy_autonomy_control_events%ROWTYPE;
  next_revision bigint;
BEGIN
  IF length(trim(p_actor_subject)) NOT BETWEEN 1 AND 80
     OR length(trim(p_reason)) NOT BETWEEN 10 AND 1000
     OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid LUCY emergency disable request';
  END IF;
  SELECT * INTO prior
  FROM public.lucy_autonomy_control
  WHERE singleton_id = 1
  FOR UPDATE;
  SELECT * INTO replay
  FROM public.lucy_autonomy_control_events
  WHERE request_fingerprint = p_request_fingerprint;
  IF replay.id IS NOT NULL THEN
    IF prior.mode <> 'disabled'
       OR prior.revision <> replay.control_revision
       OR replay.event_type <> 'emergency_disabled'
       OR replay.actor_subject <> trim(p_actor_subject)
       OR replay.reason <> trim(p_reason) THEN
      RAISE EXCEPTION 'LUCY emergency fingerprint conflict';
    END IF;
    RETURN replay.control_revision;
  END IF;
  IF prior.singleton_id IS NULL THEN
    RAISE EXCEPTION 'LUCY autonomy control is unavailable';
  END IF;
  next_revision := prior.revision + 1;
  UPDATE public.lucy_autonomy_control
  SET mode = 'disabled', canary_resident_id = NULL,
      allowed_actions = ARRAY['rest']::text[], max_residents = 1,
      revision = next_revision, reason = trim(p_reason),
      updated_by = trim(p_actor_subject), updated_at = pg_catalog.now()
  WHERE singleton_id = 1;
  INSERT INTO public.lucy_autonomy_control_events (
    control_revision, prior_mode, mode, canary_resident_id, allowed_actions,
    max_residents, actor_type, actor_subject, event_type,
    request_fingerprint, reason
  ) VALUES (
    next_revision, prior.mode, 'disabled', NULL, ARRAY['rest']::text[], 1,
    'operator', trim(p_actor_subject), 'emergency_disabled',
    p_request_fingerprint, trim(p_reason)
  );
  UPDATE public.lucy_autonomy_runs
  SET status = 'expired', suppression_code = 'emergency_disabled',
      result = pg_catalog.jsonb_build_object(
        'outcome', 'expired', 'controlRevision', next_revision
      ),
      completed_at = pg_catalog.now(), updated_at = pg_catalog.now()
  WHERE status IN ('reserved', 'running')
    AND control_revision < next_revision;
  RETURN next_revision;
END
$$;

CREATE OR REPLACE FUNCTION spacebot_reject_immutable_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Autonomy event ledgers are append-only';
END
$$;

DROP TRIGGER IF EXISTS resident_autonomy_delegation_events_immutable_row
  ON resident_autonomy_delegation_events;
CREATE TRIGGER resident_autonomy_delegation_events_immutable_row
  BEFORE UPDATE OR DELETE ON resident_autonomy_delegation_events
  FOR EACH ROW EXECUTE FUNCTION spacebot_reject_immutable_event_mutation();
ALTER TABLE resident_autonomy_delegation_events
  ENABLE ALWAYS TRIGGER resident_autonomy_delegation_events_immutable_row;
DROP TRIGGER IF EXISTS resident_autonomy_delegation_events_immutable_truncate
  ON resident_autonomy_delegation_events;
CREATE TRIGGER resident_autonomy_delegation_events_immutable_truncate
  BEFORE TRUNCATE ON resident_autonomy_delegation_events
  FOR EACH STATEMENT EXECUTE FUNCTION spacebot_reject_immutable_event_mutation();
ALTER TABLE resident_autonomy_delegation_events
  ENABLE ALWAYS TRIGGER resident_autonomy_delegation_events_immutable_truncate;

DROP TRIGGER IF EXISTS lucy_autonomy_control_events_immutable_row
  ON lucy_autonomy_control_events;
CREATE TRIGGER lucy_autonomy_control_events_immutable_row
  BEFORE UPDATE OR DELETE ON lucy_autonomy_control_events
  FOR EACH ROW EXECUTE FUNCTION spacebot_reject_immutable_event_mutation();
ALTER TABLE lucy_autonomy_control_events
  ENABLE ALWAYS TRIGGER lucy_autonomy_control_events_immutable_row;
DROP TRIGGER IF EXISTS lucy_autonomy_control_events_immutable_truncate
  ON lucy_autonomy_control_events;
CREATE TRIGGER lucy_autonomy_control_events_immutable_truncate
  BEFORE TRUNCATE ON lucy_autonomy_control_events
  FOR EACH STATEMENT EXECUTE FUNCTION spacebot_reject_immutable_event_mutation();
ALTER TABLE lucy_autonomy_control_events
  ENABLE ALWAYS TRIGGER lucy_autonomy_control_events_immutable_truncate;

REVOKE ALL ON FUNCTION spacebot_set_resident_autonomy_delegation(
  uuid, text[], integer, integer, integer, integer, timestamptz, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION spacebot_set_resident_autonomy_status(
  uuid, varchar, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION spacebot_set_lucy_autonomy_mode(
  bigint, varchar, uuid, varchar, text, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION spacebot_emergency_disable_lucy_autonomy(
  varchar, text, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION spacebot_reject_immutable_event_mutation()
  FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spacebot_runtime') THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE 'REVOKE service_role FROM spacebot_runtime';
    END IF;
    GRANT SELECT ON resident_autonomy_delegations TO spacebot_runtime;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
      ON resident_autonomy_delegations FROM spacebot_runtime;
    GRANT SELECT ON resident_autonomy_delegation_events TO spacebot_runtime;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
      ON resident_autonomy_delegation_events FROM spacebot_runtime;
    GRANT SELECT ON lucy_autonomy_control TO spacebot_runtime;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
      ON lucy_autonomy_control FROM spacebot_runtime;
    GRANT SELECT ON lucy_autonomy_control_events TO spacebot_runtime;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
      ON lucy_autonomy_control_events FROM spacebot_runtime;
    REVOKE ALL ON FUNCTION spacebot_set_lucy_autonomy_mode(
      bigint, varchar, uuid, varchar, text, varchar
    ) FROM spacebot_runtime;
    REVOKE ALL ON FUNCTION spacebot_emergency_disable_lucy_autonomy(
      varchar, text, varchar
    ) FROM spacebot_runtime;
    REVOKE ALL ON FUNCTION spacebot_set_resident_autonomy_delegation(
      uuid, text[], integer, integer, integer, integer, timestamptz, varchar
    ) FROM spacebot_runtime;
    REVOKE ALL ON FUNCTION spacebot_set_resident_autonomy_status(
      uuid, varchar, varchar
    ) FROM spacebot_runtime;
    GRANT SELECT, INSERT, UPDATE ON lucy_autonomy_runs TO spacebot_runtime;
    REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
      ON lucy_autonomy_runs FROM spacebot_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spacebot_autonomy_controller') THEN
    GRANT EXECUTE ON FUNCTION spacebot_set_resident_autonomy_delegation(
      uuid, text[], integer, integer, integer, integer, timestamptz, varchar
    ) TO spacebot_autonomy_controller;
    GRANT EXECUTE ON FUNCTION spacebot_set_resident_autonomy_status(
      uuid, varchar, varchar
    ) TO spacebot_autonomy_controller;
  END IF;
END
$$;

COMMIT;
