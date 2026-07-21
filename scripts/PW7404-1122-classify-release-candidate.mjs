import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACT = "PW7404-1122";
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const inventoryRelativePath =
  "scripts/PW7404-1122-spacebot-working-tree-inventory-20260713.tsv";
const summaryRelativePath =
  "scripts/PW7404-1122-spacebot-working-tree-summary-20260713.json";
const selfPaths = new Set([inventoryRelativePath, summaryRelativePath]);
const trackedKeepCandidates = new Set([
  "src/app/(spacebot)/aispace/page.tsx",
  "src/app/(spacebot)/factions/[faction]/page.tsx",
  "src/app/(spacebot)/factions/page.tsx",
  "src/app/(spacebot)/sanctuary/page.tsx",
  "src/app/layout.tsx",
  "src/components/Sidebar.tsx",
  "src/components/homepage/HeroHeader.tsx",
  "src/components/homepage/LiveActivity.tsx",
  "src/components/live/Newsroom.tsx",
  "src/components/live/ReadingPane.tsx",
  "src/components/newsspace/NewsHeader.tsx",
  "src/components/ticker/HomepageTickerBar.tsx",
  "src/lib/feed/boot-generator.ts",
]);
const trackedMixedReview = new Set([
  ".gitignore",
  "safe-build.sh",
  "scripts/grand-finale-restart.sh",
  "scripts/run-experience-nightly.sh",
  "scripts/start-tool-service.sh",
  "src/app/(spacebot)/planetspace/page.tsx",
]);
const canonicalEvidence = new Set([
  "docs/PW7404-1067-SPACEBOT-SPACE-CANONICAL-BIBLE-20260712.md",
  "docs/PW7404-1086-SPACEBOT-FOUNDING-LUCY-DELEGATION-MANIFEST-20260712.md",
  "docs/PW7404-1089-SPACEBOT-SPACE-MISSION-CHARTER-20260712.md",
  "docs/PW7404-1109-SPACEBOT-ACTIVE-BUILD-BOARD-20260712.md",
  "docs/PW7404-1120-SPACEBOT-NINE-AGENT-SELF-AUDIT-MISSION-BIBLE-PUNCH-LIST-20260713.md",
  "docs/PW7404-1121-SPACEBOT-RESIDENT-IDENTITY-SESSION-CHECKPOINT-20260713.md",
  "docs/PW7404-1124-SPACEBOT-IMMUTABLE-CANDIDATE-CLASSIFICATION-20260713.md",
  "docs/pw-0704-2026070401-openai-codex-rollout.md",
]);
const sensitiveEvidence = new Set([
  "docs/PW7404-1019-SPACEBOT-SPACE-FRONT-BOARD-20260709.md",
  "docs/PW7404-1068-SPACEBOT-SPACE-FULL-AUDIT-20260712.md",
  "docs/PW7404-1069-SPACEBOT-SPACE-MASTER-PUNCH-LIST-20260712.md",
  "docs/PW7404-1073-SPACEBOT-TRUST-CONTAINMENT-RELEASE-20260712.md",
  "docs/PW7404-1074-SPACEBOT-RELEASED-SOURCE-RECONCILIATION-20260712.md",
  "docs/PW7404-1076-SPACEBOT-MACHINE-CREDENTIAL-INCIDENT-INVENTORY-20260712.md",
  "docs/PW7404-1079-SPACEBOT-PUBLIC-MACHINE-CREDENTIAL-CONTAINMENT-20260712.md",
  "docs/PW7404-1080-SPACEBOT-PUBLIC-CREDENTIAL-MISUSE-FORENSICS-20260712.md",
  "docs/PW7404-1083-SPACEBOT-CREDENTIAL-RESTORE-GATE-20260712.md",
  "docs/PW7404-1084-SPACEBOT-PUBLIC-GIT-RESEED-APPROVAL-PACKET-20260712.md",
  "docs/PW7404-1093-SPACEBOT-LUCY-SINGLE-WRITER-CUTOVER-20260712.md",
  "docs/agentevolver_scope_spud.md",
  "docs/pw7404-1018-spacebot-space-compact-handoff-baseline-2026-07-06.md",
]);
const untrackedSourceSensitive = new Set([
  "src/app/api/internal/lucy/v1/autonomy/actions/route.ts",
  "src/app/api/internal/lucy/v1/autonomy/state/route.ts",
  "src/app/api/internal/lucy/v1/cycles/route.ts",
  "src/app/api/v1/agents/autonomy/route.ts",
  "src/app/api/v1/messages/[id]/route.ts",
  "src/app/api/v1/messages/conversation/[agent]/route.ts",
  "src/app/api/v1/messages/conversations/route.ts",
  "src/app/api/v1/messages/inbox/route.ts",
  "src/app/api/v1/messages/route.ts",
  "src/app/api/v1/resident-session/route.ts",
  "src/components/taskspace/TaskSpaceClient.tsx",
  "src/lib/chat/canonical-chat-execution.ts",
  "src/lib/chat/chat-actor.ts",
  "src/lib/lucy/autonomy-contract.ts",
  "src/lib/lucy/autonomy-service.ts",
  "src/lib/lucy/cycle-coordinator.ts",
  "src/lib/lucy/internal-cycle-client.ts",
  "src/lib/lucy/public-cycle-admission.ts",
  "src/lib/lucy/resident-autonomy-delegation.ts",
  "src/lib/messaging/agent-conversation-service.ts",
  "src/lib/messaging/agent-message-service.ts",
  "src/lib/publishing/resident-comment-service.ts",
  "src/lib/publishing/resident-profile-service.ts",
  "src/lib/publishing/resident-publish-service.ts",
  "src/lib/residency/resident-identity-controller.ts",
  "src/lib/security/agent-credential-auth.ts",
  "src/lib/security/agent-credential-input.ts",
  "src/lib/security/claiming-human.ts",
  "src/lib/security/internal-replay-store.ts",
  "src/lib/security/internal-request-signing.ts",
  "src/lib/security/rate-limit-store.ts",
  "src/lib/security/resident-session.ts",
  "src/lib/security/shared-internal-replay-store.ts",
]);
const untrackedSourceMixed = new Set([
  "src/lib/chat/chat-conversation-repository.ts",
  "src/lib/navigation/safe-human-redirect.ts",
]);
const untrackedSourceMalformed = new Set(["src/lib/experience/workspace.ts"]);
const untrackedSourceAuthorityHold = new Set([
  "src/lib/residency/agent-resident-errors.ts",
  "src/lib/residency/agent-resident-service.ts",
  "src/lib/residency/resident-projection-conflict-error.ts",
  "src/lib/residency/resident-projection-missing-error.ts",
]);
const untrackedInfrastructureKeep = new Set([
  ".codex/actions/pw-0704-audit-spacebot-ai-lane.md",
  ".codex/actions/pw-0704-closeout-spacebot.md",
  ".codex/actions/pw-0704-setup-spacebot.md",
  ".codex/actions/pw-0704-verify-spacebot-slice.md",
  ".codex/config.toml",
  "deepresearch-service/repo/inference/prompt.py",
  "deepresearch-service/tools/__init__.py",
  "deepresearch-service/tools/common.py",
  "deepresearch-service/tools/dashscope_scholar.py",
  "deepresearch-service/tools/dashscope_search.py",
  "lucy-engine/PW7404-1086-canonical-autonomy-runtime/PW7404-1097-test-tick-loop-snapshot.py",
  "lucy-engine/PW7404-1086-canonical-autonomy-runtime/README.md",
  "lucy-engine/PW7404-1086-canonical-autonomy-runtime/requirements.lock",
  "resident-autonomy-controller/package-lock.json",
  "resident-autonomy-controller/package.json",
  "resident-identity-controller/package-lock.json",
  "resident-identity-controller/package.json",
  "scripts/PW7404-1020-verify-spacebot-release-integrity.ps1",
  "scripts/PW7404-1024-verify-agent-identity-contract.mjs",
  "scripts/PW7404-1025-verify-canonical-agent-identity.mjs",
  "scripts/PW7404-1027-check-runtime-supervisor.mjs",
  "scripts/PW7404-1028-verify-lucy-cycle-contract.mjs",
  "scripts/PW7404-1029-verify-experience-privacy-boundary.mjs",
  "scripts/PW7404-1031-verify-chat-target-resolver.mjs",
  "scripts/PW7404-1032-verify-lucy-internal-auth.mjs",
  "scripts/PW7404-1033-verify-public-chat-contract.mjs",
  "scripts/PW7404-1034-verify-canonical-lucy-cycle-scope.mjs",
  "scripts/PW7404-1037-verify-chat-idempotency.mjs",
  "scripts/PW7404-1041-verify-agent-messaging-contract.mjs",
  "scripts/PW7404-1044-verify-agent-relationships.mjs",
  "scripts/PW7404-1048-verify-credential-first-residency.mjs",
  "scripts/PW7404-1050-package-standalone-assets.mjs",
  "scripts/PW7404-1052-verify-resident-tasks-wall-contract.mjs",
  "scripts/PW7404-1056-verify-shared-rate-limiter.mjs",
  "scripts/PW7404-1059-verify-canonical-lab-contract.mjs",
  "scripts/PW7404-1064-verify-resident-taskspace-contract.mjs",
  "scripts/PW7404-1070-verify-avatar-agentscope-containment.mjs",
  "scripts/PW7404-1074-build-released-baseline-inventory.mjs",
  "scripts/PW7404-1112-verify-public-truth-contract.mjs",
  "scripts/PW7404-1118-verify-resident-identity-session-contract.mjs",
  "scripts/PW7404-1122-classify-release-candidate.mjs",
  "scripts/PW7404-1123-verify-release-candidate-classification.mjs",
]);
const untrackedInfrastructureMalformed = new Set([
  "deepresearch-service/requirements.txt",
  "deepresearch-service/repo/inference/file_tools/file_parser.py",
  "deepresearch-service/tools/dashscope_file_parser.py",
]);
const untrackedInfrastructureAuthorityHold = new Set([
  "deepresearch-service/repo/inference/tool_file.py",
  "deepresearch-service/repo/inference/tool_python.py",
  "deepresearch-service/repo/inference/tool_scholar.py",
  "deepresearch-service/repo/inference/tool_search.py",
  "deepresearch-service/repo/inference/tool_visit.py",
]);
const dirtySensitiveQuarantine = new Set([
  ".codex/releases/PW7404-1023-spacebot-release-20260710-r2.tar.gz",
  ".codex/releases/PW7404-1023-spacebot-release-20260710-r3.tar.gz",
  ".codex/releases/PW7404-1023-spacebot-release-20260710-r4.tar.gz",
  ".codex/releases/PW7404-1023-spacebot-release-20260710-r5.tar.gz",
  ".codex/releases/PW7404-1023-spacebot-release-20260710.tar.gz",
  ".codex/releases/PW7404-1024-spacebot-agent-identity-release-20260710-r1.tar.gz",
  ".codex/releases/PW7404-1025-spacebot-canonical-identity-release-20260710-r1.tar.gz",
  ".codex/releases/PW7404-1025-spacebot-canonical-identity-release-20260710-r2.tar.gz",
  ".codex/releases/PW7404-1025-spacebot-canonical-identity-release-20260710-r3.tar.gz",
  ".codex/releases/PW7404-1025-spacebot-canonical-identity-release-20260710-r4.tar.gz",
  "SPACEBOT_AUDIT_REPORT_20260516.md",
]);
const omissionPolicies = [
  [
    ".machine_keys.json",
    "SENSITIVE_QUARANTINE",
    "Tracked machine credential container",
  ],
  [".env", "SENSITIVE_QUARANTINE", "Ignored runtime environment"],
  [".env.local", "SENSITIVE_QUARANTINE", "Ignored local runtime environment"],
  [
    ".clerk/.tmp/keyless.json",
    "SENSITIVE_QUARANTINE",
    "Ignored Clerk keyless cache",
  ],
  [
    "deepresearch-service/.env.example",
    "KEEP_CANDIDATE_IGNORED_TEMPLATE",
    "Ignored service environment template requires sanitization and explicit unignore",
  ],
  [
    "resident-autonomy-controller/.env.example",
    "KEEP_CANDIDATE_IGNORED_TEMPLATE",
    "Ignored controller environment template requires sanitization and explicit unignore",
  ],
  [".codex/tmp", "GENERATED_EXCLUDE", "Codex temporary workspace"],
  ["tmp", "GENERATED_EXCLUDE", "Repository temporary workspace"],
  [".ruff_cache", "GENERATED_EXCLUDE", "Python lint cache"],
  ["dorylus/.ruff_cache", "GENERATED_EXCLUDE", "Dorylus Python lint cache"],
  ["scripts/__pycache__", "GENERATED_EXCLUDE", "Python bytecode cache"],
];

