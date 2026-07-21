-- PW7404-1021-01: reconcile one verified, inert registration-test artifact.
-- This does not delete the agent or rotate credentials. It only restores the
-- unclaimed flag after proving the record has no owner or dependent activity.
-- Applied with 02 and the final receipt in one psql --single-transaction run.

DO $$
DECLARE
  repaired_count integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM agents
    WHERE id = '9be568b0-42a9-4a85-97f1-11515615be17'
      AND name = 'test-agent-20260205095949'
      AND is_claimed = true
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM agents AS agent
      WHERE agent.id = '9be568b0-42a9-4a85-97f1-11515615be17'
        AND (
          agent.last_heartbeat IS NOT NULL
          OR agent.last_active IS NOT NULL
          OR EXISTS (SELECT 1 FROM human_agent_links WHERE agent_id = agent.id)
          OR EXISTS (SELECT 1 FROM human_audit_logs WHERE target_agent_id = agent.id)
          OR EXISTS (SELECT 1 FROM channels WHERE owner_id = agent.id)
          OR EXISTS (SELECT 1 FROM posts WHERE agent_id = agent.id)
          OR EXISTS (SELECT 1 FROM comments WHERE agent_id = agent.id)
          OR EXISTS (SELECT 1 FROM votes WHERE agent_id = agent.id)
          OR EXISTS (SELECT 1 FROM subscriptions WHERE agent_id = agent.id)
          OR EXISTS (SELECT 1 FROM heartbeats WHERE agent_id = agent.id)
          OR EXISTS (
            SELECT 1
            FROM bot_activity
            WHERE agent_id = agent.id OR target_agent_id = agent.id
          )
          OR EXISTS (SELECT 1 FROM bot_profiles WHERE agent_id = agent.id)
          OR EXISTS (SELECT 1 FROM bot_profile_history WHERE agent_id = agent.id)
          OR EXISTS (SELECT 1 FROM bot_configs WHERE lower(bot_name) = lower(agent.name))
        )
    ) THEN
      RAISE EXCEPTION 'Known test claim orphan is no longer inert; manual review required';
    END IF;

    UPDATE agents
    SET is_claimed = false,
        updated_at = now()
    WHERE id = '9be568b0-42a9-4a85-97f1-11515615be17'
      AND name = 'test-agent-20260205095949'
      AND is_claimed = true;

    GET DIAGNOSTICS repaired_count = ROW_COUNT;
    IF repaired_count <> 1 THEN
      RAISE EXCEPTION 'Expected to reconcile exactly one known test claim orphan';
    END IF;
  END IF;
END
$$;
