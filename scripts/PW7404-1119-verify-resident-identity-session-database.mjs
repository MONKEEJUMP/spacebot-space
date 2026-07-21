import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACT = "PW7404-1119";
const DATABASE = "pw7404_1119_identity_test";
const DATABASE_PATTERN = /^pw7404_1119_identity_test$/;
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationPath = path.join(
  repoRoot,
  "drizzle/migrations/PW7404-1117-01-resident-identity-session-facades-20260713.sql",
);
const rollbackPath = path.join(
  repoRoot,
  "drizzle/migrations/PW7404-1117-ROLLBACK-resident-identity-session-facades-20260713.sql",
);

assert.match(DATABASE, DATABASE_PATTERN);
assert.ok(!/(prod|production|live|primary|supabase|neon)/i.test(DATABASE));

function psql(database, input) {
  assert.match(database, /^(postgres|pw7404_1119_identity_test)$/);
  const result = spawnSync(
    "wsl.exe",
    [
      "-d",
      "Ubuntu",
      "-u",
      "postgres",
      "--",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-At",
      "-F",
      "\t",
      "-d",
      database,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input,
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: process.env.PATH,
      },
      timeout: 120_000,
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `${ARTIFACT} psql failed (${database}): ${
        result.stderr || result.stdout
      }`,
    );
  }
  return result.stdout.trim();
}

function admin(input) {
  return psql("postgres", input);
}

