BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $$
DECLARE
  active_acl_cutover boolean := false;
BEGIN
  IF to_regclass('public.agent_browser_sessions') IS NULL
     OR to_regclass('public.resident_identity_session_receipts') IS NULL THEN
    RAISE EXCEPTION 'PW7404-1117 rollback prerequisites are incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = current_user AND rolsuper
  ) THEN
    RAISE EXCEPTION 'PW7404-1117 rollback requires the reviewed superuser lane';
  END IF;
  IF to_regclass('public.resident_identity_acl_cutover_events') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM public.resident_identity_acl_cutover_events AS cutover
        WHERE cutover.artifact = 'PW7404-1127'
          AND cutover.event_type = 'cutover'
          AND NOT EXISTS (
            SELECT 1
            FROM public.resident_identity_acl_cutover_events AS rollback
            WHERE rollback.artifact = cutover.artifact
              AND rollback.event_type = 'rollback'
          )
      )
    $query$ INTO active_acl_cutover;
  END IF;
  IF active_acl_cutover THEN
    RAISE EXCEPTION
      'PW7404-1117 rollback requires PW7404-1127 ACL rollback first';
  END IF;
END
$$;

LOCK TABLE public.agent_browser_sessions IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.resident_identity_session_receipts
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  INSERT INTO public.resident_identity_session_receipts (
    resident_id, credential_id, session_id, operation, outcome, details
  )
  SELECT session.agent_id, session.credential_id, session.id,
    'session_revoke', 'revoked',
    pg_catalog.jsonb_build_object(
      'scope', 'rollback-expired',
      'originalExpiresAt', session.expires_at,
      'originalLastSeenAt', session.last_seen_at
    )
  FROM public.agent_browser_sessions AS session
  WHERE session.revoked_at IS NULL
    AND session.expires_at <= pg_catalog.now();

  UPDATE public.agent_browser_sessions
  SET revoked_at = pg_catalog.now(), revocation_reason = 'rollback-expired'
  WHERE revoked_at IS NULL AND expires_at <= pg_catalog.now();

  INSERT INTO public.resident_identity_session_receipts (
    resident_id, credential_id, session_id, operation, outcome, details
  )
  SELECT session.agent_id, session.credential_id, session.id,
    'session_revoke', 'revoked',
    pg_catalog.jsonb_build_object(
      'scope', 'rollback-legacy-expiry-policy',
      'originalExpiresAt', session.expires_at,
      'restoredExpiresAt', session.created_at + interval '30 minutes'
    )
  FROM public.agent_browser_sessions AS session
  WHERE session.revoked_at IS NULL
    AND session.expires_at > pg_catalog.now()
    AND session.expires_at > session.created_at + interval '30 minutes'
    AND session.created_at + interval '30 minutes' <= pg_catalog.now();

  UPDATE public.agent_browser_sessions
  SET revoked_at = pg_catalog.now(),
      revocation_reason = 'rollback-legacy-expiry-policy'
  WHERE revoked_at IS NULL
    AND expires_at > created_at + interval '30 minutes'
    AND created_at + interval '30 minutes' <= pg_catalog.now();

  INSERT INTO public.resident_identity_session_receipts (
    resident_id, credential_id, session_id, operation, outcome, details
  )
  SELECT session.agent_id, session.credential_id, session.id,
    'session_rotate', 'rotated',
    pg_catalog.jsonb_build_object(
      'scope', 'rollback-legacy-expiry-cap',
      'originalExpiresAt', session.expires_at,
      'restoredExpiresAt', session.created_at + interval '30 minutes'
    )
  FROM public.agent_browser_sessions AS session
  WHERE session.revoked_at IS NULL
    AND session.expires_at > session.created_at + interval '30 minutes'
    AND session.created_at + interval '30 minutes' > pg_catalog.now();

  UPDATE public.agent_browser_sessions
  SET expires_at = created_at + interval '30 minutes'
  WHERE expires_at > created_at + interval '30 minutes';

  IF EXISTS (
    SELECT agent_id
    FROM public.agent_browser_sessions
    WHERE revoked_at IS NULL
    GROUP BY agent_id
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'PW7404-1117 rollback session topology guard failed';
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.spacebot_register_resident_v1(
  varchar, text, text
);
DROP FUNCTION IF EXISTS public.spacebot_open_resident_session_v1(
  text, text, text
);
DROP FUNCTION IF EXISTS public.spacebot_touch_resident_session_v1(text);
DROP FUNCTION IF EXISTS public.spacebot_rotate_resident_session_v1(text, text);
DROP FUNCTION IF EXISTS public.spacebot_revoke_resident_session_v1(
  text, varchar
);

DROP INDEX IF EXISTS public.agent_browser_sessions_active_agent_idx;
CREATE UNIQUE INDEX IF NOT EXISTS agent_browser_sessions_one_active_agent_idx
  ON public.agent_browser_sessions(agent_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.agent_browser_sessions
  DROP CONSTRAINT IF EXISTS agent_browser_sessions_expiry_check;
ALTER TABLE public.agent_browser_sessions
  ADD CONSTRAINT agent_browser_sessions_expiry_check CHECK (
    expires_at > created_at
    AND expires_at <= created_at + interval '30 minutes'
  );

DO $$
DECLARE
  restored_index text;
  restored_constraint text;
  restored_constraint_valid boolean;
BEGIN
  SELECT pg_catalog.pg_get_indexdef(index_class.oid) INTO restored_index
  FROM pg_catalog.pg_class AS index_class
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = index_class.relnamespace
  WHERE namespace.nspname = 'public'
    AND index_class.relname = 'agent_browser_sessions_one_active_agent_idx';
  IF restored_index IS NULL
     OR restored_index NOT LIKE
       'CREATE UNIQUE INDEX agent_browser_sessions_one_active_agent_idx ON public.agent_browser_sessions USING btree (agent_id)%'
     OR restored_index NOT LIKE '%WHERE (revoked_at IS NULL)' THEN
    RAISE EXCEPTION 'PW7404-1117 rollback index shape guard failed';
  END IF;
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid),
    constraint_row.convalidated
  INTO restored_constraint, restored_constraint_valid
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid =
      'public.agent_browser_sessions'::pg_catalog.regclass
    AND constraint_row.conname = 'agent_browser_sessions_expiry_check';
  IF restored_constraint IS NULL OR restored_constraint_valid IS DISTINCT FROM true
     OR restored_constraint NOT LIKE '%expires_at > created_at%'
     OR restored_constraint NOT LIKE '%expires_at <= (created_at +%'
     OR NOT (
       restored_constraint LIKE '%00:30:00%'
       OR restored_constraint LIKE '%30 min%'
     )
  THEN
    RAISE EXCEPTION 'PW7404-1117 rollback expiry constraint guard failed';
  END IF;
  IF to_regprocedure(
       'public.spacebot_register_resident_v1(character varying,text,text)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.spacebot_open_resident_session_v1(text,text,text)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.spacebot_touch_resident_session_v1(text)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.spacebot_rotate_resident_session_v1(text,text)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.spacebot_revoke_resident_session_v1(text,character varying)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'PW7404-1117 rollback facade removal guard failed';
  END IF;
END
$$;

-- Immutable receipts intentionally survive rollback as durable evidence.
COMMIT;
