import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACT = "PW7404-1123";
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const inventoryRelativePath =
  "scripts/PW7404-1122-spacebot-working-tree-inventory-20260713.tsv";
const summaryRelativePath =
  "scripts/PW7404-1122-spacebot-working-tree-summary-20260713.json";
const inventoryPath = path.join(repoRoot, inventoryRelativePath);
const summaryPath = path.join(repoRoot, summaryRelativePath);
const omissionPolicies = [
  [".machine_keys.json", "SENSITIVE_QUARANTINE"],
  [".env", "SENSITIVE_QUARANTINE"],
  [".env.local", "SENSITIVE_QUARANTINE"],
  [".clerk/.tmp/keyless.json", "SENSITIVE_QUARANTINE"],
  ["deepresearch-service/.env.example", "KEEP_CANDIDATE_IGNORED_TEMPLATE"],
  [
    "resident-autonomy-controller/.env.example",
    "KEEP_CANDIDATE_IGNORED_TEMPLATE",
  ],
  [".codex/tmp", "GENERATED_EXCLUDE"],
  ["tmp", "GENERATED_EXCLUDE"],
  [".ruff_cache", "GENERATED_EXCLUDE"],
  ["dorylus/.ruff_cache", "GENERATED_EXCLUDE"],
  ["scripts/__pycache__", "GENERATED_EXCLUDE"],
];
let assertions = 0;

function check(value, message) {
  assert.ok(value, message);
  assertions += 1;
}

function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  assertions += 1;
}

function git(args, { binary = false, allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: binary ? undefined : "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      result.stderr?.toString() || `git ${args.join(" ")} failed`,
    );
  }
  return result;
}

function parseStatus(buffer) {
  const tokens = buffer.toString("utf8").split("\0");
  const records = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const status = token.slice(0, 2);
    const relativePath = token.slice(3).replaceAll("\\", "/");
    if (/[RC]/.test(status)) index += 1;
    records.push({ status, path: relativePath });
  }
  return records;
}

function parseTsvLine(line) {
  const values = [];
  let value = "";
  let escaped = false;
  for (const character of line) {
    if (escaped) {
      value +=
        character === "t"
          ? "\t"
          : character === "r"
          ? "\r"
          : character === "n"
          ? "\n"
          : character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "\t") {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function sha256(absolutePath, type) {
  const input =
    type === "symlink"
      ? fs.readlinkSync(absolutePath)
      : fs.readFileSync(absolutePath);
  return crypto.createHash("sha256").update(input).digest("hex");
}

function parseIndexModes(buffer) {
  const modes = new Map();
  for (const token of buffer.toString("utf8").split("\0")) {
    if (!token) continue;
    const match = token.match(/^(\d+) [0-9a-f]+ \d+\t([\s\S]+)$/);
    if (match) modes.set(match[2].replaceAll("\\", "/"), match[1]);
  }
  return modes;
}

function worktreeMode(stats) {
  if (stats.isSymbolicLink()) return "120000";
  if (!stats.isFile()) return "";
  return stats.mode & 0o111 ? "100755" : "100644";
}

function gitPathState(relativePath) {
  const tracked = git(["ls-files", "--error-unmatch", "--", relativePath], {
    allowFailure: true,
  });
  const ignored = git(["check-ignore", "-q", "--", relativePath], {
    allowFailure: true,
  });
  return { tracked: tracked.status === 0, ignored: ignored.status === 0 };
}

check(fs.existsSync(inventoryPath), "PW7404-1122 inventory is missing");
check(fs.existsSync(summaryPath), "PW7404-1122 summary is missing");

const inventory = fs.readFileSync(inventoryPath, "utf8");
const summaryText = fs.readFileSync(summaryPath, "utf8");
const summary = JSON.parse(summaryText);
const lines = inventory.trimEnd().split(/\r?\n/);
const metadata = Object.fromEntries(
  lines
    .filter((line) => line.startsWith("# "))
    .map((line) => line.slice(2).split(/=(.*)/s).slice(0, 2)),
);
const headerIndex = lines.findIndex((line) =>
  line.startsWith("status\tpath\t"),
);
check(headerIndex >= 0, "Inventory header is missing");
const headers = parseTsvLine(lines[headerIndex]);
const rows = lines
  .slice(headerIndex + 1)
  .filter(Boolean)
  .map((line) => {
    const values = parseTsvLine(line);
    equal(
      values.length,
      headers.length,
      "Inventory row width must match header",
    );
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index]]),
    );
  });

