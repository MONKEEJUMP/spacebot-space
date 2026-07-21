BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $pw7404_rollback_preflight$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname = current_user AND rolsuper
     ) THEN
    RAISE EXCEPTION 'PW7404-1127 rollback requires the reviewed superuser lane';
  END IF;
  IF to_regclass('public.resident_identity_acl_cutover_events') IS NULL THEN
    RAISE EXCEPTION 'PW7404-1127 rollback ledger is missing';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.resident_identity_acl_cutover_events
       WHERE artifact = 'PW7404-1127' AND event_type = 'cutover'
     ) OR EXISTS (
       SELECT 1 FROM public.resident_identity_acl_cutover_events
       WHERE artifact = 'PW7404-1127' AND event_type = 'rollback'
     ) THEN
    RAISE EXCEPTION 'PW7404-1127 rollback state guard failed';
  END IF;
END
$pw7404_rollback_preflight$;

LOCK TABLE public.agents, public.agent_credentials,
  public.agent_browser_sessions, public.human_agent_links,
  public.agent_identity_aliases, public.bot_profiles, public.bot_configs,
  public.credential_security_denylist,
  public.resident_identity_session_receipts,
  public.resident_identity_acl_cutover_events IN ACCESS EXCLUSIVE MODE;

DO $pw7404_restore_acl$
DECLARE
  stored_principals text[];
  actual_principals text[];
  target_tables constant text[] := ARRAY[
    'agents', 'agent_credentials', 'agent_browser_sessions',
    'human_agent_links', 'agent_identity_aliases',
    'bot_profiles', 'bot_configs', 'credential_security_denylist',
    'resident_identity_session_receipts'
  ];
  stored_snapshot jsonb;
  restored_snapshot jsonb;
  stored_sha256 text;
  calculated_sha256 text;
  principal_name text;
  grantee_sql text;
  table_name text;
  column_name text;
  function_identity text;
  acl_entry jsonb;
  grant_sql text;
  pending_snapshot jsonb;
  next_pending jsonb;
  restore_progress boolean;
