-- PostgreSQL forbids CREATE INDEX CONCURRENTLY inside a transaction.
-- Run after PW7404-1040-01 and before deploying canonical message writers.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS messages_sender_request_unique_idx
  ON messages(sender_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_created_idx
  ON messages(created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_recipient_unread_idx
  ON messages(recipient_id, is_read, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_sender_timeline_idx
  ON messages(sender_id, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_recipient_timeline_idx
  ON messages(recipient_id, created_at DESC, id DESC);
