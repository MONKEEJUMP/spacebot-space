import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import ts from "typescript";

const ARTIFACT = "PW7404-1129";
const CONFIRMATION = "PW7404-1129";
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationPath = path.join(
  repoRoot,
  "drizzle/migrations/PW7404-1127-01-resident-identity-session-acl-cutover-20260713.sql",
);
const rollbackPath = path.join(
  repoRoot,
  "drizzle/migrations/PW7404-1127-ROLLBACK-resident-identity-session-acl-cutover-20260713.sql",
);
const expectedDigests = Object.freeze({
  migration: "7EE5291CC6B309A16FC0BD7CC09C6B4B4B69FCFFF638454EF57E5E10565D5957",
  rollback: "CDAF44B5A2306A23FB9CFAF8B739CC1486B91F7340AAB1CC5F15742FE1C0DBB8",
});
const targetIdentifiers = new Map([
  ["agents", "agents"],
  ["agentCredentials", "agent_credentials"],
  ["agentBrowserSessions", "agent_browser_sessions"],
  ["humanAgentLinks", "human_agent_links"],
  ["agentIdentityAliases", "agent_identity_aliases"],
  ["botProfiles", "bot_profiles"],
  ["botConfigs", "bot_configs"],
  ["credentialSecurityDenylist", "credential_security_denylist"],
  ["residentIdentitySessionReceipts", "resident_identity_session_receipts"],
]);
const targetSqlNames = new Set(targetIdentifiers.values());
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "venv",
]);

