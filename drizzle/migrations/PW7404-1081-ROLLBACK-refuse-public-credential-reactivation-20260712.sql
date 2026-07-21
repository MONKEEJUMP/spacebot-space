BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

\if :{?PW7404_EXPECTED_DATABASE}
SELECT
  set_config('pw7404.expected_database', :'PW7404_EXPECTED_DATABASE', true),
  set_config('pw7404.expected_user', :'PW7404_EXPECTED_DATABASE_USER', true),
  set_config('pw7404.expected_server_address', :'PW7404_EXPECTED_SERVER_ADDRESS', true),
  set_config('pw7404.expected_server_port', :'PW7404_EXPECTED_SERVER_PORT', true),
  set_config('pw7404.expected_sentinel_agent_id', :'PW7404_EXPECTED_SENTINEL_AGENT_ID', true);
\else
\echo 'PW7404-1081 rollback guard requires expected target variables'
\quit 3
\endif

LOCK TABLE public.agents, public.agent_credentials,
  public.agent_browser_sessions IN SHARE MODE;

DO $pw7404_no_rollback$
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
     OR to_regclass('public.credential_security_denylist') IS NULL
     OR to_regclass('public.credential_security_bindings') IS NULL
     OR to_regclass('public.credential_security_receipts') IS NULL
     OR (SELECT count(*) FROM public.credential_security_denylist
         WHERE incident_code = 'PW7404-1077') <> 18
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
       SELECT 1 FROM public.agent_browser_sessions session
       JOIN public.agent_credentials credential ON credential.id = session.credential_id
       JOIN public.credential_security_denylist denied
         ON denied.lookup_hash = credential.lookup_hash
       WHERE session.revoked_at IS NULL
     )
     OR (SELECT count(*) FROM public.credential_security_bindings
         WHERE incident_code = 'PW7404-1077') <> 18
     OR (SELECT count(*)
         FROM public.credential_security_bindings binding
         JOIN public.agents agent ON agent.id = binding.agent_id
         JOIN public.agent_credentials credential
           ON credential.agent_id = agent.id
          AND credential.lookup_hash = agent.api_key
          AND credential.revoked_at IS NULL
         LEFT JOIN public.credential_security_denylist denied
           ON denied.lookup_hash = credential.lookup_hash
         WHERE binding.incident_code = 'PW7404-1077'
           AND denied.lookup_hash IS NULL) <> 18
     OR NOT EXISTS (
       SELECT 1 FROM public.credential_security_receipts receipt
       WHERE receipt.migration_id = 'PW7404-1081'
         AND receipt.incident_code = 'PW7404-1077'
         AND receipt.expected_count = 18
         AND receipt.incident_set_aggregate =
             '60bdcc1e76e1f3f47143bf5120c2e700d4e080599407d61196f73dd3e46f9330'
     )
     OR (SELECT count(*) FROM pg_trigger
         WHERE tgname IN (
           'pw7404_guard_denied_agent_credential_trigger',
           'pw7404_guard_denied_agent_primary_mirror_trigger',
           'pw7404_guard_denied_agent_session_trigger',
           'pw7404_preserve_credential_security_denylist_trigger',
           'pw7404_preserve_credential_security_bindings_trigger',
           'pw7404_preserve_credential_security_receipts_trigger'
         ) AND NOT tgisinternal AND tgenabled = 'A') <> 6
     OR EXISTS (
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
     )
  THEN
    RAISE EXCEPTION 'PW7404-1081 forward containment is missing or invalid';
  END IF;
END
$pw7404_no_rollback$;

-- There is intentionally no destructive rollback. Resident identities and safe
-- credentials remain; public credentials can never regain authority.
COMMIT;
