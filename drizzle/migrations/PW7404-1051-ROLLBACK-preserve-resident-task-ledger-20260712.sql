BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regclass('public.resident_tasks') IS NULL
     OR to_regclass('public.resident_task_events') IS NULL
  THEN
    RAISE EXCEPTION 'resident task forward schema is incomplete';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM resident_tasks AS task
    LEFT JOIN resident_task_events AS event
      ON event.task_id = task.id
     AND event.task_version = task.version
    WHERE event.id IS NULL
  ) THEN
    RAISE EXCEPTION 'resident task ledger is incomplete';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM resident_tasks AS task
    LEFT JOIN resident_task_events AS event ON event.task_id = task.id
    GROUP BY task.id, task.version
    HAVING count(event.id) <> task.version
       OR min(event.task_version) <> 1
       OR max(event.task_version) <> task.version
  ) THEN
    RAISE EXCEPTION 'resident task ledger contains a version gap';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM resident_task_events AS event
    LEFT JOIN resident_task_events AS previous
      ON previous.task_id = event.task_id
     AND previous.task_version = event.task_version - 1
    WHERE (event.task_version = 1 AND (
             event.event_type <> 'created' OR event.from_status IS NOT NULL
          ))
       OR (event.task_version > 1 AND (
             previous.id IS NULL OR previous.to_status IS DISTINCT FROM event.from_status
          ))
  ) THEN
    RAISE EXCEPTION 'resident task ledger state chain is broken';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM resident_tasks AS task
    JOIN resident_task_events AS event
      ON event.task_id = task.id AND event.task_version = task.version
    WHERE event.changes ->> 'snapshot' IS NULL
       OR event.changes -> 'snapshot' ->> 'id' IS DISTINCT FROM task.id::text
       OR event.changes -> 'snapshot' ->> 'creatorAgentId' IS DISTINCT FROM task.creator_agent_id::text
       OR event.changes -> 'snapshot' ->> 'assigneeAgentId' IS DISTINCT FROM task.assignee_agent_id::text
       OR event.changes -> 'snapshot' ->> 'taskType' IS DISTINCT FROM task.task_type
       OR event.changes -> 'snapshot' ->> 'title' IS DISTINCT FROM task.title
       OR event.changes -> 'snapshot' ->> 'description' IS DISTINCT FROM task.description
       OR event.changes -> 'snapshot' -> 'input' IS DISTINCT FROM task.input
       OR event.changes -> 'snapshot' -> 'result' IS DISTINCT FROM coalesce(to_jsonb(task.result), 'null'::jsonb)
       OR event.changes -> 'snapshot' ->> 'visibility' IS DISTINCT FROM task.visibility
       OR event.changes -> 'snapshot' ->> 'priority' IS DISTINCT FROM task.priority
       OR event.changes -> 'snapshot' ->> 'status' IS DISTINCT FROM task.status
       OR (event.changes -> 'snapshot' ->> 'version')::integer IS DISTINCT FROM task.version
       OR (event.changes -> 'snapshot' ->> 'dueAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task.due_at)
       OR (event.changes -> 'snapshot' ->> 'completedAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task.completed_at)
       OR (event.changes -> 'snapshot' ->> 'cancelledAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task.cancelled_at)
       OR (event.changes -> 'snapshot' ->> 'createdAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task.created_at)
       OR (event.changes -> 'snapshot' ->> 'updatedAt')::timestamptz IS DISTINCT FROM date_trunc('milliseconds', task.updated_at)
  ) THEN
    RAISE EXCEPTION 'resident task current snapshot is inconsistent';
  END IF;
  IF (
    SELECT count(*)
    FROM pg_trigger
    WHERE tgrelid IN ('resident_tasks'::regclass, 'resident_task_events'::regclass)
      AND NOT tgisinternal
      AND tgenabled IN ('O', 'A')
      AND tgname IN (
        'pw7404_resident_task_event_immutable_trigger',
        'pw7404_resident_task_event_matches_snapshot_trigger',
        'pw7404_resident_task_guard_trigger',
        'pw7404_resident_task_requires_event_trigger'
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'resident task integrity triggers are not fully enabled';
  END IF;
END $$;

-- Forward schema and immutable history intentionally remain in place when an
-- older app build is restored. Older builds do not reference these tables.
COMMIT;