function isInfrastructurePath(relativePath) {
  return /^(\.codex|config|deepresearch-service|drizzle|lucy-engine|resident-autonomy-controller|resident-identity-controller|scripts)\//.test(
    relativePath,
  );
}

function isInfrastructureArchive(relativePath) {
  return (
    /^\.codex\/releases\/.*\.(?:txt|conf|sha256)$/i.test(relativePath) ||
    /^config\/PW7404-(?:1026-spacebot-production-nginx-20260711\.conf|1027-spacebot-runtime-supervisor-v0-20260711\.json|1071-spacebot-production-nginx-20260712\.conf)$/.test(
      relativePath,
    ) ||
    /^scripts\/PW7404-\d+-spacebot(?:-.*)?-release-paths-\d+\.txt$/.test(
      relativePath,
    ) ||
    /^scripts\/PW7404-1075-spacebot-released-baseline-20260712(?:-excluded-backups|-remove-from-head)?\.(?:txt|tsv)$/.test(
      relativePath,
    ) ||
    relativePath ===
      "scripts/PW7404-1113-autonomy-rehearsal-input-manifest-20260712.sha256"
  );
}

function gitPathState(relativePath) {
  const tracked = spawnSync(
    "git",
    ["ls-files", "--error-unmatch", "--", relativePath],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const ignored = spawnSync("git", ["check-ignore", "-q", "--", relativePath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { tracked: tracked.status === 0, ignored: ignored.status === 0 };
}

function git(args, { binary = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: binary ? undefined : "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.toString() || `git ${args.join(" ")} failed`,
    );
  }
  return result.stdout;
}

function normalize(relativePath) {
  return relativePath.replaceAll("\\", "/");
}

function parsePorcelain(buffer) {
  const tokens = buffer.toString("utf8").split("\0");
  const records = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const status = token.slice(0, 2);
    const relativePath = normalize(token.slice(3));
    let originalPath = "";
    if (/[RC]/.test(status)) {
      originalPath = normalize(tokens[index + 1] ?? "");
      index += 1;
    }
    records.push({ status, path: relativePath, originalPath });
  }
  return records;
}

function sha256File(absolutePath, stats) {
  if (stats.isSymbolicLink()) {
    return crypto
      .createHash("sha256")
      .update(fs.readlinkSync(absolutePath))
      .digest("hex");
  }
  if (!stats.isFile()) return "";
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(absolutePath))
    .digest("hex");
}

