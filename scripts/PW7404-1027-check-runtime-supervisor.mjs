#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = path.resolve(
  SCRIPT_DIR,
  "../config/PW7404-1027-spacebot-runtime-supervisor-v0-20260711.json",
);
const MAX_MANIFEST_BYTES = 1024 * 1024;
const SERVICE_MODES = new Set(["long_running", "scheduled_one_shot"]);
const DEPENDENCY_REQUIREMENTS = new Set(["required", "optional"]);
const SCHEDULE_KINDS = new Set(["cron", "application_cadence"]);
const PROBE_KINDS = new Set([
  "http",
  "tcp",
  "process",
  "freshness",
  "receipt",
  "inherited",
]);
const RESTART_POLICIES = new Set(["on_failure", "never", "externally_managed"]);
const BACKOFF_MODES = new Set(["exponential", "constant", "none"]);
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const SERVICE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class ManifestError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "ManifestError";
    this.exitCode = exitCode;
  }
}

function usage() {
  return [
    "Usage: node scripts/PW7404-1027-check-runtime-supervisor.mjs [options]",
    "",
    "Options:",
    "  --manifest <path>  Validate a specific supervisor manifest",
    "  --json             Emit machine-readable JSON",
    "  --help             Show this help",
    "",
    "This checker only reads and validates the manifest. It never starts, stops,",
    "restarts, signals, probes, or writes runtime services and never reads env values.",
  ].join("\n");
}

function parseArgs(argv) {
  let manifestPath = DEFAULT_MANIFEST;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--help") {
      return { help: true, json, manifestPath };
    } else if (arg === "--manifest") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new ManifestError("--manifest requires a path", 2);
      }
      manifestPath = path.resolve(value);
      index += 1;
    } else if (arg.startsWith("--manifest=")) {
      const value = arg.slice("--manifest=".length);
      if (!value) throw new ManifestError("--manifest requires a path", 2);
      manifestPath = path.resolve(value);
    } else {
      throw new ManifestError(`Unknown option: ${arg}`, 2);
    }
  }

  return { help: false, json, manifestPath };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(location, message) {
  throw new ManifestError(`${location}: ${message}`);
}

function requireRecord(value, location) {
  if (!isRecord(value)) fail(location, "must be an object");
  return value;
}

function requireExactKeys(value, keys, location) {
  const actual = Object.keys(requireRecord(value, location)).sort();
  const expected = [...keys].sort();
  const unexpected = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !actual.includes(key));
  if (missing.length > 0) fail(location, `missing keys: ${missing.join(", ")}`);
  if (unexpected.length > 0) {
    fail(location, `unexpected keys: ${unexpected.join(", ")}`);
  }
}

function requireString(value, location) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(location, "must be a non-empty string");
  }
  return value;
}

function requireBoolean(value, location) {
  if (typeof value !== "boolean") fail(location, "must be a boolean");
}

function requireInteger(value, location, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(location, `must be an integer >= ${minimum}`);
  }
}

function requireEnum(value, allowed, location) {
  requireString(value, location);
  if (!allowed.has(value)) {
    fail(location, `must be one of: ${[...allowed].join(", ")}`);
  }
}

function requireStringArray(value, location, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(
      location,
      allowEmpty ? "must be an array" : "must be a non-empty array",
    );
  }
  const seen = new Set();
  value.forEach((entry, index) => {
    requireString(entry, `${location}[${index}]`);
    if (seen.has(entry)) fail(`${location}[${index}]`, "duplicate value");
    seen.add(entry);
  });
  return seen;
}

function validateEnvNames(value, location) {
  const names = requireStringArray(value, location);
  for (const [index, name] of value.entries()) {
    if (!ENV_NAME_PATTERN.test(name)) {
      fail(`${location}[${index}]`, "invalid environment variable name");
    }
  }
  return names;
}

