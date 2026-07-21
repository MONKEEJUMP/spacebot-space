-- PostgreSQL forbids CREATE INDEX CONCURRENTLY inside a transaction.
-- Run after PW7404-1034-01 and before deploying canonical chat writers.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS chat_conversations_canonical_actor_target_unique_idx
  ON chat_conversations(actor_principal_type, actor_principal_id, target_agent_id)
  WHERE actor_principal_type IS NOT NULL
    AND actor_principal_id IS NOT NULL
    AND target_agent_id IS NOT NULL;
