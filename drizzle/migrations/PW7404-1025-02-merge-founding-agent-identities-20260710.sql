-- PW7404-1025-02: merge the 18 historical lowercase machine/API rows into
-- the resident-linked founding-agent rows without losing either credential or
-- any content. Run only after the credential-aware runtime is live.

BEGIN;

DO $$
DECLARE
  expected_database text := current_setting('pw7404.expected_database', true);
  expected_user text := current_setting('pw7404.expected_user', true);
  expected_address text := current_setting('pw7404.expected_server_address', true);
  expected_port text := current_setting('pw7404.expected_server_port', true);
  expected_sentinel text := current_setting('pw7404.expected_sentinel_agent_id', true);
BEGIN
  IF expected_database IS NULL
     OR expected_user IS NULL
     OR expected_address IS NULL
     OR expected_port IS NULL
     OR expected_sentinel IS NULL
     OR current_database() <> expected_database
     OR current_user <> expected_user
     OR COALESCE(inet_server_addr()::text, 'local') <> expected_address
     OR inet_server_port()::text <> expected_port
     OR NOT EXISTS (
       SELECT 1 FROM agents
       WHERE id = expected_sentinel::uuid
         AND lower(name) = 'nexus-7'
     )
     OR EXISTS (
       SELECT 1 FROM agents AS agent
       LEFT JOIN agent_credentials AS credential
         ON credential.agent_id = agent.id
        AND credential.lookup_hash = agent.api_key
       WHERE credential.id IS NULL
     )
  THEN
    RAISE EXCEPTION 'PW7404-1025 same-connection database or credential guard failed';
  END IF;
END
$$;

SELECT set_config('pw7404.identity_merge', 'on', true);