function readPrivateFile(name, { minBytes = 1, maxBytes = 4096, trim = true } = {}) {
  const filePath = process.env[name];
  if (!filePath || !path.isAbsolute(filePath)) {
    throw new Error(`${name} must name an absolute private file`);
  }
  let descriptor;
  try {
    const before = fs.lstatSync(filePath);
    if (
      before.isSymbolicLink() ||
      !before.isFile() ||
      before.size < minBytes ||
      before.size > maxBytes ||
      (process.platform !== "win32" && (before.mode & 0o077) !== 0)
    ) {
      throw new Error(`${name} private file guard failed`);
    }
    let flags = fs.constants.O_RDONLY;
    if (process.platform !== "win32" && fs.constants.O_NOFOLLOW) {
      flags |= fs.constants.O_NOFOLLOW;
    }
    descriptor = fs.openSync(filePath, flags);
    const after = fs.fstatSync(descriptor);
    if (
      !after.isFile() ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size
    ) {
      throw new Error(`${name} private file changed during validation`);
    }
    const value = fs.readFileSync(descriptor, "utf8");
    return trim ? value.trim() : value;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function loadPinnedSql(filePath, expectedDigest, label) {
  const source = fs.readFileSync(filePath, "utf8");
  const actualDigest = crypto
    .createHash("sha256")
    .update(source, "utf8")
    .digest("hex")
    .toUpperCase();
  if (actualDigest !== expectedDigest) {
    throw new Error(`${ARTIFACT} ${label} digest guard failed`);
  }
  return Object.freeze({ source, digest: actualDigest });
}

function walkSource(directory) {
  const files = [];
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkSource(entryPath));
    else if (entry.isFile() && /\.(?:ts|tsx|js|mjs|cjs|py)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function scriptKind(filePath) {
  if (/\.tsx$/.test(filePath)) return ts.ScriptKind.TSX;
  if (/\.ts$/.test(filePath)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function lineFor(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function findWritersInFile(filePath) {
  const relative = path.relative(repoRoot, filePath).replaceAll("\\", "/");
  const source = fs.readFileSync(filePath, "utf8");
  const findings = [];
  const sqlWithoutComments = source
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/--[^\r\n]*/gu, " ");
  const rawPattern = new RegExp(
    `\\b(insert\\s+into|update(?:\\s+only)?|delete\\s+from|` +
      `merge\\s+into|truncate(?:\\s+table)?|copy)\\s+` +
      `(?:["']?public["']?\\s*\\.\\s*)?["']?` +
      `(${[...targetSqlNames].join("|")})["']?\\b`,
    "giu",
  );
  for (const match of sqlWithoutComments.matchAll(rawPattern)) {
    const line = sqlWithoutComments.slice(0, match.index).split(/\r?\n/).length;
    findings.push(`${relative}:${line}:raw-${match[1].replace(/\s+/g, "-")}(${match[2]})`);
  }
  const supabasePattern = new RegExp(
    `\\.\\s*from\\s*\\(\\s*['"](${[...targetSqlNames].join("|")})['"]\\s*\\)` +
      `[\\s\\S]{0,1200}?\\.\\s*(insert|update|delete|upsert)\\s*\\(`,
    "giu",
  );
  for (const match of source.matchAll(supabasePattern)) {
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    findings.push(`${relative}:${line}:supabase-${match[2]}(${match[1]})`);
  }
  if (/\.py$/.test(filePath)) return findings;

  const sourceFile = ts.createSourceFile(
    relative,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  const aliases = new Map(targetIdentifiers);
  const namespaces = new Set();

  function importedName(specifier) {
    return specifier.propertyName?.text ?? specifier.name.text;
  }
  function resolveTable(node) {
    if (!node) return null;
    if (ts.isIdentifier(node)) return aliases.get(node.text) ?? null;
    if (ts.isPropertyAccessExpression(node)) {
      if (ts.isIdentifier(node.expression) && namespaces.has(node.expression.text)) {
        return targetIdentifiers.get(node.name.text) ?? null;
      }
      return targetIdentifiers.get(node.name.text) ?? null;
    }
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      return resolveTable(node.expression);
    }
    return null;
  }
  function collectImports(node) {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
      const bindings = node.importClause.namedBindings;
      if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
      if (ts.isNamedImports(bindings)) {
        for (const specifier of bindings.elements) {
          const table = targetIdentifiers.get(importedName(specifier));
          if (table) aliases.set(specifier.name.text, table);
        }
      }
    }
    ts.forEachChild(node, collectImports);
  }
  collectImports(sourceFile);

  let changed = true;
  while (changed) {
    changed = false;
    function collectAliases(node) {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        const table = resolveTable(node.initializer);
        if (table && aliases.get(node.name.text) !== table) {
          aliases.set(node.name.text, table);
          changed = true;
        }
      }
      ts.forEachChild(node, collectAliases);
    }
    collectAliases(sourceFile);
  }

  function inspect(node) {
    const mutationMethod = ts.isCallExpression(node)
      ? ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : ts.isElementAccessExpression(node.expression) &&
            ts.isStringLiteral(node.expression.argumentExpression)
          ? node.expression.argumentExpression.text
          : null
      : null;
    if (
      ts.isCallExpression(node) &&
      mutationMethod &&
      ["insert", "update", "delete", "upsert"].includes(mutationMethod)
    ) {
      const table = resolveTable(node.arguments[0]);
      if (table) {
        findings.push(
          `${relative}:${lineFor(sourceFile, node.getStart(sourceFile))}:` +
            `${mutationMethod}(${table})`,
        );
      }
    }
    if (ts.isTaggedTemplateExpression(node)) {
      const templateText = node.template.getText(sourceFile);
      const dynamicTables = ts.isTemplateExpression(node.template)
        ? node.template.templateSpans.map((span) => resolveTable(span.expression))
        : [];
      if (
        /\b(?:insert|update|delete|merge|truncate|copy)\b/iu.test(templateText) &&
        dynamicTables.some(Boolean)
      ) {
        for (const table of dynamicTables.filter(Boolean)) {
          findings.push(
            `${relative}:${lineFor(sourceFile, node.getStart(sourceFile))}:` +
              `dynamic-sql(${table})`,
          );
        }
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(sourceFile);
  return findings;
}

function scanRoots(roots) {
  const files = [
    ...new Set(roots.flatMap((root) => walkSource(path.join(repoRoot, root)))),
  ].sort();
  const findings = [...new Set(files.flatMap(findWritersInFile))].sort();
  const sourceDigest = crypto.createHash("sha256");
  for (const filePath of files) {
    sourceDigest.update(path.relative(repoRoot, filePath).replaceAll("\\", "/"));
    sourceDigest.update("\0");
    sourceDigest.update(fs.readFileSync(filePath));
    sourceDigest.update("\0");
  }
  return Object.freeze({
    files,
    findings,
    digest: sourceDigest.digest("hex").toUpperCase(),
  });
}

function findDependentWriters() {
  const dependent = scanRoots([
    "src",
    "resident-identity-controller",
    "resident-autonomy-controller",
    "lucy-engine",
    "ticker-worker",
    "deepresearch-service",
    "dorylus",
    "newsspace-editor",
  ]);
  const operational = scanRoots(["scripts"]);
  return Object.freeze({
    dependent: dependent.findings,
    dependentSourceDigest: dependent.digest,
    dependentSourceFileCount: dependent.files.length,
    operational: operational.findings,
  });
}

const supported = new Set(["--check", "--apply", "--rollback"]);
const argumentsList = process.argv.slice(2);
const unexpected = argumentsList.filter((value) => !supported.has(value));
if (unexpected.length > 0) {
  throw new Error(`Unsupported argument: ${unexpected.join(", ")}`);
}
const selected = argumentsList.filter((value) => supported.has(value));
if (selected.length > 1) throw new Error("Choose one ACL cutover operation");
const mode = selected[0] ?? "--check";

const pinnedMigration = loadPinnedSql(
  migrationPath,
  expectedDigests.migration,
  "migration",
);
const pinnedRollback = loadPinnedSql(
  rollbackPath,
  expectedDigests.rollback,
  "rollback",
);
const actualDigests = Object.freeze({
  migration: pinnedMigration.digest,
  rollback: pinnedRollback.digest,
});

const writerFindings = findDependentWriters();
const dependentWriterBlockers = writerFindings.dependent;
if (mode === "--apply" && dependentWriterBlockers.length > 0) {
  throw new Error(
    `${ARTIFACT} dependent runtime writers are not facade-migrated: ${dependentWriterBlockers.join(", ")}; operational writer findings tracked: ${writerFindings.operational.length}`,
  );
}
if (mode === "--check" && dependentWriterBlockers.length > 0) {
  console.log(
    JSON.stringify({
      artifact: ARTIFACT,
      status: "BLOCKED",
      mode,
      digests: actualDigests,
      dependentWriterBlockers,
      operationalWriterFindingCount: writerFindings.operational.length,
      operationalWriterFindingDigest: crypto
        .createHash("sha256")
        .update(writerFindings.operational.join("\n"))
        .digest("hex")
        .toUpperCase(),
      runtimeSourceFileCount: writerFindings.dependentSourceFileCount,
      runtimeSourceSha256: writerFindings.dependentSourceDigest,
      aclCutoverEligible: false,
      aclCutoverApplied: null,
      deploymentReady: false,
      databaseContacted: false,
    }),
  );
  process.exitCode = 2;
} else {
if (mode === "--apply") {
  const expectedSourceDigest =
    process.env.SPACEBOT_EXPECTED_RUNTIME_SOURCE_SHA256?.toUpperCase();
  const expectedReleaseRoot = process.env.SPACEBOT_DEPLOYED_RELEASE_ROOT;
  if (
    expectedSourceDigest !== writerFindings.dependentSourceDigest ||
    !expectedReleaseRoot ||
    fs.realpathSync(expectedReleaseRoot) !== fs.realpathSync(repoRoot)
  ) {
    throw new Error(`${ARTIFACT} reviewed runtime source identity guard failed`);
  }
}
if (
  mode !== "--check" &&
  process.env.SPACEBOT_IDENTITY_TRAFFIC_FENCED !== CONFIRMATION
) {
  throw new Error(
    `Set SPACEBOT_IDENTITY_TRAFFIC_FENCED=${CONFIRMATION} before mutation`,
  );
}
if (
  mode === "--apply" &&
  process.env.SPACEBOT_APPLY_IDENTITY_ACL_CUTOVER !== CONFIRMATION
) {
  throw new Error(
    `Set SPACEBOT_APPLY_IDENTITY_ACL_CUTOVER=${CONFIRMATION} before --apply`,
  );
}
if (
  mode === "--rollback" &&
  process.env.SPACEBOT_ROLLBACK_IDENTITY_ACL_CUTOVER !== CONFIRMATION
) {
  throw new Error(
    `Set SPACEBOT_ROLLBACK_IDENTITY_ACL_CUTOVER=${CONFIRMATION} before --rollback`,
  );
}

const connectionString = readPrivateFile("SPACEBOT_ADMIN_DATABASE_URL_FILE", {
  minBytes: 16,
});
const ca = readPrivateFile("SPACEBOT_DATABASE_CA_PATH", {
  minBytes: 16,
  maxBytes: 1024 * 1024,
  trim: false,
});
const expectedCaSha256 =
  process.env.SPACEBOT_EXPECTED_DATABASE_CA_SHA256?.toUpperCase();
const actualCaSha256 = crypto
  .createHash("sha256")
  .update(ca)
  .digest("hex")
  .toUpperCase();
if (!expectedCaSha256 || actualCaSha256 !== expectedCaSha256) {
  throw new Error("Pinned database CA fingerprint guard failed");
}

const guards = Object.freeze({
  database: process.env.SPACEBOT_EXPECTED_DATABASE,
  user: process.env.SPACEBOT_EXPECTED_DATABASE_USER,
  address: process.env.SPACEBOT_EXPECTED_SERVER_ADDRESS,
  port: process.env.SPACEBOT_EXPECTED_SERVER_PORT,
  hostname: process.env.SPACEBOT_EXPECTED_DATABASE_HOSTNAME,
  sentinel: process.env.SPACEBOT_EXPECTED_SENTINEL_AGENT_ID,
});
for (const [name, value] of Object.entries(guards)) {
  if (!value || /\s/.test(value)) {
    throw new Error(`Missing database ${name} guard`);
  }
}
const databaseUrl = new URL(connectionString);
if (
  !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
  databaseUrl.hostname !== guards.hostname
) {
  throw new Error("ACL cutover database URL guard failed");
}
const verifiedUrl = new URL(databaseUrl);
verifiedUrl.searchParams.delete("sslmode");
const sql = postgres(verifiedUrl.toString(), {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  ssl: { rejectUnauthorized: true, ca, servername: guards.hostname },
});

async function assertTarget() {
  const [target] = await sql`
    SELECT current_database() AS database,
      session_user AS session_user,
      current_user AS user,
      coalesce(inet_server_addr()::text, 'local') AS address,
      coalesce(inet_server_port()::text, 'local') AS port,
      current_setting('server_version_num')::integer AS version,
      EXISTS (
        SELECT 1 FROM public.agents WHERE id = ${guards.sentinel}::uuid
      ) AS sentinel,
      (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
        AS superuser
  `;
  for (const field of ["database", "user", "address", "port"]) {
    if (String(target?.[field]) !== guards[field]) {
      throw new Error(`Database ${field} guard failed`);
    }
  }
  if (
    target?.session_user !== target?.user ||
    !target?.sentinel ||
    !target?.superuser ||
    target.version < 170000 ||
    target.version >= 180000
  ) {
    throw new Error("ACL cutover database authority or PostgreSQL 17 guard failed");
  }
}

async function inspect() {
  const [presence] = await sql`
    SELECT to_regclass(
      'public.resident_identity_acl_cutover_events'
    ) IS NOT NULL AS ledger_present
  `;
  if (!presence.ledger_present) {
    return {
      ledger_present: false,
      cutover_events: 0,
      rollback_events: 0,
      phase: "not_applied",
    };
  }
  const [state] = await sql`
    SELECT true AS ledger_present,
      count(*) FILTER (WHERE event_type = 'cutover')::integer
        AS cutover_events,
      count(*) FILTER (WHERE event_type = 'rollback')::integer
        AS rollback_events
    FROM public.resident_identity_acl_cutover_events
    WHERE artifact = 'PW7404-1127'
  `;
  const phase =
    state.cutover_events === 0
      ? "not_applied"
      : state.rollback_events === 0
        ? "cutover"
        : "rolled_back";
  return { ...state, phase };
}

try {
  await assertTarget();
  const before = await inspect();
  if (mode === "--apply") {
    if (before.phase !== "not_applied") {
      throw new Error(`${ARTIFACT} apply state guard failed`);
    }
    const finalWriterFindings = findDependentWriters();
    if (
      finalWriterFindings.dependent.length > 0 ||
      finalWriterFindings.dependentSourceDigest !==
        writerFindings.dependentSourceDigest
    ) {
      throw new Error(`${ARTIFACT} runtime source changed after eligibility review`);
    }
    await sql.unsafe(pinnedMigration.source);
  } else if (mode === "--rollback") {
    if (before.phase !== "cutover") {
      throw new Error(`${ARTIFACT} rollback state guard failed`);
    }
    await sql.unsafe(pinnedRollback.source);
  }
  const after = await inspect();
  const expectedPhase =
    mode === "--apply"
      ? "cutover"
      : mode === "--rollback"
        ? "rolled_back"
        : before.phase;
  if (after.phase !== expectedPhase) {
    throw new Error(`${ARTIFACT} post-operation phase guard failed`);
  }
  console.log(
    JSON.stringify({
      artifact: ARTIFACT,
      status:
        mode === "--check" && dependentWriterBlockers.length > 0
          ? "BLOCKED"
          : "PASS",
      mode,
      phase: after.phase,
      digests: actualDigests,
      dependentWriterBlockers,
      operationalWriterFindingCount: writerFindings.operational.length,
      operationalWriterFindingDigest: crypto
        .createHash("sha256")
        .update(writerFindings.operational.join("\n"))
        .digest("hex")
        .toUpperCase(),
      runtimeSourceFileCount: writerFindings.dependentSourceFileCount,
      runtimeSourceSha256: writerFindings.dependentSourceDigest,
      aclCutoverEligible:
        after.phase === "not_applied" && dependentWriterBlockers.length === 0,
      aclCutoverApplied: after.phase === "cutover",
      deploymentReady: false,
    }),
  );
  if (mode === "--check" && dependentWriterBlockers.length > 0) {
    process.exitCode = 2;
  }
} finally {
  await sql.end({ timeout: 5 });
}
}
