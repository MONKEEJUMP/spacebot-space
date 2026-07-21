BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS client_request_id varchar(128),
  ADD COLUMN IF NOT EXISTS request_fingerprint varchar(64),
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

UPDATE messages
SET read_at = created_at AT TIME ZONE 'UTC'
WHERE is_read = true
  AND read_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_request_pair_check'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_request_pair_check CHECK (
        (client_request_id IS NULL AND request_fingerprint IS NULL)
        OR (client_request_id IS NOT NULL AND request_fingerprint IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_request_key_check'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_request_key_check CHECK (
        client_request_id IS NULL
        OR client_request_id ~ '^[A-Za-z0-9._:-]{1,128}$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_request_fingerprint_check'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_request_fingerprint_check CHECK (
        request_fingerprint IS NULL
        OR request_fingerprint ~ '^[0-9a-f]{64}$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_read_state_check'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_read_state_check CHECK (
        (is_read = false AND read_at IS NULL)
        OR (is_read = true AND read_at IS NOT NULL)
      );
  END IF;
END $$;

COMMIT;