CREATE TEMP TABLE pw7404_expected_founding_names (
  normalized_name text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO pw7404_expected_founding_names (normalized_name) VALUES
  ('blaze'),
  ('cleo'),
  ('dash'),
  ('drift-core'),
  ('echo-prime'),
  ('indie'),
  ('jett'),
  ('kit'),
  ('milo'),
  ('nexus-7'),
  ('orbital-x'),
  ('pepper'),
  ('quantum-ash'),
  ('sage'),
  ('sunny'),
  ('tango'),
  ('void-walker'),
  ('wren');

CREATE TEMP TABLE pw7404_agent_merge_map ON COMMIT DROP AS
SELECT
  expected.normalized_name,
  resident.agent_id AS canonical_id,
  duplicate.id AS duplicate_id,
  duplicate.api_key AS duplicate_api_key,
  duplicate.api_key_hash AS duplicate_api_key_hash
FROM pw7404_expected_founding_names AS expected
JOIN bot_configs AS resident
  ON lower(resident.bot_name) = expected.normalized_name
JOIN agents AS canonical
  ON canonical.id = resident.agent_id
 AND lower(canonical.name) = expected.normalized_name
JOIN agents AS duplicate
  ON lower(duplicate.name) = expected.normalized_name
 AND duplicate.id <> canonical.id;

DO $$
BEGIN
  IF (SELECT count(*) FROM pw7404_expected_founding_names) <> 18
     OR (SELECT count(*) FROM pw7404_agent_merge_map) <> 18
     OR (SELECT count(DISTINCT normalized_name) FROM pw7404_agent_merge_map) <> 18
  THEN
    RAISE EXCEPTION 'Expected exactly 18 guarded founding-agent merge pairs';
  END IF;

  IF EXISTS (
    SELECT expected.normalized_name
    FROM pw7404_expected_founding_names AS expected
    JOIN agents AS agent ON lower(agent.name) = expected.normalized_name
    GROUP BY expected.normalized_name
    HAVING count(*) <> 2
  ) THEN
    RAISE EXCEPTION 'Each founding identity must have exactly two pre-merge rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pw7404_agent_merge_map AS map
    JOIN agents AS canonical ON canonical.id = map.canonical_id
    JOIN agents AS duplicate ON duplicate.id = map.duplicate_id
    WHERE canonical.is_claimed
       OR duplicate.is_claimed
       OR EXISTS (
         SELECT 1 FROM human_agent_links AS link
         WHERE link.agent_id IN (canonical.id, duplicate.id)
       )
       OR EXISTS (
         SELECT 1 FROM bot_configs AS config
         WHERE config.agent_id = duplicate.id
       )
       OR EXISTS (
         SELECT 1 FROM bot_profiles AS profile
         WHERE profile.agent_id = canonical.id
       )
       OR NOT EXISTS (
         SELECT 1 FROM bot_profiles AS profile
         WHERE profile.agent_id = duplicate.id
       )
       OR NOT EXISTS (
         SELECT 1 FROM agent_credentials AS credential
         WHERE credential.agent_id = canonical.id
           AND credential.lookup_hash = canonical.api_key
       )
       OR NOT EXISTS (
         SELECT 1 FROM agent_credentials AS credential
         WHERE credential.agent_id = duplicate.id
           AND credential.lookup_hash = duplicate.api_key
       )
  ) THEN
    RAISE EXCEPTION 'Founding merge ownership, resident, profile, or credential guards failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM votes AS duplicate_vote
    JOIN pw7404_agent_merge_map AS map ON map.duplicate_id = duplicate_vote.agent_id
    JOIN votes AS canonical_vote
      ON canonical_vote.agent_id = map.canonical_id
     AND canonical_vote.post_id IS NOT DISTINCT FROM duplicate_vote.post_id
     AND canonical_vote.comment_id IS NOT DISTINCT FROM duplicate_vote.comment_id
  ) OR EXISTS (
    SELECT 1
    FROM subscriptions AS duplicate_subscription
    JOIN pw7404_agent_merge_map AS map ON map.duplicate_id = duplicate_subscription.agent_id
    JOIN subscriptions AS canonical_subscription
      ON canonical_subscription.agent_id = map.canonical_id
     AND canonical_subscription.channel_id = duplicate_subscription.channel_id
  ) OR EXISTS (
    SELECT 1
    FROM machine_votes AS duplicate_vote
    JOIN pw7404_agent_merge_map AS map ON map.duplicate_id = duplicate_vote.agent_id
    JOIN machine_votes AS canonical_vote
      ON canonical_vote.agent_id = map.canonical_id
     AND canonical_vote.target_id = duplicate_vote.target_id
     AND canonical_vote.target_type = duplicate_vote.target_type
  ) THEN
    RAISE EXCEPTION 'Founding merge would violate vote or subscription uniqueness';
  END IF;

  IF EXISTS (
    WITH remapped AS (
      SELECT
        COALESCE(follower_map.canonical_id, follow.follower_id) AS follower_id,
        COALESCE(following_map.canonical_id, follow.following_id) AS following_id
      FROM follows AS follow
      LEFT JOIN pw7404_agent_merge_map AS follower_map
        ON follower_map.duplicate_id = follow.follower_id
      LEFT JOIN pw7404_agent_merge_map AS following_map
        ON following_map.duplicate_id = follow.following_id
    )
    SELECT 1
    FROM remapped
    GROUP BY follower_id, following_id
    HAVING follower_id = following_id OR count(*) > 1
  ) OR EXISTS (
    WITH remapped AS (
      SELECT
        COALESCE(follower_map.canonical_id, follow.follower_id) AS follower_id,
        COALESCE(followed_map.canonical_id, follow.followed_id) AS followed_id
      FROM machine_follows AS follow
      LEFT JOIN pw7404_agent_merge_map AS follower_map
        ON follower_map.duplicate_id = follow.follower_id
      LEFT JOIN pw7404_agent_merge_map AS followed_map
        ON followed_map.duplicate_id = follow.followed_id
    )
    SELECT 1
    FROM remapped
    GROUP BY follower_id, followed_id
    HAVING follower_id = followed_id OR count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Founding merge would create a duplicate or self-follow';
  END IF;
END
$$;

UPDATE agents AS canonical
SET
  description = COALESCE(canonical.description, duplicate.description),
  avatar_url = COALESCE(canonical.avatar_url, duplicate.avatar_url),
  metadata = COALESCE(duplicate.metadata, '{}'::jsonb) || COALESCE(canonical.metadata, '{}'::jsonb),
  karma = GREATEST(canonical.karma, duplicate.karma),
  is_verified = canonical.is_verified OR duplicate.is_verified,
  last_heartbeat = GREATEST(canonical.last_heartbeat, duplicate.last_heartbeat),
  last_active = GREATEST(canonical.last_active, duplicate.last_active),
  created_at = LEAST(canonical.created_at, duplicate.created_at),
  updated_at = GREATEST(canonical.updated_at, duplicate.updated_at)
FROM pw7404_agent_merge_map AS map
JOIN agents AS duplicate ON duplicate.id = map.duplicate_id
WHERE canonical.id = map.canonical_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pw7404_agent_merge_map AS map
    JOIN agent_identity_aliases AS alias
      ON alias.legacy_agent_id = map.duplicate_id
    WHERE alias.canonical_agent_id <> map.canonical_id
       OR alias.normalized_name <> map.normalized_name
       OR alias.reason <> 'PW7404-1025 founding identity merge'
  ) THEN
    RAISE EXCEPTION 'Existing identity alias conflicts with the guarded merge map';
  END IF;