BEGIN
  SELECT principals, acl_snapshot, snapshot_sha256
  INTO stored_principals, stored_snapshot, stored_sha256
  FROM public.resident_identity_acl_cutover_events
  WHERE artifact = 'PW7404-1127' AND event_type = 'cutover';

  SELECT pg_catalog.array_agg(candidate ORDER BY candidate)
  INTO actual_principals
  FROM (
    VALUES
      ('PUBLIC'::text),
      ('pw7404_task_maintenance'::text),
      ('spacebot_identity_controller'::text),
      ('spacebot_runtime'::text)
    UNION ALL
    SELECT 'service_role'::text
    WHERE EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role'
    )
  ) AS principal(candidate);
  IF actual_principals IS DISTINCT FROM stored_principals THEN
    RAISE EXCEPTION 'PW7404-1127 rollback principal-set drift';
  END IF;
  calculated_sha256 := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(stored_snapshot::text, 'UTF8')),
    'hex'
  );
  IF calculated_sha256 IS DISTINCT FROM stored_sha256 THEN
    RAISE EXCEPTION 'PW7404-1127 rollback snapshot digest guard failed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(stored_snapshot) AS entry(value)
    WHERE entry.value->>'kind' NOT IN ('table', 'column', 'function')
      OR entry.value->>'schema' <> 'public'
      OR entry.value->>'principal' <> ALL(stored_principals)
      OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS grantor_role
        WHERE grantor_role.rolname = entry.value->>'grantor'
      )
      OR entry.value->>'privilege' NOT IN (
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
        'REFERENCES', 'TRIGGER', 'MAINTAIN', 'EXECUTE'
      )
      OR (
        entry.value->>'kind' IN ('table', 'column')
        AND entry.value->>'object' <> ALL(target_tables)
      )
      OR (
        entry.value->>'kind' = 'function'
        AND entry.value->>'identity' NOT IN (
          'public.spacebot_register_resident_v1(p_name character varying, p_description text, p_credential_secret text)',
          'public.spacebot_open_resident_session_v1(p_credential_secret text, p_new_session_token text, p_prior_session_token text)',
          'public.spacebot_touch_resident_session_v1(p_session_token text)',
          'public.spacebot_rotate_resident_session_v1(p_current_session_token text, p_new_session_token text)',
          'public.spacebot_revoke_resident_session_v1(p_session_token text, p_scope character varying)'
        )
      )
  ) THEN
    RAISE EXCEPTION 'PW7404-1127 rollback snapshot allowlist guard failed';
  END IF;

  FOREACH principal_name IN ARRAY stored_principals LOOP
    grantee_sql := CASE WHEN principal_name = 'PUBLIC' THEN 'PUBLIC'
      ELSE pg_catalog.quote_ident(principal_name) END;
    FOREACH table_name IN ARRAY target_tables LOOP
      FOR column_name IN
        SELECT attribute.attname
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = pg_catalog.to_regclass(
          pg_catalog.format('public.%I', table_name)
        )
          AND attribute.attnum > 0 AND NOT attribute.attisdropped
      LOOP
        EXECUTE pg_catalog.format(
          'REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %s',
          column_name, table_name, grantee_sql
        );
      END LOOP;
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %s',
        table_name, grantee_sql
      );
    END LOOP;
    FOREACH function_identity IN ARRAY ARRAY[
      'public.spacebot_register_resident_v1(character varying,text,text)',
      'public.spacebot_open_resident_session_v1(text,text,text)',
      'public.spacebot_touch_resident_session_v1(text)',
      'public.spacebot_rotate_resident_session_v1(text,text)',
      'public.spacebot_revoke_resident_session_v1(text,character varying)'
    ] LOOP
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s',
        function_identity, grantee_sql
      );
    END LOOP;
  END LOOP;

  pending_snapshot := stored_snapshot;
  WHILE pg_catalog.jsonb_array_length(pending_snapshot) > 0 LOOP
    next_pending := '[]'::jsonb;
    restore_progress := false;
    FOR acl_entry IN
      SELECT value
      FROM pg_catalog.jsonb_array_elements(pending_snapshot)
      ORDER BY value->>'kind', value->>'schema', value->>'object',
        value->>'column', value->>'principal', value->>'grantor',
        value->>'privilege'
    LOOP
      grantee_sql := CASE WHEN acl_entry->>'principal' = 'PUBLIC' THEN 'PUBLIC'
        ELSE pg_catalog.quote_ident(acl_entry->>'principal') END;
      IF acl_entry->>'kind' = 'table' THEN
        grant_sql := pg_catalog.format(
          'GRANT %s ON TABLE %I.%I TO %s%s',
          acl_entry->>'privilege', acl_entry->>'schema',
          acl_entry->>'object', grantee_sql,
          CASE WHEN (acl_entry->>'grantable')::boolean
            THEN ' WITH GRANT OPTION' ELSE '' END
        );
      ELSIF acl_entry->>'kind' = 'column' THEN
        grant_sql := pg_catalog.format(
          'GRANT %s (%I) ON TABLE %I.%I TO %s%s',
          acl_entry->>'privilege', acl_entry->>'column',
          acl_entry->>'schema', acl_entry->>'object', grantee_sql,
          CASE WHEN (acl_entry->>'grantable')::boolean
            THEN ' WITH GRANT OPTION' ELSE '' END
        );
      ELSE
        grant_sql := pg_catalog.format(
          'GRANT %s ON FUNCTION %s TO %s%s',
          acl_entry->>'privilege', acl_entry->>'identity', grantee_sql,
          CASE WHEN (acl_entry->>'grantable')::boolean
            THEN ' WITH GRANT OPTION' ELSE '' END
        );
      END IF;
      BEGIN
        EXECUTE pg_catalog.format(
          'SET LOCAL ROLE %I', acl_entry->>'grantor'
        );
        EXECUTE grant_sql;
        RESET ROLE;
        restore_progress := true;
      EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
        next_pending := next_pending || pg_catalog.jsonb_build_array(acl_entry);
      END;
    END LOOP;
    IF NOT restore_progress THEN
      RAISE EXCEPTION
        'PW7404-1127 rollback grant dependency graph cannot be restored';
    END IF;
    pending_snapshot := next_pending;
  END LOOP;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'kind', acl.kind,
        'schema', acl.schema_name,
        'object', acl.object_name,
        'column', acl.column_name,
        'identity', acl.object_identity,
        'principal', acl.principal_name,
        'grantor', acl.grantor_name,
        'privilege', acl.privilege_type,
        'grantable', acl.is_grantable
      ) ORDER BY acl.kind, acl.schema_name, acl.object_name,
        acl.column_name, acl.principal_name, acl.grantor_name,
        acl.privilege_type
    ),
    '[]'::jsonb
  ) INTO restored_snapshot
  FROM (
    SELECT 'table'::text AS kind, namespace.nspname::text AS schema_name,
      relation.relname::text AS object_name, NULL::text AS column_name,
      NULL::text AS object_identity,
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
      AND relation.relname = ANY(target_tables)
      AND CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
               ELSE grantee_role.rolname END = ANY(stored_principals)
    UNION ALL
    SELECT 'column', namespace.nspname::text, relation.relname::text,
      attribute.attname::text, NULL::text,
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
      AND relation.relname = ANY(target_tables)
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
      AND CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
               ELSE grantee_role.rolname END = ANY(stored_principals)
    UNION ALL
    SELECT 'function', namespace.nspname::text, procedure.proname::text,
      NULL::text,
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
      AND CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
               ELSE grantee_role.rolname END = ANY(stored_principals)
  ) AS acl;
  IF restored_snapshot IS DISTINCT FROM stored_snapshot THEN
    RAISE EXCEPTION 'PW7404-1127 rollback did not restore the exact ACL snapshot';
  END IF;

  INSERT INTO public.resident_identity_acl_cutover_events (
    artifact, event_type, principals, acl_snapshot, snapshot_sha256
  ) VALUES (
    'PW7404-1127', 'rollback', stored_principals,
    stored_snapshot, stored_sha256
  );
END
$pw7404_restore_acl$;

COMMIT;
