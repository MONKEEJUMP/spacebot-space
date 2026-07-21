import postgres from "postgres";

const RECEIPT = "PW7404-1026 claim resident world";

function printHelp() {
  console.log(`Usage: npm run verify:claim-resident-world

Required environment:
  SPACEBOT_PROOF_AGENT  Exact claimed agent name (matched case-insensitively)
  DATABASE_URL          PostgreSQL connection URL (never printed)

Optional environment:
  SPACEBOT_BASE_URL     Public site origin for unauthenticated agent-detail proof`);
}

function fail(reason) {
  console.error(`${RECEIPT}: FAIL (${reason})`);
  process.exitCode = 1;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const requestedAgent = process.env.SPACEBOT_PROOF_AGENT?.trim();
const databaseUrl = process.env.DATABASE_URL;

if (!requestedAgent) {
  fail("SPACEBOT_PROOF_AGENT is required");
  process.exit(1);
}

if (requestedAgent.length > 50) {
  fail("SPACEBOT_PROOF_AGENT must be 50 characters or fewer");
  process.exit(1);
}

if (!databaseUrl) {
  fail("DATABASE_URL is required");
  process.exit(1);
}

let sql;

try {
  sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 2,
    onnotice: () => {},
  });

  const proof = await sql.begin(
    "isolation level repeatable read read only",
    async (tx) => {
      const [transaction] = await tx`
        SELECT current_setting('transaction_read_only') AS read_only
      `;
      const [row] = await tx`
        WITH target_agents AS (
          SELECT
            id,
            name,
            is_claimed,
            claim_code,
            claim_code_expires_at
          FROM agents
          WHERE lower(name) = lower(${requestedAgent})
        ),
        duplicate_agent_groups AS (
          SELECT lower(name)
          FROM agents
          GROUP BY lower(name)
          HAVING count(*) > 1
        ),
        duplicate_resident_groups AS (
          SELECT lower(bot_name)
          FROM bot_configs
          GROUP BY lower(bot_name)
          HAVING count(*) > 1
        ),
        alias_shadow_inconsistencies AS (
          SELECT alias.legacy_agent_id
          FROM agent_identity_aliases AS alias
          LEFT JOIN agents AS canonical
            ON canonical.id = alias.canonical_agent_id
          LEFT JOIN agents AS legacy_shadow
            ON legacy_shadow.id = alias.legacy_agent_id
          WHERE canonical.id IS NULL
             OR legacy_shadow.id IS NOT NULL
             OR alias.legacy_agent_id = alias.canonical_agent_id
             OR alias.normalized_name <> lower(canonical.name)
             OR EXISTS (
               SELECT 1
               FROM agents AS name_shadow
               WHERE lower(name_shadow.name) = alias.normalized_name
                 AND name_shadow.id <> alias.canonical_agent_id
             )
        ),
        resident_inconsistencies AS (
          SELECT config.id
          FROM bot_configs AS config
          LEFT JOIN agents AS agent ON agent.id = config.agent_id
          WHERE agent.id IS NULL
             OR lower(config.bot_name) <> lower(agent.name)
        )
        SELECT
          (SELECT count(*)::int FROM target_agents) AS target_count,
          (SELECT id::text FROM target_agents ORDER BY id LIMIT 1) AS agent_id,
          (SELECT name FROM target_agents ORDER BY id LIMIT 1) AS canonical_name,
          (SELECT count(*)::int FROM target_agents WHERE is_claimed = true)
            AS claimed_count,
          (SELECT count(*)::int FROM target_agents
           WHERE claim_code IS NULL AND claim_code_expires_at IS NULL)
            AS consumed_claim_count,
          (SELECT count(*)::int
           FROM human_agent_links
           WHERE agent_id IN (SELECT id FROM target_agents)
             AND status = 'active') AS active_link_count,
          (SELECT count(*)::int
           FROM bot_profiles
           WHERE agent_id IN (SELECT id FROM target_agents)) AS profile_count,
          (SELECT count(*)::int
           FROM bot_configs
           WHERE agent_id IN (SELECT id FROM target_agents)) AS resident_count,
          (SELECT count(*)::int FROM duplicate_agent_groups)
            AS duplicate_agent_group_count,
          (SELECT count(*)::int FROM duplicate_resident_groups)
            AS duplicate_resident_group_count,
          (SELECT count(*)::int FROM alias_shadow_inconsistencies)
            AS alias_shadow_inconsistency_count,
          (SELECT count(*)::int FROM resident_inconsistencies)
            AS resident_inconsistency_count
      `;

      return { ...row, transaction_read_only: transaction.read_only === "on" };
    },
  );

  const expected = {
    transaction_read_only: true,
    target_count: 1,
    claimed_count: 1,
    consumed_claim_count: 1,
    active_link_count: 1,
    profile_count: 1,
    resident_count: 1,
    duplicate_agent_group_count: 0,
    duplicate_resident_group_count: 0,
    alias_shadow_inconsistency_count: 0,
    resident_inconsistency_count: 0,
  };
  const failedChecks = Object.entries(expected)
    .filter(([key, value]) => proof[key] !== value)
    .map(([key]) => key);

  if (failedChecks.length > 0 || !proof.agent_id || !proof.canonical_name) {
    if (!proof.agent_id || !proof.canonical_name)
      failedChecks.push("canonical_identity");
    fail(`checks=${[...new Set(failedChecks)].join(",")}`);
  } else if (process.env.SPACEBOT_BASE_URL) {
    let detailUrl;
    try {
      detailUrl = new URL(
        `/api/v1/public/agents/${encodeURIComponent(proof.canonical_name)}`,
        process.env.SPACEBOT_BASE_URL,
      );
    } catch {
      fail("SPACEBOT_BASE_URL is invalid");
    }

    if (detailUrl) {
      try {
        const response = await fetch(detailUrl, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        const body = await response.json();
        const publicNameMatches =
          typeof body?.profile?.name === "string" &&
          body.profile.name.toLowerCase() ===
            proof.canonical_name.toLowerCase();

        if (!response.ok || body?.success !== true || !publicNameMatches) {
          fail(`public_detail status=${response.status}`);
        } else {
          console.log(
            `${RECEIPT}: PASS agent=${proof.canonical_name} agent_id=${proof.agent_id} public_detail=${response.status}`,
          );
        }
      } catch {
        fail("public_detail request failed");
      }
    }
  } else {
    console.log(
      `${RECEIPT}: PASS agent=${proof.canonical_name} agent_id=${proof.agent_id}`,
    );
  }
} catch (error) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? ` code=${String(error.code)}`
      : "";
  fail(`database verification failed${code}`);
} finally {
  if (sql) await sql.end({ timeout: 2 }).catch(() => {});
}
