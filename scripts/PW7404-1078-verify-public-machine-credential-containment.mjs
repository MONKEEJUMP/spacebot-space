#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;

const EXPECTED_CONFIRMATION =
  "VERIFY_PUBLIC_GIT_MACHINE_KEY_CONTAINMENT_20260712";
const EXPECTED_COUNT = 18;
const EXPECTED_CWD = "/var/www/spacebot";
const EXPECTED_HOSTNAME = "spacebot";
const EXPECTED_BUILD_ID = "nSROWoBdTkqCFXi-AfqYC";
const EXPECTED_DATABASE = "postgres";
const EXPECTED_DATABASE_ROLE = "postgres";
const EXPECTED_DATABASE_HOSTNAME = "aws-1-us-east-1.pooler.supabase.com";
const EXPECTED_DATABASE_ADDRESS = "2600:1f18:2e13:9d31:d82d:1078:4676:6635/128";
const EXPECTED_DATABASE_PORT = 5432;
const EXPECTED_EXPOSED_AGGREGATE =
  "60bdcc1e76e1f3f47143bf5120c2e700d4e080599407d61196f73dd3e46f9330";
const SUPABASE_CA_PATH = "/root/spacebot-secrets/supabase-root-2021-ca.crt";
const EXPECTED_SUPABASE_CA_SHA256 =
  "807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA";
const KEY_FILE_PATH = "/var/www/spacebot/.machine_keys.json";
const INCIDENT_DIRECTORY =
  "/root/spacebot-releases/PW7404-1077-20260712-public-machine-key-containment";
