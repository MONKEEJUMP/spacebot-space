BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $pw7404_preflight$
DECLARE
  role_name text;
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname = current_user AND rolsuper
     ) THEN
    RAISE EXCEPTION 'PW7404-1127 requires the reviewed superuser cutover lane';
  END IF;
  FOREACH role_name IN ARRAY ARRAY[
    'spacebot_runtime',
    'pw7404_task_maintenance',
    'spacebot_identity_controller',
    'spacebot_identity_owner'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name
    ) THEN
      RAISE EXCEPTION 'PW7404-1127 missing required role %', role_name;
    END IF;
  END LOOP;
  IF pg_catalog.shobj_description(
       (SELECT oid FROM pg_catalog.pg_roles
        WHERE rolname = 'spacebot_identity_controller'),
       'pg_authid'
     ) IS DISTINCT FROM
       'PW7404-1117:spacebot-space:identity-controller:v1'
     OR pg_catalog.shobj_description(
       (SELECT oid FROM pg_catalog.pg_roles
        WHERE rolname = 'spacebot_identity_owner'),
       'pg_authid'
     ) IS DISTINCT FROM
       'PW7404-1117:spacebot-space:identity-owner:v1' THEN
    RAISE EXCEPTION 'PW7404-1127 identity role provenance guard failed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE (rolname IN (
        'spacebot_runtime', 'pw7404_task_maintenance',
        'spacebot_identity_controller'
      ) AND (
        NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolinherit OR rolreplication OR rolbypassrls
      )) OR (rolname = 'spacebot_identity_owner' AND (
        rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolinherit OR rolreplication OR rolbypassrls
      )) OR (rolname = 'service_role' AND (
        rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication
      ))
  ) THEN
    RAISE EXCEPTION 'PW7404-1127 unsafe identity principal flags';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role
      ON member_role.oid = membership.member
    WHERE member_role.rolname IN (
      'spacebot_runtime', 'pw7404_task_maintenance',
      'spacebot_identity_controller', 'spacebot_identity_owner',
      'service_role'
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted_role
      ON granted_role.oid = membership.roleid
    WHERE granted_role.rolname IN (
      'spacebot_runtime', 'pw7404_task_maintenance',
      'spacebot_identity_controller', 'spacebot_identity_owner'
    )
  ) THEN
    RAISE EXCEPTION 'PW7404-1127 target principal role graph is not isolated';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'agents', 'agent_credentials', 'agent_browser_sessions',
        'human_agent_links', 'agent_identity_aliases',
        'bot_profiles', 'bot_configs', 'credential_security_denylist',
        'resident_identity_session_receipts'
      )
      AND NOT (
        owner_role.rolsuper OR (
          owner_role.rolname <> 'spacebot_identity_owner'
          AND NOT owner_role.rolcanlogin
          AND NOT owner_role.rolcreatedb
          AND NOT owner_role.rolcreaterole
          AND NOT owner_role.rolinherit
          AND NOT owner_role.rolreplication
          AND NOT owner_role.rolbypassrls
          AND NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_auth_members AS owner_membership
            WHERE owner_membership.member = owner_role.oid
               OR owner_membership.roleid = owner_role.oid
          )
        )
      )
  ) THEN
    RAISE EXCEPTION
      'PW7404-1127 protected relation owner is not superuser or isolated NOLOGIN';
  END IF;
  IF EXISTS (
    WITH expected(kind, relation_name, column_name, privilege_type, is_grantable)
      AS (VALUES
        ('table', 'agents', NULL::text, 'SELECT', false),
        ('table', 'agents', NULL::text, 'INSERT', false),
        ('column', 'agents', 'last_active', 'UPDATE', false),
        ('table', 'agent_credentials', NULL::text, 'SELECT', false),
        ('table', 'agent_credentials', NULL::text, 'INSERT', false),
        ('column', 'agent_credentials', 'last_used_at', 'UPDATE', false),
        ('table', 'agent_browser_sessions', NULL::text, 'SELECT', false),
        ('table', 'agent_browser_sessions', NULL::text, 'INSERT', false),
        ('column', 'agent_browser_sessions', 'last_seen_at', 'UPDATE', false),
        ('column', 'agent_browser_sessions', 'expires_at', 'UPDATE', false),
        ('column', 'agent_browser_sessions', 'revoked_at', 'UPDATE', false),
        ('column', 'agent_browser_sessions', 'revocation_reason', 'UPDATE', false),
        ('table', 'bot_profiles', NULL::text, 'SELECT', false),
        ('table', 'bot_profiles', NULL::text, 'INSERT', false),
        ('table', 'bot_configs', NULL::text, 'SELECT', false),
        ('table', 'bot_configs', NULL::text, 'INSERT', false),
        ('table', 'credential_security_denylist', NULL::text, 'SELECT', false),
        ('table', 'resident_identity_session_receipts', NULL::text, 'INSERT', false)
      ), actual AS (
        SELECT 'table'::text AS kind, relation.relname::text AS relation_name,
          NULL::text AS column_name, privilege.privilege_type::text,
          privilege.is_grantable
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS privilege
        JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE namespace.nspname = 'public'
          AND relation.relname IN (
            'agents', 'agent_credentials', 'agent_browser_sessions',
            'human_agent_links', 'agent_identity_aliases',
            'bot_profiles', 'bot_configs', 'credential_security_denylist',
            'resident_identity_session_receipts'
          )
          AND grantee_role.rolname = 'spacebot_identity_owner'
        UNION ALL
        SELECT 'column', relation.relname::text, attribute.attname::text,
          privilege.privilege_type::text, privilege.is_grantable
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = relation.oid
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
        JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = privilege.grantee
        WHERE namespace.nspname = 'public'
          AND relation.relname IN (
            'agents', 'agent_credentials', 'agent_browser_sessions',
            'human_agent_links', 'agent_identity_aliases',
            'bot_profiles', 'bot_configs', 'credential_security_denylist',
            'resident_identity_session_receipts'
          )
          AND attribute.attnum > 0 AND NOT attribute.attisdropped
          AND grantee_role.rolname = 'spacebot_identity_owner'
      )
    SELECT 1 FROM (
      (SELECT * FROM actual EXCEPT SELECT * FROM expected)
      UNION ALL
      (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    ) AS difference
  ) THEN
    RAISE EXCEPTION 'PW7404-1127 identity owner ACL drift';
  END IF;
  IF to_regprocedure(
       'public.spacebot_register_resident_v1(character varying,text,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.spacebot_open_resident_session_v1(text,text,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.spacebot_touch_resident_session_v1(text)'
     ) IS NULL
     OR to_regprocedure(
       'public.spacebot_rotate_resident_session_v1(text,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.spacebot_revoke_resident_session_v1(text,character varying)'
     ) IS NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       JOIN pg_catalog.pg_roles AS owner_role
         ON owner_role.oid = procedure.proowner
       WHERE procedure.oid IN (
         'public.spacebot_register_resident_v1(character varying,text,text)'::regprocedure,
         'public.spacebot_open_resident_session_v1(text,text,text)'::regprocedure,
         'public.spacebot_touch_resident_session_v1(text)'::regprocedure,
         'public.spacebot_rotate_resident_session_v1(text,text)'::regprocedure,
         'public.spacebot_revoke_resident_session_v1(text,character varying)'::regprocedure
       )
         AND (
           owner_role.rolname <> 'spacebot_identity_owner'
           OR NOT procedure.prosecdef
           OR procedure.proconfig IS NULL
           OR NOT procedure.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
         )
     ) THEN
    RAISE EXCEPTION 'PW7404-1127 facade ownership or hardening guard failed';
  END IF;
  IF to_regprocedure(
       'public.spacebot_reject_immutable_event_mutation()'
     ) IS NULL THEN
    RAISE EXCEPTION 'PW7404-1127 immutable event guard is missing';
  END IF;
