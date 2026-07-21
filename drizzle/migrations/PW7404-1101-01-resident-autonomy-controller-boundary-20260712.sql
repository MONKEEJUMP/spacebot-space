BEGIN;
SET LOCAL search_path = pg_catalog, public, pg_temp;

-- Remove the resident-id-only entry points from the reviewed 1086 migration.
DROP FUNCTION IF EXISTS spacebot_set_resident_autonomy_delegation(
  uuid, text[], integer, integer, integer, integer, timestamptz, varchar
);
DROP FUNCTION IF EXISTS spacebot_set_resident_autonomy_status(
  uuid, varchar, varchar
);

-- Do not elevate the legacy credential-sync trigger. Shared runtime
-- registration remains denied until the actor-scoped registration facade is
-- reviewed and shipped.

CREATE TABLE resident_autonomy_mutation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  credential_id uuid NOT NULL REFERENCES agent_credentials(id) ON DELETE RESTRICT,
  idempotency_key_sha256 varchar(64) NOT NULL,
  operation varchar(16) NOT NULL,
  expected_revision bigint NOT NULL,
  payload_sha256 varchar(64) NOT NULL,
  delegation_id uuid NOT NULL REFERENCES resident_autonomy_delegations(id) ON DELETE RESTRICT,
  resulting_revision bigint NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_autonomy_mutation_receipts_operation_check CHECK (
    operation IN ('set', 'status')
  ),
  CONSTRAINT resident_autonomy_mutation_receipts_revision_check CHECK (
    expected_revision >= 0 AND resulting_revision > 0
  ),
  CONSTRAINT resident_autonomy_mutation_receipts_key_check CHECK (
    idempotency_key_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT resident_autonomy_mutation_receipts_payload_check CHECK (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT resident_autonomy_mutation_receipts_request_unique UNIQUE (
    credential_id, idempotency_key_sha256
  )
);
CREATE INDEX resident_autonomy_mutation_receipts_resident_created_idx
  ON resident_autonomy_mutation_receipts(resident_id, created_at DESC);

CREATE TRIGGER resident_autonomy_mutation_receipts_immutable_row
  BEFORE UPDATE OR DELETE ON resident_autonomy_mutation_receipts
  FOR EACH ROW EXECUTE FUNCTION spacebot_reject_immutable_event_mutation();
ALTER TABLE resident_autonomy_mutation_receipts
  ENABLE ALWAYS TRIGGER resident_autonomy_mutation_receipts_immutable_row;
CREATE TRIGGER resident_autonomy_mutation_receipts_immutable_truncate
  BEFORE TRUNCATE ON resident_autonomy_mutation_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION spacebot_reject_immutable_event_mutation();
ALTER TABLE resident_autonomy_mutation_receipts
  ENABLE ALWAYS TRIGGER resident_autonomy_mutation_receipts_immutable_truncate;

CREATE FUNCTION spacebot_mutate_resident_autonomy(
  p_credential_secret text,
  p_operation varchar(16),
  p_expected_revision bigint,
  p_idempotency_key varchar(128),
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  authenticated_credential_id uuid;
  authenticated_resident_id uuid;
  request_key_sha256 varchar(64);
  event_fingerprint varchar(64);
  payload_sha256 varchar(64);
  replay public.resident_autonomy_mutation_receipts%ROWTYPE;
  prior public.resident_autonomy_delegations%ROWTYPE;
  current_row public.resident_autonomy_delegations%ROWTYPE;
  allowed_actions_value text[];
  status_value varchar(16);
  expires_value timestamptz;
  min_post integer;
  max_posts integer;
  min_comment integer;
  max_comments integer;
  event_name varchar(16);
  response_value jsonb;
  recent_mutations integer;
BEGIN
  IF length(p_credential_secret) NOT BETWEEN 32 AND 200
     OR p_operation NOT IN ('set', 'status')
     OR p_expected_revision IS NULL OR p_expected_revision < 0
     OR p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
     OR p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid resident autonomy mutation request';
  END IF;

  SELECT credential.id, credential.agent_id
  INTO authenticated_credential_id, authenticated_resident_id
  FROM public.agent_credentials AS credential
  JOIN public.agents AS resident ON resident.id = credential.agent_id
  WHERE credential.lookup_hash = pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(p_credential_secret, 'UTF8')),
      'hex'
    )
    AND credential.revoked_at IS NULL
    AND resident.moderation_status = 'active'
  FOR SHARE OF credential, resident;
  IF authenticated_credential_id IS NULL THEN
    RAISE EXCEPTION 'Resident credential proof rejected';
  END IF;

  request_key_sha256 := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_idempotency_key, 'UTF8')), 'hex'
  );
  payload_sha256 := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_payload::text, 'UTF8')), 'hex'
  );
  event_fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    authenticated_credential_id::text || ':' || p_idempotency_key, 'UTF8'
  )), 'hex');

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'resident-autonomy-delegation:' || authenticated_resident_id::text, 0
  ));

  SELECT * INTO replay
  FROM public.resident_autonomy_mutation_receipts
  WHERE credential_id = authenticated_credential_id
    AND idempotency_key_sha256 = request_key_sha256;
  IF replay.id IS NOT NULL THEN
    IF replay.operation <> p_operation
       OR replay.expected_revision <> p_expected_revision
       OR replay.payload_sha256 <> payload_sha256 THEN
      RAISE EXCEPTION 'Resident autonomy idempotency conflict';
    END IF;
    RETURN replay.response;
  END IF;

  SELECT * INTO prior
  FROM public.resident_autonomy_delegations
  WHERE resident_id = authenticated_resident_id
  FOR UPDATE;
  IF coalesce(prior.revision, 0) <> p_expected_revision THEN
    RAISE EXCEPTION 'Resident autonomy revision conflict';
  END IF;

  IF p_operation = 'set' THEN
    IF NOT p_payload ?& ARRAY[
      'allowed_actions', 'min_post_interval_minutes', 'max_posts_per_24_hours',
      'min_comment_interval_minutes', 'max_comments_per_24_hours'
    ] OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_payload) AS key
      WHERE key NOT IN (
        'allowed_actions', 'min_post_interval_minutes', 'max_posts_per_24_hours',
        'min_comment_interval_minutes', 'max_comments_per_24_hours', 'expires_at'
      )
    ) OR pg_catalog.jsonb_typeof(p_payload->'allowed_actions') <> 'array' THEN
      RAISE EXCEPTION 'Invalid resident autonomy preferences';
    END IF;
    SELECT pg_catalog.array_agg(action ORDER BY ordinal)
    INTO allowed_actions_value
    FROM pg_catalog.jsonb_array_elements_text(p_payload->'allowed_actions')
      WITH ORDINALITY AS item(action, ordinal);
    min_post := (p_payload->>'min_post_interval_minutes')::integer;
    max_posts := (p_payload->>'max_posts_per_24_hours')::integer;
    min_comment := (p_payload->>'min_comment_interval_minutes')::integer;
    max_comments := (p_payload->>'max_comments_per_24_hours')::integer;
    expires_value := CASE
      WHEN p_payload->>'expires_at' IS NULL THEN NULL
      ELSE (p_payload->>'expires_at')::timestamptz
    END;
    IF allowed_actions_value IS NULL OR cardinality(allowed_actions_value) < 1
       OR cardinality(allowed_actions_value) <> cardinality(ARRAY(
         SELECT DISTINCT action FROM unnest(allowed_actions_value) AS action
       ))
       OR NOT allowed_actions_value <@ ARRAY['post','comment','profile','learn','rest']::text[]
       OR NOT allowed_actions_value @> ARRAY['rest']::text[]
       OR min_post NOT BETWEEN 60 AND 10080
       OR max_posts NOT BETWEEN 0 AND 6
       OR min_comment NOT BETWEEN 15 AND 10080
       OR max_comments NOT BETWEEN 0 AND 24
       OR (expires_value IS NOT NULL AND (
         expires_value < pg_catalog.now() + interval '1 hour'
         OR expires_value > pg_catalog.now() + interval '366 days'
       )) THEN
      RAISE EXCEPTION 'Invalid resident autonomy preferences';
    END IF;

    SELECT count(*)::integer INTO recent_mutations
    FROM public.resident_autonomy_mutation_receipts
    WHERE resident_id = authenticated_resident_id
      AND created_at > pg_catalog.now() - interval '1 hour'
      AND (operation = 'set' OR response->>'status' = 'active');
    IF recent_mutations >= 10 THEN
      RAISE EXCEPTION 'Resident autonomy preference rate limit exceeded';
    END IF;

    IF prior.id IS NULL THEN
      INSERT INTO public.resident_autonomy_delegations (
        resident_id, delegate, grant_source, allowed_actions,
        min_post_interval_minutes, max_posts_per_24_hours,
        min_comment_interval_minutes, max_comments_per_24_hours,
        status, starts_at, expires_at, revision
      ) VALUES (
        authenticated_resident_id, 'lucy', 'resident_credential', allowed_actions_value,
        min_post, max_posts, min_comment, max_comments,
        'active', pg_catalog.now(), expires_value, 1
      ) RETURNING * INTO current_row;
      event_name := 'granted';
    ELSE
      UPDATE public.resident_autonomy_delegations
      SET grant_source = 'resident_credential', manifest_id = NULL,
          allowed_actions = allowed_actions_value,
          min_post_interval_minutes = min_post,
          max_posts_per_24_hours = max_posts,
          min_comment_interval_minutes = min_comment,
          max_comments_per_24_hours = max_comments,
          status = 'active', starts_at = pg_catalog.now(), expires_at = expires_value,
          revoked_at = NULL, revision = revision + 1, updated_at = pg_catalog.now()
      WHERE id = prior.id
      RETURNING * INTO current_row;
      event_name := CASE
        WHEN prior.status = 'revoked' THEN 'granted'
        WHEN prior.status = 'paused' THEN 'resumed'
        ELSE 'updated'
      END;
    END IF;
  ELSE
    IF pg_catalog.jsonb_object_length(p_payload) <> 1
       OR NOT p_payload ? 'status'
       OR p_payload->>'status' NOT IN ('active', 'paused', 'revoked') THEN
      RAISE EXCEPTION 'Invalid resident autonomy status';
    END IF;
    IF prior.id IS NULL THEN
      RAISE EXCEPTION 'Resident autonomy delegation not found';
    END IF;
    status_value := p_payload->>'status';
    IF prior.status = 'revoked' AND status_value <> 'revoked' THEN
      RAISE EXCEPTION 'Revoked autonomy requires a new preference grant';
    END IF;
    IF status_value = 'active' THEN
      SELECT count(*)::integer INTO recent_mutations
      FROM public.resident_autonomy_mutation_receipts
      WHERE resident_id = authenticated_resident_id
        AND created_at > pg_catalog.now() - interval '1 hour'
        AND (operation = 'set' OR response->>'status' = 'active');
      IF recent_mutations >= 10 THEN
        RAISE EXCEPTION 'Resident autonomy preference rate limit exceeded';
      END IF;
    END IF;
    UPDATE public.resident_autonomy_delegations
    SET status = status_value,
        revoked_at = CASE
          WHEN status_value = 'revoked' THEN coalesce(prior.revoked_at, pg_catalog.now())
          ELSE NULL
        END,
        revision = revision + 1,
        updated_at = pg_catalog.now()
    WHERE id = prior.id
    RETURNING * INTO current_row;
    event_name := CASE
      WHEN status_value = 'revoked' THEN 'revoked'
      WHEN status_value = 'paused' THEN 'paused'
      ELSE 'resumed'
    END;
  END IF;

  INSERT INTO public.resident_autonomy_delegation_events (
    delegation_id, resident_id, event_type, actor_type,
    request_fingerprint, delegation_revision, details
  ) VALUES (
    current_row.id, authenticated_resident_id, event_name, 'resident',
    event_fingerprint, current_row.revision,
    pg_catalog.jsonb_build_object(
      'credentialId', authenticated_credential_id,
      'payloadFingerprint', payload_sha256,
      'operation', p_operation
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'residentId', authenticated_resident_id,
    'delegationId', current_row.id,
    'revision', current_row.revision,
    'status', current_row.status
  );
  INSERT INTO public.resident_autonomy_mutation_receipts (
    resident_id, credential_id, idempotency_key_sha256, operation,
    expected_revision, payload_sha256, delegation_id, resulting_revision, response
  ) VALUES (
    authenticated_resident_id, authenticated_credential_id, request_key_sha256,
    p_operation, p_expected_revision, payload_sha256, current_row.id,
    current_row.revision, response_value
  );
  RETURN response_value;
END
$$;

REVOKE ALL ON TABLE resident_autonomy_mutation_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION spacebot_mutate_resident_autonomy(
  text, varchar, bigint, varchar, jsonb
) FROM PUBLIC;

-- Clear creator-role default ACL residue before the dedicated controller
-- provisioner grants one reviewed EXECUTE capability.
DO $$
DECLARE
  grantee_name text;
BEGIN
  FOR grantee_name IN
    SELECT DISTINCT grantee_role.rolname
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    JOIN pg_roles AS grantee_role ON grantee_role.oid = privilege.grantee
    WHERE procedure.oid = 'public.spacebot_mutate_resident_autonomy(text,varchar,bigint,varchar,jsonb)'::regprocedure
      AND privilege.grantee <> procedure.proowner
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.spacebot_mutate_resident_autonomy(text,varchar,bigint,varchar,jsonb) FROM %I',
      grantee_name
    );
  END LOOP;

  FOR grantee_name IN
    SELECT DISTINCT grantee_role.rolname
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) AS privilege
    JOIN pg_roles AS grantee_role ON grantee_role.oid = privilege.grantee
    WHERE relation.oid = 'public.resident_autonomy_mutation_receipts'::regclass
      AND privilege.grantee <> relation.relowner
  LOOP
    EXECUTE format(
      'REVOKE ALL ON TABLE public.resident_autonomy_mutation_receipts FROM %I',
      grantee_name
    );
  END LOOP;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spacebot_runtime') THEN
    ALTER ROLE spacebot_runtime NOBYPASSRLS;
    REVOKE ALL ON FUNCTION spacebot_mutate_resident_autonomy(
      text, varchar, bigint, varchar, jsonb
    ) FROM spacebot_runtime;
    REVOKE ALL ON resident_autonomy_mutation_receipts FROM spacebot_runtime;

    -- Runtime may resolve credentials and record authentication use, but it
    -- cannot mint, rebind, revoke, or replace a credential verifier.
    REVOKE INSERT, UPDATE, DELETE ON public.agent_credentials FROM spacebot_runtime;
    GRANT SELECT ON public.agent_credentials TO spacebot_runtime;
    GRANT UPDATE (last_used_at) ON public.agent_credentials TO spacebot_runtime;

    -- Registration and identity mutation require a reviewed actor-scoped
    -- facade; the shared runtime role receives heartbeat columns only.
    REVOKE INSERT, UPDATE, DELETE ON public.agents FROM spacebot_runtime;
    GRANT UPDATE (last_heartbeat, last_active) ON public.agents TO spacebot_runtime;

    REVOKE INSERT, UPDATE, DELETE ON public.human_agent_links
      FROM spacebot_runtime;
    REVOKE INSERT, UPDATE, DELETE ON public.agent_identity_aliases
      FROM spacebot_runtime;
    REVOKE INSERT, UPDATE, DELETE ON
      public.bot_profiles,
      public.bot_configs,
      public.bot_activity,
      public.bot_profile_history
      FROM spacebot_runtime;

    IF to_regclass('public.agent_browser_sessions') IS NOT NULL THEN
      EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.agent_browser_sessions FROM spacebot_runtime';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pw7404_task_maintenance') THEN
    ALTER ROLE pw7404_task_maintenance NOBYPASSRLS;
  END IF;
END
$$;

COMMIT;
