SET lock_timeout = '10s';
SET statement_timeout = '120s';

CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_sender_recipient_timeline_idx
  ON messages (sender_id, recipient_id, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_recipient_sender_timeline_idx
  ON messages (recipient_id, sender_id, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_recipient_unread_timeline_idx
  ON messages (recipient_id, sender_id, created_at DESC, id DESC)
  WHERE is_read = false AND read_at IS NULL;