END
$pw7404_preflight$;

LOCK TABLE public.agents, public.agent_credentials,
  public.agent_browser_sessions, public.human_agent_links,
  public.agent_identity_aliases, public.bot_profiles, public.bot_configs,
  public.credential_security_denylist,
  public.resident_identity_session_receipts
  IN ACCESS EXCLUSIVE MODE;

CREATE TABLE public.resident_identity_acl_cutover_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact varchar(20) NOT NULL,
  event_type varchar(12) NOT NULL,
  principals text[] NOT NULL,
  acl_snapshot jsonb NOT NULL,
  snapshot_sha256 varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_identity_acl_cutover_events_artifact_event_unique
    UNIQUE (artifact, event_type),
  CONSTRAINT resident_identity_acl_cutover_events_artifact_check
    CHECK (artifact = 'PW7404-1127'),
  CONSTRAINT resident_identity_acl_cutover_events_event_type_check
    CHECK (event_type IN ('cutover', 'rollback')),
  CONSTRAINT resident_identity_acl_cutover_events_principals_check
    CHECK (cardinality(principals) BETWEEN 4 AND 5),
  CONSTRAINT resident_identity_acl_cutover_events_snapshot_check
    CHECK (jsonb_typeof(acl_snapshot) = 'array'),
  CONSTRAINT resident_identity_acl_cutover_events_sha256_check
    CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$')
);

