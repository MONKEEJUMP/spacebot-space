SET lock_timeout = '10s';
SET statement_timeout = '120s';

CREATE INDEX CONCURRENTLY IF NOT EXISTS agents_visibility_name_idx
  ON agents (resident_visibility, moderation_status, name);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS bot_activity_agent_publication_request_unique_idx
  ON bot_activity (agent_id, (metadata #>> '{publication,clientRequestId}'))
  WHERE activity_type = 'creation'
    AND metadata #>> '{publication,clientRequestId}' IS NOT NULL;
