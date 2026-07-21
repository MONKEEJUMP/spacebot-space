BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

\if :{?PW7404_EXPECTED_DATABASE}
SELECT
  set_config('pw7404.expected_database', :'PW7404_EXPECTED_DATABASE', true),
  set_config('pw7404.expected_user', :'PW7404_EXPECTED_DATABASE_USER', true),
  set_config('pw7404.expected_server_address', :'PW7404_EXPECTED_SERVER_ADDRESS', true),
  set_config('pw7404.expected_server_port', :'PW7404_EXPECTED_SERVER_PORT', true),
  set_config('pw7404.expected_sentinel_agent_id', :'PW7404_EXPECTED_SENTINEL_AGENT_ID', true);

DO $pw7404_target_guard$
BEGIN
  IF current_database() <> current_setting('pw7404.expected_database')
     OR current_user <> current_setting('pw7404.expected_user')
     OR coalesce(inet_server_addr()::text, 'local') <>
        current_setting('pw7404.expected_server_address')
     OR coalesce(inet_server_port()::text, 'local') <>
        current_setting('pw7404.expected_server_port')
     OR NOT EXISTS (
       SELECT 1 FROM agents
       WHERE id = current_setting('pw7404.expected_sentinel_agent_id')::uuid
     )
  THEN
    RAISE EXCEPTION 'PW7404-1051 same-connection database target guard failed';
  END IF;

  IF to_regclass('public.resident_tasks') IS NOT NULL
     OR to_regclass('public.resident_task_events') IS NOT NULL
  THEN
    RAISE EXCEPTION 'PW7404-1051 refuses pre-existing resident task tables';
  END IF;
END
$pw7404_target_guard$;
\else
\echo 'PW7404-1051 expected target variables are required'
\quit 3
\endif

