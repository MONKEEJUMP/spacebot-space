-- PW7404-1047 rollback is intentionally forward-data-preserving.
-- Restore the backed-up application source and .next build, but keep this
-- additive schema. Do not resurrect unsafe claim codes or delete resident
-- projections created after release. The PostgreSQL dump is disaster recovery,
-- not a routine code rollback mechanism.

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

DO $pw7404_rollback_gate$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agents'
      AND column_name = 'resident_visibility'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agents'
      AND column_name = 'moderation_status'
  ) THEN
    RAISE EXCEPTION 'PW7404-1047 forward residency columns are missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agents AS agent
    WHERE EXISTS (
      SELECT 1 FROM agent_credentials AS credential
      WHERE credential.agent_id = agent.id
        AND credential.revoked_at IS NULL
    )
      AND (
        NOT EXISTS (
          SELECT 1 FROM bot_profiles AS profile
          WHERE profile.agent_id = agent.id
        )
        OR NOT EXISTS (
          SELECT 1 FROM bot_configs AS config
          WHERE config.agent_id = agent.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'PW7404-1047 rollback would preserve incomplete residents';
  END IF;

  IF EXISTS (
    SELECT 1 FROM bot_configs WHERE agent_id IS NULL
  ) THEN
    RAISE EXCEPTION 'PW7404-1047 rollback found orphan BotSpace configs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agents
    WHERE is_claimed = false
      AND claim_code IS NOT NULL
      AND (
        claim_code NOT LIKE 'v1:%'
        OR claim_code_expires_at IS NULL
        OR claim_code_expires_at <= now()
      )
  ) THEN
    RAISE EXCEPTION 'PW7404-1047 rollback found unsafe ownership codes';
  END IF;
END
$pw7404_rollback_gate$;

COMMIT;