function psqlAsync(database, input) {
  assert.match(database, /^(postgres|pw7404_1119_identity_test)$/);
  return new Promise((resolve) => {
    const child = spawn(
      "wsl.exe",
      [
        "-d",
        "Ubuntu",
        "-u",
        "postgres",
        "--",
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-q",
        "-At",
        "-d",
        database,
      ],
      {
        cwd: repoRoot,
        env: {
          SystemRoot: process.env.SystemRoot,
          WINDIR: process.env.WINDIR,
          PATH: process.env.PATH,
        },
        windowsHide: true,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdin.end(input);
    const timeout = setTimeout(() => child.kill(), 30_000);
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

const fixtureDdl = String.raw`
CREATE EXTENSION pgcrypto WITH SCHEMA public;

CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(50) NOT NULL UNIQUE,
  api_key varchar(100) NOT NULL UNIQUE,
  api_key_hash varchar(255) NOT NULL,
  description text,
  avatar_url text,
  resident_visibility varchar(10) NOT NULL DEFAULT 'public',
  moderation_status varchar(10) NOT NULL DEFAULT 'active',
  claim_code varchar(50),
  claim_code_expires_at timestamptz,
  last_active timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agents_visibility_check CHECK (
    resident_visibility IN ('public', 'unlisted', 'private')
  ),
  CONSTRAINT agents_moderation_check CHECK (
    moderation_status IN ('active', 'suspended', 'removed')
  )
);
CREATE UNIQUE INDEX agents_name_casefold_unique_idx
  ON public.agents(lower(name));

CREATE TABLE public.agent_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  lookup_hash varchar(100) NOT NULL UNIQUE,
  verifier_hash varchar(255),
  credential_family varchar(20) NOT NULL DEFAULT 'legacy',
  verifier_kind varchar(30) NOT NULL DEFAULT 'legacy',
  label varchar(50) NOT NULL DEFAULT 'legacy-primary',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_credentials_id_agent_unique UNIQUE (id, agent_id),
  CONSTRAINT agent_credentials_family_verifier_check CHECK (
    (credential_family = 'legacy' AND verifier_kind = 'legacy' AND verifier_hash IS NOT NULL)
    OR (credential_family = 'botspace' AND verifier_kind = 'bcrypt' AND verifier_hash IS NOT NULL)
    OR (credential_family = 'machine' AND verifier_kind = 'sha256_lookup' AND verifier_hash IS NULL)
  )
);

CREATE TABLE public.bot_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE CASCADE,
  mood varchar(50),
  bio text
);

CREATE TABLE public.bot_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE CASCADE,
  bot_name varchar(50) NOT NULL UNIQUE,
  display_name varchar(50) NOT NULL,
  bot_type varchar(30) NOT NULL,
  space varchar(30) NOT NULL,
  tagline text,
  specialty text,
  category varchar(50),
  mood varchar(50),
  avatar_seed varchar(100),
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  is_founding boolean NOT NULL DEFAULT false
);

CREATE TABLE public.agent_browser_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revocation_reason varchar(40),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_browser_sessions_credential_agent_fk
    FOREIGN KEY (credential_id, agent_id)
    REFERENCES public.agent_credentials(id, agent_id) ON DELETE CASCADE,
  CONSTRAINT agent_browser_sessions_expiry_check CHECK (
    expires_at > created_at
    AND expires_at <= created_at + interval '30 minutes'
  ),
  CONSTRAINT agent_browser_sessions_revocation_pair_check CHECK (
    (revoked_at IS NULL AND revocation_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)
  )
);
CREATE UNIQUE INDEX agent_browser_sessions_one_active_agent_idx
  ON public.agent_browser_sessions(agent_id) WHERE revoked_at IS NULL;

CREATE TABLE public.credential_security_denylist (
  lookup_hash varchar(100) PRIMARY KEY,
  incident_code varchar(40) NOT NULL,
  exposure_at timestamptz NOT NULL,
  contained_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.spacebot_reject_immutable_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable_event_mutation_rejected';
END
$$;

CREATE FUNCTION public.pw7404_sync_agent_primary_credential()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('pw7404.identity_merge', true) = 'on' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.agent_credentials (
    agent_id, lookup_hash, verifier_hash, credential_family,
    verifier_kind, label, created_at
  ) VALUES (
    NEW.id, NEW.api_key, NEW.api_key_hash,
    'legacy', 'legacy', 'primary-mirror', NEW.created_at
  );
  RETURN NEW;
END
$$;
CREATE TRIGGER pw7404_sync_agent_primary_credential_trigger
AFTER INSERT OR UPDATE OF api_key, api_key_hash ON public.agents
FOR EACH ROW EXECUTE FUNCTION public.pw7404_sync_agent_primary_credential();

CREATE FUNCTION public.pw7404_guard_agent_normalized_name()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(NEW.name), 0));
  IF EXISTS (
    SELECT 1 FROM bot_configs
    WHERE lower(bot_name) = lower(NEW.name)
      AND agent_id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Agent name collides with another resident identity';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER pw7404_guard_agent_normalized_name_trigger
BEFORE INSERT OR UPDATE OF name ON public.agents
FOR EACH ROW EXECUTE FUNCTION public.pw7404_guard_agent_normalized_name();

CREATE FUNCTION public.pw7404_guard_resident_normalized_name()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.agent_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM agents
    WHERE id = NEW.agent_id AND lower(name) = lower(NEW.bot_name)
  ) THEN
    RAISE EXCEPTION 'Resident name must match its canonical agent identity';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER pw7404_guard_resident_normalized_name_trigger
BEFORE INSERT OR UPDATE OF bot_name, agent_id ON public.bot_configs
FOR EACH ROW EXECUTE FUNCTION public.pw7404_guard_resident_normalized_name();
`;

const behaviorSql = String.raw`
DO $pw7404_behavior$
DECLARE
  secret text := 'botspace_' || repeat('A', 32);
  denied_secret text := 'botspace_' || repeat('D', 32);
  first_result jsonb;
  replay_result jsonb;
  open_result jsonb;
  rotate_result jsonb;
  touch_result jsonb;
  revoke_result jsonb;
  resident_id uuid;
  token_one text := repeat('B', 43);
  token_two text := repeat('C', 43);
  denied_lookup text;
BEGIN
  first_result := public.spacebot_register_resident_v1(
    'FixtureResident', 'Disposable resident', secret
  );
  IF first_result->>'replayed' <> 'false'
     OR first_result->>'residentVisibility' <> 'private' THEN
    RAISE EXCEPTION 'REG-01 first registration failed';
  END IF;
  resident_id := (first_result->>'residentId')::uuid;

  replay_result := public.spacebot_register_resident_v1(
    'fixtureresident', 'Disposable resident', secret
  );
  IF replay_result->>'replayed' <> 'true'
     OR replay_result->>'residentId' <> resident_id::text
     OR (SELECT count(*) FROM public.agents) <> 1
     OR (SELECT count(*) FROM public.agent_credentials) <> 1
     OR (SELECT count(*) FROM public.bot_profiles) <> 1
     OR (SELECT count(*) FROM public.bot_configs) <> 1
     OR (SELECT count(*) FROM public.resident_identity_session_receipts) <> 1 THEN
    RAISE EXCEPTION 'REG-02 replay or projection count failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_credentials
    WHERE lookup_hash <> encode(sha256(convert_to(secret, 'UTF8')), 'hex')
       OR credential_family <> 'botspace'
       OR verifier_kind <> 'bcrypt'
       OR verifier_hash !~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$'
       OR public.crypt(secret, verifier_hash) <> verifier_hash
  ) THEN
    RAISE EXCEPTION 'BCRYPT-01 credential storage failed';
  END IF;

  denied_lookup := encode(sha256(convert_to(denied_secret, 'UTF8')), 'hex');
  INSERT INTO public.credential_security_denylist (
    lookup_hash, incident_code, exposure_at, contained_at, reason
  ) VALUES (
    denied_lookup, 'PW7404-1119', now(), now(), 'synthetic fixture'
  );
  BEGIN
    PERFORM public.spacebot_register_resident_v1(
      'DeniedFixture', 'Must fail', denied_secret
    );
    RAISE EXCEPTION 'DENY-01 denied registration unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  IF (SELECT count(*) FROM public.agents) <> 1 THEN
    RAISE EXCEPTION 'DENY-01 denied registration was not atomic';
  END IF;

  open_result := public.spacebot_open_resident_session_v1(
    secret, token_one, NULL
  );
  IF open_result->>'accessMode' <> 'active'
     OR open_result->>'activeSessionCount' <> '1'
     OR NOT EXISTS (
       SELECT 1 FROM public.agent_browser_sessions
       WHERE token_hash = encode(sha256(convert_to(token_one, 'UTF8')), 'hex')
         AND expires_at <= created_at + interval '30 minutes 5 seconds'
     ) THEN
    RAISE EXCEPTION 'SES-01 session open failed';
  END IF;

  rotate_result := public.spacebot_rotate_resident_session_v1(
    token_one, token_two
  );
  IF rotate_result->>'activeSessionCount' <> '1'
     OR NOT EXISTS (
       SELECT 1 FROM public.agent_browser_sessions
       WHERE token_hash = encode(sha256(convert_to(token_one, 'UTF8')), 'hex')
         AND revocation_reason = 'rotated'
     ) THEN
    RAISE EXCEPTION 'SES-02 rotation failed';
  END IF;

  UPDATE public.agents SET moderation_status = 'suspended'
  WHERE id = resident_id;
  touch_result := public.spacebot_touch_resident_session_v1(token_two);
  IF touch_result->>'accessMode' <> 'restricted'
     OR touch_result->'resident'->>'moderationStatus' <> 'suspended'
     OR NOT EXISTS (
       SELECT 1 FROM public.agent_browser_sessions
       WHERE token_hash = encode(sha256(convert_to(token_two, 'UTF8')), 'hex')
         AND expires_at <= created_at + interval '30 days'
     ) THEN
    RAISE EXCEPTION 'MOD-01 restricted touch failed';
  END IF;

  revoke_result := public.spacebot_revoke_resident_session_v1(
    token_two, 'current'
  );
  IF revoke_result->>'outcome' <> 'revoked'
     OR revoke_result->>'revokedCount' <> '1' THEN
    RAISE EXCEPTION 'SES-03 revoke failed';
  END IF;
  revoke_result := public.spacebot_revoke_resident_session_v1(
    token_two, 'current'
  );
  IF revoke_result->>'outcome' <> 'already_revoked'
     OR revoke_result->>'revokedCount' <> '0' THEN
    RAISE EXCEPTION 'SES-04 revoke replay failed';
  END IF;

  IF (SELECT count(*) FROM public.resident_identity_session_receipts
      WHERE operation = 'registration' AND outcome = 'created') <> 1
     OR (SELECT count(*) FROM public.resident_identity_session_receipts
      WHERE operation = 'session_open' AND outcome = 'created') <> 1
     OR (SELECT count(*) FROM public.resident_identity_session_receipts
      WHERE operation = 'session_rotate' AND outcome = 'rotated') <> 1
     OR (SELECT count(*) FROM public.resident_identity_session_receipts
      WHERE operation = 'session_revoke' AND outcome = 'revoked') <> 1 THEN
    RAISE EXCEPTION 'REC-01 receipt counts failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agents WHERE row_to_json(agents)::text LIKE '%' || secret || '%'
  ) OR EXISTS (
    SELECT 1 FROM public.agent_credentials
    WHERE row_to_json(agent_credentials)::text LIKE '%' || secret || '%'
  ) OR EXISTS (
    SELECT 1 FROM public.agent_browser_sessions
    WHERE row_to_json(agent_browser_sessions)::text LIKE '%' || token_two || '%'
  ) OR EXISTS (
    SELECT 1 FROM public.resident_identity_session_receipts
    WHERE row_to_json(resident_identity_session_receipts)::text LIKE '%' || secret || '%'
       OR row_to_json(resident_identity_session_receipts)::text LIKE '%' || token_two || '%'
  ) THEN
    RAISE EXCEPTION 'SECRET-01 plaintext material persisted';
  END IF;

  BEGIN
    UPDATE public.resident_identity_session_receipts SET details = '{}';
    RAISE EXCEPTION 'REC-02 immutable update unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'immutable_event_mutation_rejected' THEN RAISE; END IF;
  END;
  DELETE FROM public.agent_browser_sessions WHERE revoked_at IS NOT NULL;
  IF (SELECT count(*) FROM public.agent_browser_sessions) <> 0
     OR (SELECT count(*) FROM public.resident_identity_session_receipts
         WHERE operation IN ('session_open', 'session_rotate', 'session_revoke')) <> 3 THEN
    RAISE EXCEPTION 'REC-03 receipt evidence did not survive session cleanup';
  END IF;
END
$pw7404_behavior$;

SELECT jsonb_build_object(
  'status', 'PASS',
  'residents', (SELECT count(*) FROM public.agents),
  'credentials', (SELECT count(*) FROM public.agent_credentials),
  'sessions', (SELECT count(*) FROM public.agent_browser_sessions),
  'receipts', (SELECT count(*) FROM public.resident_identity_session_receipts),
  'plaintextPersisted', false
)::text;
`;

let created = false;
try {
  const probe = admin(String.raw`
    SELECT current_database(), current_user,
      current_setting('server_version_num')::int,
      coalesce(inet_server_addr()::text, 'local'),
      coalesce(inet_server_port()::text, 'local');
  `).split("\t");
  assert.equal(probe[0], "postgres");
  assert.equal(probe[1], "postgres");
  assert.ok(Number(probe[2]) >= 170000 && Number(probe[2]) < 180000);
  assert.equal(probe[3], "local");
  assert.equal(probe[4], "local");

  admin(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE);`);
  admin(`CREATE DATABASE ${DATABASE};`);
  created = true;
  psql(DATABASE, fixtureDdl);
  const migration = fs.readFileSync(migrationPath, "utf8");
  const rollback = fs.readFileSync(rollbackPath, "utf8");
  psql(DATABASE, migration);
  psql(DATABASE, migration);
  psql(DATABASE, rollback);
  psql(DATABASE, migration);
  const receipt = psql(DATABASE, behaviorSql);
  const receiptLine = receipt.split(/\r?\n/).filter(Boolean).at(-1);
  assert.ok(receiptLine, `${ARTIFACT} behavior receipt is missing`);

  const concurrencySecret = `botspace_${"A".repeat(32)}`;
  const concurrencyTokens = Array.from({ length: 16 }, (_, index) =>
    crypto
      .createHash("sha256")
      .update(`pw7404-1119-concurrency-${index}`)
      .digest("base64url"),
  );
  const concurrent = await Promise.all(
    concurrencyTokens.map((token) =>
      psqlAsync(
        DATABASE,
        `SET statement_timeout = '15s'; SELECT public.spacebot_open_resident_session_v1('${concurrencySecret}', '${token}', NULL)::text;`,
      ),
    ),
  );
  const concurrentSuccess = concurrent.filter((result) => result.status === 0);
  const concurrentLimited = concurrent.filter(
    (result) =>
      result.status !== 0 &&
      result.stderr.includes("spacebot_session_limit_reached"),
  );
  const concurrentUnexpected = concurrent.filter(
    (result) =>
      result.status !== 0 &&
      !result.stderr.includes("spacebot_session_limit_reached"),
  );
  assert.equal(concurrentSuccess.length, 8, `${ARTIFACT} concurrency winners`);
  assert.equal(concurrentLimited.length, 8, `${ARTIFACT} session-limit losers`);
  assert.equal(
    concurrentUnexpected.length,
    0,
    `${ARTIFACT} concurrency failures`,
  );
  assert.equal(
    psql(
      DATABASE,
      "SELECT count(*) FROM public.agent_browser_sessions WHERE revoked_at IS NULL AND expires_at > now();",
    ),
    "8",
    `${ARTIFACT} active-session cap`,
  );

  const replayToken = concurrencyTokens.find(
    (_, index) => concurrent[index].status === 0,
  );
  assert.ok(replayToken, `${ARTIFACT} replay token is missing`);
  const firstSession = JSON.parse(
    concurrent.find((result) => result.status === 0).stdout,
  );
  const replayedSession = JSON.parse(
    psql(
      DATABASE,
      `SELECT public.spacebot_open_resident_session_v1('${concurrencySecret}', '${replayToken}', NULL)::text;`,
    ),
  );
  assert.equal(
    replayedSession.sessionId,
    firstSession.sessionId,
    `${ARTIFACT} response-loss replay session id`,
  );
  assert.equal(
    psql(
      DATABASE,
      "SELECT count(*) FROM public.resident_identity_session_receipts WHERE operation = 'session_open';",
    ),
    "9",
    `${ARTIFACT} response-loss replay receipt count`,
  );

  const nullScope = JSON.parse(
    psql(
      DATABASE,
      `SELECT public.spacebot_revoke_resident_session_v1('${replayToken}', NULL::varchar)::text;`,
    ),
  );
  assert.equal(nullScope.outcome, "absent", `${ARTIFACT} null revoke scope`);
  assert.equal(
    psql(
      DATABASE,
      `SELECT count(*) FROM public.agent_browser_sessions WHERE token_hash = encode(sha256(convert_to('${replayToken}', 'UTF8')), 'hex') AND revoked_at IS NULL;`,
    ),
    "1",
    `${ARTIFACT} null revoke must not mutate`,
  );
  const revokedAll = JSON.parse(
    psql(
      DATABASE,
      `SELECT public.spacebot_revoke_resident_session_v1('${replayToken}', 'all')::text;`,
    ),
  );
  assert.equal(
    revokedAll.outcome,
    "revoked_all",
    `${ARTIFACT} revoke-all outcome`,
  );
  assert.equal(revokedAll.revokedCount, 8, `${ARTIFACT} revoke-all count`);
  const migrationSha256 = crypto
    .createHash("sha256")
    .update(Buffer.from(migration))
    .digest("hex")
    .toUpperCase();
  console.log(
    JSON.stringify({
      artifact: ARTIFACT,
      status: "PASS",
      database: DATABASE,
      postgresMajor: 17,
      migrationSha256,
      behaviorReceipt: JSON.parse(receiptLine),
      concurrency: {
        requested: 16,
        opened: concurrentSuccess.length,
        limited: concurrentLimited.length,
        unexpected: concurrentUnexpected.length,
        responseLossReplay: true,
        revokeAllCount: revokedAll.revokedCount,
      },
      productionContacted: false,
    }),
  );
} finally {
  if (created) {
    admin(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE);`);
    const remains = admin(
      `SELECT count(*) FROM pg_database WHERE datname = '${DATABASE}';`,
    );
    assert.equal(
      remains,
      "0",
      `${ARTIFACT} disposable database cleanup failed`,
    );
  }
}