CREATE TABLE resident_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_agent_id uuid NOT NULL,
  assignee_agent_id uuid,
  task_type varchar(32) NOT NULL DEFAULT 'general',
  title varchar(200) NOT NULL,
  description text NOT NULL DEFAULT '',
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  visibility varchar(12) NOT NULL DEFAULT 'participants',
  priority varchar(10) NOT NULL DEFAULT 'normal',
  status varchar(16) NOT NULL DEFAULT 'open',
  version integer NOT NULL DEFAULT 1,
  due_at timestamptz(6),
  completed_at timestamptz(6),
  cancelled_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT resident_tasks_creator_agent_id_agents_id_fk
    FOREIGN KEY (creator_agent_id) REFERENCES agents(id) ON DELETE RESTRICT,
  CONSTRAINT resident_tasks_assignee_agent_id_agents_id_fk
    FOREIGN KEY (assignee_agent_id) REFERENCES agents(id) ON DELETE RESTRICT,
  CONSTRAINT resident_tasks_type_check
    CHECK (task_type ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT resident_tasks_title_check CHECK (btrim(title) <> ''),
  CONSTRAINT resident_tasks_description_size_check
    CHECK (char_length(description) <= 32768),
  CONSTRAINT resident_tasks_input_check
    CHECK (jsonb_typeof(input) = 'object' AND octet_length(input::text) <= 32768),
  CONSTRAINT resident_tasks_result_check
    CHECK (
      result IS NULL
      OR (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 65536)
    ),
  CONSTRAINT resident_tasks_visibility_check
    CHECK (visibility IN ('participants', 'residents')),
  CONSTRAINT resident_tasks_priority_check
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT resident_tasks_status_check
    CHECK (status IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
  CONSTRAINT resident_tasks_version_check CHECK (version >= 1),
  CONSTRAINT resident_tasks_terminal_state_check CHECK (
    (status = 'open' AND completed_at IS NULL AND cancelled_at IS NULL AND result IS NULL)
    OR (
      status IN ('in_progress', 'blocked')
      AND assignee_agent_id IS NOT NULL
      AND completed_at IS NULL
      AND cancelled_at IS NULL
      AND result IS NULL
    )
    OR (
      status = 'completed'
      AND assignee_agent_id IS NOT NULL
      AND completed_at IS NOT NULL
      AND cancelled_at IS NULL
      AND result IS NOT NULL
    )
    OR (
      status = 'cancelled'
      AND cancelled_at IS NOT NULL
      AND completed_at IS NULL
      AND result IS NULL
    )
  ),
  CONSTRAINT resident_tasks_chronology_check CHECK (created_at <= updated_at)
);

CREATE TABLE resident_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  actor_agent_id uuid NOT NULL,
  task_version integer NOT NULL,
  event_type varchar(24) NOT NULL,
  from_status varchar(16),
  to_status varchar(16) NOT NULL,
  client_request_id varchar(128) NOT NULL,
  request_fingerprint varchar(64) NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT resident_task_events_task_id_tasks_id_fk
    FOREIGN KEY (task_id) REFERENCES resident_tasks(id) ON DELETE RESTRICT,
  CONSTRAINT resident_task_events_actor_agent_id_agents_id_fk
    FOREIGN KEY (actor_agent_id) REFERENCES agents(id) ON DELETE RESTRICT,
  CONSTRAINT resident_task_events_version_check CHECK (task_version >= 1),
  CONSTRAINT resident_task_events_type_check CHECK (
    event_type IN (
      'created', 'updated', 'assigned', 'started', 'blocked', 'resumed',
      'released', 'noted', 'completed', 'cancelled'
    )
  ),
  CONSTRAINT resident_task_events_request_key_check
    CHECK (client_request_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  CONSTRAINT resident_task_events_request_fingerprint_check
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT resident_task_events_status_check CHECK (
    to_status IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')
    AND (
      from_status IS NULL
      OR from_status IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')
    )
  ),
  CONSTRAINT resident_task_events_changes_check CHECK (
    jsonb_typeof(changes) = 'object'
    AND jsonb_typeof(changes -> 'snapshot') = 'object'
    AND (changes -> 'snapshot' ->> 'version')::integer = task_version
    AND changes -> 'snapshot' ->> 'status' = to_status
  ),
  CONSTRAINT resident_task_events_transition_check CHECK (
    (event_type = 'created' AND from_status IS NULL AND to_status = 'open')
    OR (event_type IN ('updated', 'assigned') AND from_status = 'open' AND to_status = 'open')
    OR (
      event_type = 'noted'
      AND from_status IN ('open', 'in_progress', 'blocked')
      AND to_status = from_status
    )
    OR (event_type = 'started' AND from_status = 'open' AND to_status = 'in_progress')
    OR (event_type = 'blocked' AND from_status = 'in_progress' AND to_status = 'blocked')
    OR (event_type = 'resumed' AND from_status = 'blocked' AND to_status = 'in_progress')
    OR (
      event_type = 'released'
      AND from_status IN ('open', 'in_progress', 'blocked')
      AND to_status = 'open'
    )
    OR (
      event_type = 'completed'
      AND from_status = 'in_progress'
      AND to_status = 'completed'
    )
    OR (
      event_type = 'cancelled'
      AND from_status IN ('open', 'in_progress', 'blocked')
      AND to_status = 'cancelled'
    )
  )
);

CREATE INDEX resident_tasks_creator_timeline_idx
  ON resident_tasks (creator_agent_id, updated_at DESC, id DESC);
CREATE INDEX resident_tasks_assignee_timeline_idx
  ON resident_tasks (assignee_agent_id, updated_at DESC, id DESC);
CREATE INDEX resident_tasks_status_timeline_idx
  ON resident_tasks (status, updated_at DESC, id DESC);
CREATE INDEX resident_tasks_available_idx
  ON resident_tasks (priority, created_at, id)
  WHERE visibility = 'residents' AND status = 'open' AND assignee_agent_id IS NULL;
CREATE INDEX resident_tasks_due_idx
  ON resident_tasks (due_at, id)
  WHERE due_at IS NOT NULL AND status IN ('open', 'in_progress', 'blocked');
CREATE UNIQUE INDEX resident_task_events_version_unique_idx
  ON resident_task_events (task_id, task_version);
CREATE UNIQUE INDEX resident_task_events_actor_request_unique_idx
  ON resident_task_events (actor_agent_id, client_request_id);
CREATE INDEX resident_task_events_task_timeline_idx
  ON resident_task_events (task_id, task_version, id);
CREATE INDEX resident_task_events_actor_timeline_idx
  ON resident_task_events (actor_agent_id, created_at, id);

CREATE OR REPLACE FUNCTION pw7404_resident_task_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'pw7404_task_maintenance'
     AND current_setting('pw7404.allow_resident_task_maintenance', true) = 'on'
  THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'resident_task_events is append-only';
END;
$$;

CREATE TRIGGER pw7404_resident_task_event_immutable_trigger
BEFORE UPDATE OR DELETE ON resident_task_events
FOR EACH ROW EXECUTE FUNCTION pw7404_resident_task_event_immutable();

CREATE OR REPLACE FUNCTION pw7404_resident_task_event_matches_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  task_row resident_tasks%ROWTYPE;
  previous_event resident_task_events%ROWTYPE;
  snapshot jsonb;
BEGIN
  SELECT *
  INTO task_row
  FROM resident_tasks
  WHERE id = NEW.task_id;

  IF NOT FOUND
     OR task_row.version <> NEW.task_version
     OR task_row.status <> NEW.to_status
  THEN
    RAISE EXCEPTION 'resident task event must match the current task snapshot';
  END IF;

  snapshot := NEW.changes -> 'snapshot';
  IF jsonb_typeof(snapshot) <> 'object'
     OR NOT snapshot ?& ARRAY[
       'id', 'creatorAgentId', 'assigneeAgentId', 'taskType', 'title',
       'description', 'input', 'result', 'visibility', 'priority', 'status',
       'version', 'dueAt', 'completedAt', 'cancelledAt', 'createdAt', 'updatedAt'
     ]
     OR snapshot - ARRAY[
       'id', 'creatorAgentId', 'assigneeAgentId', 'taskType', 'title',
       'description', 'input', 'result', 'visibility', 'priority', 'status',
       'version', 'dueAt', 'completedAt', 'cancelledAt', 'createdAt', 'updatedAt'
     ] <> '{}'::jsonb
     OR snapshot ->> 'id' IS DISTINCT FROM task_row.id::text
     OR snapshot ->> 'creatorAgentId' IS DISTINCT FROM task_row.creator_agent_id::text
     OR snapshot ->> 'assigneeAgentId' IS DISTINCT FROM task_row.assignee_agent_id::text
     OR snapshot ->> 'taskType' IS DISTINCT FROM task_row.task_type
     OR snapshot ->> 'title' IS DISTINCT FROM task_row.title
     OR snapshot ->> 'description' IS DISTINCT FROM task_row.description
     OR snapshot -> 'input' IS DISTINCT FROM task_row.input
     OR snapshot -> 'result' IS DISTINCT FROM coalesce(to_jsonb(task_row.result), 'null'::jsonb)
     OR snapshot ->> 'visibility' IS DISTINCT FROM task_row.visibility
     OR snapshot ->> 'priority' IS DISTINCT FROM task_row.priority
     OR snapshot ->> 'status' IS DISTINCT FROM task_row.status
     OR (snapshot ->> 'version')::integer IS DISTINCT FROM task_row.version
     OR (snapshot ->> 'dueAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task_row.due_at)
     OR (snapshot ->> 'completedAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task_row.completed_at)
     OR (snapshot ->> 'cancelledAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task_row.cancelled_at)
     OR (snapshot ->> 'createdAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task_row.created_at)
     OR (snapshot ->> 'updatedAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task_row.updated_at)
  THEN
    RAISE EXCEPTION 'resident task event snapshot must exactly match the task row';
  END IF;

  IF NEW.task_version = 1 THEN
    IF NEW.event_type <> 'created'
       OR NEW.from_status IS NOT NULL
       OR NEW.actor_agent_id <> task_row.creator_agent_id
    THEN
      RAISE EXCEPTION 'resident task version one requires a creator-attributed created event';
    END IF;
  ELSE
    SELECT *
    INTO previous_event
    FROM resident_task_events
    WHERE task_id = NEW.task_id
      AND task_version = NEW.task_version - 1;

    IF NOT FOUND OR previous_event.to_status IS DISTINCT FROM NEW.from_status THEN
      RAISE EXCEPTION 'resident task event must continue the prior ledger state';
    END IF;

    IF NEW.event_type IN ('updated', 'cancelled')
       AND NEW.actor_agent_id <> task_row.creator_agent_id
    THEN
      RAISE EXCEPTION 'resident task event actor is not the task creator';
    ELSIF NEW.event_type = 'assigned'
       AND NEW.actor_agent_id <> task_row.creator_agent_id
       AND NEW.actor_agent_id IS DISTINCT FROM task_row.assignee_agent_id
    THEN
      RAISE EXCEPTION 'resident task assignment actor is invalid';
    ELSIF NEW.event_type IN ('started', 'blocked', 'resumed', 'released', 'completed')
       AND NEW.actor_agent_id IS DISTINCT FROM
         (previous_event.changes -> 'snapshot' ->> 'assigneeAgentId')::uuid
    THEN
      RAISE EXCEPTION 'resident task lifecycle actor is not the prior assignee';
    ELSIF NEW.event_type = 'noted'
       AND NEW.actor_agent_id <> task_row.creator_agent_id
       AND NEW.actor_agent_id IS DISTINCT FROM task_row.assignee_agent_id
       AND NEW.actor_agent_id IS DISTINCT FROM
         (previous_event.changes -> 'snapshot' ->> 'assigneeAgentId')::uuid
    THEN
      RAISE EXCEPTION 'resident task note actor is not a participant';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM agents AS actor
    WHERE actor.id = NEW.actor_agent_id
      AND actor.moderation_status = 'active'
      AND EXISTS (
        SELECT 1
        FROM agent_credentials AS credential
        WHERE credential.agent_id = actor.id
          AND credential.revoked_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'resident task event actor must be an active credentialed resident';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pw7404_resident_task_event_matches_snapshot_trigger
BEFORE INSERT ON resident_task_events
FOR EACH ROW EXECUTE FUNCTION pw7404_resident_task_event_matches_snapshot();

CREATE OR REPLACE FUNCTION pw7404_resident_task_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.status <> 'open' THEN
      RAISE EXCEPTION 'resident task must be created open at version one';
    END IF;
    RETURN NEW;
  END IF;
  IF current_user = 'pw7404_task_maintenance'
     AND current_setting('pw7404.allow_resident_task_maintenance', true) = 'on'
  THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'resident_tasks cannot be physically deleted';
  END IF;
  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'terminal resident task cannot be changed';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'resident task version must increment by exactly one';
  END IF;
  IF NEW.id <> OLD.id
     OR NEW.creator_agent_id <> OLD.creator_agent_id
     OR NEW.created_at <> OLD.created_at
  THEN
    RAISE EXCEPTION 'resident task identity fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pw7404_resident_task_guard_trigger
BEFORE INSERT OR UPDATE OR DELETE ON resident_tasks
FOR EACH ROW EXECUTE FUNCTION pw7404_resident_task_guard();

CREATE OR REPLACE FUNCTION pw7404_resident_task_requires_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'pw7404_task_maintenance'
     AND current_setting('pw7404.allow_resident_task_maintenance', true) = 'on'
  THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM resident_task_events AS event
    WHERE event.task_id = NEW.id
      AND event.task_version = NEW.version
  ) THEN
    RAISE EXCEPTION 'resident task version % requires a matching event', NEW.version;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER pw7404_resident_task_requires_event_trigger
AFTER INSERT OR UPDATE ON resident_tasks
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION pw7404_resident_task_requires_event();

REVOKE DELETE ON resident_tasks FROM PUBLIC;
REVOKE UPDATE, DELETE ON resident_task_events FROM PUBLIC;

COMMIT;
