-- PW7404-1021-02: make ownership single-winner and connect BotSpace residents
-- to their canonical agents. Run once before deploying code that writes
-- claim_code_expires_at or bot_configs.agent_id. Applied through the coded
-- runner together with 01 and the receipt in one transaction.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS claim_code_expires_at timestamptz(6);

ALTER TABLE bot_configs
  ADD COLUMN IF NOT EXISTS agent_id uuid;

ALTER TABLE humans
  ADD COLUMN IF NOT EXISTS stripe_subscription_id varchar(100);

CREATE UNIQUE INDEX IF NOT EXISTS humans_email_casefold_unique_idx
  ON humans (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS humans_stripe_subscription_id_unique_idx
  ON humans (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

UPDATE bot_configs AS config
SET agent_id = agent.id
FROM agents AS agent
WHERE config.agent_id IS NULL
  AND config.bot_name = agent.name;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM human_agent_links
    WHERE status = 'active'
    GROUP BY agent_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active agent ownership must be reconciled first';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agents AS agent
    WHERE agent.is_claimed = true
      AND NOT EXISTS (
        SELECT 1
        FROM human_agent_links AS link
        WHERE link.agent_id = agent.id
          AND link.status = 'active'
      )
  ) THEN
    RAISE EXCEPTION 'Claimed agents without an active owner must be reconciled first';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM human_agent_links AS link
    JOIN agents AS agent ON agent.id = link.agent_id
    WHERE link.status = 'active'
      AND agent.is_claimed = false
  ) THEN
    RAISE EXCEPTION 'Active ownership links for unclaimed agents must be reconciled first';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS human_agent_links_one_active_agent_idx
  ON human_agent_links (agent_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS bot_configs_agent_id_unique_idx
  ON bot_configs (agent_id)
  WHERE agent_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bot_configs_agent_id_agents_id_fk'
  ) THEN
    ALTER TABLE bot_configs
      ADD CONSTRAINT bot_configs_agent_id_agents_id_fk
      FOREIGN KEY (agent_id)
      REFERENCES agents(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE bot_configs
  VALIDATE CONSTRAINT bot_configs_agent_id_agents_id_fk;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bot_configs WHERE agent_id IS NULL) THEN
    RAISE EXCEPTION 'BotSpace residents without canonical agents must be reconciled first';
  END IF;
END
$$;
