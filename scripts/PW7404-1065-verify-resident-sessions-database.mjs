import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const connectionString =
  process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL;
const guards = {
  database: process.env.SPACEBOT_EXPECTED_DATABASE,
  user: process.env.SPACEBOT_EXPECTED_DATABASE_USER,
  address: process.env.SPACEBOT_EXPECTED_SERVER_ADDRESS,
  port: process.env.SPACEBOT_EXPECTED_SERVER_PORT,
  sentinel: process.env.SPACEBOT_EXPECTED_SENTINEL_AGENT_ID,
};

if (!connectionString) throw new Error("Database URL is required");
for (const [name, value] of Object.entries(guards)) {
  if (!value) throw new Error(`SPACEBOT expected ${name} guard is required`);
}

const sql = postgres(connectionString, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});
const agentIds = [];
let checks = 0;

function tokenHash(label) {
  return crypto.createHash("sha256").update(label).digest("hex");
}

async function expectDatabaseError(expectedCode, operation, label) {
  try {
    await operation();
    assert.fail(`${label} unexpectedly succeeded`);
  } catch (error) {
    assert.equal(error.code, expectedCode, label);
    checks += 1;
  }
}

async function assertTarget() {
  const [target] = await sql`
    SELECT current_database() AS database,
           current_user AS user,
           coalesce(inet_server_addr()::text, 'local') AS address,
           coalesce(inet_server_port()::text, 'local') AS port,
           EXISTS (
             SELECT 1 FROM public.agents WHERE id = ${guards.sentinel}::uuid
           ) AS sentinel
  `;
  for (const field of ["database", "user", "address", "port"]) {
    assert.equal(target[field], guards[field], `wrong ${field} target`);
    checks += 1;
  }
  assert.equal(target.sentinel, true, "database sentinel missing");
  checks += 1;
}

async function createDisposableResident(name) {
  const seed = tokenHash(name);
  const [agent] = await sql`
    INSERT INTO public.agents (name, api_key, api_key_hash, description)
    VALUES (
      ${name}, ${seed}, ${`canary-${seed}`},
      'PW7404-1065 disposable resident session database canary'
    )
    RETURNING id, name
  `;
  agentIds.push(agent.id);
  const [credential] = await sql`
    SELECT id, agent_id, revoked_at
    FROM public.agent_credentials
    WHERE agent_id = ${agent.id}
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `;
  assert.ok(credential, `${name} credential missing`);
  assert.equal(credential.revoked_at, null, `${name} credential is revoked`);
  checks += 2;
  return { agent, credential };
}