DROP TRIGGER IF EXISTS resident_identity_acl_cutover_events_immutable_row
  ON public.resident_identity_acl_cutover_events;
CREATE TRIGGER resident_identity_acl_cutover_events_immutable_row
  BEFORE UPDATE OR DELETE ON public.resident_identity_acl_cutover_events
  FOR EACH ROW EXECUTE FUNCTION public.spacebot_reject_immutable_event_mutation();
ALTER TABLE public.resident_identity_acl_cutover_events
  ENABLE ALWAYS TRIGGER resident_identity_acl_cutover_events_immutable_row;
DROP TRIGGER IF EXISTS resident_identity_acl_cutover_events_immutable_truncate
  ON public.resident_identity_acl_cutover_events;
CREATE TRIGGER resident_identity_acl_cutover_events_immutable_truncate
  BEFORE TRUNCATE ON public.resident_identity_acl_cutover_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.spacebot_reject_immutable_event_mutation();
ALTER TABLE public.resident_identity_acl_cutover_events
  ENABLE ALWAYS TRIGGER resident_identity_acl_cutover_events_immutable_truncate;
REVOKE ALL ON TABLE public.resident_identity_acl_cutover_events FROM PUBLIC;

DO $pw7404_cutover$
DECLARE
  target_principals text[];
  target_tables constant text[] := ARRAY[
    'agents', 'agent_credentials', 'agent_browser_sessions',
    'human_agent_links', 'agent_identity_aliases',
    'bot_profiles', 'bot_configs', 'credential_security_denylist',
    'resident_identity_session_receipts'
  ];
  acl_snapshot jsonb;
  acl_sha256 text;
  principal_name text;
  grantee_sql text;
  table_name text;
  column_name text;
  function_identity text;
  acl_entry jsonb;
  revoke_sql text;
  pending_snapshot jsonb;
  next_pending jsonb;
  revoke_progress boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.resident_identity_acl_cutover_events
    WHERE artifact = 'PW7404-1127'
  ) THEN
    RAISE EXCEPTION 'PW7404-1127 cutover event already exists';
  END IF;

  SELECT pg_catalog.array_agg(candidate ORDER BY candidate)
  INTO target_principals
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

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT privilege.grantee, privilege.grantor
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS privilege
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY(target_tables)
      UNION ALL
      SELECT privilege.grantee, privilege.grantor
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = relation.oid
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY(target_tables)
        AND attribute.attnum > 0 AND NOT attribute.attisdropped
      UNION ALL
      SELECT privilege.grantee, privilege.grantor
      FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) AS privilege
      WHERE procedure.oid IN (
        'public.spacebot_register_resident_v1(character varying,text,text)'::regprocedure,
        'public.spacebot_open_resident_session_v1(text,text,text)'::regprocedure,
        'public.spacebot_touch_resident_session_v1(text)'::regprocedure,
        'public.spacebot_rotate_resident_session_v1(text,text)'::regprocedure,
        'public.spacebot_revoke_resident_session_v1(text,character varying)'::regprocedure
      )
    ) AS acl
    JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = acl.grantor
    LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = acl.grantee
    WHERE grantor_role.rolname = ANY(target_principals)
      AND CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
               ELSE grantee_role.rolname END <> ALL(target_principals)
  ) THEN
    RAISE EXCEPTION
      'PW7404-1127 target principal granted protected access to an unmanaged principal';
  END IF;

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
  ) INTO acl_snapshot
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
               ELSE grantee_role.rolname END = ANY(target_principals)
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
               ELSE grantee_role.rolname END = ANY(target_principals)
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
               ELSE grantee_role.rolname END = ANY(target_principals)
  ) AS acl;

  acl_sha256 := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(acl_snapshot::text, 'UTF8')),
    'hex'
  );
  INSERT INTO public.resident_identity_acl_cutover_events (
    artifact, event_type, principals, acl_snapshot, snapshot_sha256
  ) VALUES (
    'PW7404-1127', 'cutover', target_principals,
    acl_snapshot, acl_sha256
  );

  SELECT coalesce(pg_catalog.jsonb_agg(entry.value), '[]'::jsonb)
  INTO pending_snapshot
  FROM pg_catalog.jsonb_array_elements(acl_snapshot) AS entry(value)
  WHERE entry.value->>'grantor' = ANY(target_principals)
    AND entry.value->>'principal' = ANY(target_principals)
    AND entry.value->>'grantor' <> entry.value->>'principal';

  WHILE pg_catalog.jsonb_array_length(pending_snapshot) > 0 LOOP
    next_pending := '[]'::jsonb;
    revoke_progress := false;
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
        revoke_sql := pg_catalog.format(
          'REVOKE %s ON TABLE %I.%I FROM %s',
          acl_entry->>'privilege', acl_entry->>'schema',
          acl_entry->>'object', grantee_sql
        );
      ELSIF acl_entry->>'kind' = 'column' THEN
        revoke_sql := pg_catalog.format(
          'REVOKE %s (%I) ON TABLE %I.%I FROM %s',
          acl_entry->>'privilege', acl_entry->>'column',
          acl_entry->>'schema', acl_entry->>'object', grantee_sql
        );
      ELSE
        revoke_sql := pg_catalog.format(
          'REVOKE %s ON FUNCTION %s FROM %s',
          acl_entry->>'privilege', acl_entry->>'identity', grantee_sql
        );
      END IF;
      BEGIN
        EXECUTE pg_catalog.format(
          'SET LOCAL ROLE %I', acl_entry->>'grantor'
        );
        EXECUTE revoke_sql;
        RESET ROLE;
        revoke_progress := true;
      EXCEPTION WHEN dependent_objects_still_exist THEN
        RESET ROLE;
        next_pending := next_pending || pg_catalog.jsonb_build_array(acl_entry);
      END;
    END LOOP;
    IF NOT revoke_progress THEN
      RAISE EXCEPTION
        'PW7404-1127 protected ACL grant dependency graph cannot be revoked';
    END IF;
    pending_snapshot := next_pending;
  END LOOP;

  FOREACH principal_name IN ARRAY target_principals LOOP
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

  GRANT SELECT ON TABLE public.agents, public.agent_credentials,
    public.human_agent_links, public.agent_identity_aliases,
    public.bot_profiles, public.bot_configs
    TO spacebot_runtime;
  GRANT SELECT ON TABLE public.agents TO pw7404_task_maintenance;

  GRANT EXECUTE ON FUNCTION public.spacebot_register_resident_v1(
    varchar, text, text
  ) TO spacebot_identity_controller;
  GRANT EXECUTE ON FUNCTION public.spacebot_open_resident_session_v1(
    text, text, text
  ) TO spacebot_identity_controller;
  GRANT EXECUTE ON FUNCTION public.spacebot_touch_resident_session_v1(text)
    TO spacebot_identity_controller;
  GRANT EXECUTE ON FUNCTION public.spacebot_rotate_resident_session_v1(
    text, text
  ) TO spacebot_identity_controller;
  GRANT EXECUTE ON FUNCTION public.spacebot_revoke_resident_session_v1(
    text, varchar
  ) TO spacebot_identity_controller;