function parseIndexModes(buffer) {
  const modes = new Map();
  for (const token of buffer.toString("utf8").split("\0")) {
    if (!token) continue;
    const match = token.match(/^(\d+) [0-9a-f]+ \d+\t([\s\S]+)$/);
    if (match) modes.set(normalize(match[2]), match[1]);
  }
  return modes;
}

function worktreeMode(stats) {
  if (stats.isSymbolicLink()) return "120000";
  if (!stats.isFile()) return "";
  return stats.mode & 0o111 ? "100755" : "100644";
}

function secretShapes(absolutePath, relativePath, stats) {
  if (!stats.isFile() || stats.size > 2 * 1024 * 1024) return [];
  if (
    /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|zip|gz|dump|pdf)$/i.test(
      relativePath,
    )
  ) {
    return [];
  }
  const content = fs.readFileSync(absolutePath, "utf8");
  const shapes = [];
  const checks = [
    ["PRIVATE_KEY_BLOCK", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["OPENAI_KEY_SHAPED", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
    ["STRIPE_LIVE_KEY_SHAPED", /\b(?:sk|rk)_live_[A-Za-z0-9]{12,}\b/],
    ["STRIPE_TEST_KEY_SHAPED", /\b(?:sk|rk)_test_[A-Za-z0-9]{8,}\b/],
    ["SPACEBOT_CREDENTIAL_SHAPED", /\b(?:sb|botspace)_[A-Za-z0-9_-]{24,}\b/],
    [
      "DATABASE_URL_WITH_PASSWORD",
      /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@[^\s/]+\//i,
    ],
  ];
  for (const [label, pattern] of checks) {
    if (pattern.test(content)) shapes.push(label);
  }
  return shapes;
}

function looksMalformedRoot(relativePath) {
  if (relativePath.includes("/")) return false;
  if (/^[A-Za-z0-9._ -]+$/.test(relativePath)) return false;
  return (
    relativePath.includes("__tlog") ||
    relativePath.includes("charCodeAt") ||
    relativePath.includes("setTimeout") ||
    relativePath.includes("{var") ||
    relativePath.includes(".length") ||
    relativePath.includes("})")
  );
}

function classify(relativePath, status, shapes, materialDiff) {
  const lower = relativePath.toLowerCase();
  const rootImage =
    !relativePath.includes("/") && /\.(png|jpe?g|webp)$/i.test(relativePath);
  const generated =
    lower === "tsconfig.tsbuildinfo" ||
    lower.startsWith(".next/") ||
    lower.startsWith("node_modules/") ||
    lower.endsWith(".pyc") ||
    /^\.codex\/releases\/.*\.tar\.gz$/i.test(relativePath) ||
    rootImage ||
    /(^|\/)(tmp|temp|coverage)(_|\/|$)/i.test(relativePath);

  if (selfPaths.has(relativePath)) {
    return {
      classification: "MANIFEST_SELF",
      sourceCandidate: "yes",
      runtimePackage: "no",
      rationale:
        "Deterministic PW7404-1122 inventory output; self hash intentionally omitted",
    };
  }
  if (dirtySensitiveQuarantine.has(relativePath)) {
    return {
      classification: "SENSITIVE_QUARANTINE",
      sourceCandidate: "no",
      runtimePackage: "no",
      rationale:
        "Credential-shaped release bundle or private duplicate evidence requires quarantine",
    };
  }
  if (looksMalformedRoot(relativePath)) {
    return {
      classification: "MALFORMED",
      sourceCandidate: "no",
      runtimePackage: "no",
      rationale: "Malformed root scratch filename",
    };
  }
  if (generated) {
    return {
      classification: "GENERATED_EXCLUDE",
      sourceCandidate: "no",
      runtimePackage: "no",
      rationale: "Generated, screenshot, cache, or temporary artifact",
    };
  }
  if (status !== "??" && !materialDiff) {
    return {
      classification: "STATUS_ONLY_EXCLUDE",
      sourceCandidate: "no",
      runtimePackage: "no",
      rationale:
        "Git status entry has no material tracked diff; base HEAD already supplies the file",
    };
  }
  if (status === "??" && untrackedSourceMalformed.has(relativePath)) {
    return {
      classification: "MALFORMED",
      sourceCandidate: "no",
      runtimePackage: "no",
      rationale:
        "Zero-byte shadow source conflicts with the governed workspace authority",
    };
  }
  if (status === "??" && untrackedSourceAuthorityHold.has(relativePath)) {
    return {
      classification: "AUTHORITY_HOLD",
      sourceCandidate: "no",
      runtimePackage: "no",
      rationale:
        "Orphaned resident projection authority has no active importer and requires an explicit canonical decision",
    };
  }
  if (status === "??" && untrackedSourceMixed.has(relativePath)) {
    return {
      classification: "REVIEW_MIXED",
      sourceCandidate: "review",
      runtimePackage: "review",
      rationale:
        "Untracked source crosses or duplicates a canonical authority seam",
    };
  }
  if (status === "??" && untrackedSourceSensitive.has(relativePath)) {
    return {
      classification: "SENSITIVE_REVIEW",
      sourceCandidate: "review",
      runtimePackage: "no",
      rationale:
        "Untracked authentication, authority, private-data, autonomy, or runtime path requires behavioral proof",
    };
  }
  if (status === "??" && untrackedInfrastructureMalformed.has(relativePath)) {
    return {
      classification: "MALFORMED",
      sourceCandidate: "no",
      runtimePackage: "no",
      rationale:
        "DeepResearch startup/import chain is incomplete or references undeclared modules",
    };
  }
  if (
    status === "??" &&
    untrackedInfrastructureAuthorityHold.has(relativePath)
  ) {
    return {
      classification: "AUTHORITY_HOLD",
      sourceCandidate: "no",
      runtimePackage: "no",
      rationale:
        "Unused legacy DeepResearch wrapper duplicates active tools and references missing dependencies",
    };
  }
  if (status === "??" && isInfrastructureArchive(relativePath)) {
    return {
      classification: "ARCHIVE_EVIDENCE",
      sourceCandidate: "yes",
      runtimePackage: "no",
      rationale:
        "Historical release path, checksum, config, or baseline evidence",
    };
  }
  if (status === "??" && untrackedInfrastructureKeep.has(relativePath)) {
    return {
      classification: "KEEP_CANDIDATE",
      sourceCandidate: "yes",
      runtimePackage: "review",
      rationale:
        "Static verifier, generator, lock, package metadata, or bounded support source",
    };
  }
  if (
    status === "??" &&
    (isInfrastructurePath(relativePath) || relativePath === "start-spacebot.sh")
  ) {
    return {
      classification: "SENSITIVE_REVIEW",
      sourceCandidate: "review",
      runtimePackage: "no",
      rationale:
        "Migration, live verifier, controller, service, launcher, or runtime tool requires ordered security proof",
    };
  }
  if (
    shapes.length > 0 ||
    (relativePath !== ".env.example" &&
      /(^|\/)(\.env($|\.)|.*\.(pem|key|p12|dump|sqlite|db)$)/i.test(
        relativePath,
      )) ||
    /^SPACEBOT_AUDIT_REPORT_/i.test(relativePath) ||
    sensitiveEvidence.has(relativePath)
  ) {
    return {
      classification: "SENSITIVE_REVIEW",
      sourceCandidate: "review",
      runtimePackage: "no",
      rationale: shapes.length
        ? `Secret-shaped content labels: ${shapes.join(",")}`
        : sensitiveEvidence.has(relativePath)
        ? "Operational or security evidence requires redaction and source-placement review"
        : "Sensitive filename or historical audit evidence requires review",
    };
  }
  if (canonicalEvidence.has(relativePath)) {
    return {
      classification: "KEEP_CANDIDATE",
      sourceCandidate: "yes",
      runtimePackage: "no",
      rationale:
        "Current canonical mission, board, checkpoint, or workflow authority",
    };
  }
  if (
    rootImage ||
    lower.startsWith("docs/") ||
    lower.startsWith("research/") ||
    /^spacebot_audit_report_/i.test(relativePath)
  ) {
    return {
      classification: "ARCHIVE_EVIDENCE",
      sourceCandidate: "yes",
      runtimePackage: "no",
      rationale: "Durable governance, audit, research, or release evidence",
    };
  }
  if (status !== "??" && trackedKeepCandidates.has(relativePath)) {
    return {
      classification: "KEEP_CANDIDATE",
      sourceCandidate: "yes",
      runtimePackage: "review",
      rationale:
        "Tracked presentation/truth change cleared the first classification lane",
    };
  }
  if (status !== "??" && trackedMixedReview.has(relativePath)) {
    return {
      classification: "REVIEW_MIXED",
      sourceCandidate: "review",
      runtimePackage: "review",
      rationale:
        "Tracked mixed or metadata-sensitive change requires subsystem adjudication",
    };
  }
  if (status !== "??") {
    return {
      classification: "SENSITIVE_REVIEW",
      sourceCandidate: "review",
      runtimePackage: "no",
      rationale:
        "Tracked authority, identity, public-truth, money, auth, or runtime contract requires review",
    };
  }
  if (
    /^(src|scripts|drizzle|config|resident-autonomy-controller|resident-identity-controller|lucy-engine|deepresearch-service|ticker-worker|public|\.codex)\//.test(
      relativePath,
    ) ||
    /^(AGENTS\.md|package(?:-lock)?\.json|next\.config\.js|ecosystem\.config\.js|safe-build\.sh|start-spacebot\.sh|\.gitignore|\.env\.example)$/.test(
      relativePath,
    )
  ) {
    return {
      classification: "KEEP_CANDIDATE",
      sourceCandidate: "yes",
      runtimePackage:
        lower.startsWith("docs/") || lower.startsWith("research/")
          ? "no"
          : "review",
      rationale:
        status === "??"
          ? "Untracked implementation/proof/config candidate requires review before inclusion"
          : "Tracked implementation/config change requires diff review",
    };
  }
  return {
    classification: "UNRESOLVED",
    sourceCandidate: "review",
    runtimePackage: "review",
    rationale: "No automatic release rule applies",
  };
}