const COMPROMISED_FILE_PATH = path.join(
  INCIDENT_DIRECTORY,
  ".machine_keys.compromised.json",
);
const VERIFY_URL = "https://www.spacebot.space/api/v1/agents/me";
const HEALTH_URL = "https://www.spacebot.space/api/health";
const KEY_PATTERN = /^sb_[0-9a-f]{64}$/u;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeReceipt(filePath, value) {
  const descriptor = openSync(filePath, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function assertUrl(raw, expectedPath) {
  const parsed = new URL(raw);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "www.spacebot.space" ||
    parsed.port !== "" ||
    parsed.pathname !== expectedPath ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw new Error("Hardcoded HTTPS verification URL guard failed");
  }
}

let stage = "preflight";
let sql;
try {
  if (process.env.PW7404_CONFIRM_VERIFICATION !== EXPECTED_CONFIRMATION) {
    throw new Error("Explicit verification confirmation is missing");
  }
  if (
    process.platform !== "linux" ||
    process.getuid?.() !== 0 ||
    hostname() !== EXPECTED_HOSTNAME ||
    realpathSync(process.cwd()) !== EXPECTED_CWD
  ) {
    throw new Error("Production execution guard failed");
  }
  if (
    readFileSync(
      path.join(EXPECTED_CWD, ".next", "BUILD_ID"),
      "utf8",
    ).trim() !== EXPECTED_BUILD_ID
  ) {
    throw new Error("Production build identity guard failed");
  }
  if (existsSync(KEY_FILE_PATH))
    throw new Error("Plaintext key file remains in live worktree");
  const compromisedStat = lstatSync(COMPROMISED_FILE_PATH);
  if (
    !compromisedStat.isFile() ||
    compromisedStat.isSymbolicLink() ||
    compromisedStat.uid !== 0 ||
    (compromisedStat.mode & 0o777) !== 0o600
  ) {
    throw new Error("Quarantined incident file guard failed");
  }
  chmodSync(INCIDENT_DIRECTORY, 0o700);
  const caStat = lstatSync(SUPABASE_CA_PATH);
  const caPem = readFileSync(SUPABASE_CA_PATH, "utf8");
  const caFingerprint = new X509Certificate(caPem).fingerprint256
    .replaceAll(":", "")
    .toUpperCase();
  if (
    !caStat.isFile() ||
    caStat.isSymbolicLink() ||
    caStat.uid !== 0 ||
    (caStat.mode & 0o022) !== 0 ||
    caFingerprint !== EXPECTED_SUPABASE_CA_SHA256
  ) {
    throw new Error("Pinned Supabase CA guard failed");
  }
  assertUrl(VERIFY_URL, "/api/v1/agents/me");
  assertUrl(HEALTH_URL, "/api/health");

  const keyMap = JSON.parse(readFileSync(COMPROMISED_FILE_PATH, "utf8"));
  const exposedValues = Object.values(keyMap).map(String);
  if (
    exposedValues.length !== EXPECTED_COUNT ||
    new Set(exposedValues).size !== EXPECTED_COUNT ||
    !exposedValues.every((value) => KEY_PATTERN.test(value))
  ) {
    throw new Error("Quarantined incident file does not match expected shape");
  }
  const exposedLookups = exposedValues.map(digest);
  if (
    digest([...exposedLookups].sort().join("\n")) !== EXPECTED_EXPOSED_AGGREGATE
  ) {
    throw new Error(
      "Quarantined incident set does not match reviewed aggregate",
    );
  }

  loadEnvConfig(EXPECTED_CWD, false, { info() {}, error() {} });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is unavailable");
  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (
    databaseUrl.protocol !== "postgresql:" ||
    databaseUrl.hostname !== EXPECTED_DATABASE_HOSTNAME ||
    (databaseUrl.port || "5432") !== String(EXPECTED_DATABASE_PORT)
  ) {
    throw new Error("Production database URL guard failed");
  }

  stage = "database-proof";
  sql = postgres(databaseUrl.toString(), {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 2,
    ssl: {
      rejectUnauthorized: true,
      ca: caPem,
      servername: EXPECTED_DATABASE_HOSTNAME,
    },
  });
  const [databaseProof] = await sql`
    SELECT
      current_database() AS database,
      current_user AS role,
      inet_server_addr()::text AS address,
      inet_server_port()::int AS port,
      (SELECT count(*)::int FROM agent_credentials
        WHERE lookup_hash IN ${sql(exposedLookups)}
          AND revoked_at IS NULL
      ) AS exposed_active,
      (SELECT count(*)::int FROM agent_credentials
        WHERE lookup_hash IN ${sql(exposedLookups)}
          AND revoked_at IS NOT NULL
      ) AS exposed_revoked,
      (SELECT count(*)::int FROM agents
        WHERE api_key IN ${sql(exposedLookups)}
      ) AS exposed_mirrors,
      (SELECT count(*)::int FROM agent_browser_sessions s
        JOIN agent_credentials c ON c.id = s.credential_id
        WHERE c.lookup_hash IN ${sql(exposedLookups)}
          AND s.revoked_at IS NULL
      ) AS exposed_sessions,
      (SELECT count(*)::int
        FROM agents a
        JOIN agent_credentials c
          ON c.agent_id = a.id
         AND c.lookup_hash = a.api_key
         AND c.revoked_at IS NULL
        WHERE a.id IN (
          SELECT agent_id FROM agent_credentials WHERE lookup_hash IN ${sql(
            exposedLookups,
          )}
        )
      ) AS safe_primary_mirrors
  `;
  if (
    databaseProof.database !== EXPECTED_DATABASE ||
    databaseProof.role !== EXPECTED_DATABASE_ROLE ||
    databaseProof.address !== EXPECTED_DATABASE_ADDRESS ||
    databaseProof.port !== EXPECTED_DATABASE_PORT ||
    databaseProof.exposed_active !== 0 ||
    databaseProof.exposed_revoked !== EXPECTED_COUNT ||
    databaseProof.exposed_mirrors !== 0 ||
    databaseProof.exposed_sessions !== 0 ||
    databaseProof.safe_primary_mirrors !== EXPECTED_COUNT
  ) {
    throw new Error("Authoritative database containment proof failed");
  }

  stage = "runtime-proof";
  const pm2 = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8" }));
  const processRecord = pm2.find(
    (entry) => entry.pm_id === 14 && entry.name === "spacebot",
  );
  if (
    processRecord?.pm2_env?.status !== "online" ||
    processRecord?.pm2_env?.unstable_restarts !== 0
  ) {
    throw new Error("PM2 runtime proof failed");
  }
  const health = await fetch(HEALTH_URL, {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (health.status !== 200) throw new Error("External health proof failed");

  stage = "https-revocation-proof";
  let externalHttps401 = 0;
  for (const exposedValue of exposedValues) {
    const response = await fetch(VERIFY_URL, {
      headers: { Authorization: `Bearer ${exposedValue}` },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401) externalHttps401 += 1;
  }
  if (externalHttps401 !== EXPECTED_COUNT) {
    throw new Error("External HTTPS revocation proof failed");
  }

  stage = "receipt";
  const receipt = {
    provenance: "PW7404-1078",
    phase: "VERIFIED",
    completedAt: new Date().toISOString(),
    exposedCredentials: EXPECTED_COUNT,
    exposedActive: databaseProof.exposed_active,
    exposedRevoked: databaseProof.exposed_revoked,
    exposedMirrors: databaseProof.exposed_mirrors,
    exposedSessions: databaseProof.exposed_sessions,
    safePrimaryMirrors: databaseProof.safe_primary_mirrors,
    externalHttps401,
    externalHealth: health.status,
    pm2Online: true,
    unstableRestarts: 0,
    livePlaintextKeyFileAbsent: !existsSync(KEY_FILE_PATH),
    plaintextValuesLogged: 0,
  };
  const receiptPath = path.join(
    INCIDENT_DIRECTORY,
    "verification-receipt.json",
  );
  if (existsSync(receiptPath))
    throw new Error("Verification receipt already exists");
  writeReceipt(receiptPath, receipt);
  console.log(JSON.stringify({ status: "PASS", ...receipt }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      status: "FAILED",
      stage,
      errorType: error instanceof Error ? error.name : "Error",
    }),
  );
  process.exitCode = 1;
} finally {
  if (sql) await sql.end({ timeout: 2 }).catch(() => undefined);
}
