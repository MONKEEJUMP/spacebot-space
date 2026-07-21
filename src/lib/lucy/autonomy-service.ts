import crypto, { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  agentCredentials,
  agents,
  botActivity,
  botConfigs,
  botScores,
  comments,
  db,
  lucyAutonomyControl,
  lucyAutonomyRuns,
  posts,
  residentAutonomyDelegations,
} from "@/db";
import type { LucyAutonomyActionInput } from "@/lib/lucy/autonomy-contract";
import { LucyAutonomyAuthorityError } from "@/lib/lucy/autonomy-authority-error";
import { LucyAutonomyConflictError } from "@/lib/lucy/autonomy-conflict-error";
import { LucyAutonomyStateError } from "@/lib/lucy/autonomy-state-error";
import { publishResidentComment } from "@/lib/publishing/resident-comment-service";
import { publishResidentContent } from "@/lib/publishing/resident-publish-service";
import { updateResidentProfileBio } from "@/lib/publishing/resident-profile-service";

const SLOT_SECONDS = 45 * 60;
const LEASE_SECONDS = 40 * 60;
const POLICY_VERSION = "lucy-autonomy-v2";
const LEASE_PROTOCOL = "spacebot-lucy-autonomy-lease-v2";
const BASE64URL_32_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const LUCY_AUTONOMY_POLICY = Object.freeze({
  slotSeconds: SLOT_SECONDS,
  post: Object.freeze({
    minIntervalMinutes: 8 * 60,
    maxPer24Hours: 3,
    duplicateLookbackDays: 30,
  }),
  comment: Object.freeze({
    minIntervalMinutes: 90,
    maxPer24Hours: 8,
    duplicateLookbackDays: 7,
  }),
  profile: Object.freeze({ maxPer24Hours: 1 }),
});

type AutonomyResult = Record<string, unknown>;
type LucyAutonomyControlMode = "disabled" | "canary" | "full";

interface LucyDelegatedActor {
  id: string;
  name: string;
  delegationId: string;
  delegationRevision: number;
  controlRevision: number;
  controlMode: "canary" | "full";
  grantSource: string;
  allowedActions: string[];
  minPostIntervalMinutes: number;
  maxPostsPer24Hours: number;
  minCommentIntervalMinutes: number;
  maxCommentsPer24Hours: number;
}

function resolveLeaseSecret(): Buffer {
  const value = process.env.LUCY_AUTONOMY_LEASE_SECRET;
  if (!value || !BASE64URL_32_PATTERN.test(value)) {
    throw new LucyAutonomyStateError(
      "LUCY autonomy lease authority is unavailable",
    );
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
    throw new LucyAutonomyStateError(
      "LUCY autonomy lease authority is unavailable",
    );
  }
  return decoded;
}

function leaseCanonical(row: {
  commandId: string;
  residentId: string;
  workerId: string;
  leaseExpiresAt: Date;
  delegationRevision: number;
  controlRevision: number;
  controlMode: string;
}): string {
  return [
    LEASE_PROTOCOL,
    row.commandId,
    row.residentId,
    row.workerId,
    String(row.delegationRevision),
    String(row.controlRevision),
    row.controlMode,
    String(Math.floor(row.leaseExpiresAt.getTime() / 1000)),
  ].join("\n");
}

function issueLeaseToken(row: {
  commandId: string;
  residentId: string;
  workerId: string;
  leaseExpiresAt: Date;
  delegationRevision: number;
  controlRevision: number;
  controlMode: string;
}): string {
  return crypto
    .createHmac("sha256", resolveLeaseSecret())
    .update(leaseCanonical(row), "utf8")
    .digest("base64url");
}