try {
  await assertTarget();

  const [shape] = await sql`
    SELECT to_regclass('public.agent_browser_sessions') IS NOT NULL AS present,
           has_table_privilege(
             'spacebot_runtime', 'public.agent_browser_sessions', 'SELECT,INSERT'
           ) AS runtime_access,
           NOT has_table_privilege(
             'spacebot_runtime', 'public.agent_browser_sessions', 'DELETE'
           ) AS runtime_delete_denied,
           has_column_privilege(
             'spacebot_runtime', 'public.agent_browser_sessions', 'last_seen_at', 'UPDATE'
           ) AS runtime_touch_allowed,
           has_column_privilege(
             'spacebot_runtime', 'public.agent_browser_sessions', 'revoked_at', 'UPDATE'
           ) AS runtime_revoke_allowed,
           NOT has_column_privilege(
             'spacebot_runtime', 'public.agent_browser_sessions', 'token_hash', 'UPDATE'
           ) AS runtime_token_rewrite_denied,
           NOT has_table_privilege(
             'public', 'public.agent_browser_sessions', 'SELECT,INSERT,UPDATE,DELETE'
           ) AS public_denied,
           has_table_privilege(
             'pw7404_task_maintenance', 'public.agent_browser_sessions', 'SELECT,DELETE'
           ) AS maintenance_access,
           NOT has_table_privilege(
             'pw7404_task_maintenance', 'public.agent_browser_sessions', 'INSERT'
           ) AS maintenance_insert_denied,
           NOT has_table_privilege(
             'pw7404_task_maintenance', 'public.agent_browser_sessions', 'UPDATE'
           ) AS maintenance_update_denied
  `;
  assert.equal(shape.present, true, "resident session table missing");
  assert.equal(
    shape.runtime_access,
    true,
    "runtime session privileges missing",
  );
  assert.equal(
    shape.runtime_delete_denied,
    true,
    "runtime can delete sessions",
  );
  assert.equal(
    shape.runtime_touch_allowed,
    true,
    "runtime cannot touch sessions",
  );
  assert.equal(
    shape.runtime_revoke_allowed,
    true,
    "runtime cannot revoke sessions",
  );
  assert.equal(
    shape.runtime_token_rewrite_denied,
    true,
    "runtime can rewrite session tokens",
  );
  assert.equal(
    shape.public_denied,
    true,
    "PUBLIC has session table privileges",
  );
  assert.equal(shape.maintenance_access, true, "maintenance access missing");
  assert.equal(
    shape.maintenance_insert_denied,
    true,
    "maintenance can insert sessions",
  );
  assert.equal(
    shape.maintenance_update_denied,
    true,
    "maintenance can update sessions",
  );
  checks += 10;

  const suffix = crypto.randomBytes(6).toString("hex");
  const alpha = await createDisposableResident(`pw1065-alpha-${suffix}`);
  const beta = await createDisposableResident(`pw1065-beta-${suffix}`);
  const now = new Date();
  const expires = new Date(now.getTime() + 20 * 60 * 1_000);

  const [first] = await sql`
    INSERT INTO public.agent_browser_sessions (
      agent_id, credential_id, token_hash, created_at, last_seen_at, expires_at
    ) VALUES (
      ${alpha.agent.id}, ${alpha.credential.id}, ${tokenHash(
        `first-${suffix}`,
      )},
      ${now}, ${now}, ${expires}
    )
    RETURNING id
  `;
  assert.ok(first.id, "first session was not inserted");
  checks += 1;

  await expectDatabaseError(
    "23505",
    () => sql`
      INSERT INTO public.agent_browser_sessions (
        agent_id, credential_id, token_hash, created_at, last_seen_at, expires_at
      ) VALUES (
        ${alpha.agent.id}, ${alpha.credential.id}, ${tokenHash(
          `duplicate-${suffix}`,
        )},
        ${now}, ${now}, ${expires}
      )
    `,
    "one active session per resident must be enforced",
  );

  await expectDatabaseError(
    "23503",
    () => sql`
      INSERT INTO public.agent_browser_sessions (
        agent_id, credential_id, token_hash, created_at, last_seen_at, expires_at
      ) VALUES (
        ${beta.agent.id}, ${alpha.credential.id}, ${tokenHash(
          `cross-${suffix}`,
        )},
        ${now}, ${now}, ${expires}
      )
    `,
    "credential and resident identity must match",
  );

  await expectDatabaseError(
    "23514",
    () => sql`
      INSERT INTO public.agent_browser_sessions (
        agent_id, credential_id, token_hash, created_at, last_seen_at, expires_at
      ) VALUES (
        ${beta.agent.id}, ${beta.credential.id}, ${tokenHash(`long-${suffix}`)},
        ${now}, ${now}, ${new Date(now.getTime() + 31 * 60 * 1_000)}
      )
    `,
    "sessions longer than thirty minutes must be rejected",
  );

  await sql`
    UPDATE public.agent_browser_sessions
    SET revoked_at = now(), revocation_reason = 'rotated'
    WHERE id = ${first.id}
  `;
  const [rotated] = await sql`
    INSERT INTO public.agent_browser_sessions (
      agent_id, credential_id, token_hash, created_at, last_seen_at, expires_at
    ) VALUES (
      ${alpha.agent.id}, ${alpha.credential.id}, ${tokenHash(
        `rotated-${suffix}`,
      )},
      ${now}, ${now}, ${expires}
    )
    RETURNING id
  `;
  assert.ok(rotated.id, "rotated session was not inserted");
  checks += 1;

  await sql`
    UPDATE public.agent_credentials
    SET revoked_at = now()
    WHERE id = ${alpha.credential.id}
  `;
  const [revokedBinding] = await sql`
    SELECT count(*)::int AS active
    FROM public.agent_browser_sessions AS session
    JOIN public.agent_credentials AS credential
      ON credential.id = session.credential_id
     AND credential.agent_id = session.agent_id
    WHERE session.id = ${rotated.id}
      AND session.revoked_at IS NULL
      AND session.expires_at > now()
      AND credential.revoked_at IS NULL
  `;
  assert.equal(
    revokedBinding.active,
    0,
    "revoked credential still authorizes session",
  );
  checks += 1;

  const [betaSession] = await sql`
    INSERT INTO public.agent_browser_sessions (
      agent_id, credential_id, token_hash, created_at, last_seen_at, expires_at
    ) VALUES (
      ${beta.agent.id}, ${beta.credential.id}, ${tokenHash(
        `cascade-${suffix}`,
      )},
      ${now}, ${now}, ${expires}
    )
    RETURNING id
  `;
  await sql`DELETE FROM public.agent_credentials WHERE id = ${beta.credential.id}`;
  const [cascade] = await sql`
    SELECT count(*)::int AS count
    FROM public.agent_browser_sessions
    WHERE id = ${betaSession.id}
  `;
  assert.equal(
    cascade.count,
    0,
    "credential delete did not cascade session cleanup",
  );
  checks += 1;
} finally {
  if (agentIds.length > 0) {
    await sql`DELETE FROM public.agents WHERE id = ANY(${agentIds}::uuid[])`;
    const [remaining] = await sql`
      SELECT
        (SELECT count(*)::int FROM public.agents WHERE id = ANY(${agentIds}::uuid[])) AS agents,
        (SELECT count(*)::int FROM public.agent_credentials WHERE agent_id = ANY(${agentIds}::uuid[])) AS credentials,
        (SELECT count(*)::int FROM public.agent_browser_sessions WHERE agent_id = ANY(${agentIds}::uuid[])) AS sessions
    `;
    assert.deepEqual(remaining, { agents: 0, credentials: 0, sessions: 0 });
    checks += 1;
  }
  await sql.end();
}

console.log(`PW7404-1065 resident session database: PASS (${checks} checks)`);
