import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifact = "PW7404-1102";
const expected1086Sha256 =
  "7B33208B75A2BF554E7BB73489050BDE720A9992858C9874AEE63086D81ECD89";
const expected1101Sha256 =
  "22F7AD3B7ED714F13CBED804A52945ED90A5279434AC8219CC78A104E103CBD4";
const expectedInputManifestSha256 =
  "B2ECE04184E6E988D6F30D41A2906E1C20C0DB1B5570A48521B2A17FFD2EACE5";
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".phase1-remote",
  ".ruff_cache",
  "node_modules",
  "tmp",
]);
const sourceExtensions = new Set([
  ".cjs",
  ".env",
  ".js",
  ".json",
  ".mjs",
  ".service",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
]);

let checks = 0;
const failures = [];
const receipts = [];

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll("\\", "/");
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function normalizeEol(value) {
  return value.replace(/\r\n?/g, "\n");
}

function compact(value) {
  return value.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function check(condition, message, evidence = undefined) {
  checks += 1;
  const passed = Boolean(condition);
  const receipt = { checkId: checks, message, passed };
  if (evidence !== undefined) receipt.evidence = evidence;
  receipts.push(receipt);
  if (!passed)
    failures.push({ message, ...(evidence === undefined ? {} : { evidence }) });
}

function walk(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(filePath, output);
    } else if (
      entry.isFile() &&
      sourceExtensions.has(path.extname(entry.name).toLowerCase()) &&
      entry.name !== path.basename(fileURLToPath(import.meta.url))
    ) {
      output.push(filePath);
    }
  }
  return output;
}