const coalesced = parseStatus(
  git(["status", "--porcelain=v1", "-z"], { binary: true }).stdout,
);
const expanded = parseStatus(
  git(["status", "--porcelain=v1", "-z", "-uall"], { binary: true }).stdout,
);
const currentHead = git(["rev-parse", "HEAD"]).stdout.trim();
const currentBranch = git(["branch", "--show-current"]).stdout.trim();
const indexModes = parseIndexModes(
  git(["ls-files", "-s", "-z"], { binary: true }).stdout,
);
const materialDiffPaths = new Set(
  git(["diff", "--name-only", "-z"], { binary: true })
    .stdout.toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((relativePath) => relativePath.replaceAll("\\", "/")),
);

equal(summary.artifact, "PW7404-1122", "Summary artifact must be PW7404-1122");
equal(
  summary.status,
  "CLASSIFICATION_CANDIDATE",
  "Summary status must remain candidate",
);
equal(summary.baseHead, currentHead, "Inventory base HEAD is stale");
equal(summary.branch, currentBranch, "Inventory branch is stale");
equal(metadata.base_head, currentHead, "TSV base HEAD is stale");
equal(metadata.branch, currentBranch, "TSV branch is stale");
equal(
  summary.coalescedStatusEntries,
  coalesced.length,
  "Coalesced status count is stale",
);
equal(
  summary.expandedStatusFiles,
  expanded.length,
  "Expanded status count is stale",
);
equal(rows.length, expanded.length, "Inventory row count is stale");
equal(
  Number(metadata.coalesced_status_entries),
  coalesced.length,
  "TSV coalesced count is stale",
);
equal(
  Number(metadata.expanded_status_files),
  expanded.length,
  "TSV expanded count is stale",
);

const rowKeys = new Set(rows.map((row) => `${row.status}\0${row.path}`));
equal(rowKeys.size, rows.length, "Inventory has duplicate status/path rows");
for (const record of expanded) {
  check(
    rowKeys.has(`${record.status}\0${record.path}`),
    `Inventory omits ${record.path}`,
  );
}

const classificationCounts = {};
let secretShapeFiles = 0;
let modeDriftFiles = 0;
let statusOnlyFiles = 0;
let authorityHoldFiles = 0;
let sensitiveQuarantineFiles = 0;
for (const row of rows) {
  const absolutePath = path.join(repoRoot, row.path);
  check(fs.existsSync(absolutePath), `Inventory path is missing: ${row.path}`);
  const stats = fs.lstatSync(absolutePath);
  classificationCounts[row.classification] =
    (classificationCounts[row.classification] ?? 0) + 1;
  if (row.secret_shape_labels) secretShapeFiles += 1;
  if (row.mode_changed === "true") modeDriftFiles += 1;
  if (row.classification === "STATUS_ONLY_EXCLUDE") statusOnlyFiles += 1;
  if (row.classification === "AUTHORITY_HOLD") authorityHoldFiles += 1;
  if (row.classification === "SENSITIVE_QUARANTINE") {
    sensitiveQuarantineFiles += 1;
  }

  equal(
    row.index_mode,
    indexModes.get(row.path) ?? "",
    `Index mode drift: ${row.path}`,
  );
  equal(
    row.worktree_mode,
    worktreeMode(stats),
    `Worktree mode drift: ${row.path}`,
  );
  equal(
    row.mode_changed,
    String(
      Boolean(
        row.index_mode &&
          row.worktree_mode &&
          row.index_mode !== row.worktree_mode,
      ),
    ),
    `Mode-change receipt drift: ${row.path}`,
  );
  equal(
    row.material_diff,
    row.status === "??" ? "n/a" : String(materialDiffPaths.has(row.path)),
    `Material-diff receipt drift: ${row.path}`,
  );

  if (row.classification === "MANIFEST_SELF") {
    equal(
      row.sha256,
      "<self>",
      `Self artifact hash must be omitted: ${row.path}`,
    );
    equal(
      row.bytes,
      "<self>",
      `Self artifact size must be omitted: ${row.path}`,
    );
  } else {
    equal(
      row.sha256,
      sha256(absolutePath, row.type),
      `Hash drift: ${row.path}`,
    );
  }
  if (
    [
      "AUTHORITY_HOLD",
      "GENERATED_EXCLUDE",
      "MALFORMED",
      "SENSITIVE_QUARANTINE",
      "STATUS_ONLY_EXCLUDE",
    ].includes(row.classification)
  ) {
    equal(
      row.source_candidate,
      "no",
      `${row.classification} cannot enter source candidate`,
    );
    equal(
      row.runtime_package,
      "no",
      `${row.classification} cannot enter runtime package`,
    );
  }
  if (row.classification === "SENSITIVE_REVIEW") {
    equal(
      row.source_candidate,
      "review",
      "Sensitive files require explicit source review",
    );
    equal(
      row.runtime_package,
      "no",
      "Sensitive files cannot enter runtime package",
    );
  }
  if (row.classification === "REVIEW_MIXED") {
    equal(
      row.source_candidate,
      "review",
      "Mixed files require explicit source review",
    );
  }
  if (row.classification === "ARCHIVE_EVIDENCE") {
    equal(
      row.source_candidate,
      "yes",
      "Archive evidence belongs in source provenance",
    );
    equal(
      row.runtime_package,
      "no",
      "Archive evidence cannot enter runtime package",
    );
  }
  check(
    row.classification !== "UNRESOLVED",
    `Unresolved file remains: ${row.path}`,
  );
  check(
    row.type !== "symlink",
    `Symlink requires explicit release policy: ${row.path}`,
  );
}