function escapeTsv(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\t", "\\t")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n");
}

const inventoryPath = path.join(repoRoot, inventoryRelativePath);
const summaryPath = path.join(repoRoot, summaryRelativePath);
fs.closeSync(fs.openSync(inventoryPath, "a"));
fs.closeSync(fs.openSync(summaryPath, "a"));

const coalesced = parsePorcelain(
  git(["status", "--porcelain=v1", "-z"], { binary: true }),
);
const expanded = parsePorcelain(
  git(["status", "--porcelain=v1", "-z", "-uall"], { binary: true }),
);
const indexModes = parseIndexModes(
  git(["ls-files", "-s", "-z"], { binary: true }),
);
const materialDiffPaths = new Set(
  git(["diff", "--name-only", "-z"], { binary: true })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalize),
);
const baseHead = git(["rev-parse", "HEAD"]).trim();
const branch = git(["branch", "--show-current"]).trim();
const baselineAndIgnoredHolds = omissionPolicies
  .filter(([relativePath]) => fs.existsSync(path.join(repoRoot, relativePath)))
  .map(([relativePath, classification, rationale]) => ({
    path: relativePath,
    classification,
    ...gitPathState(relativePath),
    rationale,
  }));

const rows = expanded
  .map((record) => {
    const absolutePath = path.join(repoRoot, record.path);
    const stats = fs.lstatSync(absolutePath);
    const shapes = secretShapes(absolutePath, record.path, stats);
    const materialDiff =
      record.status === "??" ? null : materialDiffPaths.has(record.path);
    const indexMode = indexModes.get(record.path) ?? "";
    const currentMode = worktreeMode(stats);
    const decision = classify(record.path, record.status, shapes, materialDiff);
    return {
      status: record.status,
      path: record.path,
      originalPath: record.originalPath,
      type: stats.isSymbolicLink()
        ? "symlink"
        : stats.isFile()
        ? "file"
        : stats.isDirectory()
        ? "directory"
        : "other",
      indexMode,
      worktreeMode: currentMode,
      modeChanged: Boolean(
        indexMode && currentMode && indexMode !== currentMode,
      ),
      materialDiff,
      bytes: selfPaths.has(record.path) ? "<self>" : stats.size,
      sha256: selfPaths.has(record.path)
        ? "<self>"
        : sha256File(absolutePath, stats),
      secretShapeLabels: shapes,
      ...decision,
    };
  })
  .sort((left, right) => left.path.localeCompare(right.path));