function validateProbe(probe, location) {
  requireExactKeys(
    probe,
    ["kind", "target", "expected", "timeout_ms"],
    location,
  );
  requireEnum(probe.kind, PROBE_KINDS, `${location}.kind`);
  requireString(probe.target, `${location}.target`);
  requireStringArray(probe.expected, `${location}.expected`, {
    allowEmpty: false,
  });
  requireInteger(probe.timeout_ms, `${location}.timeout_ms`, 1);
}

function validateService(service, index) {
  const location = `services[${index}]`;
  requireExactKeys(
    service,
    [
      "id",
      "display_name",
      "mode",
      "process",
      "schedule",
      "dependencies",
      "boundary",
      "observability",
      "runtime_policy",
      "environment",
    ],
    location,
  );

  requireString(service.id, `${location}.id`);
  if (!SERVICE_ID_PATTERN.test(service.id)) {
    fail(`${location}.id`, "must be lowercase kebab-case");
  }
  requireString(service.display_name, `${location}.display_name`);
  requireEnum(service.mode, SERVICE_MODES, `${location}.mode`);

  requireExactKeys(
    service.process,
    ["manager", "identity", "expected_instances"],
    `${location}.process`,
  );
  requireString(service.process.manager, `${location}.process.manager`);
  requireString(service.process.identity, `${location}.process.identity`);
  requireInteger(
    service.process.expected_instances,
    `${location}.process.expected_instances`,
  );

  if (service.mode === "long_running") {
    if (service.schedule !== null)
      fail(`${location}.schedule`, "must be null for long_running");
    if (service.process.expected_instances < 1) {
      fail(
        `${location}.process.expected_instances`,
        "must be >= 1 for long_running",
      );
    }
  } else {
    requireExactKeys(
      service.schedule,
      [
        "kind",
        "expression",
        "timezone",
        "overlap_allowed",
        "idle_after_success",
        "late_after_ms",
      ],
      `${location}.schedule`,
    );
    requireEnum(
      service.schedule.kind,
      SCHEDULE_KINDS,
      `${location}.schedule.kind`,
    );
    requireString(
      service.schedule.expression,
      `${location}.schedule.expression`,
    );
    requireString(service.schedule.timezone, `${location}.schedule.timezone`);
    requireBoolean(
      service.schedule.overlap_allowed,
      `${location}.schedule.overlap_allowed`,
    );
    requireBoolean(
      service.schedule.idle_after_success,
      `${location}.schedule.idle_after_success`,
    );
    requireInteger(
      service.schedule.late_after_ms,
      `${location}.schedule.late_after_ms`,
      1,
    );
    if (service.process.expected_instances !== 0) {
      fail(
        `${location}.process.expected_instances`,
        "must be 0 between scheduled runs",
      );
    }
  }

  if (!Array.isArray(service.dependencies))
    fail(`${location}.dependencies`, "must be an array");
  const dependencyIds = new Set();
  service.dependencies.forEach((dependency, dependencyIndex) => {
    const dependencyLocation = `${location}.dependencies[${dependencyIndex}]`;
    requireExactKeys(
      dependency,
      ["service_id", "requirement"],
      dependencyLocation,
    );
    requireString(dependency.service_id, `${dependencyLocation}.service_id`);
    requireEnum(
      dependency.requirement,
      DEPENDENCY_REQUIREMENTS,
      `${dependencyLocation}.requirement`,
    );
    if (dependency.service_id === service.id)
      fail(dependencyLocation, "self-dependency is forbidden");
    if (dependencyIds.has(dependency.service_id)) {
      fail(
        dependencyLocation,
        `duplicate dependency: ${dependency.service_id}`,
      );
    }
    dependencyIds.add(dependency.service_id);
  });

  requireExactKeys(
    service.boundary,
    ["bind_scope", "protocol", "exposure", "auth"],
    `${location}.boundary`,
  );
  requireString(service.boundary.bind_scope, `${location}.boundary.bind_scope`);
  requireString(service.boundary.protocol, `${location}.boundary.protocol`);
  requireString(service.boundary.exposure, `${location}.boundary.exposure`);
  requireExactKeys(
    service.boundary.auth,
    ["required", "mechanism", "env_names"],
    `${location}.boundary.auth`,
  );
  requireBoolean(
    service.boundary.auth.required,
    `${location}.boundary.auth.required`,
  );
  requireString(
    service.boundary.auth.mechanism,
    `${location}.boundary.auth.mechanism`,
  );
  const authEnvNames = validateEnvNames(
    service.boundary.auth.env_names,
    `${location}.boundary.auth.env_names`,
  );
  if (
    service.boundary.auth.required &&
    service.boundary.auth.mechanism === "none"
  ) {
    fail(
      `${location}.boundary.auth`,
      "required auth cannot use mechanism=none",
    );
  }
  if (!service.boundary.auth.required && authEnvNames.size > 0) {
    fail(
      `${location}.boundary.auth.env_names`,
      "must be empty when auth is not required",
    );
  }

  requireExactKeys(
    service.observability,
    ["health", "readiness"],
    `${location}.observability`,
  );
  validateProbe(
    service.observability.health,
    `${location}.observability.health`,
  );
  validateProbe(
    service.observability.readiness,
    `${location}.observability.readiness`,
  );

  requireExactKeys(
    service.runtime_policy,
    ["timeout_ms", "max_concurrency", "restart"],
    `${location}.runtime_policy`,
  );
  requireInteger(
    service.runtime_policy.timeout_ms,
    `${location}.runtime_policy.timeout_ms`,
    1,
  );
  requireInteger(
    service.runtime_policy.max_concurrency,
    `${location}.runtime_policy.max_concurrency`,
    1,
  );
  requireExactKeys(
    service.runtime_policy.restart,
    ["policy", "max_attempts", "base_delay_ms", "max_delay_ms", "backoff"],
    `${location}.runtime_policy.restart`,
  );
  const restart = service.runtime_policy.restart;
  requireEnum(
    restart.policy,
    RESTART_POLICIES,
    `${location}.runtime_policy.restart.policy`,
  );
  requireInteger(
    restart.max_attempts,
    `${location}.runtime_policy.restart.max_attempts`,
  );
  requireInteger(
    restart.base_delay_ms,
    `${location}.runtime_policy.restart.base_delay_ms`,
  );
  requireInteger(
    restart.max_delay_ms,
    `${location}.runtime_policy.restart.max_delay_ms`,
  );
  requireEnum(
    restart.backoff,
    BACKOFF_MODES,
    `${location}.runtime_policy.restart.backoff`,
  );
  if (restart.policy === "never" || restart.policy === "externally_managed") {
    if (
      restart.max_attempts !== 0 ||
      restart.base_delay_ms !== 0 ||
      restart.max_delay_ms !== 0 ||
      restart.backoff !== "none"
    ) {
      fail(
        `${location}.runtime_policy.restart`,
        `${restart.policy} must have zero attempts/delays and no backoff`,
      );
    }
  } else if (
    restart.max_attempts < 1 ||
    restart.base_delay_ms < 1 ||
    restart.max_delay_ms < restart.base_delay_ms ||
    restart.backoff === "none"
  ) {
    fail(
      `${location}.runtime_policy.restart`,
      "on_failure requires bounded attempts and backoff",
    );
  }
  if (service.mode === "scheduled_one_shot" && restart.policy !== "never") {
    fail(
      `${location}.runtime_policy.restart.policy`,
      "scheduled_one_shot must never restart a run",
    );
  }

  requireExactKeys(
    service.environment,
    ["required_names", "optional_names"],
    `${location}.environment`,
  );
  const requiredEnvNames = validateEnvNames(
    service.environment.required_names,
    `${location}.environment.required_names`,
  );
  const optionalEnvNames = validateEnvNames(
    service.environment.optional_names,
    `${location}.environment.optional_names`,
  );
  for (const name of requiredEnvNames) {
    if (optionalEnvNames.has(name)) {
      fail(
        `${location}.environment`,
        "an environment name is both required and optional",
      );
    }
  }
  for (const name of authEnvNames) {
    if (!requiredEnvNames.has(name) && !optionalEnvNames.has(name)) {
      fail(
        `${location}.boundary.auth.env_names`,
        "auth environment name is not declared in environment",
      );
    }
  }
}