equal(
  JSON.stringify(summary.classifications),
  JSON.stringify(
    Object.fromEntries(
      Object.entries(classificationCounts).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    ),
  ),
  "Classification totals do not reconcile",
);
equal(
  summary.secretShapeFiles,
  secretShapeFiles,
  "Secret-shape file count does not reconcile",
);
equal(
  summary.modeDriftFiles,
  modeDriftFiles,
  "Mode-drift file count does not reconcile",
);
equal(
  summary.statusOnlyFiles,
  statusOnlyFiles,
  "Status-only file count does not reconcile",
);
equal(
  summary.authorityHoldFiles,
  authorityHoldFiles,
  "Authority-hold file count does not reconcile",
);
equal(
  summary.sensitiveQuarantineFiles,
  sensitiveQuarantineFiles,
  "Sensitive-quarantine file count does not reconcile",
);
const expectedOmissions = omissionPolicies
  .filter(([relativePath]) => fs.existsSync(path.join(repoRoot, relativePath)))
  .map(([relativePath, classification]) => ({
    path: relativePath,
    classification,
    ...gitPathState(relativePath),
  }));
equal(
  summary.baselineAndIgnoredHolds.length,
  expectedOmissions.length,
  "Baseline/ignored omission count does not reconcile",
);
for (const expected of expectedOmissions) {
  const actual = summary.baselineAndIgnoredHolds.find(
    (entry) => entry.path === expected.path,
  );
  check(actual, `Baseline/ignored omission is missing: ${expected.path}`);
  equal(
    actual.classification,
    expected.classification,
    `Omission classification drift: ${expected.path}`,
  );
  equal(
    actual.tracked,
    expected.tracked,
    `Omission tracked-state drift: ${expected.path}`,
  );
  equal(
    actual.ignored,
    expected.ignored,
    `Omission ignore-state drift: ${expected.path}`,
  );
}
equal(summary.unresolvedFiles, 0, "Unresolved files remain");
equal(
  summary.productionContacted,
  false,
  "Classifier must not claim production contact",
);
for (const value of Object.values(summary.mutations)) {
  equal(value, false, "Classifier mutation receipt must remain false");
}

check(
  !/\b(?:sk|rk)_live_[A-Za-z0-9]{12,}\b/.test(inventory),
  "Inventory must not contain raw Stripe live credentials",
);
check(
  !/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/.test(inventory),
  "Inventory must not contain raw OpenAI credentials",
);
const staged = git(["diff", "--cached", "--quiet"], { allowFailure: true });
equal(staged.status, 0, "No files may be staged during classification");

console.log(
  JSON.stringify({
    artifact: ARTIFACT,
    status: "PASS",
    assertions,
    coalescedStatusEntries: coalesced.length,
    expandedStatusFiles: rows.length,
    inventorySha256: crypto
      .createHash("sha256")
      .update(inventory)
      .digest("hex")
      .toUpperCase(),
    summarySha256: crypto
      .createHash("sha256")
      .update(summaryText)
      .digest("hex")
      .toUpperCase(),
    productionContacted: false,
    gitMutated: false,
  }),
);