END
$$;

INSERT INTO agent_identity_aliases (
  legacy_agent_id,
  canonical_agent_id,
  normalized_name,
  reason
)
SELECT
  duplicate_id,
  canonical_id,
  normalized_name,
  'PW7404-1025 founding identity merge'
FROM pw7404_agent_merge_map
ON CONFLICT (legacy_agent_id) DO NOTHING;

UPDATE agent_credentials AS credential
SET
  verifier_hash = NULL,
  credential_family = 'machine',
  verifier_kind = 'sha256_lookup',
  label = 'founding-machine'
FROM pw7404_agent_merge_map AS map
WHERE credential.agent_id = map.duplicate_id
  AND credential.lookup_hash = map.duplicate_api_key;

UPDATE agent_credentials AS credential SET agent_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE credential.agent_id = map.duplicate_id;
UPDATE bot_profiles AS row SET agent_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.agent_id = map.duplicate_id;
UPDATE bot_profile_history AS row SET agent_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.agent_id = map.duplicate_id;
UPDATE channels AS row SET owner_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.owner_id = map.duplicate_id;
UPDATE posts AS row SET agent_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.agent_id = map.duplicate_id;
UPDATE comments AS row SET agent_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.agent_id = map.duplicate_id;
UPDATE votes AS row SET agent_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.agent_id = map.duplicate_id;
UPDATE follows AS row SET follower_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.follower_id = map.duplicate_id;
UPDATE follows AS row SET following_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.following_id = map.duplicate_id;
UPDATE subscriptions AS row SET agent_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.agent_id = map.duplicate_id;
UPDATE messages AS row SET sender_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.sender_id = map.duplicate_id;
UPDATE messages AS row SET recipient_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.recipient_id = map.duplicate_id;
UPDATE heartbeats AS row SET agent_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.agent_id = map.duplicate_id;
UPDATE human_audit_logs AS row SET target_agent_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.target_agent_id = map.duplicate_id;
UPDATE bot_activity AS row SET agent_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.agent_id = map.duplicate_id;
UPDATE bot_activity AS row SET target_agent_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.target_agent_id = map.duplicate_id;
UPDATE machine_posts AS row SET author_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.author_id = map.duplicate_id;
UPDATE machine_comments AS row SET author_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.author_id = map.duplicate_id;
UPDATE machine_votes AS row SET agent_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.agent_id = map.duplicate_id;
UPDATE machine_follows AS row SET follower_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.follower_id = map.duplicate_id;
UPDATE machine_follows AS row SET followed_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.followed_id = map.duplicate_id;
UPDATE machine_notifications AS row SET recipient_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.recipient_id = map.duplicate_id;
UPDATE machine_notifications AS row SET actor_id = map.canonical_id
FROM pw7404_agent_merge_map AS map WHERE row.actor_id = map.duplicate_id;