function validateRequiredDependencyGraph(services) {
  const graph = new Map(
    services.map((service) => [
      service.id,
      service.dependencies
        .filter((dependency) => dependency.requirement === "required")
        .map((dependency) => dependency.service_id),
    ]),
  );
  const visiting = new Set();
  const visited = new Set();

  function visit(serviceId, lineage) {
    if (visiting.has(serviceId)) {
      fail(
        "services",
        `required dependency cycle: ${[...lineage, serviceId].join(" -> ")}`,
      );
    }
    if (visited.has(serviceId)) return;
    visiting.add(serviceId);
    for (const dependencyId of graph.get(serviceId) ?? []) {
      visit(dependencyId, [...lineage, serviceId]);
    }
    visiting.delete(serviceId);
    visited.add(serviceId);
  }

  for (const serviceId of graph.keys()) visit(serviceId, []);
}

function validateManifest(manifest) {
  requireExactKeys(
    manifest,
    [
      "artifact_id",
      "schema_version",
      "supervisor",
      "state_semantics",
      "required_service_ids",
      "services",
    ],
    "manifest",
  );
  requireString(manifest.artifact_id, "manifest.artifact_id");
  if (!/^PW7404-\d{4}-[a-z0-9-]+$/.test(manifest.artifact_id)) {
    fail("manifest.artifact_id", "must use a coded PW7404 artifact id");
  }
  if (manifest.schema_version !== "0.1.0") {
    fail("manifest.schema_version", "unsupported schema version");
  }

  requireExactKeys(
    manifest.supervisor,
    ["mode", "environment_handling", "mutations", "dependency_rules"],
    "manifest.supervisor",
  );
  if (manifest.supervisor.mode !== "observe_only") {
    fail("manifest.supervisor.mode", "must be observe_only");
  }
  if (manifest.supervisor.environment_handling !== "names_only") {
    fail("manifest.supervisor.environment_handling", "must be names_only");
  }
  const mutationKeys = [
    "start",
    "stop",
    "restart",
    "reload",
    "signal",
    "write_runtime_state",
  ];
  requireExactKeys(
    manifest.supervisor.mutations,
    mutationKeys,
    "manifest.supervisor.mutations",
  );
  for (const key of mutationKeys) {
    if (manifest.supervisor.mutations[key] !== false) {
      fail(`manifest.supervisor.mutations.${key}`, "must be false");
    }
  }
  requireExactKeys(
    manifest.supervisor.dependency_rules,
    ["required_failure", "optional_failure", "missing_observation"],
    "manifest.supervisor.dependency_rules",
  );
  const expectedDependencyRules = {
    required_failure: "unhealthy",
    optional_failure: "degraded",
    missing_observation: "unknown",
  };
  for (const [key, expected] of Object.entries(expectedDependencyRules)) {
    if (manifest.supervisor.dependency_rules[key] !== expected) {
      fail(
        `manifest.supervisor.dependency_rules.${key}`,
        `must be ${expected}`,
      );
    }
  }

  const states = ["healthy", "degraded", "unhealthy", "idle", "unknown"];
  requireExactKeys(
    manifest.state_semantics,
    states,
    "manifest.state_semantics",
  );
  states.forEach((state) =>
    requireString(
      manifest.state_semantics[state],
      `manifest.state_semantics.${state}`,
    ),
  );

  const requiredServiceIds = requireStringArray(
    manifest.required_service_ids,
    "manifest.required_service_ids",
    { allowEmpty: false },
  );
  if (!Array.isArray(manifest.services) || manifest.services.length === 0) {
    fail("manifest.services", "must be a non-empty array");
  }
  manifest.services.forEach(validateService);

  const serviceIds = new Set();
  manifest.services.forEach((service, index) => {
    if (serviceIds.has(service.id))
      fail(`services[${index}].id`, `duplicate service id: ${service.id}`);
    serviceIds.add(service.id);
  });
  for (const requiredId of requiredServiceIds) {
    if (!serviceIds.has(requiredId))
      fail("manifest.services", `missing required service: ${requiredId}`);
  }
  for (const serviceId of serviceIds) {
    if (!requiredServiceIds.has(serviceId)) {
      fail(
        "manifest.required_service_ids",
        `service is not declared as required inventory: ${serviceId}`,
      );
    }
  }
  manifest.services.forEach((service, serviceIndex) => {
    service.dependencies.forEach((dependency, dependencyIndex) => {
      if (!serviceIds.has(dependency.service_id)) {
        fail(
          `services[${serviceIndex}].dependencies[${dependencyIndex}].service_id`,
          `unknown service: ${dependency.service_id}`,
        );
      }
    });
  });
  validateRequiredDependencyGraph(manifest.services);
}

