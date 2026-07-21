BEGIN;

ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS actor_principal_type varchar(16),
  ADD COLUMN IF NOT EXISTS actor_principal_id uuid,
  ADD COLUMN IF NOT EXISTS target_agent_id uuid,
  ADD COLUMN IF NOT EXISTS canonicalized_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_conversations_target_agent_id_agents_id_fk'
      AND conrelid = 'public.chat_conversations'::regclass
  ) THEN
    ALTER TABLE chat_conversations
      ADD CONSTRAINT chat_conversations_target_agent_id_agents_id_fk
      FOREIGN KEY (target_agent_id) REFERENCES agents(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chat_conversations_actor_idx
  ON chat_conversations(actor_principal_type, actor_principal_id);
CREATE INDEX IF NOT EXISTS chat_conversations_target_agent_idx
  ON chat_conversations(target_agent_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_conversations_cycle_scope_unique'
      AND conrelid = 'public.chat_conversations'::regclass
  ) THEN
    ALTER TABLE chat_conversations
      ADD CONSTRAINT chat_conversations_cycle_scope_unique
      UNIQUE (id, actor_principal_type, actor_principal_id, target_agent_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_conversations_canonical_scope_check'
      AND conrelid = 'public.chat_conversations'::regclass
  ) THEN
    ALTER TABLE chat_conversations
      ADD CONSTRAINT chat_conversations_canonical_scope_check CHECK (
        (actor_principal_type IS NULL AND actor_principal_id IS NULL AND target_agent_id IS NULL AND canonicalized_at IS NULL)
        OR (actor_principal_type IN ('human', 'agent') AND actor_principal_id IS NOT NULL AND target_agent_id IS NOT NULL AND canonicalized_at IS NOT NULL)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS lucy_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  target_agent_id uuid NOT NULL REFERENCES agents(id),
  actor_principal_type varchar(16) NOT NULL,
  actor_principal_id uuid NOT NULL,
  input_hash varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'reserved',
  lease_owner uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  output jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT lucy_cycles_status_check CHECK (
    status IN ('reserved', 'running', 'completed', 'partial', 'blocked', 'refused', 'failed')
  ),
  CONSTRAINT lucy_cycles_actor_type_check CHECK (
    actor_principal_type IN ('human', 'agent', 'system')
  ),
  CONSTRAINT lucy_cycles_conversation_scope_fk FOREIGN KEY (
    conversation_id,
    actor_principal_type,
    actor_principal_id,
    target_agent_id
  ) REFERENCES chat_conversations (
    id,
    actor_principal_type,
    actor_principal_id,
    target_agent_id
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS lucy_cycles_request_unique_idx
  ON lucy_cycles(request_id);
CREATE UNIQUE INDEX IF NOT EXISTS lucy_cycles_turn_unique_idx
  ON lucy_cycles(turn_id);
CREATE INDEX IF NOT EXISTS lucy_cycles_conversation_idx
  ON lucy_cycles(conversation_id);
CREATE INDEX IF NOT EXISTS lucy_cycles_target_agent_idx
  ON lucy_cycles(target_agent_id);
CREATE INDEX IF NOT EXISTS lucy_cycles_actor_idx
  ON lucy_cycles(actor_principal_type, actor_principal_id);
CREATE INDEX IF NOT EXISTS lucy_cycles_lease_idx
  ON lucy_cycles(lease_expires_at);

COMMIT;