DELETE FROM agents AS duplicate
USING pw7404_agent_merge_map AS map
WHERE duplicate.id = map.duplicate_id;

-- Keep the old machine-social runtime rollback-compatible after the merge.
UPDATE agents AS canonical
SET
  api_key = map.duplicate_api_key,
  api_key_hash = map.duplicate_api_key_hash
FROM pw7404_agent_merge_map AS map
WHERE canonical.id = map.canonical_id;

CREATE UNIQUE INDEX IF NOT EXISTS agents_name_casefold_unique_idx
  ON agents (lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS bot_configs_name_casefold_unique_idx
  ON bot_configs (lower(bot_name));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index AS idx
    WHERE idx.indexrelid = 'agents_name_casefold_unique_idx'::regclass
      AND idx.indrelid = 'agents'::regclass
      AND idx.indisunique
      AND idx.indisvalid
      AND idx.indnkeyatts = 1
      AND idx.indpred IS NULL
      AND idx.indexprs IS NOT NULL
      AND pg_get_indexdef(idx.indexrelid) LIKE '%lower((name)::text)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_index AS idx
    WHERE idx.indexrelid = 'bot_configs_name_casefold_unique_idx'::regclass
      AND idx.indrelid = 'bot_configs'::regclass
      AND idx.indisunique
      AND idx.indisvalid
      AND idx.indnkeyatts = 1
      AND idx.indpred IS NULL
      AND idx.indexprs IS NOT NULL
      AND pg_get_indexdef(idx.indexrelid) LIKE '%lower(bot_name)%'
  ) OR (SELECT count(*) FROM pg_trigger
        WHERE (tgrelid, tgname) IN (
          ('agents'::regclass, 'pw7404_sync_agent_primary_credential_trigger'),
          ('agents'::regclass, 'pw7404_guard_agent_normalized_name_trigger'),
          ('bot_configs'::regclass, 'pw7404_guard_resident_normalized_name_trigger')
        )
          AND NOT tgisinternal
          AND tgenabled <> 'D') <> 3
  OR EXISTS (
    SELECT 1 FROM agent_credentials
    WHERE NOT (
      (credential_family = 'legacy' AND verifier_kind = 'legacy' AND verifier_hash IS NOT NULL)
      OR (credential_family = 'botspace' AND verifier_kind = 'bcrypt' AND verifier_hash IS NOT NULL)
      OR (credential_family = 'machine' AND verifier_kind = 'sha256_lookup' AND verifier_hash IS NULL)
    )
  ) OR EXISTS (
    SELECT lower(name) FROM agents GROUP BY lower(name) HAVING count(*) > 1
  ) OR EXISTS (
    SELECT lower(bot_name) FROM bot_configs GROUP BY lower(bot_name) HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM bot_configs AS config
    JOIN agents AS agent ON agent.id = config.agent_id
    WHERE lower(config.bot_name) <> lower(agent.name)
  ) OR EXISTS (
    SELECT 1
    FROM pw7404_expected_founding_names AS expected
    WHERE (SELECT count(*) FROM agents WHERE lower(name) = expected.normalized_name) <> 1
       OR (SELECT count(*) FROM agent_credentials AS credential
           JOIN agents AS agent ON agent.id = credential.agent_id
           WHERE lower(agent.name) = expected.normalized_name) < 2
  ) OR EXISTS (
    SELECT 1
    FROM pw7404_agent_merge_map AS map
    LEFT JOIN agent_identity_aliases AS alias
      ON alias.legacy_agent_id = map.duplicate_id
     AND alias.canonical_agent_id = map.canonical_id
     AND alias.normalized_name = map.normalized_name
     AND alias.reason = 'PW7404-1025 founding identity merge'
    WHERE alias.legacy_agent_id IS NULL
  ) THEN
    RAISE EXCEPTION 'PW7404-1025 canonical identity post-merge invariants failed';
  END IF;
END
$$;

\if :{?PW7404_DRY_RUN}
ROLLBACK;
\else
COMMIT;
\endif