function buildSummary(manifest, manifestPath) {
  const modeCounts = { long_running: 0, scheduled_one_shot: 0 };
  const dependencyCounts = { required: 0, optional: 0 };
  for (const service of manifest.services) {
    modeCounts[service.mode] += 1;
    for (const dependency of service.dependencies) {
      dependencyCounts[dependency.requirement] += 1;
    }
  }
  return {
    ok: true,
    artifact_id: manifest.artifact_id,
    schema_version: manifest.schema_version,
    mode: manifest.supervisor.mode,
    manifest: manifestPath,
    service_count: manifest.services.length,
    service_modes: modeCounts,
    dependencies: dependencyCounts,
    states: Object.keys(manifest.state_semantics),
    runtime_actions_performed: 0,
    environment_values_read: 0,
  };
}

async function readManifest(manifestPath) {
  let content;
  try {
    content = await readFile(manifestPath, "utf8");
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? error.code
        : "READ_ERROR";
    throw new ManifestError(`Cannot read manifest (${code}): ${manifestPath}`);
  }
  if (Buffer.byteLength(content, "utf8") > MAX_MANIFEST_BYTES) {
    throw new ManifestError(`Manifest exceeds ${MAX_MANIFEST_BYTES} bytes`);
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new ManifestError("Malformed manifest JSON");
  }
}

function emitFailure(error, json) {
  const message =
    error instanceof Error ? error.message : "Unknown validation failure";
  if (json) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  } else {
    process.stderr.write(`Runtime supervisor manifest INVALID: ${message}\n`);
  }
}

async function main() {
  let options = { json: process.argv.includes("--json") };
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const manifest = await readManifest(options.manifestPath);
    validateManifest(manifest);
    const summary = buildSummary(manifest, options.manifestPath);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(summary)}\n`);
    } else {
      process.stdout.write(
        [
          `Runtime supervisor manifest VALID: ${summary.artifact_id}`,
          `Services: ${summary.service_count} (${summary.service_modes.long_running} long_running, ${summary.service_modes.scheduled_one_shot} scheduled_one_shot)`,
          `Dependencies: ${summary.dependencies.required} required, ${summary.dependencies.optional} optional`,
          "Safety: observe_only; 0 runtime actions; 0 environment values read",
        ].join("\n") + "\n",
      );
    }
  } catch (error) {
    emitFailure(error, options.json);
    process.exitCode = error instanceof ManifestError ? error.exitCode : 1;
  }
}

await main();
