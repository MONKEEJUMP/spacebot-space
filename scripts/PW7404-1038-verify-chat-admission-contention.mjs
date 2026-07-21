import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const admissionPath = path.join(
  repoRoot,
  "src/lib/lucy/public-cycle-admission.ts",
);
const jsonRoutePath = path.join(repoRoot, "src/app/api/chat/route.ts");
const canonicalExecutionPath = path.join(
  repoRoot,
  "src/lib/chat/canonical-chat-execution.ts",
);
const streamRoutePath = path.join(
  repoRoot,
  "src/app/api/chat/stream/route.ts",
);
const coordinatorPath = path.join(repoRoot, "src/lib/lucy/cycle-coordinator.ts");
const conversationRepositoryPath = path.join(
  repoRoot,
  "src/lib/chat/chat-conversation-repository.ts",
);
const cycleRepositoryPath = path.join(
  repoRoot,
  "src/lib/lucy/cycle-repository.ts",
);
const admissionSource = fs.readFileSync(admissionPath, "utf8");
const jsonRouteSource = fs.readFileSync(jsonRoutePath, "utf8");
const canonicalExecutionSource = fs.readFileSync(
  canonicalExecutionPath,
  "utf8",
);
const streamRouteSource = fs.readFileSync(streamRoutePath, "utf8");
const coordinatorSource = fs.readFileSync(coordinatorPath, "utf8");
const conversationRepositorySource = fs.readFileSync(
  conversationRepositoryPath,
  "utf8",
);
const cycleRepositorySource = fs.readFileSync(cycleRepositoryPath, "utf8");

let checks = 0;
function matches(source, pattern, message) {
  assert.match(source, pattern, message);
  checks += 1;
}

