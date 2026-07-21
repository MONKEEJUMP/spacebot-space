#!/usr/bin/env node

import { createHash, X509Certificate } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;

const EXPECTED_CONFIRMATION = "CONTAIN_PUBLIC_GIT_MACHINE_KEYS_20260712";
const EXPECTED_COUNT = 18;
const EXPECTED_CWD = "/var/www/spacebot";
const EXPECTED_HOSTNAME = "spacebot";
const EXPECTED_DATABASE = "postgres";
const EXPECTED_DATABASE_ROLE = "postgres";
const EXPECTED_DATABASE_HOSTNAME = "aws-1-us-east-1.pooler.supabase.com";
const EXPECTED_DATABASE_ADDRESS = "2600:1f18:2e13:9d31:d82d:1078:4676:6635/128";
const EXPECTED_DATABASE_PORT = 5432;
const EXPECTED_SENTINEL_ID = "ba8e3767-c37d-4f10-98cd-9364a54dfd60";
const EXPECTED_SENTINEL_NAME = "NEXUS-7";
const EXPECTED_BUILD_ID = "nSROWoBdTkqCFXi-AfqYC";
const EXPECTED_EXPOSED_AGGREGATE =
  "60bdcc1e76e1f3f47143bf5120c2e700d4e080599407d61196f73dd3e46f9330";
const SUPABASE_CA_PATH = "/root/spacebot-secrets/supabase-root-2021-ca.crt";
const EXPECTED_SUPABASE_CA_SHA256 =
  "807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA";
const KEY_FILE_PATH = "/var/www/spacebot/.machine_keys.json";
const INCIDENT_DIRECTORY =
  "/root/spacebot-releases/PW7404-1077-20260712-public-machine-key-containment";
