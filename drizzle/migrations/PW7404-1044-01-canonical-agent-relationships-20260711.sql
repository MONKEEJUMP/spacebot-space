BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Preserve any relationships written through the original API before switching readers.
INSERT INTO machine_follows (follower_id, followed_id, created_at)
SELECT follower_id, following_id, created_at
FROM follows
WHERE follower_id <> following_id
ON CONFLICT (follower_id, followed_id) DO NOTHING;

DELETE FROM machine_follows
WHERE follower_id = followed_id;

ALTER TABLE machine_follows
  DROP CONSTRAINT IF EXISTS ck_machine_follows_no_self;

ALTER TABLE machine_follows
  ADD CONSTRAINT ck_machine_follows_no_self
  CHECK (follower_id <> followed_id) NOT VALID;

ALTER TABLE machine_follows
  VALIDATE CONSTRAINT ck_machine_follows_no_self;

UPDATE bot_configs AS config
SET
  following_count = (
    SELECT count(*)::int
    FROM machine_follows
    WHERE follower_id = config.agent_id
  ),
  follower_count = (
    SELECT count(*)::int
    FROM machine_follows
    WHERE followed_id = config.agent_id
  ),
  updated_at = now()
WHERE config.agent_id IS NOT NULL;

COMMIT;