matches(admissionSource, /db\.transaction\(async \(transaction\)/);
matches(admissionSource, /pg_advisory_xact_lock\(hashtextextended/);
matches(admissionSource, /SET LOCAL lock_timeout = '5s'/);
matches(admissionSource, /SET LOCAL statement_timeout = '15s'/);
matches(admissionSource, /code === "55P03" \|\| code === "57014"/);
matches(admissionSource, /lucy-request:/);
matches(admissionSource, /chat-conversation/);
assert.ok(
  admissionSource.indexOf("lucy-request:") <
    admissionSource.indexOf('"chat-conversation"'),
  "request lock must precede conversation lock",
);
checks += 1;
matches(admissionSource, /\.insert\(chatConversations\)/);
matches(admissionSource, /\.insert\(lucyCycles\)/);
matches(admissionSource, /\.onConflictDoNothing\(\)/);
matches(admissionSource, /Idempotency-Key was reused for another request/);
matches(admissionSource, /This request is already processing/);
matches(jsonRouteSource, /executeCanonicalChatTurn\(/);
matches(canonicalExecutionSource, /admitPublicLucyCycle\(/);
matches(canonicalExecutionSource, /executeReservedLucyCycle\(/);
matches(jsonRouteSource, /error instanceof LucyCycleConflictError/);
matches(streamRouteSource, /admitPublicLucyCycle\(/);
matches(streamRouteSource, /beginReservedExternalLucyCycle\(/);
matches(streamRouteSource, /executeReservedLucyCycle\(/);
assert.ok(
  streamRouteSource.indexOf("startExternalLucyCycleLeaseHeartbeat(cycleLease)") <
    streamRouteSource.indexOf("callDeepResearchStream("),
  "DeepResearch heartbeat must start before the upstream connection attempt",
);
checks += 1;
matches(coordinatorSource, /assertReservationMatchesInput/);
matches(coordinatorSource, /reservation\.inputHash !== hashLucyCycleInput/);
matches(coordinatorSource, /startLucyCycleLeaseHeartbeat/);
matches(coordinatorSource, /renewExternalLucyCycle/);
matches(conversationRepositorySource, /ne\(chatMessages\.id, excludeTurnId\)/);
matches(cycleRepositorySource, /gt\(lucyCycles\.leaseExpiresAt, now\)/);
matches(cycleRepositorySource, /export async function renewLucyCycleLease/);
matches(
  cycleRepositorySource,
  /eq\(lucyCycles\.status, "running"\)[\s\S]{0,200}gt\(lucyCycles\.leaseExpiresAt, now\)/,
);

const runDatabaseCanary = process.argv.includes("--database-canary");
if (!runDatabaseCanary) {
  console.log(
    `PW7404-1038 chat admission contention: PASS (${checks} static checks; database canary skipped)`,
  );
  process.exit(0);
}

if (process.env.SPACEBOT_RUN_CHAT_CONTENTION_CANARY !== "1") {
  throw new Error(
    "SPACEBOT_RUN_CHAT_CONTENTION_CANARY=1 is required for the database canary",
  );
}

dotenv.config({ path: path.join(repoRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });
const connectionString =
  process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("SPACEBOT_DATABASE_URL or DATABASE_URL is required");
}
process.env.NODE_ENV = "production";

const require = createRequire(import.meta.url);
const jiti = require("jiti")(scriptPath, {
  alias: { "@": path.join(repoRoot, "src") },
});
const { admitPublicLucyCycle } = jiti(admissionPath);
const { loadCanonicalChatHistory } = jiti(conversationRepositoryPath);
const { completeLucyCycle, markLucyCycleRunning, renewLucyCycleLease } = jiti(
  cycleRepositoryPath,
);
const sql = postgres(connectionString, {
  max: 2,
  idle_timeout: 5,
  connect_timeout: 10,
  ssl: { rejectUnauthorized: false },
});

const actorId = crypto.randomUUID();
const sameTargetActorId = crypto.randomUUID();
const timeoutActorId = crypto.randomUUID();
const requestId = crypto.randomUUID();
const turnId = crypto.randomUUID();
const actor = Object.freeze({
  principalType: "agent",
  principalId: actorId,
  legacyAuthUserId: `pw7404-contention:${actorId}`,
});
const sameTargetActor = Object.freeze({
  principalType: "agent",
  principalId: sameTargetActorId,
  legacyAuthUserId: `pw7404-contention:${sameTargetActorId}`,
});
const timeoutActor = Object.freeze({
  principalType: "agent",
  principalId: timeoutActorId,
  legacyAuthUserId: `pw7404-contention:${timeoutActorId}`,
});

try {
  const targets = await sql`
    SELECT agent.id::text AS agent_id,
           agent.name AS agent_name,
           config.bot_name,
           config.display_name
    FROM bot_configs AS config
    JOIN agents AS agent ON agent.id = config.agent_id
    WHERE config.is_active = true
    ORDER BY agent.id
    LIMIT 2
  `;
  assert.equal(targets.length, 2, "two active canonical targets are required");
  checks += 1;
  const targetFrom = (row) => Object.freeze({
    agentId: row.agent_id,
    agentName: row.agent_name,
    normalizedName: row.bot_name.toLowerCase(),
    displayName: row.display_name || row.bot_name,
    requestedName: row.bot_name,
    matchedBy: ["config"],
    config: { botName: row.bot_name },
  });
  const firstTarget = targetFrom(targets[0]);
  const secondTarget = targetFrom(targets[1]);
  const timeoutRequestId = crypto.randomUUID();
  const timeoutOptions = {
    requestId: timeoutRequestId,
    turnId: crypto.randomUUID(),
    actor: timeoutActor,
    target: firstTarget,
    message: "PW7404 bounded-lock canary",
    deadlineMs: 30_000,
  };
  const timeoutStartedAt = Date.now();
  await sql.begin(async (lockTransaction) => {
    await lockTransaction`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`lucy-request:${timeoutRequestId}`}, 0)
      )
    `;
    await assert.rejects(
      admitPublicLucyCycle(timeoutOptions),
      /Chat admission is busy/,
    );
  });
  const timeoutElapsedMs = Date.now() - timeoutStartedAt;
  assert.ok(timeoutElapsedMs >= 4_000, "lock timeout fired too early");
  assert.ok(timeoutElapsedMs < 10_000, "lock timeout was not bounded");
  const [timeoutState] = await sql`
    SELECT
      (SELECT count(*)::int FROM lucy_cycles
       WHERE actor_principal_id = ${timeoutActorId}) AS cycle_count,
      (SELECT count(*)::int FROM chat_conversations
       WHERE actor_principal_id = ${timeoutActorId}) AS conversation_count
  `;
  assert.equal(timeoutState.cycle_count, 0);
  assert.equal(timeoutState.conversation_count, 0);
  checks += 5;

  const firstOptions = {
    requestId,
    turnId,
    actor,
    target: firstTarget,
    message: "PW7404 contention canary A",
    deadlineMs: 30_000,
  };
  const secondOptions = {
    ...firstOptions,
    target: secondTarget,
    message: "PW7404 contention canary B",
  };

  const settled = await Promise.allSettled([
    admitPublicLucyCycle(firstOptions),
    admitPublicLucyCycle(secondOptions),
  ]);
  const fulfilled = settled.filter((item) => item.status === "fulfilled");
  const rejected = settled.filter((item) => item.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactly one admission must win");
  assert.equal(rejected.length, 1, "exactly one admission must conflict");
  checks += 2;
  const winner = fulfilled[0].value;
  assert.equal(winner.kind, "reserved");
  assert.match(
    String(rejected[0].reason?.message || rejected[0].reason),
    /Idempotency-Key was reused/,
  );
  checks += 2;

  const [state] = await sql`
    SELECT
      (SELECT count(*)::int FROM lucy_cycles
       WHERE actor_principal_id = ${actorId}) AS cycle_count,
      (SELECT count(*)::int FROM chat_conversations
       WHERE actor_principal_id = ${actorId}) AS conversation_count,
      (SELECT count(*)::int FROM chat_messages AS message
       JOIN chat_conversations AS conversation
         ON conversation.id = message.conversation_id
       WHERE conversation.actor_principal_id = ${actorId}) AS message_count
  `;
  assert.equal(state.cycle_count, 1, "one cycle must persist");
  assert.equal(state.conversation_count, 1, "loser conversation must roll back");
  assert.equal(state.message_count, 0, "admission must not persist messages");
  checks += 3;

  const winnerOptions = settled[0].status === "fulfilled"
    ? firstOptions
    : secondOptions;
  await assert.rejects(
    admitPublicLucyCycle(winnerOptions),
    /already processing/,
  );
  await assert.rejects(
    admitPublicLucyCycle({
      ...winnerOptions,
      message: `${winnerOptions.message} changed`,
    }),
    /Idempotency-Key was reused/,
  );
  checks += 2;

  await sql`
    INSERT INTO chat_messages (id, conversation_id, role, content, metadata)
    VALUES (
      ${turnId}::uuid,
      ${winner.conversation.id}::uuid,
      'user',
      ${winnerOptions.message},
      ${sql.json({ source: "pw7404-contention-canary" })}
    )
  `;
  await sql`
    UPDATE lucy_cycles
    SET lease_expires_at = now() - interval '1 second'
    WHERE id = ${winner.reservation.cycleId}::uuid
  `;
  await assert.rejects(
    markLucyCycleRunning(
      winner.reservation.cycleId,
      winner.reservation.leaseOwner,
    ),
    /lease is no longer active/,
  );
  checks += 1;

  const reclaimed = await admitPublicLucyCycle(winnerOptions);
  assert.equal(reclaimed.kind, "reserved");
  assert.equal(reclaimed.reservation.cycleId, winner.reservation.cycleId);
  assert.notEqual(
    reclaimed.reservation.leaseOwner,
    winner.reservation.leaseOwner,
  );
  checks += 3;
  const history = await loadCanonicalChatHistory(
    reclaimed.conversation.id,
    20,
    turnId,
  );
  assert.equal(
    history.some((item) => item.turnId === turnId),
    false,
    "reclaimed history must exclude the current turn",
  );
  checks += 1;

  await markLucyCycleRunning(
    reclaimed.reservation.cycleId,
    reclaimed.reservation.leaseOwner,
  );
  await renewLucyCycleLease(
    reclaimed.reservation.cycleId,
    reclaimed.reservation.leaseOwner,
    60_000,
  );
  const [leaseState] = await sql`
    SELECT status, lease_expires_at > now() AS lease_active
    FROM lucy_cycles
    WHERE id = ${reclaimed.reservation.cycleId}::uuid
  `;
  assert.equal(leaseState.status, "running");
  assert.equal(leaseState.lease_active, true);
  checks += 2;
  const completedOutput = {
    schema_version: "2.0.0",
    request_id: reclaimed.input.request_id,
    cycle_id: reclaimed.reservation.cycleId,
    turn_id: reclaimed.input.turn_id,
    target_agent_id: reclaimed.input.target_agent_id,
    conversation_id: reclaimed.input.conversation_id,
    status: "completed",
    message: "PW7404 contention canary completed",
    evidence: [],
    degradation: { active: false, reasons: [] },
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      provider_calls: 0,
      duration_ms: 1,
    },
    engine: {
      query_id: `canary:${reclaimed.reservation.cycleId}`,
      name: "pw7404-contention-canary",
      completed_worker_count: 0,
    },
    version: {
      contract: "2.0.0",
      cognition: "pw7404-contention-canary-v1",
      provider: null,
    },
    errors: [],
  };
  await completeLucyCycle(
    reclaimed.reservation.cycleId,
    reclaimed.reservation.leaseOwner,
    completedOutput,
  );
  const replay = await admitPublicLucyCycle(winnerOptions);
  assert.equal(replay.kind, "replay");
  assert.equal(replay.output.message, completedOutput.message);
  checks += 2;

  const sameTargetOptions = {
    requestId: crypto.randomUUID(),
    turnId: crypto.randomUUID(),
    actor: sameTargetActor,
    target: firstTarget,
    message: "PW7404 same-target contention canary",
    deadlineMs: 30_000,
  };
  const sameTargetSettled = await Promise.allSettled([
    admitPublicLucyCycle(sameTargetOptions),
    admitPublicLucyCycle(sameTargetOptions),
  ]);
  assert.equal(
    sameTargetSettled.filter((item) => item.status === "fulfilled").length,
    1,
  );
  assert.equal(
    sameTargetSettled.filter((item) => item.status === "rejected").length,
    1,
  );
  assert.match(
    String(
      sameTargetSettled.find((item) => item.status === "rejected")?.reason
        ?.message || "",
    ),
    /already processing/,
  );
  const [sameTargetState] = await sql`
    SELECT
      (SELECT count(*)::int FROM lucy_cycles
       WHERE actor_principal_id = ${sameTargetActorId}) AS cycle_count,
      (SELECT count(*)::int FROM chat_conversations
       WHERE actor_principal_id = ${sameTargetActorId}) AS conversation_count
  `;
  assert.equal(sameTargetState.cycle_count, 1);
  assert.equal(sameTargetState.conversation_count, 1);
  checks += 5;

} finally {
  await sql.begin(async (transaction) => {
    await transaction`
      DELETE FROM lucy_cycles
      WHERE actor_principal_id IN (${actorId}, ${sameTargetActorId}, ${timeoutActorId})
    `;
    await transaction`
      DELETE FROM chat_conversations
      WHERE actor_principal_id IN (${actorId}, ${sameTargetActorId}, ${timeoutActorId})
    `;
  });
  const [cleanup] = await sql`
    SELECT
      (SELECT count(*)::int FROM lucy_cycles
       WHERE actor_principal_id IN (${actorId}, ${sameTargetActorId}, ${timeoutActorId})) AS cycle_count,
      (SELECT count(*)::int FROM chat_conversations
       WHERE actor_principal_id IN (${actorId}, ${sameTargetActorId}, ${timeoutActorId})) AS conversation_count
  `;
  assert.equal(cleanup.cycle_count, 0, "canary cycles must be deleted");
  assert.equal(cleanup.conversation_count, 0, "canary conversations must be deleted");
  await sql.end({ timeout: 5 });
}
checks += 2;
console.log(
  `PW7404-1038 chat admission contention: PASS (${checks} checks; concurrent database canary)`,
);
process.exit(0);