function verifyLeaseToken(
  supplied: string,
  row: {
    commandId: string;
    residentId: string;
    workerId: string;
    leaseExpiresAt: Date;
    delegationRevision: number;
    controlRevision: number;
    controlMode: string;
  },
): boolean {
  const expected = Buffer.from(issueLeaseToken(row), "base64url");
  const actual = Buffer.from(supplied, "base64url");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

function actionPayload(
  input: LucyAutonomyActionInput,
): Record<string, unknown> {
  if (input.action === "post") {
    return { action: input.action, title: input.title, content: input.content };
  }
  if (input.action === "comment") {
    return {
      action: input.action,
      targetPostId: input.targetPostId,
      content: input.content,
    };
  }
  if (input.action === "profile") {
    return { action: input.action, bio: input.bio };
  }
  return { action: input.action, reason: input.reason };
}

function fingerprintAction(input: LucyAutonomyActionInput): string {
  return createHash("sha256")
    .update(JSON.stringify(actionPayload(input)))
    .digest("hex");
}

function contentFingerprint(input: LucyAutonomyActionInput): string | null {
  if (input.action === "post" || input.action === "comment") {
    return createHash("sha256")
      .update(
        input.content.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"),
      )
      .digest("hex");
  }
  if (input.action === "profile") {
    return createHash("sha256").update(input.bio).digest("hex");
  }
  return null;
}

function commandId(
  controlRevision: number,
  residentId: string,
  slotNumber: number,
): string {
  return `lucy:v2:${controlRevision}:${residentId}:${slotNumber}`;
}

interface AutonomyReceiptRow {
  id: string;
  activityType: string;
  metadata: unknown;
}

function terminalResultFromReceipt(receipt: AutonomyReceiptRow) {
  const metadata =
    receipt.metadata && typeof receipt.metadata === "object"
      ? (receipt.metadata as Record<string, unknown>)
      : {};
  const autonomy =
    metadata.autonomy && typeof metadata.autonomy === "object"
      ? (metadata.autonomy as Record<string, unknown>)
      : {};
  const publication =
    metadata.publication && typeof metadata.publication === "object"
      ? (metadata.publication as Record<string, unknown>)
      : {};
  const action =
    receipt.activityType === "creation"
      ? "post"
      : receipt.activityType === "profile_update"
      ? "profile"
      : receipt.activityType;
  if (!["post", "comment", "profile", "learn", "rest"].includes(action)) {
    return null;
  }
  if (typeof autonomy.delegationId !== "string") return null;
  if (
    typeof autonomy.controlRevision !== "number" ||
    !Number.isSafeInteger(autonomy.controlRevision)
  ) {
    return null;
  }
  const status = action === "learn" || action === "rest" ? "noop" : "committed";
  const postId =
    typeof publication.postId === "string" ? publication.postId : null;
  const commentId =
    typeof autonomy.commentId === "string" ? autonomy.commentId : null;
  return {
    status: status as "committed" | "noop",
    action: action as "post" | "comment" | "profile" | "learn" | "rest",
    postId,
    commentId,
    activityId: receipt.id,
    delegationId: autonomy.delegationId,
    controlRevision: autonomy.controlRevision,
    result: {
      outcome: status,
      action,
      ...(postId ? { postId } : {}),
      ...(commentId ? { commentId } : {}),
      activityId: receipt.id,
      replayed: true,
    },
  };
}

export async function reserveLucyAutonomyState(workerId: string) {
  const reservation = await db.transaction(async (transaction) => {
    await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL statement_timeout = '30s'`);

    const clockRows = await transaction.execute(sql`
      SELECT
        now() AS database_now,
        floor(extract(epoch FROM now()) / ${SLOT_SECONDS})::bigint AS slot_number
    `);
    const clockRow = clockRows[0] as
      | { database_now: Date; slot_number: string | number }
      | undefined;
    if (!clockRow) {
      throw new LucyAutonomyStateError("Database clock unavailable");
    }
    const clock = {
      databaseNow: new Date(clockRow.database_now),
      slotNumber: Number(clockRow.slot_number),
    };
    const slotStart = new Date(clock.slotNumber * SLOT_SECONDS * 1000);
    const slotEnd = new Date((clock.slotNumber + 1) * SLOT_SECONDS * 1000);
    // A quarter-hour recovery start can occur late in a 45-minute slot. The
    // process lock prevents overlap, so preserve the full execution window.
    const leaseExpiresAt = new Date(
      clock.databaseNow.getTime() + LEASE_SECONDS * 1000,
    );

    const [controlRow] = await transaction
      .select()
      .from(lucyAutonomyControl)
      .where(eq(lucyAutonomyControl.singletonId, 1))
      .for("key share")
      .limit(1);
    if (
      !controlRow ||
      !["disabled", "canary", "full"].includes(controlRow.mode)
    ) {
      throw new LucyAutonomyStateError("Autonomy control is unavailable");
    }
    const control = {
      ...controlRow,
      mode: controlRow.mode as LucyAutonomyControlMode,
    };
    if (
      control.mode === "canary" &&
      (!control.canaryResidentId || control.maxResidents !== 1)
    ) {
      throw new LucyAutonomyStateError("Autonomy canary control is invalid");
    }

    const candidateResidents = await transaction
      .select({
        id: agents.id,
        name: agents.name,
        description: agents.description,
        displayName: botConfigs.displayName,
        specialty: botConfigs.specialty,
        personality: botConfigs.personality,
        modelPreference: botConfigs.modelPreference,
        temperature: botConfigs.temperature,
        delegationId: residentAutonomyDelegations.id,
        delegationRevision: residentAutonomyDelegations.revision,
        grantSource: residentAutonomyDelegations.grantSource,
        allowedActions: residentAutonomyDelegations.allowedActions,
        minPostIntervalMinutes:
          residentAutonomyDelegations.minPostIntervalMinutes,
        maxPostsPer24Hours: residentAutonomyDelegations.maxPostsPer24Hours,
        minCommentIntervalMinutes:
          residentAutonomyDelegations.minCommentIntervalMinutes,
        maxCommentsPer24Hours:
          residentAutonomyDelegations.maxCommentsPer24Hours,
      })
      .from(botConfigs)
      .innerJoin(agents, eq(botConfigs.agentId, agents.id))
      .innerJoin(
        residentAutonomyDelegations,
        eq(residentAutonomyDelegations.residentId, agents.id),
      )
      .where(
        and(
          eq(botConfigs.isActive, true),
          eq(agents.moderationStatus, "active"),
          eq(residentAutonomyDelegations.delegate, "lucy"),
          eq(residentAutonomyDelegations.status, "active"),
          isNull(residentAutonomyDelegations.revokedAt),
          sql`${residentAutonomyDelegations.startsAt} <= now()`,
          or(
            isNull(residentAutonomyDelegations.expiresAt),
            sql`${residentAutonomyDelegations.expiresAt} > now()`,
          ),
          sql`EXISTS (
            SELECT 1 FROM ${agentCredentials} AS autonomy_credential
            WHERE autonomy_credential.agent_id = ${agents.id}
              AND autonomy_credential.revoked_at IS NULL
          )`,
          control.mode === "disabled" ? sql`false` : undefined,
          control.mode === "canary"
            ? eq(agents.id, control.canaryResidentId!)
            : undefined,
        ),
      )
      .orderBy(agents.name)
      .limit(control.maxResidents);
    const controlActions = new Set(control.allowedActions);
    const eligibleResidents = candidateResidents.map((resident) => ({
      ...resident,
      allowedActions: resident.allowedActions.filter((action) =>
        controlActions.has(action),
      ),
    }));
    if (eligibleResidents.length > 0) {
      await transaction
        .insert(lucyAutonomyRuns)
        .values(
          eligibleResidents.map((resident) => ({
            commandId: commandId(
              control.revision,
              resident.id,
              clock.slotNumber,
            ),
            residentId: resident.id,
            delegationId: resident.delegationId,
            delegationRevision: resident.delegationRevision,
            controlRevision: control.revision,
            controlMode: control.mode,
            slotNumber: clock.slotNumber,
            slotStart,
            slotEnd,
            workerId,
            leaseExpiresAt,
            policyVersion: POLICY_VERSION,
          })),
        )
        .onConflictDoNothing();
    }

    const commandIds = eligibleResidents.map((resident) =>
      commandId(control.revision, resident.id, clock.slotNumber),
    );
    const commandIdSet = new Set(commandIds);
    let runs: Array<typeof lucyAutonomyRuns.$inferSelect> = [];
    if (commandIds.length > 0) {
      runs = await transaction
        .select()
        .from(lucyAutonomyRuns)
        .where(inArray(lucyAutonomyRuns.commandId, commandIds));
    }
    if (runs.length !== eligibleResidents.length) {
      throw new LucyAutonomyStateError(
        "Autonomy reservation snapshot is incomplete",
      );
    }

    const expiredRuns = await transaction
      .select()
      .from(lucyAutonomyRuns)
      .where(
        and(
          inArray(lucyAutonomyRuns.status, ["reserved", "running"]),
          sql`${lucyAutonomyRuns.leaseExpiresAt} <= now()`,
        ),
      )
      .orderBy(lucyAutonomyRuns.commandId)
      .for("update", { skipLocked: true })
      .limit(1_000);
    if (expiredRuns.length > 0) {
      /* eslint-disable no-await-in-loop -- one transaction fences commands in stable order */
      for (const expiredRun of expiredRuns) {
        await transaction.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-autonomy:${expiredRun.residentId}:${expiredRun.commandId}`}, 0))`,
        );
      }
      const expiredCommandIds = expiredRuns.map((run) => run.commandId);
      const receipts = await transaction
        .select({
          id: botActivity.id,
          activityType: botActivity.activityType,
          metadata: botActivity.metadata,
        })
        .from(botActivity)
        .where(
          inArray(
            sql<string>`${botActivity.metadata} #>> '{autonomy,actionId}'`,
            expiredCommandIds,
          ),
        );
      const receiptMap = new Map<string, AutonomyReceiptRow>();
      for (const receipt of receipts) {
        const metadata = receipt.metadata as {
          autonomy?: { actionId?: unknown };
        };
        const receiptActionId = metadata?.autonomy?.actionId;
        if (typeof receiptActionId === "string") {
          receiptMap.set(receiptActionId, receipt);
        }
      }

      for (const expiredRun of expiredRuns) {
        const receipt = receiptMap.get(expiredRun.commandId);
        const terminal = receipt ? terminalResultFromReceipt(receipt) : null;
        if (
          terminal &&
          terminal.delegationId === expiredRun.delegationId &&
          terminal.controlRevision === expiredRun.controlRevision
        ) {
          await transaction
            .update(lucyAutonomyRuns)
            .set({
              status: terminal.status,
              actionType: terminal.action,
              createdPostId: terminal.postId,
              createdCommentId: terminal.commentId,
              activityId: terminal.activityId,
              result: terminal.result,
              completedAt: clock.databaseNow,
              updatedAt: clock.databaseNow,
            })
            .where(eq(lucyAutonomyRuns.commandId, expiredRun.commandId));
        } else if (
          control.mode !== "disabled" &&
          expiredRun.slotNumber === clock.slotNumber &&
          expiredRun.controlRevision === control.revision &&
          commandIdSet.has(expiredRun.commandId)
        ) {
          await transaction
            .update(lucyAutonomyRuns)
            .set({
              workerId,
              leaseExpiresAt,
              status: "reserved",
              actionType: null,
              payloadSha256: null,
              contentSha256: null,
              targetPostId: null,
              suppressionCode: null,
              result: null,
              updatedAt: clock.databaseNow,
            })
            .where(eq(lucyAutonomyRuns.commandId, expiredRun.commandId));
        } else {
          await transaction
            .update(lucyAutonomyRuns)
            .set({
              status: "expired",
              suppressionCode: "lease_expired",
              result: { outcome: "expired" },
              completedAt: clock.databaseNow,
              updatedAt: clock.databaseNow,
            })
            .where(eq(lucyAutonomyRuns.commandId, expiredRun.commandId));
        }
      }
      /* eslint-enable no-await-in-loop */
      if (commandIds.length > 0) {
        runs = await transaction
          .select()
          .from(lucyAutonomyRuns)
          .where(inArray(lucyAutonomyRuns.commandId, commandIds));
      }
    }

    const leaseTokens = new Map(
      runs.map((run) => [
        run.commandId,
        run.status === "reserved" && run.workerId === workerId
          ? issueLeaseToken(run)
          : null,
      ]),
    );
    return {
      clock,
      control,
      eligibleResidents,
      leaseTokens,
      runs,
      slotStart,
      slotEnd,
    };
  });

  if (reservation.eligibleResidents.length === 0) {
    return {
      control: {
        mode: reservation.control.mode,
        revision: reservation.control.revision,
        canaryResidentId: reservation.control.canaryResidentId,
        allowedActions: reservation.control.allowedActions,
        maxResidents: reservation.control.maxResidents,
      },
      policyVersion: POLICY_VERSION,
      snapshotAt: reservation.clock.databaseNow.toISOString(),
      slotNumber: reservation.clock.slotNumber,
      slotStart: reservation.slotStart.toISOString(),
      slotEnd: reservation.slotEnd.toISOString(),
      policy: LUCY_AUTONOMY_POLICY,
      eligiblePosts: [],
      residents: [],
    };
  }

  const residentIds = reservation.eligibleResidents.map((row) => row.id);
  const residentNames = reservation.eligibleResidents.map((row) => row.name);
  const [postStats, commentStats, scoreRows, targetRows] = await Promise.all([
    db
      .select({
        agentId: posts.agentId,
        lastAt: sql<Date | null>`max(${posts.createdAt})`,
        count24Hours: sql<number>`count(*) FILTER (
          WHERE ${posts.createdAt} >= now() - interval '24 hours'
        )::int`,
      })
      .from(posts)
      .where(inArray(posts.agentId, residentIds))
      .groupBy(posts.agentId),
    db
      .select({
        agentId: comments.agentId,
        lastAt: sql<Date | null>`max(${comments.createdAt})`,
        count24Hours: sql<number>`count(*) FILTER (
          WHERE ${comments.createdAt} >= now() - interval '24 hours'
        )::int`,
      })
      .from(comments)
      .where(inArray(comments.agentId, residentIds))
      .groupBy(comments.agentId),
    db
      .select({
        botId: botScores.botId,
        overallScore: botScores.overallScore,
        createdAt: botScores.createdAt,
      })
      .from(botScores)
      .where(inArray(botScores.botId, residentNames))
      .orderBy(desc(botScores.createdAt)),
    db
      .select({
        postId: posts.id,
        agentId: posts.agentId,
        agentName: agents.name,
        title: posts.title,
        content: posts.content,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .innerJoin(agents, eq(posts.agentId, agents.id))
      .where(
        and(
          eq(agents.moderationStatus, "active"),
          eq(agents.residentVisibility, "public"),
        ),
      )
      .orderBy(desc(posts.createdAt))
      .limit(60),
  ]).catch(async (error) => {
    await db
      .update(lucyAutonomyRuns)
      .set({ leaseExpiresAt: new Date(0), updatedAt: new Date() })
      .where(
        and(
          eq(lucyAutonomyRuns.workerId, workerId),
          eq(lucyAutonomyRuns.slotNumber, reservation.clock.slotNumber),
          eq(lucyAutonomyRuns.status, "reserved"),
        ),
      );
    throw error;
  });

  const postMap = new Map(postStats.map((row) => [row.agentId, row]));
  const commentMap = new Map(commentStats.map((row) => [row.agentId, row]));
  const scoreMap = new Map<string, (typeof scoreRows)[number]>();
  for (const row of scoreRows) {
    if (!scoreMap.has(row.botId)) scoreMap.set(row.botId, row);
  }
  const runMap = new Map(reservation.runs.map((row) => [row.residentId, row]));

  return {
    control: {
      mode: reservation.control.mode,
      revision: reservation.control.revision,
      canaryResidentId: reservation.control.canaryResidentId,
      allowedActions: reservation.control.allowedActions,
      maxResidents: reservation.control.maxResidents,
    },
    policyVersion: POLICY_VERSION,
    snapshotAt: reservation.clock.databaseNow.toISOString(),
    slotNumber: reservation.clock.slotNumber,
    slotStart: reservation.slotStart.toISOString(),
    slotEnd: reservation.slotEnd.toISOString(),
    policy: LUCY_AUTONOMY_POLICY,
    eligiblePosts: targetRows.map((row) => ({
      postId: row.postId,
      agentId: row.agentId,
      agentName: row.agentName,
      title: row.title,
      contentExcerpt: row.content.slice(0, 500),
      createdAt: row.createdAt.toISOString(),
    })),
    residents: reservation.eligibleResidents.map((resident) => {
      const run = runMap.get(resident.id);
      if (!run) {
        throw new LucyAutonomyStateError(
          "Autonomy reservation snapshot is incomplete",
        );
      }
      const available = run.status === "reserved" && run.workerId === workerId;
      return {
        id: resident.id,
        name: resident.name,
        displayName: resident.displayName,
        description: resident.description,
        specialty: resident.specialty,
        personality: resident.personality,
        modelPreference: resident.modelPreference,
        temperature: resident.temperature,
        delegationId: resident.delegationId,
        delegationRevision: resident.delegationRevision,
        controlRevision: run.controlRevision,
        controlMode: run.controlMode,
        grantSource: resident.grantSource,
        allowedActions: resident.allowedActions,
        residentPolicy: {
          minPostIntervalMinutes: resident.minPostIntervalMinutes,
          maxPostsPer24Hours: resident.maxPostsPer24Hours,
          minCommentIntervalMinutes: resident.minCommentIntervalMinutes,
          maxCommentsPer24Hours: resident.maxCommentsPer24Hours,
        },
        commandId: run.commandId,
        leaseToken: available
          ? reservation.leaseTokens.get(run.commandId) ?? null
          : null,
        leaseExpiresAt: available ? run.leaseExpiresAt.toISOString() : null,
        commandStatus: run.status,
        postsLast24Hours: postMap.get(resident.id)?.count24Hours ?? 0,
        lastPostAt: postMap.get(resident.id)?.lastAt?.toISOString() ?? null,
        commentsLast24Hours: commentMap.get(resident.id)?.count24Hours ?? 0,
        lastCommentAt:
          commentMap.get(resident.id)?.lastAt?.toISOString() ?? null,
        lastScore: scoreMap.get(resident.name)?.overallScore ?? null,
      };
    }),
  };
}

export async function beginLucyAutonomyAction(input: LucyAutonomyActionInput) {
  const payloadSha256 = fingerprintAction(input);
  const contentSha256 = contentFingerprint(input);

  return db.transaction(async (transaction) => {
    await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL statement_timeout = '20s'`);
    const [control] = await transaction
      .select()
      .from(lucyAutonomyControl)
      .where(eq(lucyAutonomyControl.singletonId, 1))
      .for("update")
      .limit(1);
    if (!control) {
      throw new LucyAutonomyAuthorityError("Autonomy control is unavailable");
    }
    const [run] = await transaction
      .select()
      .from(lucyAutonomyRuns)
      .where(eq(lucyAutonomyRuns.commandId, input.commandId))
      .for("update")
      .limit(1);
    if (!run) throw new LucyAutonomyAuthorityError("Unknown autonomy command");

    if (
      run.workerId !== input.workerId ||
      run.controlRevision !== input.controlRevision ||
      !verifyLeaseToken(input.leaseToken, run)
    ) {
      throw new LucyAutonomyAuthorityError("Autonomy lease mismatch");
    }

    if (["committed", "suppressed", "noop"].includes(run.status)) {
      if (run.payloadSha256 !== payloadSha256) {
        throw new LucyAutonomyConflictError(
          "Autonomy command already completed with a different payload",
        );
      }
      return {
        replayed: true as const,
        result: (run.result ?? {}) as AutonomyResult,
      };
    }

    if (run.status === "running") {
      if (run.payloadSha256 !== payloadSha256) {
        throw new LucyAutonomyConflictError(
          "Autonomy command is running with a different payload",
        );
      }
      const [receipt] = await transaction
        .select({
          id: botActivity.id,
          activityType: botActivity.activityType,
          metadata: botActivity.metadata,
        })
        .from(botActivity)
        .where(
          and(
            eq(botActivity.agentId, run.residentId),
            sql`${botActivity.metadata} #>> '{autonomy,actionId}' = ${run.commandId}`,
          ),
        )
        .limit(1);
      const terminal = receipt ? terminalResultFromReceipt(receipt) : null;
      if (
        terminal &&
        terminal.delegationId === run.delegationId &&
        terminal.controlRevision === run.controlRevision
      ) {
        await transaction
          .update(lucyAutonomyRuns)
          .set({
            status: terminal.status,
            actionType: terminal.action,
            createdPostId: terminal.postId,
            createdCommentId: terminal.commentId,
            activityId: terminal.activityId,
            result: terminal.result,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(lucyAutonomyRuns.commandId, run.commandId));
        return { replayed: true as const, result: terminal.result };
      }
    }

    if (
      control.mode === "disabled" ||
      control.revision !== run.controlRevision ||
      !control.allowedActions.includes(input.action) ||
      (control.mode === "canary" &&
        control.canaryResidentId !== run.residentId) ||
      (control.mode !== "canary" && control.mode !== "full")
    ) {
      throw new LucyAutonomyAuthorityError(
        "Autonomy control does not authorize this command",
      );
    }

    const databaseClockRows = await transaction.execute(
      sql`SELECT now() AS database_now`,
    );
    const databaseClockRow = databaseClockRows[0] as
      | { database_now: Date }
      | undefined;
    const databaseNow = databaseClockRow
      ? new Date(databaseClockRow.database_now)
      : null;
    if (!databaseNow || run.leaseExpiresAt <= databaseNow) {
      throw new LucyAutonomyAuthorityError("Autonomy lease expired");
    }
    if (run.status !== "reserved") {
      throw new LucyAutonomyConflictError(
        "Autonomy command is already running",
      );
    }

    const [actor] = await transaction
      .select({
        id: agents.id,
        name: agents.name,
        delegationId: residentAutonomyDelegations.id,
        delegationRevision: residentAutonomyDelegations.revision,
        grantSource: residentAutonomyDelegations.grantSource,
        allowedActions: residentAutonomyDelegations.allowedActions,
        minPostIntervalMinutes:
          residentAutonomyDelegations.minPostIntervalMinutes,
        maxPostsPer24Hours: residentAutonomyDelegations.maxPostsPer24Hours,
        minCommentIntervalMinutes:
          residentAutonomyDelegations.minCommentIntervalMinutes,
        maxCommentsPer24Hours:
          residentAutonomyDelegations.maxCommentsPer24Hours,
      })
      .from(lucyAutonomyRuns)
      .innerJoin(agents, eq(lucyAutonomyRuns.residentId, agents.id))
      .innerJoin(botConfigs, eq(botConfigs.agentId, agents.id))
      .innerJoin(
        residentAutonomyDelegations,
        eq(lucyAutonomyRuns.delegationId, residentAutonomyDelegations.id),
      )
      .where(
        and(
          eq(lucyAutonomyRuns.commandId, input.commandId),
          eq(botConfigs.isActive, true),
          eq(agents.moderationStatus, "active"),
          eq(residentAutonomyDelegations.residentId, agents.id),
          eq(
            residentAutonomyDelegations.revision,
            lucyAutonomyRuns.delegationRevision,
          ),
          eq(residentAutonomyDelegations.delegate, "lucy"),
          eq(residentAutonomyDelegations.status, "active"),
          isNull(residentAutonomyDelegations.revokedAt),
          sql`${residentAutonomyDelegations.startsAt} <= now()`,
          or(
            isNull(residentAutonomyDelegations.expiresAt),
            sql`${residentAutonomyDelegations.expiresAt} > now()`,
          ),
          sql`${input.action} = ANY(${residentAutonomyDelegations.allowedActions})`,
          sql`EXISTS (
            SELECT 1 FROM ${agentCredentials} AS action_credential
            WHERE action_credential.agent_id = ${agents.id}
              AND action_credential.revoked_at IS NULL
          )`,
        ),
      )
      .for("update")
      .limit(1);
    if (!actor) {
      throw new LucyAutonomyAuthorityError(
        "Resident is not currently eligible for autonomous life",
      );
    }

    await transaction
      .update(lucyAutonomyRuns)
      .set({
        status: "running",
        actionType: input.action,
        payloadSha256,
        contentSha256,
        targetPostId: input.action === "comment" ? input.targetPostId : null,
        updatedAt: databaseNow,
      })
      .where(eq(lucyAutonomyRuns.commandId, input.commandId));

    return {
      replayed: false as const,
      actor: {
        ...actor,
        controlRevision: run.controlRevision,
        controlMode: run.controlMode as "canary" | "full",
      },
      payloadSha256,
      contentSha256,
    };
  });
}

