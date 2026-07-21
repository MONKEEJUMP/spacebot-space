#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}`);
    }
    values.set(key.slice(2), path.resolve(value));
  }

  for (const required of ["live", "head", "current", "output"]) {
    if (!values.has(required)) throw new Error(`Missing required --${required} argument`);
  }
  return Object.fromEntries(values);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function normalizedHash(bytes) {
  if (bytes.includes(0)) return sha256(bytes);
  return sha256(Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"), "utf8"));
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

async function collectFiles(root, ignoredDirectories) {
  const files = new Map();

  async function walk(absoluteDirectory) {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const relativePath = toPosix(path.relative(root, absolutePath));
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      const stat = await lstat(absolutePath);
      if (!stat.isFile()) continue;
      const bytes = await readFile(absolutePath);
      files.set(relativePath, {
        bytes: stat.size,
        sha256: sha256(bytes),
        normalizedSha256: normalizedHash(bytes),
      });
    }
  }

  await walk(root);
  return files;
}

function compare(reference, candidate) {
  const result = {
    sameExact: [],
    sameNormalized: [],
    changed: [],
    referenceOnly: [],
    candidateOnly: [],
  };

  const allPaths = [...new Set([...reference.keys(), ...candidate.keys()])].sort();
  for (const filePath of allPaths) {
    const referenceFile = reference.get(filePath);
    const candidateFile = candidate.get(filePath);
    if (!candidateFile) result.referenceOnly.push(filePath);
    else if (!referenceFile) result.candidateOnly.push(filePath);
    else if (referenceFile.sha256 === candidateFile.sha256) result.sameExact.push(filePath);
    else if (referenceFile.normalizedSha256 === candidateFile.normalizedSha256) {
      result.sameNormalized.push(filePath);
    } else result.changed.push(filePath);
  }
  return result;
}

function suspiciousPaths(paths) {
  const risky = /(^|\/)(\.env(?:\.|$)|[^/]*(?:secret|credential|private[-_.]?key|id_rsa|\.pem$|\.p12$|\.key$|\.bak(?:\d+)?$|\.backup(?:[-_.]|$)|~$))/i;
  return paths.filter((filePath) => risky.test(filePath));
}

function isBackupArtifact(filePath) {
  return /(?:\.bak(?:\.|$)|\.backup(?:\.|-|$)|backup(?:\.|-|$)|-bak(?:\d|$)|~$)/i.test(filePath);
}

function counts(comparison) {
  return Object.fromEntries(Object.entries(comparison).map(([key, value]) => [key, value.length]));
}

function renderMarkdown(report) {
  const section = (title, comparison) => [
    `## ${title}`,
    "",
    `- Exact matches: ${comparison.sameExact.length}`,
    `- Line-ending-only matches: ${comparison.sameNormalized.length}`,
    `- Changed: ${comparison.changed.length}`,
    `- Live-only: ${comparison.referenceOnly.length}`,
    `- Candidate-only: ${comparison.candidateOnly.length}`,
    "",
  ].join("\n");

  return [
    "# PW7404-1074 Released Source Reconciliation Inventory",
    "",
    `Generated: ${report.generatedAt}`,
    `Live root: \`${report.roots.live}\``,
    `Git HEAD root: \`${report.roots.head}\``,
    `Current checkout: \`${report.roots.current}\``,
    "",
    section("Live Versus Git HEAD", report.liveVsHead),
    section("Live Versus Current Checkout", report.liveVsCurrent),
    "## TaskSpace Isolation",
    "",
    `- Manifest paths: ${report.taskspace.manifestPaths.length}`,
    `- TaskSpace paths changed from live in current checkout: ${report.taskspace.changedFromLive.length}`,
    `- TaskSpace paths absent from live but present in current checkout: ${report.taskspace.currentOnly.length}`,
    "",
    "## Safety Signals",
    "",
    `- Suspicious live paths: ${report.safety.suspiciousLivePaths.length}`,
    `- Suspicious current-only paths: ${report.safety.suspiciousCurrentOnlyPaths.length}`,
    "",
    "The JSON companion is canonical and contains the complete sorted path lists and hashes.",
    "",
  ].join("\n");
}

const args = parseArgs(process.argv.slice(2));
const coreIgnoredDirectories = new Set([".git", ".next", ".venv", "node_modules"]);
const generatedIgnoredDirectories = new Set([
  ...coreIgnoredDirectories,
  ".ruff_cache",
  "__pycache__",
  "flight-recorder",
]);
const live = await collectFiles(args.live, generatedIgnoredDirectories);
const [head, current] = await Promise.all([
  collectFiles(args.head, coreIgnoredDirectories),
  collectFiles(args.current, generatedIgnoredDirectories),
]);

const liveVsHead = compare(live, head);
const liveVsCurrent = compare(live, current);
const taskspaceManifestPath = path.join(
  args.current,
  "scripts",
  "PW7404-1063-spacebot-taskspace-release-paths-20260712.txt",
);
const taskspaceManifestPaths = (await readFile(taskspaceManifestPath, "utf8"))
  .split(/\r?\n/u)
  .map((value) => value.trim())
  .filter(Boolean)
  .sort();
const taskspacePathSet = new Set(taskspaceManifestPaths);

const report = {
  schemaVersion: 1,
  provenance: "PW7404-1074",
  generatedAt: new Date().toISOString(),
  roots: args,
  fileCounts: { live: live.size, head: head.size, currentAllowlisted: current.size },
  countSummary: {
    liveVsHead: counts(liveVsHead),
    liveVsCurrent: counts(liveVsCurrent),
  },
  liveVsHead,
  liveVsCurrent,
  taskspace: {
    manifestPaths: taskspaceManifestPaths,
    changedFromLive: liveVsCurrent.changed.filter((filePath) => taskspacePathSet.has(filePath)),
    currentOnly: liveVsCurrent.candidateOnly.filter((filePath) => taskspacePathSet.has(filePath)),
  },
  safety: {
    suspiciousLivePaths: suspiciousPaths([...live.keys()].sort()),
    suspiciousCurrentOnlyPaths: suspiciousPaths(liveVsCurrent.candidateOnly),
  },
  liveFiles: Object.fromEntries([...live.entries()].sort(([left], [right]) => left.localeCompare(right))),
};

const canonicalLivePaths = [...live.keys()].filter((filePath) => !isBackupArtifact(filePath)).sort();
const excludedBackupPaths = [...live.keys()].filter(isBackupArtifact).sort();
const canonicalLivePathSet = new Set(canonicalLivePaths);
const removeFromHeadPaths = [...head.keys()]
  .filter((filePath) => !canonicalLivePathSet.has(filePath))
  .sort();
report.releasedBaseline = {
  canonicalLivePaths,
  excludedBackupPaths,
  removeFromHeadPaths,
};

await writeFile(`${args.output}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(`${args.output}.md`, renderMarkdown(report), "utf8");
if (args["manifest-root"]) {
  const manifestPrefix = path.join(
    args["manifest-root"],
    "PW7404-1075-spacebot-released-baseline-20260712",
  );
  const manifestRows = canonicalLivePaths.map((filePath) => {
    const file = live.get(filePath);
    return `${file.sha256}\t${file.bytes}\t${filePath}`;
  });
  await writeFile(`${manifestPrefix}.tsv`, `${manifestRows.join("\n")}\n`, "utf8");
  await writeFile(
    `${manifestPrefix}-excluded-backups.txt`,
    `${excludedBackupPaths.join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    `${manifestPrefix}-remove-from-head.txt`,
    `${removeFromHeadPaths.join("\n")}\n`,
    "utf8",
  );
}
console.log(JSON.stringify({
  outputs: [`${args.output}.json`, `${args.output}.md`],
  fileCounts: report.fileCounts,
  countSummary: report.countSummary,
  taskspace: {
    manifestPaths: report.taskspace.manifestPaths.length,
    changedFromLive: report.taskspace.changedFromLive.length,
    currentOnly: report.taskspace.currentOnly.length,
  },
  safety: {
    suspiciousLivePaths: report.safety.suspiciousLivePaths.length,
    suspiciousCurrentOnlyPaths: report.safety.suspiciousCurrentOnlyPaths.length,
  },
  releasedBaseline: {
    canonicalLivePaths: canonicalLivePaths.length,
    excludedBackupPaths: excludedBackupPaths.length,
    removeFromHeadPaths: removeFromHeadPaths.length,
  },
}, null, 2));
