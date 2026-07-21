import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const route = await readFile(
  new URL("src/app/api/v1/lab/chat/route.ts", root),
  "utf8",
);
const resolver = await readFile(
  new URL("src/lib/lab/canonical-lab-target.ts", root),
  "utf8",
);
const executor = await readFile(
  new URL("src/lib/chat/canonical-chat-execution.ts", root),
  "utf8",
);
const targetResolver = await readFile(
  new URL("src/lib/chat/chat-target-resolver.ts", root),
  "utf8",
);
const credentialAuth = await readFile(
  new URL("src/lib/security/agent-credential-auth.ts", root),
  "utf8",
);
const migration = await readFile(
  new URL("scripts/PW7404-1058-apply-canonical-lab-residents.mjs", root),
  "utf8",
);
const schema = await readFile(new URL("src/db/schema.ts", root), "utf8");

let checks = 0;
function receipt(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

for (const forbidden of [
  "CEREBRAS_API_KEY",
  "api.cerebras.ai",
  "twoAgentPipeline",
  "labConversations",
  "labMessages",
  "getResearcherPrompt",
  "getFacePrompt",
]) {
  receipt(!route.includes(forbidden), `Lab route forbids ${forbidden}`);
}

for (const required of [
  "resolveCanonicalLabTarget",
  "resolveCanonicalChatActor",
  "canonicalActorKey",
  "executeCanonicalChatTurn",
  "ChatIdempotencyKeyError",
  "LucyCycleConflictError",
  "LucyUserMessagePersistenceError",
  "rateLimitDeniedResponse",
]) {
  receipt(route.includes(required), `Lab route uses ${required}`);
}

const targetIndex = route.indexOf("await resolveCanonicalLabTarget");
const actorIndex = route.indexOf("await resolveCanonicalChatActor");
const limiterIndex = route.indexOf("await checkRateLimit");
const safetyIndex = route.indexOf("const safetyDecision = evaluateLabSafety");
const executeIndex = route.indexOf("await executeCanonicalChatTurn");
receipt(targetIndex > 0, "canonical target resolution is present");
receipt(actorIndex > targetIndex, "typed actor resolves after target lookup");
receipt(limiterIndex > actorIndex, "rate limiting uses the typed principal");
receipt(safetyIndex > limiterIndex, "safety runs after identity admission");
receipt(executeIndex > safetyIndex, "cognition runs after every admission gate");

receipt(
  route.includes("conversationHistory remains accepted for older clients"),
  "legacy caller history is accepted but ignored",
);
receipt(
  route.includes('type: "researcher"'),
  "JSON and SSE preserve the researcher part",
);
receipt(route.includes('{ type: "done" }'), "SSE preserves the done event");
receipt(
  route.includes('"Content-Type": "text/event-stream"'),
  "SSE content type is explicit",
);
for (const key of [
  "success:",
  "response:",
  "parts:",
  "botName",
  "provider:",
  "model:",
]) {
  receipt(route.includes(key), `legacy response key ${key} is preserved`);
}

receipt(
  resolver.includes("resolveCanonicalChatTargetByAgentId"),
  "Lab identity resolves through the canonical agent id",
);
receipt(
  resolver.includes('target.config.botType !== "lab-resident"'),
  "Lab target enforces the resident config type",
);
receipt(
  resolver.includes('target.config.space !== "lab"'),
  "Lab target enforces the Lab space",
);
receipt(
  targetResolver.includes("agent.moderation_status = 'active'"),
  "canonical targets must be active residents",
);
receipt(
  credentialAuth.includes('agent.moderationStatus !== "active"'),
  "suspended actor credentials are rejected",
);
receipt(
  !credentialAuth.includes("agent.isClaimed") &&
    !credentialAuth.includes("ownerPlatform"),
  "agent authentication has no claim or owner gate",
);
receipt(
  schema.includes('agentId: uuid("agent_id")') &&
    schema.includes('uniqueIndex("lab_bots_agent_id_unique_idx")'),
  "lab_bots has a unique canonical agent link",
);
receipt(
  /agentId: uuid\("agent_id"\)[\s\S]{0,160}\.notNull\(\)/.test(schema),
  "Lab canonical agent link is required",
);

receipt(
  migration.includes("UPDATE agent_credentials") &&
    !migration.includes("INSERT INTO agent_credentials"),
  "provisioning converts the trigger-created credential in place",
);
receipt(
  migration.includes("updatedCredentials.length !== 1"),
  "provisioning requires exactly one primary credential",
);
receipt(
  migration.includes("'lab-resident', 'lab'") &&
    migration.includes("'public', 'active', NULL"),
  "Lab agents are active public residents without ownership metadata",
);
receipt(
  migration.includes("row.is_claimed === false") &&
    migration.includes("row.human_link_count === 0"),
  "provisioning proves no claim or human ownership link",
);
receipt(
  migration.includes("ALTER COLUMN agent_id SET NOT NULL") &&
    migration.includes("lab_bots_agent_id_unique_idx") &&
    migration.includes("FOREIGN KEY (agent_id) REFERENCES agents(id)"),
  "provisioning closes the canonical Lab identity constraints",
);
receipt(
  migration.includes("pathState.uid !== 0") &&
    migration.includes("(pathState.mode & 0o777) !== 0o600"),
  "credential output requires root ownership and mode 0600",
);
receipt(
  migration.includes("Credential output must be outside the repository"),
  "plaintext credentials cannot be written into the repository",
);
receipt(
  !/console\.(?:log|error)\([^\n]*(?:credential\.key|verifierHash|lookupHash)/.test(
    migration,
  ),
  "credential material is never printed",
);

const admissionIndex = executor.indexOf("await admitPublicLucyCycle");
const historyIndex = executor.indexOf("await loadCanonicalChatHistory");
const cycleIndex = executor.indexOf("await executeReservedLucyCycle");
receipt(admissionIndex > 0, "canonical execution reserves the cycle");
receipt(historyIndex > admissionIndex, "history loads only after admission");
receipt(cycleIndex > historyIndex, "cognition runs after canonical history");
receipt(
  executor.indexOf('admission.kind === "replay"') < historyIndex,
  "replay returns before history or provider work",
);

console.log(`Canonical Lab contract verification passed: ${checks} checks.`);
