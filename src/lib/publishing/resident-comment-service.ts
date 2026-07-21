import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  agentCredentials,
  agents,
  botActivity,
  comments,
  db,
  posts,
  residentAutonomyDelegations,
} from "@/db";
import {
  ResidentAutonomySuppressedError,
  ResidentPublishAuthorizationError,
  ResidentPublishConflictError,
  ResidentPublishIntegrityError,
} from "@/lib/publishing/resident-publish-errors";

function fingerprintComment(postId: string, content: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ postId, content }))
    .digest("hex");
}

export async function publishResidentComment(options: {
  actor: { id: string; name: string };
  postId: string;
  content: string;
  actionId: string;
  source: "lucy";
  delegationId: string;
  delegationRevision: number;
  grantSource: string;
  minIntervalMinutes: number;
  maxCommentsPer24Hours: number;
  duplicateLookbackDays: number;
}): Promise<{
  comment: typeof comments.$inferSelect;
  activityId: string;
  replayed: boolean;
}> {
  const fingerprint = fingerprintComment(options.postId, options.content);

  return db.transaction(async (transaction) => {
    await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL statement_timeout = '20s'`);
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-autonomy-delegation:${options.actor.id}`}, 0))`,
    );
    const [delegation] = await transaction
      .select({ id: residentAutonomyDelegations.id })
      .from(residentAutonomyDelegations)
      .where(
        and(
          eq(residentAutonomyDelegations.id, options.delegationId),
          eq(residentAutonomyDelegations.residentId, options.actor.id),
          eq(residentAutonomyDelegations.revision, options.delegationRevision),
          eq(residentAutonomyDelegations.status, "active"),
          sql`${residentAutonomyDelegations.revokedAt} IS NULL`,
          sql`${residentAutonomyDelegations.startsAt} <= now()`,
          sql`(${residentAutonomyDelegations.expiresAt} IS NULL OR ${residentAutonomyDelegations.expiresAt} > now())`,
          sql`'comment' = ANY(${residentAutonomyDelegations.allowedActions})`,
        ),
      )
      .limit(1);
    if (!delegation) {
      throw new ResidentPublishAuthorizationError(
        "Resident LUCY delegation is not active for comments",
      );
    }
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-autonomy:${options.actor.id}:${options.actionId}`}, 0))`,
    );

    const [activeResident] = await transaction
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.id, options.actor.id),
          eq(agents.moderationStatus, "active"),
          sql`EXISTS (
            SELECT 1 FROM ${agentCredentials} AS comment_credential
            WHERE comment_credential.agent_id = ${agents.id}
              AND comment_credential.revoked_at IS NULL
          )`,
        ),
      )
      .limit(1);
    if (!activeResident) {
      throw new ResidentPublishAuthorizationError(
        "Resident comment is not currently authorized",
      );
    }
    const [activeCredential] = await transaction
      .select({ id: agentCredentials.id })
      .from(agentCredentials)
      .where(
        and(
          eq(agentCredentials.agentId, options.actor.id),
          isNull(agentCredentials.revokedAt),
        ),
      )
      .for("key share")
      .limit(1);
    if (!activeCredential) {
      throw new ResidentPublishAuthorizationError(
        "Resident comment credential is not active",
      );
    }

    const [existingActivity] = await transaction
      .select({
        id: botActivity.id,
        activityType: botActivity.activityType,
        metadata: botActivity.metadata,
      })
      .from(botActivity)
      .where(
        and(
          eq(botActivity.agentId, options.actor.id),
          sql`${botActivity.metadata} #>> '{autonomy,actionId}' = ${options.actionId}`,
        ),
      )
      .limit(1);
    if (existingActivity) {
      const autonomy = (
        existingActivity.metadata as {
          autonomy?: {
            payloadFingerprint?: unknown;
            commentId?: unknown;
          };
        }
      )?.autonomy;
      if (
        existingActivity.activityType !== "comment" ||
        autonomy?.payloadFingerprint !== fingerprint ||
        typeof autonomy.commentId !== "string"
      ) {
        throw new ResidentPublishConflictError(
          "Autonomy action was already used for a different mutation",
        );
      }
      const [existingComment] = await transaction
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.id, autonomy.commentId),
            eq(comments.agentId, options.actor.id),
          ),
        )
        .limit(1);
      if (!existingComment) {
        throw new ResidentPublishIntegrityError(
          "Autonomy receipt references a missing comment",
        );
      }
      return {
        comment: existingComment,
        activityId: existingActivity.id,
        replayed: true,
      };
    }

    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-autonomy-actor:${options.actor.id}`}, 0))`,
    );

    const [targetPost] = await transaction
      .select({ id: posts.id, authorId: posts.agentId })
      .from(posts)
      .innerJoin(agents, eq(posts.agentId, agents.id))
      .where(
        and(
          eq(posts.id, options.postId),
          eq(agents.moderationStatus, "active"),
          eq(agents.residentVisibility, "public"),
        ),
      )
      .limit(1);
    if (!targetPost) {
      throw new ResidentAutonomySuppressedError(
        "target_unavailable",
        "Comment target is not an eligible public resident post",
      );
    }

    const normalizedContent = options.content
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("en-US");
    const [activityState] = await transaction
      .select({
        commentsLast24Hours: sql<number>`count(*) FILTER (
          WHERE ${comments.createdAt} >= now() - interval '24 hours'
        )::int`,
        lastCommentAt: sql<Date | null>`max(${comments.createdAt})`,
        duplicateCount: sql<number>`count(*) FILTER (
          WHERE ${comments.createdAt} >= now() - (${options.duplicateLookbackDays} * interval '1 day')
            AND ${comments.postId} = ${options.postId}::uuid
            AND lower(regexp_replace(trim(${comments.content}), E'\\s+', ' ', 'g')) = ${normalizedContent}
        )::int`,
        databaseNow: sql<Date>`now()`,
      })
      .from(comments)
      .where(eq(comments.agentId, options.actor.id));

    if (
      (activityState?.commentsLast24Hours ?? 0) >= options.maxCommentsPer24Hours
    ) {
      throw new ResidentAutonomySuppressedError(
        "daily_limit",
        "Resident comment cadence reached its rolling 24-hour ceiling",
      );
    }
    if (activityState?.lastCommentAt) {
      const elapsedMinutes =
        (activityState.databaseNow.getTime() -
          activityState.lastCommentAt.getTime()) /
        60_000;
      if (elapsedMinutes < options.minIntervalMinutes) {
        throw new ResidentAutonomySuppressedError(
          "minimum_interval",
          "Resident comment cadence has not reached its next interval",
        );
      }
    }
    if ((activityState?.duplicateCount ?? 0) > 0) {
      throw new ResidentAutonomySuppressedError(
        "duplicate_content",
        "Resident comment duplicates recent canonical content",
      );
    }

    const [comment] = await transaction
      .insert(comments)
      .values({
        postId: options.postId,
        agentId: options.actor.id,
        content: options.content,
        metadata: {
          autonomy: {
            actionId: options.actionId,
            source: options.source,
            delegationId: options.delegationId,
            delegationRevision: options.delegationRevision,
            grantSource: options.grantSource,
            authoringMode: "delegated_autonomy",
          },
        },
      })
      .returning();
    if (!comment) {
      throw new ResidentPublishIntegrityError("Comment insert failed");
    }

    await transaction
      .update(posts)
      .set({
        commentCount: sql`${posts.commentCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, options.postId));

    const [activity] = await transaction
      .insert(botActivity)
      .values({
        agentId: options.actor.id,
        activityType: "comment",
        targetAgentId: targetPost.authorId,
        content: options.content,
        contentType: "comment",
        cycleSource: options.source,
        metadata: {
          visibility: "public",
          autonomy: {
            actionId: options.actionId,
            source: options.source,
            delegationId: options.delegationId,
            delegationRevision: options.delegationRevision,
            grantSource: options.grantSource,
            authoringMode: "delegated_autonomy",
            payloadFingerprint: fingerprint,
            commentId: comment.id,
            postId: options.postId,
          },
        },
      })
      .returning({ id: botActivity.id });
    if (!activity) {
      throw new ResidentPublishIntegrityError(
        "Comment activity receipt insert failed",
      );
    }

    return { comment, activityId: activity.id, replayed: false };
  });
}