END
$pw7404_cutover$;

DO $pw7404_postflight$
DECLARE
  forbidden_count integer;
  controller_function_count integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role
      ON member_role.oid = membership.member
    WHERE member_role.rolname IN (
      'spacebot_runtime', 'pw7404_task_maintenance',
      'spacebot_identity_controller', 'spacebot_identity_owner',
      'service_role'
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted_role
      ON granted_role.oid = membership.roleid
    WHERE granted_role.rolname IN (
      'spacebot_runtime', 'pw7404_task_maintenance',
      'spacebot_identity_controller', 'spacebot_identity_owner'
    )
  ) THEN
    RAISE EXCEPTION 'PW7404-1127 target principal role graph drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'agents', 'agent_credentials', 'agent_browser_sessions',
        'human_agent_links', 'agent_identity_aliases',
        'bot_profiles', 'bot_configs', 'credential_security_denylist',
        'resident_identity_session_receipts'
      )
      AND NOT (
        owner_role.rolsuper OR (
          owner_role.rolname <> 'spacebot_identity_owner'
          AND NOT owner_role.rolcanlogin
          AND NOT owner_role.rolcreatedb
          AND NOT owner_role.rolcreaterole
          AND NOT owner_role.rolinherit
          AND NOT owner_role.rolreplication
          AND NOT owner_role.rolbypassrls
          AND NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_auth_members AS owner_membership
            WHERE owner_membership.member = owner_role.oid
               OR owner_membership.roleid = owner_role.oid
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'PW7404-1127 protected relation owner drifted';
  END IF;

  SELECT pg_catalog.count(*) INTO forbidden_count
  FROM (
    SELECT relation.relname, privilege.privilege_type,
      CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
           ELSE grantee_role.rolname END AS principal_name,
      NULL::text AS column_name
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS privilege
    LEFT JOIN pg_catalog.pg_roles AS grantee_role
      ON grantee_role.oid = privilege.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'agents', 'agent_credentials', 'agent_browser_sessions',
        'human_agent_links', 'agent_identity_aliases',
        'bot_profiles', 'bot_configs', 'credential_security_denylist',
        'resident_identity_session_receipts'
      )
      AND privilege.privilege_type IN (
        'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER',
        'MAINTAIN'
      )
    UNION ALL
    SELECT relation.relname, privilege.privilege_type,
      CASE WHEN privilege.grantee = 0 THEN 'PUBLIC'
           ELSE grantee_role.rolname END,
      attribute.attname::text
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
    LEFT JOIN pg_catalog.pg_roles AS grantee_role
      ON grantee_role.oid = privilege.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'agents', 'agent_credentials', 'agent_browser_sessions',
        'human_agent_links', 'agent_identity_aliases',
        'bot_profiles', 'bot_configs', 'credential_security_denylist',
        'resident_identity_session_receipts'
      )
  ) AS candidate
  WHERE candidate.principal_name IN (
    'PUBLIC', 'pw7404_task_maintenance', 'service_role',
    'spacebot_identity_controller', 'spacebot_runtime'
  )
    ;
  IF forbidden_count <> 0 THEN
    RAISE EXCEPTION 'PW7404-1127 forbidden direct identity DML remains';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS candidate_role
    CROSS JOIN LATERAL (
      SELECT relation.oid
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN (
          'agents', 'agent_credentials', 'agent_browser_sessions',
          'human_agent_links', 'agent_identity_aliases',
          'bot_profiles', 'bot_configs', 'credential_security_denylist',
          'resident_identity_session_receipts'
        )
    ) AS protected_relation
    WHERE candidate_role.rolcanlogin
      AND NOT candidate_role.rolsuper
      AND (
        pg_catalog.has_table_privilege(
          candidate_role.oid, protected_relation.oid, 'INSERT'
        )
        OR pg_catalog.has_table_privilege(
          candidate_role.oid, protected_relation.oid, 'UPDATE'
        )
        OR pg_catalog.has_table_privilege(
          candidate_role.oid, protected_relation.oid, 'DELETE'
        )
        OR pg_catalog.has_table_privilege(
          candidate_role.oid, protected_relation.oid, 'TRUNCATE'
        )
        OR pg_catalog.has_table_privilege(
          candidate_role.oid, protected_relation.oid, 'REFERENCES'
        )
        OR pg_catalog.has_table_privilege(
          candidate_role.oid, protected_relation.oid, 'TRIGGER'
        )
        OR pg_catalog.has_table_privilege(
          candidate_role.oid, protected_relation.oid, 'MAINTAIN'
        )
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid = protected_relation.oid
            AND attribute.attnum > 0
            AND NOT attribute.attisdropped
            AND (
              pg_catalog.has_column_privilege(
                candidate_role.oid, protected_relation.oid,
                attribute.attnum, 'INSERT'
              )
              OR pg_catalog.has_column_privilege(
                candidate_role.oid, protected_relation.oid,
                attribute.attnum, 'UPDATE'
              )
              OR pg_catalog.has_column_privilege(
                candidate_role.oid, protected_relation.oid,
                attribute.attnum, 'REFERENCES'
              )
            )
        )
      )
  ) THEN
    RAISE EXCEPTION 'PW7404-1127 effective login-role identity writer remains';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS privilege
    LEFT JOIN pg_catalog.pg_roles AS grantee_role
      ON grantee_role.oid = privilege.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'agents', 'agent_credentials', 'agent_browser_sessions',
        'human_agent_links', 'agent_identity_aliases',
        'bot_profiles', 'bot_configs', 'credential_security_denylist',
        'resident_identity_session_receipts'
      )
      AND privilege.privilege_type IN (
        'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      )
      AND privilege.grantee <> relation.relowner
      AND coalesce(grantee_role.rolsuper, false) = false
      AND coalesce(grantee_role.rolname, 'PUBLIC') <>
        'spacebot_identity_owner'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
    LEFT JOIN pg_catalog.pg_roles AS grantee_role
      ON grantee_role.oid = privilege.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'agents', 'agent_credentials', 'agent_browser_sessions',
        'human_agent_links', 'agent_identity_aliases',
        'bot_profiles', 'bot_configs', 'credential_security_denylist',
        'resident_identity_session_receipts'
      )
      AND privilege.privilege_type IN ('INSERT', 'UPDATE', 'REFERENCES')
      AND coalesce(grantee_role.rolsuper, false) = false
      AND coalesce(grantee_role.rolname, 'PUBLIC') <>
        'spacebot_identity_owner'
  ) THEN
    RAISE EXCEPTION 'PW7404-1127 unreviewed non-superuser identity DML remains';
  END IF;

  SELECT pg_catalog.count(*) INTO controller_function_count
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid IN (
    'public.spacebot_register_resident_v1(character varying,text,text)'::regprocedure,
    'public.spacebot_open_resident_session_v1(text,text,text)'::regprocedure,
    'public.spacebot_touch_resident_session_v1(text)'::regprocedure,
    'public.spacebot_rotate_resident_session_v1(text,text)'::regprocedure,
    'public.spacebot_revoke_resident_session_v1(text,character varying)'::regprocedure
  )
    AND pg_catalog.has_function_privilege(
      'spacebot_identity_controller', procedure.oid, 'EXECUTE'
    );
  IF controller_function_count <> 5
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       JOIN pg_catalog.pg_roles AS owner_role
         ON owner_role.oid = procedure.proowner
       WHERE procedure.oid IN (
         'public.spacebot_register_resident_v1(character varying,text,text)'::regprocedure,
         'public.spacebot_open_resident_session_v1(text,text,text)'::regprocedure,
         'public.spacebot_touch_resident_session_v1(text)'::regprocedure,
         'public.spacebot_rotate_resident_session_v1(text,text)'::regprocedure,
         'public.spacebot_revoke_resident_session_v1(text,character varying)'::regprocedure
       )
         AND (
           owner_role.rolname <> 'spacebot_identity_owner'
           OR procedure.prosecdef IS DISTINCT FROM true
           OR procedure.proconfig IS DISTINCT FROM
             ARRAY['search_path=pg_catalog, pg_temp']::text[]
         )
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       CROSS JOIN LATERAL pg_catalog.aclexplode(procedure.proacl) AS privilege
       LEFT JOIN pg_catalog.pg_roles AS grantee_role
         ON grantee_role.oid = privilege.grantee
       WHERE procedure.oid IN (
         'public.spacebot_register_resident_v1(character varying,text,text)'::regprocedure,
         'public.spacebot_open_resident_session_v1(text,text,text)'::regprocedure,
         'public.spacebot_touch_resident_session_v1(text)'::regprocedure,
         'public.spacebot_rotate_resident_session_v1(text,text)'::regprocedure,
         'public.spacebot_revoke_resident_session_v1(text,character varying)'::regprocedure
       )
         AND privilege.privilege_type = 'EXECUTE'
         AND privilege.grantee <> procedure.proowner
         AND coalesce(grantee_role.rolname, 'PUBLIC') <>
           'spacebot_identity_controller'
     ) THEN
    RAISE EXCEPTION 'PW7404-1127 facade execute authority guard failed';
  END IF;
  IF pg_catalog.has_table_privilege(
       'spacebot_identity_controller',
       'public.agent_browser_sessions', 'SELECT,INSERT,UPDATE,DELETE'
     )
     OR pg_catalog.has_table_privilege(
       'spacebot_runtime',
       'public.agent_browser_sessions', 'SELECT,INSERT,UPDATE,DELETE'
     )
     OR pg_catalog.has_column_privilege(
       'spacebot_runtime', 'public.agents', 'last_active', 'UPDATE'
     )
     OR pg_catalog.has_column_privilege(
       'spacebot_runtime', 'public.agent_credentials', 'last_used_at', 'UPDATE'
     ) THEN
    RAISE EXCEPTION 'PW7404-1127 effective ACL guard failed';
  END IF;
END
$pw7404_postflight$;

COMMIT;