const KEY_PATTERN = /^sb_[0-9a-f]{64}$/u;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeExclusiveJson(filePath, value, mode) {
  const descriptor = openSync(filePath, "wx", mode);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function fsyncDirectory(directoryPath) {
  const descriptor = openSync(directoryPath, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function assertProductionFilesystem() {
  if (process.platform !== "linux" || process.getuid?.() !== 0) {
    throw new Error("Containment must run as root on Linux");
  }
  if (
    hostname() !== EXPECTED_HOSTNAME ||
    realpathSync(process.cwd()) !== EXPECTED_CWD
  ) {
    throw new Error("Production host or working directory guard failed");
  }
  if (
    readFileSync(
      path.join(EXPECTED_CWD, ".next", "BUILD_ID"),
      "utf8",
    ).trim() !== EXPECTED_BUILD_ID
  ) {
    throw new Error("Production build identity guard failed");
  }
  const stat = lstatSync(KEY_FILE_PATH);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== 0 ||
    (stat.mode & 0o777) !== 0o600
  ) {
    throw new Error("Production key file ownership or mode guard failed");
  }
}

let stage = "preflight";
let sql;
try {
  if (process.env.PW7404_CONFIRM_CONTAINMENT !== EXPECTED_CONFIRMATION) {
    throw new Error("Explicit containment confirmation is missing");
  }
  assertProductionFilesystem();
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

  const keyMap = JSON.parse(readFileSync(KEY_FILE_PATH, "utf8"));
  const sourceEntries = Object.entries(keyMap);
  const exposedValues = sourceEntries.map(([, value]) => String(value));
  if (
    sourceEntries.length !== EXPECTED_COUNT ||
    new Set(sourceEntries.map(([label]) => label.toLocaleLowerCase("en-US")))
      .size !== EXPECTED_COUNT ||
    new Set(exposedValues).size !== EXPECTED_COUNT ||
    !exposedValues.every((value) => KEY_PATTERN.test(value))
  ) {
    throw new Error(
      "Exposed credential file does not match the incident inventory",
    );
  }
  const exposedLookups = exposedValues.map(digest);
  if (
    digest([...exposedLookups].sort().join("\n")) !== EXPECTED_EXPOSED_AGGREGATE
  ) {
    throw new Error(
      "Exposed credential aggregate does not match the reviewed incident set",
    );
  }

  mkdirSync(INCIDENT_DIRECTORY, { recursive: true, mode: 0o700 });
  chmodSync(INCIDENT_DIRECTORY, 0o700);
  const incidentDirectoryStat = lstatSync(INCIDENT_DIRECTORY);
  if (
    !incidentDirectoryStat.isDirectory() ||
    incidentDirectoryStat.isSymbolicLink() ||
    incidentDirectoryStat.uid !== 0 ||
    (incidentDirectoryStat.mode & 0o777) !== 0o700
  ) {
    throw new Error("Incident directory ownership or mode guard failed");
  }
  if (
    lstatSync(path.dirname(KEY_FILE_PATH)).dev !== incidentDirectoryStat.dev
  ) {
    throw new Error(
      "Key file and incident directory are not on the same filesystem",
    );
  }
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
  const databaseReceiptPath = path.join(
    INCIDENT_DIRECTORY,
    "database-containment-receipt.json",
  );
  const receiptPath = path.join(INCIDENT_DIRECTORY, "containment-receipt.json");
  if (existsSync(databaseReceiptPath) || existsSync(receiptPath)) {
    throw new Error("Containment receipt already exists");
  }

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

  stage = "database-containment";
  const databaseReceipt = await sql.begin(async (transaction) => {
    await transaction`SET LOCAL lock_timeout = '15s'`;
    await transaction`SET LOCAL statement_timeout = '60s'`;
    await transaction`SET LOCAL pw7404.identity_merge = 'on'`;
    await transaction`LOCK TABLE agent_credentials IN SHARE ROW EXCLUSIVE MODE`;
    await transaction`LOCK TABLE agent_browser_sessions IN SHARE ROW EXCLUSIVE MODE`;
    await transaction`LOCK TABLE agents IN SHARE ROW EXCLUSIVE MODE`;

    const [identity] = await transaction`
      SELECT current_database() AS database,
             current_user AS role,
             inet_server_addr()::text AS address,
             inet_server_port()::int AS port,
             to_regclass('public.agent_credentials')::text AS credentials_table,
             to_regclass('public.agent_browser_sessions')::text AS sessions_table,
             to_regprocedure('public.pw7404_sync_agent_primary_credential()')::text AS sync_function
    `;
    if (
      identity?.database !== EXPECTED_DATABASE ||
      identity?.role !== EXPECTED_DATABASE_ROLE ||
      identity?.address !== EXPECTED_DATABASE_ADDRESS ||
      identity?.port !== EXPECTED_DATABASE_PORT ||
      identity?.credentials_table !== "agent_credentials" ||
      identity?.sessions_table !== "agent_browser_sessions" ||
      identity?.sync_function !== "pw7404_sync_agent_primary_credential()"
    ) {
      throw new Error("Production database identity or schema guard failed");
    }

    const [sentinel] = await transaction`
      SELECT id::text AS id, name
      FROM agents
      WHERE id = ${EXPECTED_SENTINEL_ID}::uuid
    `;
    if (
      sentinel?.id !== EXPECTED_SENTINEL_ID ||
      sentinel?.name !== EXPECTED_SENTINEL_NAME
    ) {
      throw new Error("Production sentinel guard failed");
    }

    const locked = await transaction`
      SELECT ac.id::text AS credential_id,
             ac.agent_id::text AS agent_id,
             ac.lookup_hash,
             ac.credential_family,
             ac.verifier_kind,
             a.name AS agent_name,
             a.api_key AS agent_lookup_mirror
      FROM agent_credentials ac
      JOIN agents a ON a.id = ac.agent_id
      WHERE ac.lookup_hash IN ${transaction(exposedLookups)}
        AND ac.revoked_at IS NULL
      ORDER BY ac.agent_id
      FOR UPDATE OF ac, a
    `;
    if (
      locked.length !== EXPECTED_COUNT ||
      new Set(locked.map((row) => row.agent_id)).size !== EXPECTED_COUNT ||
      locked.some(
        (row) =>
          row.credential_family !== "machine" ||
          row.verifier_kind !== "sha256_lookup" ||
          row.agent_lookup_mirror !== row.lookup_hash,
      )
    ) {
      throw new Error("Exposed credential mapping or authority set changed");
    }

    const byLookup = new Map(locked.map((row) => [row.lookup_hash, row]));
    const safeFallbacks = await transaction`
      SELECT id::text AS credential_id,
             agent_id::text AS agent_id,
             lookup_hash,
             verifier_hash,
             credential_family,
             verifier_kind
      FROM agent_credentials
      WHERE agent_id IN ${transaction(locked.map((row) => row.agent_id))}
        AND lookup_hash NOT IN ${transaction(exposedLookups)}
        AND revoked_at IS NULL
      ORDER BY agent_id
      FOR UPDATE
    `;
    if (
      safeFallbacks.length !== EXPECTED_COUNT ||
      new Set(safeFallbacks.map((row) => row.agent_id)).size !==
        EXPECTED_COUNT ||
      safeFallbacks.some(
        (row) =>
          row.credential_family !== "legacy" ||
          row.verifier_kind !== "legacy" ||
          typeof row.verifier_hash !== "string" ||
          row.verifier_hash.length === 0,
      )
    ) {
      throw new Error(
        "Expected one safe legacy fallback credential per resident",
      );
    }
    const fallbackByAgent = new Map(
      safeFallbacks.map((row) => [row.agent_id, row]),
    );
    for (const [sourceLabel, exposedValue] of sourceEntries) {
      const row = byLookup.get(digest(String(exposedValue)));
      if (
        !row ||
        !fallbackByAgent.has(row.agent_id) ||
        row.agent_name.toLocaleLowerCase("en-US") !==
          sourceLabel.toLocaleLowerCase("en-US")
      ) {
        throw new Error("Credential-to-resident identity guard failed");
      }
    }

    const [otherAuthorityBefore] = await transaction`
      SELECT count(*)::int AS count
      FROM agent_credentials
      WHERE agent_id IN ${transaction(locked.map((row) => row.agent_id))}
        AND revoked_at IS NULL
        AND lookup_hash NOT IN ${transaction(exposedLookups)}
    `;
    const sessionsRevoked = await transaction`
      UPDATE agent_browser_sessions
      SET revoked_at = now(), revocation_reason = 'public-credential-containment'
      WHERE credential_id IN ${transaction(
        locked.map((row) => row.credential_id),
      )}
        AND revoked_at IS NULL
      RETURNING id::text AS session_id
    `;
    const credentialsRevoked = await transaction`
      UPDATE agent_credentials
      SET revoked_at = now(), label = 'public-git-exposure-revoked-pw1077'
      WHERE id IN ${transaction(locked.map((row) => row.credential_id))}
        AND revoked_at IS NULL
      RETURNING id::text AS credential_id
    `;
    if (credentialsRevoked.length !== EXPECTED_COUNT) {
      throw new Error("Exposed credential revocation count is incomplete");
    }

    for (const row of locked) {
      const fallback = fallbackByAgent.get(row.agent_id);
      await transaction`
        UPDATE agents
        SET api_key = ${fallback.lookup_hash}, api_key_hash = ${fallback.verifier_hash}
        WHERE id = ${row.agent_id}::uuid
      `;
    }

    const [postflight] = await transaction`
      SELECT
        (SELECT count(*)::int FROM agent_credentials
          WHERE lookup_hash IN ${transaction(
            exposedLookups,
          )} AND revoked_at IS NULL
        ) AS exposed_active,
        (SELECT count(*)::int FROM agents
          WHERE api_key IN ${transaction(exposedLookups)}
        ) AS exposed_mirrors,
        (SELECT count(*)::int
          FROM agents a
          JOIN agent_credentials c
            ON c.agent_id = a.id
           AND c.lookup_hash = a.api_key
           AND c.revoked_at IS NULL
          WHERE a.id IN ${transaction(locked.map((row) => row.agent_id))}
        ) AS safe_primary_mirrors,
        (SELECT count(*)::int FROM agent_browser_sessions
          WHERE credential_id IN ${transaction(
            locked.map((row) => row.credential_id),
          )}
            AND revoked_at IS NULL
        ) AS exposed_sessions,
        (SELECT count(*)::int FROM agent_credentials
          WHERE agent_id IN ${transaction(locked.map((row) => row.agent_id))}
            AND revoked_at IS NULL
            AND lookup_hash NOT IN ${transaction(exposedLookups)}
        ) AS other_authority_after
    `;
    if (
      postflight.exposed_active !== 0 ||
      postflight.exposed_mirrors !== 0 ||
      postflight.safe_primary_mirrors !== EXPECTED_COUNT ||
      postflight.exposed_sessions !== 0 ||
      postflight.other_authority_after !== otherAuthorityBefore.count
    ) {
      throw new Error("Transactional containment postflight failed");
    }

    return {
      exposedCredentialsRevoked: credentialsRevoked.length,
      browserSessionsRevoked: sessionsRevoked.length,
      distinctResidents: locked.length,
      otherActiveCredentialsPreserved: postflight.other_authority_after,
      exposedActiveAfter: postflight.exposed_active,
      exposedMirrorsAfter: postflight.exposed_mirrors,
      safePrimaryMirrors: postflight.safe_primary_mirrors,
      exposedSessionsAfter: postflight.exposed_sessions,
    };
  });

  stage = "database-receipt";
  const committedReceipt = {
    provenance: "PW7404-1077",
    phase: "DB_COMMITTED",
    completedAt: new Date().toISOString(),
    exposedCredentialsRevoked: databaseReceipt.exposedCredentialsRevoked,
    distinctResidents: databaseReceipt.distinctResidents,
    browserSessionsRevoked: databaseReceipt.browserSessionsRevoked,
    otherActiveCredentialsPreserved:
      databaseReceipt.otherActiveCredentialsPreserved,
    exposedActiveAfter: databaseReceipt.exposedActiveAfter,
    exposedMirrorsAfter: databaseReceipt.exposedMirrorsAfter,
    safePrimaryMirrors: databaseReceipt.safePrimaryMirrors,
    exposedSessionsAfter: databaseReceipt.exposedSessionsAfter,
    plaintextValuesLogged: 0,
  };
  writeExclusiveJson(databaseReceiptPath, committedReceipt, 0o600);
  fsyncDirectory(INCIDENT_DIRECTORY);

  stage = "plaintext-file-removal";
  const quarantinedFilePath = path.join(
    INCIDENT_DIRECTORY,
    ".machine_keys.compromised.json",
  );
  if (existsSync(quarantinedFilePath))
    throw new Error("Quarantined key file already exists");
  renameSync(KEY_FILE_PATH, quarantinedFilePath);
  chmodSync(quarantinedFilePath, 0o600);
  fsyncDirectory(path.dirname(KEY_FILE_PATH));
  fsyncDirectory(INCIDENT_DIRECTORY);

  stage = "receipt";
  const receipt = {
    ...committedReceipt,
    phase: "FILE_REMOVED",
    completedAt: new Date().toISOString(),
    publicRepository: "MONKEEJUMP/spacebot-space",
    publicRepositoryVisibility: "PUBLIC",
    productionPlaintextFileRemoved: !existsSync(KEY_FILE_PATH),
  };
  writeExclusiveJson(receiptPath, receipt, 0o600);
  fsyncDirectory(INCIDENT_DIRECTORY);
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