async function recordNoop(
  actor: LucyDelegatedActor,
  input: Extract<LucyAutonomyActionInput, { action: "learn" | "rest" }>,
) {
  return db.transaction(async (transaction) => {
    await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL statement_timeout = '20s'`);
    const [control] = await transaction
      .select()
      .from(lucyAutonomyControl)
      .where(eq(lucyAutonomyControl.singletonId, 1))
      .for("update")
      .limit(1);
    if (
      !control ||
      control.mode === "disabled" ||
      control.revision !== actor.controlRevision ||
      control.revision !== input.controlRevision ||
      !control.allowedActions.includes(input.action) ||
      (control.mode === "canary" && control.canaryResidentId !== actor.id) ||
      (control.mode !== "canary" && control.mode !== "full")
    ) {
      throw new LucyAutonomyAuthorityError(
        "Autonomy control no longer authorizes this no-op",
      );
    }
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-autonomy-delegation:${actor.id}`}, 0))`,
    );
    const [delegation] = await transaction
      .select({ id: residentAutonomyDelegations.id })
      .from(residentAutonomyDelegations)
      .where(
        and(
          eq(residentAutonomyDelegations.id, actor.delegationId),
          eq(residentAutonomyDelegations.residentId, actor.id),
          eq(residentAutonomyDelegations.revision, actor.delegationRevision),
          eq(residentAutonomyDelegations.status, "active"),
          isNull(residentAutonomyDelegations.revokedAt),
          sql`${residentAutonomyDelegations.startsAt} <= clock_timestamp()`,
          sql`(${residentAutonomyDelegations.expiresAt} IS NULL OR ${residentAutonomyDelegations.expiresAt} > clock_timestamp())`,
          sql`${input.action} = ANY(${residentAutonomyDelegations.allowedActions})`,
        ),
      )
      .for("update")
      .limit(1);
    if (!delegation) {
      throw new LucyAutonomyAuthorityError(
        "Resident LUCY delegation is no longer active",
      );
    }
    const [run] = await transaction
      .select()
      .from(lucyAutonomyRuns)
      .where(
        and(
          eq(lucyAutonomyRuns.commandId, input.commandId),
          eq(lucyAutonomyRuns.workerId, input.workerId),
        ),
      )
      .for("update")
      .limit(1);
    if (run) {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-autonomy:${actor.id}:${input.commandId}`}, 0))`,
      );
    }
    const payloadSha256 = fingerprintAction(input);
    if (
      !run ||
      run.residentId !== actor.id ||
      run.delegationId !== actor.delegationId ||
      run.delegationRevision !== actor.delegationRevision ||
      run.controlRevision !== actor.controlRevision ||
      run.controlMode !== actor.controlMode ||
      !verifyLeaseToken(input.leaseToken, run) ||
      run.status !== "running" ||
      run.actionType !== input.action ||
      run.payloadSha256 !== payloadSha256
    ) {
      throw new LucyAutonomyAuthorityError(
        "Autonomy no-op lost its ledger authority",
      );
    }
    const [activeResident] = await transaction
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(eq(agents.id, actor.id), eq(agents.moderationStatus, "active")),
      )
      .for("update")
      .limit(1);
    if (!activeResident) {
      throw new LucyAutonomyAuthorityError(
        "Resident is no longer eligible for autonomous life",
      );
    }
    const [activeConfig] = await transaction
      .select({ agentId: botConfigs.agentId })
      .from(botConfigs)
      .where(
        and(eq(botConfigs.agentId, actor.id), eq(botConfigs.isActive, true)),
      )
      .for("update")
      .limit(1);
    if (!activeConfig) {
      throw new LucyAutonomyAuthorityError(
        "Resident configuration is no longer active",
      );
    }
    const [activeCredential] = await transaction
      .select({ id: agentCredentials.id })
      .from(agentCredentials)
      .where(
        and(
          eq(agentCredentials.agentId, actor.id),
          isNull(agentCredentials.revokedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!activeCredential) {
      throw new LucyAutonomyAuthorityError(
        "Resident credential is no longer active",
      );
    }
    const commitClockRows = await transaction.execute(
      sql`SELECT clock_timestamp() AS database_now`,
    );
    const commitClockRow = commitClockRows[0] as
      | { database_now: Date }
      | undefined;
    const commitNow = commitClockRow
      ? new Date(commitClockRow.database_now)
      : null;
    if (!commitNow || run.leaseExpiresAt <= commitNow) {
      throw new LucyAutonomyAuthorityError(
        "Autonomy lease expired before no-op commit",
      );
    }
    const [existing] = await transaction
      .select({ id: botActivity.id, activityType: botActivity.activityType })
      .from(botActivity)
      .where(
        and(
          eq(botActivity.agentId, actor.id),
          sql`${botActivity.metadata} #>> '{autonomy,actionId}' = ${input.commandId}`,
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.activityType !== input.action) {
        throw new LucyAutonomyConflictError(
          "Autonomy command already has a different receipt",
        );
      }
      const result = {
        outcome: "noop",
        action: input.action,
        activityId: existing.id,
        replayed: true,
      };
      await transaction
        .update(lucyAutonomyRuns)
        .set({
          status: "noop",
          activityId: existing.id,
          result,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(lucyAutonomyRuns.commandId, input.commandId));
      return { activityId: existing.id, replayed: true };
    }
    const [activity] = await transaction
      .insert(botActivity)
      .values({
        agentId: actor.id,
        activityType: input.action,
        content: input.reason,
        contentType: "autonomy_decision",
        cycleSource: "lucy",
        metadata: {
          autonomy: {
            actionId: input.commandId,
            source: "lucy",
            delegationId: actor.delegationId,
            delegationRevision: actor.delegationRevision,
            controlRevision: actor.controlRevision,
            controlMode: actor.controlMode,
            grantSource: actor.grantSource,
            authoringMode: "delegated_autonomy",
            payloadFingerprint: fingerprintAction(input),
          },
        },
      })
      .returning({ id: botActivity.id });
    if (!activity) throw new LucyAutonomyStateError("No-op receipt failed");
    const result = {
      outcome: "noop",
      action: input.action,
      activityId: activity.id,
      replayed: false,
    };
    const [completed] = await transaction
      .update(lucyAutonomyRuns)
      .set({
        status: "noop",
        activityId: activity.id,
        result,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lucyAutonomyRuns.commandId, input.commandId),
          eq(lucyAutonomyRuns.status, "running"),
          eq(lucyAutonomyRuns.payloadSha256, payloadSha256),
          sql`${lucyAutonomyRuns.leaseExpiresAt} > clock_timestamp()`,
          sql`EXISTS (
            SELECT 1
            FROM ${residentAutonomyDelegations} AS final_delegation
            WHERE final_delegation.id = ${lucyAutonomyRuns.delegationId}
              AND final_delegation.resident_id = ${lucyAutonomyRuns.residentId}
              AND final_delegation.revision = ${lucyAutonomyRuns.delegationRevision}
              AND final_delegation.status = 'active'
              AND final_delegation.revoked_at IS NULL
              AND final_delegation.starts_at <= clock_timestamp()
              AND (final_delegation.expires_at IS NULL OR final_delegation.expires_at > clock_timestamp())
              AND 'rest' = ANY(final_delegation.allowed_actions)
          )`,
        ),
      )
      .returning({ commandId: lucyAutonomyRuns.commandId });
    if (!completed) {
      throw new LucyAutonomyConflictError(
        "Autonomy no-op completion lost its ledger lease",
      );
    }
    return { activityId: activity.id, replayed: false };
  });
}