function parseFunctions(sql) {
  const functions = [];
  const pattern =
    /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+([a-zA-Z0-9_."]+)\s*\(([\s\S]*?)\)\s*RETURNS([\s\S]*?)AS\s+\$\$([\s\S]*?)\$\$\s*;/giu;
  for (const match of sql.matchAll(pattern)) {
    functions.push({
      name: match[1].replaceAll('"', ""),
      parameters: match[2],
      returns: match[3],
      body: match[4],
      source: match[0],
    });
  }
  return functions;
}

const migrationPath =
  "drizzle/migrations/PW7404-1101-01-resident-autonomy-controller-boundary-20260712.sql";
const baseMigrationPath =
  "drizzle/migrations/PW7404-1086-01-canonical-lucy-autonomy-ledger-20260712.sql";
const apply1086Path = "scripts/PW7404-1086-apply-canonical-lucy-autonomy.mjs";
const apply1103Path =
  "scripts/PW7404-1103-apply-resident-autonomy-controller-boundary.mjs";
const rehearsal1106Path =
  "scripts/PW7404-1106-run-exact-autonomy-rehearsal.sh";
const inputManifestPath =
  "scripts/PW7404-1113-autonomy-rehearsal-input-manifest-20260712.sha256";
const migration = read(migrationPath);
const compactMigration = compact(migration);
const baseMigration = read(baseMigrationPath);
const apply1086 = normalizeEol(read(apply1086Path));
const apply1103 = normalizeEol(read(apply1103Path));
const rehearsal1106 = normalizeEol(read(rehearsal1106Path));
const inputManifestBytes = fs.readFileSync(path.join(repoRoot, inputManifestPath));
const inputManifest = normalizeEol(inputManifestBytes.toString("utf8"));
const allFiles = walk(repoRoot).sort((left, right) =>
  relative(left).localeCompare(relative(right)),
);
const sources = allFiles.map((filePath) => ({
  path: relative(filePath),
  source: fs.readFileSync(filePath, "utf8"),
}));
const appSources = sources.filter(({ path: filePath }) =>
  filePath.startsWith("src/"),
);
const appSource = appSources.map(({ source }) => source).join("\n");
const autonomyAppSources = appSources.filter(({ path: filePath, source }) =>
  /resident-autonomy|agents\/autonomy|RESIDENT_AUTONOMY_CONTROLLER/u.test(
    `${filePath}\n${source}`,
  ),
);
const autonomyAppSource = autonomyAppSources
  .map(({ source }) => source)
  .join("\n");
const serviceImplementations = sources.filter(
  ({ path: filePath, source }) =>
    !filePath.startsWith("src/") &&
    !filePath.startsWith("drizzle/") &&
    filePath !== ".env.example" &&
    filePath !==
      "scripts/PW7404-1107-verify-autonomy-controller-database.mjs" &&
    /SPACEBOT_(?:RESIDENT_)?AUTONOMY_CONTROLLER_DATABASE_URL(?:_FILE)?/u.test(
      source,
    ) &&
    /(?:from\s+["']postgres["']|require\(["']postgres["']\))/u.test(source),
);
const serviceSource = serviceImplementations
  .map(({ source }) => source)
  .join("\n");
const delegationClientSource =
  sources.find(
    ({ path: filePath }) =>
      filePath === "src/lib/lucy/resident-autonomy-delegation.ts",
  )?.source ?? "";
const mutationTransportBody =
  delegationClientSource.match(
    /body:\s*JSON\.stringify\s*\(\s*\{([\s\S]*?)\}\s*\)\s*,?/u,
  )?.[1] ?? "";
const controllerUnitSource =
  sources.find(
    ({ path: filePath }) =>
      filePath ===
      "config/PW7404-1101-spacebot-resident-autonomy-controller.service",
  )?.source ?? "";
const provisionSource =
  sources.find(
    ({ path: filePath }) =>
      filePath ===
      "scripts/PW7404-1101-provision-resident-autonomy-controller.mjs",
  )?.source ?? "";
const buddyCommentSource =
  sources.find(
    ({ path: filePath }) =>
      filePath === "src/app/api/v1/buddy/comment/route.ts",
  )?.source ?? "";
const residentSessionRouteSource =
  sources.find(
    ({ path: filePath }) =>
      filePath === "src/app/api/v1/resident-session/route.ts",
  )?.source ?? "";

const actual1086Sha256 = createHash("sha256")
  .update(fs.readFileSync(path.join(repoRoot, baseMigrationPath)))
  .digest("hex")
  .toUpperCase();
check(
  actual1086Sha256 === expected1086Sha256,
  "reviewed PW7404-1086 migration bytes retain the pinned digest",
  actual1086Sha256,
);
check(
  apply1086.includes(`const expectedSha256 =\n  "${expected1086Sha256}";`),
  "PW7404-1086 apply script retains the reviewed digest text",
);
check(
  apply1086.includes(
    '"PW7404-1086 migration digest does not match the reviewed artifact"',
  ),
  "PW7404-1086 digest failure text remains unchanged",
);
const actual1101Sha256 = createHash("sha256")
  .update(fs.readFileSync(path.join(repoRoot, migrationPath)))
  .digest("hex")
  .toUpperCase();
check(
  actual1101Sha256 === expected1101Sha256,
  "reviewed PW7404-1101 migration bytes retain the pinned digest",
  actual1101Sha256,
);
check(
  apply1103.includes(
    `const EXPECTED_MIGRATION_SHA256 =\n  "${expected1101Sha256}";`,
  ),
  "PW7404-1103 apply script retains the reviewed boundary digest",
);
const actualInputManifestSha256 = createHash("sha256")
  .update(inputManifestBytes)
  .digest("hex")
  .toUpperCase();
const inputManifestEntries = inputManifest
  .trim()
  .split("\n")
  .map((line) => line.match(/^([0-9a-f]{64}) {2}(.+)$/u))
  .filter(Boolean)
  .map((match) => ({ digest: match[1], path: match[2] }));
const inputManifestEntriesValid =
  inputManifestEntries.length === 17 &&
  inputManifestEntries.every((entry) => {
    if (path.isAbsolute(entry.path) || entry.path.startsWith("../")) return false;
    const filePath = path.join(repoRoot, entry.path);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    return (
      createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex") === entry.digest
    );
  });
check(
  actualInputManifestSha256 === expectedInputManifestSha256,
  "PW7404-1113 digest-pinned rehearsal-input manifest retains its reviewed digest",
  actualInputManifestSha256,
);
check(
  inputManifestEntriesValid,
  "PW7404-1113 pins all 17 executable, migration, controller, service-unit, and dependency inputs",
  inputManifestEntries.map((entry) => entry.path),
);
check(
  rehearsal1106.includes(expectedInputManifestSha256.toLowerCase()) &&
    rehearsal1106.includes("sha256sum --check --strict") &&
    rehearsal1106.includes('"inputManifest"'),
  "PW7404-1106 verifies and receipts the digest-pinned input manifest before rehearsal",
);

const oldDelegationName = "spacebot_set_resident_autonomy_delegation";
const oldStatusName = "spacebot_set_resident_autonomy_status";
check(
  new RegExp(
    `DROP FUNCTION IF EXISTS ${oldDelegationName}\\s*\\(\\s*uuid\\s*,\\s*text\\[\\]`,
    "iu",
  ).test(migration),
  "migration drops the resident-id-only delegation function",
);
check(
  new RegExp(
    `DROP FUNCTION IF EXISTS ${oldStatusName}\\s*\\(\\s*uuid\\s*,\\s*varchar`,
    "iu",
  ).test(migration),
  "migration drops the resident-id-only status function",
);

const autonomyFunctions = parseFunctions(migration).filter(({ name }) =>
  /resident_autonomy/iu.test(name),
);
const unifiedFunctions = autonomyFunctions.filter(
  ({ name }) =>
    ![oldDelegationName, oldStatusName].includes(name.split(".").at(-1)),
);
check(
  autonomyFunctions.length === 1 && unifiedFunctions.length === 1,
  "migration creates exactly one unified resident-autonomy database facade",
  autonomyFunctions.map(({ name }) => name),
);

const facade = unifiedFunctions[0] ?? {
  name: "<missing-unified-resident-autonomy-facade>",
  parameters: "",
  returns: "",
  body: "",
  source: "",
};
const facadeName = facade.name.split(".").at(-1);
const parameters = compact(facade.parameters);
const facadeBody = compact(facade.body);
check(
  /credential(?:_secret|_key|_token|_raw|\s+credential)?\s+(?:text|varchar)/iu.test(
    parameters,
  ),
  "database facade accepts a raw resident credential",
  parameters,
);
check(
  !/(?:^|,)\s*p_(?:resident|agent)_id\s+uuid\b/iu.test(parameters) &&
    !/(?:^|,)\s*p_credential_id\s+uuid\b/iu.test(parameters),
  "database facade accepts no resident or credential identifier",
  parameters,
);
check(
  /expected_revision\s+(?:bigint|integer|int8|int4)/iu.test(parameters),
  "database facade requires an expected revision",
  parameters,
);
check(
  /(?:idempotency_key|request_fingerprint)\s+(?:text|varchar)/iu.test(
    parameters,
  ),
  "database facade requires receipt idempotency input",
  parameters,
);
check(
  /p_payload\s+jsonb/iu.test(parameters) &&
    /payload_sha256\s*:=\s*pg_catalog\.encode/iu.test(facadeBody) &&
    /p_payload::text/iu.test(facadeBody),
  "database facade computes a canonical payload digest for idempotency",
  parameters,
);
check(
  /SELECT credential\.id, credential\.agent_id INTO [a-z0-9_]*credential[a-z0-9_]*, [a-z0-9_]*resident[a-z0-9_]*/iu.test(
    facadeBody,
  ),
  "database facade derives the resident from the credential row",
);
check(
  /credential\.revoked_at IS NULL/iu.test(facadeBody) &&
    /credential\.lookup_hash\s*=\s*pg_catalog\.encode/iu.test(facadeBody) &&
    /pg_catalog\.sha256\s*\(\s*pg_catalog\.convert_to/iu.test(facadeBody),
  "database facade verifies an active nonrevoked credential hash",
);
check(
  /resident\.moderation_status\s*=\s*'active'/iu.test(facadeBody),
  "database facade rejects inactive resident principals",
);
check(
  /resident_autonomy_mutation_receipts/iu.test(facadeBody) &&
    /credential_id\s*=\s*authenticated_credential_id/iu.test(facadeBody) &&
    /idempotency_key_sha256\s*=\s*request_key_sha256/iu.test(facadeBody),
  "database facade resolves idempotent replay from immutable receipts",
);
check(
  /payloadFingerprint/iu.test(facade.body) &&
    /Resident autonomy idempotency conflict/iu.test(facade.body),
  "same idempotency receipt rejects a conflicting payload",
);
check(
  /CREATE TABLE resident_autonomy_mutation_receipts/iu.test(migration) &&
    /credential_id uuid NOT NULL/iu.test(migration) &&
    /expected_revision bigint NOT NULL/iu.test(migration) &&
    /payload_sha256 varchar\(64\) NOT NULL/iu.test(migration) &&
    /resulting_revision bigint NOT NULL/iu.test(migration) &&
    /response jsonb NOT NULL/iu.test(migration) &&
    /BEFORE UPDATE OR DELETE ON resident_autonomy_mutation_receipts/iu.test(
      migration,
    ) &&
    /BEFORE TRUNCATE ON resident_autonomy_mutation_receipts/iu.test(migration),
  "immutable receipt details bind credential, payload, and expected revision",
);
check(
  /coalesce\(prior\.revision, 0\)\s*(?:<>|!=|IS DISTINCT FROM)\s*p_expected_revision/iu.test(
    facadeBody,
  ) && /Resident autonomy revision conflict/iu.test(facadeBody),
  "database facade enforces expected-revision compare-and-swap",
);
check(
  /INSERT INTO public\.resident_autonomy_delegation_events/iu.test(facadeBody),
  "database facade writes the canonical immutable receipt ledger",
);
check(
  /SECURITY DEFINER/iu.test(facade.source) &&
    /SET search_path = pg_catalog, public, pg_temp/iu.test(facade.source),
  "database facade is security-definer with a fixed search path",
);
check(
  !/ALTER FUNCTION pw7404_sync_agent_primary_credential\(\) SECURITY DEFINER/iu.test(
    migration,
  ) &&
    migration.includes("Do not elevate the legacy credential-sync trigger") &&
    migration.includes("Shared runtime") &&
    migration.includes("registration remains denied"),
  "legacy credential trigger is not elevated to security-definer authority",
);

const escapedFacadeName = escapeRegex(facadeName);
const publicRevoke = new RegExp(
  `REVOKE ALL ON FUNCTION (?:public\\.)?${escapedFacadeName}\\s*\\([\\s\\S]*?\\) FROM PUBLIC`,
  "iu",
);
const runtimeRevoke = new RegExp(
  `REVOKE ALL ON FUNCTION (?:public\\.)?${escapedFacadeName}\\s*\\([\\s\\S]*?\\) FROM spacebot_runtime`,
  "iu",
);
check(
  publicRevoke.test(migration) &&
    /REVOKE ALL ON TABLE resident_autonomy_mutation_receipts FROM PUBLIC/iu.test(
      migration,
    ),
  "PUBLIC cannot execute the facade or read its receipt table",
);
check(
  runtimeRevoke.test(migration) &&
    /REVOKE ALL ON resident_autonomy_mutation_receipts FROM spacebot_runtime/iu.test(
      migration,
    ),
  "spacebot_runtime cannot execute the facade or access its receipt table",
);
check(
  /ALTER ROLE spacebot_runtime NOBYPASSRLS/iu.test(migration) &&
    /REVOKE INSERT, UPDATE, DELETE ON public\.agents FROM spacebot_runtime/iu.test(
      compactMigration,
    ) &&
    !/GRANT INSERT[\s\S]*?ON public\.agents TO spacebot_runtime/iu.test(
      migration,
    ) &&
    /GRANT UPDATE \(last_heartbeat, last_active\) ON public\.agents TO spacebot_runtime/iu.test(
      compactMigration,
    ),
  "runtime cannot delete, moderate, claim, or rebind an existing resident",
);
check(
  /REVOKE INSERT, UPDATE, DELETE ON public\.agent_credentials FROM spacebot_runtime/iu.test(
    compactMigration,
  ) &&
    /GRANT UPDATE \(last_used_at\) ON public\.agent_credentials TO spacebot_runtime/iu.test(
      compactMigration,
    ) &&
    /REVOKE INSERT, UPDATE, DELETE ON public\.human_agent_links FROM spacebot_runtime/iu.test(
      compactMigration,
    ) &&
    /REVOKE INSERT, UPDATE, DELETE ON public\.agent_identity_aliases FROM spacebot_runtime/iu.test(
      compactMigration,
    ) &&
    /public\.bot_profiles, public\.bot_configs, public\.bot_activity, public\.bot_profile_history FROM spacebot_runtime/iu.test(
      compactMigration,
    ) &&
    /REVOKE INSERT, UPDATE, DELETE ON public\.agent_browser_sessions FROM spacebot_runtime/iu.test(
      migration,
    ),
  "runtime credential, linkage, projection, and session authority is denied",
);
const controllerGrants = [
  ...migration.matchAll(
    /GRANT\s+([A-Z, ]+)\s+ON\s+(FUNCTION|TABLE|ALL FUNCTIONS IN SCHEMA|ALL TABLES IN SCHEMA)\s+([\s\S]*?)\s+TO\s+spacebot_autonomy_controller\b/giu,
  ),
];
check(
  controllerGrants.length === 0,
  "migration grants no controller authority before the dedicated provisioner",
  controllerGrants.map((grant) => compact(grant[0])),
);
check(
  /CROSS JOIN LATERAL aclexplode/iu.test(migration) &&
    /REVOKE ALL ON FUNCTION public\.spacebot_mutate_resident_autonomy/iu.test(
      migration,
    ) &&
    /REVOKE ALL ON TABLE public\.resident_autonomy_mutation_receipts/iu.test(
      migration,
    ),
  "migration removes non-owner facade and receipt ACL residue before provisioning",
);
check(
  !new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?${oldDelegationName}`,
    "iu",
  ).test(compactMigration) &&
    !new RegExp(
      `CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?${oldStatusName}`,
      "iu",
    ).test(compactMigration),
  "migration does not recreate either split legacy mutation function",
);
check(
  /const rollbackCanary = process\.argv\.includes\("--rollback-canary"\)/u.test(
    apply1103,
  ) &&
    /await sql\.begin\(async \(transaction\) =>/u.test(apply1103) &&
    /state = await inspect\(transaction\)/u.test(apply1103) &&
    /controller boundary verification failed; migration rolled back/u.test(
      apply1103,
    ),
  "1103 applies the migration and postflight inspection in one transaction",
);
check(
  /SPACEBOT_ROLLBACK_CANARY/u.test(apply1103) &&
    /PW7404_1103_ROLLBACK_CANARY_COMPLETE/u.test(apply1103) &&
    /inspectRollbackSurface/u.test(apply1103) &&
    /rollback canary left database residue/u.test(apply1103),
  "1103 exposes a disposable forced-rollback canary with safe pre-migration snapshots",
);

check(
  /CREATE UNIQUE INDEX IF NOT EXISTS resident_autonomy_delegation_events_request_unique_idx/iu.test(
    baseMigration,
  ) &&
    /BEFORE UPDATE OR DELETE ON resident_autonomy_delegation_events/iu.test(
      baseMigration,
    ) &&
    /BEFORE TRUNCATE ON resident_autonomy_delegation_events/iu.test(
      baseMigration,
    ) &&
    (baseMigration.match(
      /ENABLE ALWAYS TRIGGER resident_autonomy_delegation_events_immutable_/giu,
    )?.length ?? 0) === 2,
  "1086 receipt rows remain unique and immutable against update, delete, and truncate",
);

check(
  serviceImplementations.length === 1,
  "exactly one separate resident-autonomy-controller service owns the database pool",
  serviceImplementations.map(({ path: filePath }) => filePath),
);
check(
  /(?:createServer|\.listen\s*\(|listen\s*\(\s*\{)/u.test(serviceSource),
  "controller boundary is an independently listening service",
);
check(
  /127\.0\.0\.1|\[::1\]|localhost/u.test(serviceSource) &&
    /(?:host|hostname|address|listen)/iu.test(serviceSource),
  "controller service binds explicitly to loopback",
);
check(
  new RegExp(escapedFacadeName, "u").test(serviceSource),
  "controller service calls only the unified database facade",
);
check(
  /idempotency_key/u.test(serviceSource) &&
    /expectedRevision|expected_revision/u.test(serviceSource),
  "controller service requires receipt idempotency and expected revision",
);
check(
  /credential/u.test(serviceSource) &&
    !/body\.(?:residentId|resident_id)|input\.(?:residentId|resident_id)/u.test(
      serviceSource,
    ),
  "controller service forwards raw credential authority without a caller resident id",
);
check(
  /User=spacebot-autonomy-controller/u.test(controllerUnitSource) &&
    /ExecStart=.*PW7404-1101-controller\.mjs/u.test(controllerUnitSource) &&
    /NoNewPrivileges=true/u.test(controllerUnitSource) &&
    /ProtectSystem=strict/u.test(controllerUnitSource),
  "controller runs as a separate hardened operating-system service",
);
check(
  /function_acl_exact/u.test(provisionSource) &&
    /zero_table_access/u.test(provisionSource) &&
    /zero_sequence_access/u.test(provisionSource) &&
    /GRANT EXECUTE ON FUNCTION public\.spacebot_mutate_resident_autonomy/u.test(
      provisionSource,
    ) &&
    /REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public/u.test(
      provisionSource,
    ),
  "controller role provisioner proves one exact function grant and zero relation access",
);

check(
  !/SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_DATABASE_(?:URL|CA_PATH)/u.test(
    appSource,
  ) &&
    !/SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_EXPECTED_(?:CA_SHA256|DATABASE|HOSTNAME|USER)/u.test(
      appSource,
    ),
  "Next application source has no controller database credentials",
);
check(
  !/(?:from\s+["']postgres["']|require\(["']postgres["']\))/u.test(
    autonomyAppSource,
  ) &&
    !/SELECT\s+spacebot_[a-z0-9_]*resident_autonomy/iu.test(autonomyAppSource),
  "Next autonomy boundary has no controller database pool or direct SQL call",
  autonomyAppSources.map(({ path: filePath }) => filePath),
);
check(
  /SPACEBOT_RESIDENT_AUTONOMY_CONTROLLER_URL/u.test(autonomyAppSource) &&
    /target\.origin\s*!==\s*["']http:\/\/127\.0\.0\.1:8110["']/u.test(
      delegationClientSource,
    ) &&
    /Resident autonomy controller URL guard failed/u.test(
      delegationClientSource,
    ),
  "Next application uses a loopback-only controller service URL",
);
check(
  /Idempotency-Key|idempotency-key/u.test(autonomyAppSource) &&
    /expectedRevision|expected_revision/u.test(autonomyAppSource),
  "Next mutation contract forwards Idempotency-Key and expected revision",
);
check(
  /credential:\s*input\.credential/u.test(mutationTransportBody) &&
    /idempotency_key:\s*input\.idempotencyKey/u.test(mutationTransportBody) &&
    /expected_revision:\s*input\.expectedRevision/u.test(
      mutationTransportBody,
    ) &&
    /payload:\s*input\.payload/u.test(mutationTransportBody) &&
    !/(?:residentId|resident_id)\s*:/u.test(mutationTransportBody),
  "Next mutation transport sends credential authority without resident identity",
);
check(
  /db\.transaction\(async \(tx\)/u.test(buddyCommentSource) &&
    /await tx\.insert\(botActivity\)/u.test(buddyCommentSource) &&
    !/await db\.insert\(botActivity\)/u.test(buddyCommentSource),
  "Buddy comment, counter, and activity receipt commit atomically or roll back together",
);
const residentLogoutCatch =
  residentSessionRouteSource.match(
    /export async function DELETE[\s\S]*?catch \(error\) \{([\s\S]*?)\n  \}\n\}/u,
  )?.[1] ?? "";
check(
  residentLogoutCatch.includes("controllerErrorResponse") &&
    !residentLogoutCatch.includes("clearSessionCookie"),
  "failed server-side session revocation preserves the browser proof for retry",
);

const verdict = failures.length === 0 ? "PASS" : "FAIL";
console.log(
  JSON.stringify(
    {
      artifact,
      verdict,
      mode: "deterministic-source-contract",
      databaseAccessed: false,
      secretsRequired: false,
      checks,
      passed: checks - failures.length,
      failures,
      facade: facadeName,
      controllerServiceSources: serviceImplementations.map(
        ({ path: filePath }) => filePath,
      ),
      receipts,
    },
    null,
    2,
  ),
);
if (failures.length > 0) process.exitCode = 1;
