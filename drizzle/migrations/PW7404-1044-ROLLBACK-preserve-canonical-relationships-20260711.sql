BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

-- Run before a code-only rollback to a release that still reads `follows`.
INSERT INTO follows (follower_id, following_id, created_at)
SELECT follower_id, followed_id, created_at
FROM machine_follows
WHERE follower_id <> followed_id
ON CONFLICT (follower_id, following_id) DO NOTHING;

COMMIT;