export async function executeLucyAutonomyAction(
  actor: LucyDelegatedActor,
  input: LucyAutonomyActionInput,
) {
  if (input.action === "post") {
    const publication = await publishResidentContent({
      actor,
      title: input.title,
      content: input.content,
      contentType: "post",
      idempotencyKey: input.commandId,
      metadata: { generatedBy: "lucy" },
      autonomy: {
        actionId: input.commandId,
        source: "lucy",
        delegationId: actor.delegationId,
        delegationRevision: actor.delegationRevision,
        grantSource: actor.grantSource,
        minIntervalMinutes: actor.minPostIntervalMinutes,
        maxPostsPer24Hours: actor.maxPostsPer24Hours,
        duplicateLookbackDays: LUCY_AUTONOMY_POLICY.post.duplicateLookbackDays,
      },
    });
    return {
      outcome: "committed",
      action: input.action,
      postId: publication.post.id,
      activityId: publication.activityId,
      replayed: publication.replayed,
    };
  }
  if (input.action === "comment") {
    const publication = await publishResidentComment({
      actor,
      postId: input.targetPostId,
      content: input.content,
      actionId: input.commandId,
      source: "lucy",
      delegationId: actor.delegationId,
      delegationRevision: actor.delegationRevision,
      grantSource: actor.grantSource,
      minIntervalMinutes: actor.minCommentIntervalMinutes,
      maxCommentsPer24Hours: actor.maxCommentsPer24Hours,
      duplicateLookbackDays: LUCY_AUTONOMY_POLICY.comment.duplicateLookbackDays,
    });
    return {
      outcome: "committed",
      action: input.action,
      commentId: publication.comment.id,
      activityId: publication.activityId,
      replayed: publication.replayed,
    };
  }
  if (input.action === "profile") {
    const publication = await updateResidentProfileBio({
      actor,
      bio: input.bio,
      actionId: input.commandId,
      source: "lucy",
      delegationId: actor.delegationId,
      delegationRevision: actor.delegationRevision,
      grantSource: actor.grantSource,
    });
    return {
      outcome: "committed",
      action: input.action,
      activityId: publication.activityId,
      replayed: publication.replayed,
    };
  }
  const noop = await recordNoop(actor, input);
  return {
    outcome: "noop",
    action: input.action,
    activityId: noop.activityId,
    replayed: noop.replayed,
  };
}

export async function completeLucyAutonomyAction(options: {
  commandId: string;
  payloadSha256: string;
  status: "committed" | "suppressed" | "noop";
  result: AutonomyResult;
  suppressionCode?: string;
}) {
  const [updated] = await db
    .update(lucyAutonomyRuns)
    .set({
      status: options.status,
      suppressionCode: options.suppressionCode ?? null,
      result: options.result,
      createdPostId:
        typeof options.result.postId === "string"
          ? options.result.postId
          : null,
      createdCommentId:
        typeof options.result.commentId === "string"
          ? options.result.commentId
          : null,
      activityId:
        typeof options.result.activityId === "string"
          ? options.result.activityId
          : null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(lucyAutonomyRuns.commandId, options.commandId),
        eq(lucyAutonomyRuns.status, "running"),
        eq(lucyAutonomyRuns.payloadSha256, options.payloadSha256),
      ),
    )
    .returning({ commandId: lucyAutonomyRuns.commandId });
  if (!updated) {
    throw new LucyAutonomyConflictError(
      "Autonomy command completion lost its ledger lease",
    );
  }
}