const counts = {};
for (const row of rows) {
  counts[row.classification] = (counts[row.classification] ?? 0) + 1;
}

const header = [
  "status",
  "path",
  "original_path",
  "type",
  "index_mode",
  "worktree_mode",
  "mode_changed",
  "material_diff",
  "bytes",
  "sha256",
  "classification",
  "source_candidate",
  "runtime_package",
  "secret_shape_labels",
  "rationale",
];
const tsv = [
  `# artifact=${ARTIFACT}`,
  `# base_head=${baseHead}`,
  `# branch=${branch}`,
  `# coalesced_status_entries=${coalesced.length}`,
  `# expanded_status_files=${rows.length}`,
  header.join("\t"),
  ...rows.map((row) =>
    [
      row.status,
      row.path,
      row.originalPath,
      row.type,
      row.indexMode,
      row.worktreeMode,
      row.modeChanged,
      row.materialDiff === null ? "n/a" : row.materialDiff,
      row.bytes,
      row.sha256,
      row.classification,
      row.sourceCandidate,
      row.runtimePackage,
      row.secretShapeLabels.join(","),
      row.rationale,
    ]
      .map(escapeTsv)
      .join("\t"),
  ),
  "",
].join("\n");

const summary = {
  artifact: ARTIFACT,
  status: "CLASSIFICATION_CANDIDATE",
  baseHead,
  branch,
  coalescedStatusEntries: coalesced.length,
  expandedStatusFiles: rows.length,
  classifications: Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  ),
  sourceCandidate: {
    yes: rows.filter((row) => row.sourceCandidate === "yes").length,
    no: rows.filter((row) => row.sourceCandidate === "no").length,
    review: rows.filter((row) => row.sourceCandidate === "review").length,
  },
  runtimePackage: {
    yes: rows.filter((row) => row.runtimePackage === "yes").length,
    no: rows.filter((row) => row.runtimePackage === "no").length,
    review: rows.filter((row) => row.runtimePackage === "review").length,
  },
  secretShapeFiles: rows.filter((row) => row.secretShapeLabels.length > 0)
    .length,
  modeDriftFiles: rows.filter((row) => row.modeChanged).length,
  statusOnlyFiles: rows.filter(
    (row) => row.classification === "STATUS_ONLY_EXCLUDE",
  ).length,
  authorityHoldFiles: rows.filter(
    (row) => row.classification === "AUTHORITY_HOLD",
  ).length,
  sensitiveQuarantineFiles: rows.filter(
    (row) => row.classification === "SENSITIVE_QUARANTINE",
  ).length,
  malformedFiles: rows.filter((row) => row.classification === "MALFORMED")
    .length,
  unresolvedFiles: rows.filter((row) => row.classification === "UNRESOLVED")
    .length,
  baselineAndIgnoredHolds,
  productionContacted: false,
  mutations: {
    staged: false,
    committed: false,
    deleted: false,
    historyRewritten: false,
  },
};

fs.writeFileSync(inventoryPath, tsv, "utf8");
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary));
