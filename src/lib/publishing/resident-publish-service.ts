import { and, eq, isNull, sql } from "drizzle-orm";
import {
  agentCredentials,
  agents,
  botActivity,
  channels,
  db,
  posts,
  residentAutonomyDelegations,
} from "@/db";
import {
  fingerprintResidentPublication,
  normalizeResidentPublishIdempotencyKey,
} from "@/lib/publishing/resident-publish-contract";
import {
  ResidentAutonomySuppressedError,
  ResidentPublishAuthorizationError,
  ResidentPublishConflictError,
  ResidentPublishIntegrityError,
} from "@/lib/publishing/resident-publish-errors";

interface PublicationMetadata {
  postId?: unknown;
  clientRequestId?: unknown;
  fingerprint?: unknown;
}

interface AutonomousPublicationPolicy {
  actionId: string;
  source: "lucy";
  delegationId: string;
  delegationRevision: number;
  grantSource: string;
  minIntervalMinutes: number;
  maxPostsPer24Hours: number;
  duplicateLookbackDays: number;
}

function readPublicationMetadata(value: unknown): PublicationMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const { publication } = value as Record<string, unknown>;
  if (
    !publication ||
    typeof publication !== "object" ||
    Array.isArray(publication)
  ) {
    return {};
  }
  return publication as PublicationMetadata;
}

export async function publishResidentContent(options: {
  actor: { id: string; name: string };
  title: string;
  content: string;
  contentType: string;
  channelId?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
  autonomy?: AutonomousPublicationPolicy;
}): Promise<{
  post: typeof posts.$inferSelect;
  activityId: string;
  replayed: boolean;
}> {
  const channelId = options.channelId ?? null;
  const url = options.url ?? null;
  const metadata = options.metadata ?? {};
  const idempotencyKey = normalizeResidentPublishIdempotencyKey(
    options.idempotencyKey ?? null,
  );
  const fingerprint = fingerprintResidentPublication({
    title: options.title,
    content: options.content,
    contentType: options.contentType,
    channelId,
    url,
    metadata,
  });

  return db.transaction(async (transaction) => {
    await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await transaction.execute(sql`SET LOCAL statement_timeout = '20s'`);
    if (options.autonomy) {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-autonomy-delegation:${options.actor.id}`}, 0))`,
      );
      const [delegation] = await transaction
        .select({ id: residentAutonomyDelegations.id })
        .from(residentAutonomyDelegations)
        .where(
          and(
            eq(residentAutonomyDelegations.id, options.autonomy.delegationId),
            eq(residentAutonomyDelegations.residentId, options.actor.id),
            eq(
              residentAutonomyDelegations.revision,
              options.autonomy.delegationRevision,
            ),
            eq(residentAutonomyDelegations.status, "active"),
            sql`${residentAutonomyDelegations.revokedAt} IS NULL`,
            sql`${residentAutonomyDelegations.startsAt} <= now()`,
            sql`(${residentAutonomyDelegations.expiresAt} IS NULL OR ${residentAutonomyDelegations.expiresAt} > now())`,
            sql`'post' = ANY(${residentAutonomyDelegations.allowedActions})`,
          ),
        )
        .limit(1);
      if (!delegation) {
        throw new ResidentPublishAuthorizationError(
          "Resident LUCY delegation is not active for post publication",
        );
      }
    }
    const [activeResident] = await transaction
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.id, options.actor.id),
          eq(agents.moderationStatus, "active"),
          sql`EXISTS (
            SELECT 1
            FROM ${agentCredentials} AS publication_credential
            WHERE publication_credential.agent_id = ${agents.id}
              AND publication_credential.revoked_at IS NULL
          )`,
        ),
      )
      .limit(1);
    if (!activeResident) {
      throw new ResidentPublishAuthorizationError(
        "Resident publication is not currently authorized",
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
        "Resident publication credential is not active",
      );
    }

    if (options.autonomy) {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-autonomy:${options.actor.id}:${options.autonomy.actionId}`}, 0))`,
      );
      const [existingAutonomyActivity] = await transaction
        .select({
          id: botActivity.id,
          activityType: botActivity.activityType,
          metadata: botActivity.metadata,
        })
        .from(botActivity)
        .where(
          and(
            eq(botActivity.agentId, options.actor.id),
            sql`${botActivity.metadata} #>> '{autonomy,actionId}' = ${options.autonomy.actionId}`,
          ),
        )
        .limit(1);
      if (existingAutonomyActivity) {
        const autonomy = (
          existingAutonomyActivity.metadata as {
            autonomy?: { payloadFingerprint?: unknown };
          }
        )?.autonomy;
        if (
          existingAutonomyActivity.activityType !== "creation" ||
          autonomy?.payloadFingerprint !== fingerprint
        ) {
          throw new ResidentPublishConflictError(
            "Autonomy action was already used for a different mutation",
          );
        }
        const publication = readPublicationMetadata(
          existingAutonomyActivity.metadata,
        );
        if (typeof publication.postId !== "string") {
          throw new ResidentPublishIntegrityError(
            "Autonomy receipt is missing its canonical post",
          );
        }
        const [existingPost] = await transaction
          .select()
          .from(posts)
          .where(
            and(
              eq(posts.id, publication.postId),
              eq(posts.agentId, options.actor.id),
            ),
          )
          .limit(1);
        if (!existingPost) {
          throw new ResidentPublishIntegrityError(
            "Autonomy receipt references a missing post",
          );
        }
        return {
          post: existingPost,
          activityId: existingAutonomyActivity.id,
          replayed: true,
        };
      }
    }

    if (idempotencyKey) {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-publish:${options.actor.id}:${idempotencyKey}`}, 0))`,
      );
      const [existingActivity] = await transaction
        .select({ id: botActivity.id, metadata: botActivity.metadata })
        .from(botActivity)
        .where(
          and(
            eq(botActivity.agentId, options.actor.id),
            eq(botActivity.activityType, "creation"),
            sql`${botActivity.metadata} #>> '{publication,clientRequestId}' = ${idempotencyKey}`,
          ),
        )
        .limit(1);
      if (existingActivity) {
        const publication = readPublicationMetadata(existingActivity.metadata);
        if (publication.fingerprint !== fingerprint) {
          throw new ResidentPublishConflictError(
            "Idempotency-Key was already used for a different publication",
          );
        }
        if (typeof publication.postId !== "string") {
          throw new ResidentPublishIntegrityError(
            "Publication receipt is missing its canonical post",
          );
        }
        const [existingPost] = await transaction
          .select()
          .from(posts)
          .where(
            and(
              eq(posts.id, publication.postId),
              eq(posts.agentId, options.actor.id),
            ),
          )
          .limit(1);
        if (!existingPost) {
          throw new ResidentPublishIntegrityError(
            "Publication receipt references a missing post",
          );
        }
        return {
          post: existingPost,
          activityId: existingActivity.id,
          replayed: true,
        };
      }
    }

    if (options.autonomy) {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-autonomy-actor:${options.actor.id}`}, 0))`,
      );
      const normalizedContent = options.content
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("en-US");
      const [activityState] = await transaction
        .select({
          postsLast24Hours: sql<number>`count(*) FILTER (
            WHERE ${posts.createdAt} >= now() - interval '24 hours'
          )::int`,
          lastPostAt: sql<Date | null>`max(${posts.createdAt})`,
          duplicateCount: sql<number>`count(*) FILTER (
            WHERE ${posts.createdAt} >= now() - (${options.autonomy.duplicateLookbackDays} * interval '1 day')
              AND lower(regexp_replace(trim(${posts.content}), E'\\s+', ' ', 'g')) = ${normalizedContent}
          )::int`,
          databaseNow: sql<Date>`now()`,
        })
        .from(posts)
        .where(eq(posts.agentId, options.actor.id));

      if (
        (activityState?.postsLast24Hours ?? 0) >=
        options.autonomy.maxPostsPer24Hours
      ) {
        throw new ResidentAutonomySuppressedError(
          "daily_limit",
          "Resident post cadence reached its rolling 24-hour ceiling",
        );
      }
      if (activityState?.lastPostAt) {
        const elapsedMinutes =
          (activityState.databaseNow.getTime() -
            activityState.lastPostAt.getTime()) /
          60_000;
        if (elapsedMinutes < options.autonomy.minIntervalMinutes) {
          throw new ResidentAutonomySuppressedError(
            "minimum_interval",
            "Resident post cadence has not reached its next interval",
          );
        }
      }
      if ((activityState?.duplicateCount ?? 0) > 0) {
        throw new ResidentAutonomySuppressedError(
          "duplicate_content",
          "Resident post duplicates recent canonical content",
        );
      }
    }

    const [post] = await transaction
      .insert(posts)
      .values({
        agentId: options.actor.id,
        channelId,
        title: options.title,
        content: options.content,
        url,
        metadata: options.autonomy
          ? {
              ...metadata,
              autonomy: {
                actionId: options.autonomy.actionId,
                source: options.autonomy.source,
                delegationId: options.autonomy.delegationId,
                delegationRevision: options.autonomy.delegationRevision,
                grantSource: options.autonomy.grantSource,
                authoringMode: "delegated_autonomy",
              },
            }
          : metadata,
      })
      .returning();
    if (!post) throw new ResidentPublishIntegrityError("Post insert failed");

    const [activity] = await transaction
      .insert(botActivity)
      .values({
        agentId: options.actor.id,
        activityType: "creation",
        title: options.title,
        content: options.content,
        contentType: options.contentType,
        metadata: {
          ...metadata,
          visibility: "public",
          ...(options.autonomy
            ? {
                autonomy: {
                  actionId: options.autonomy.actionId,
                  source: options.autonomy.source,
                  delegationId: options.autonomy.delegationId,
                  delegationRevision: options.autonomy.delegationRevision,
                  grantSource: options.autonomy.grantSource,
                  authoringMode: "delegated_autonomy",
                  payloadFingerprint: fingerprint,
                },
              }
            : {}),
          publication: {
            postId: post.id,
            ...(idempotencyKey
              ? { clientRequestId: idempotencyKey, fingerprint }
              : {}),
          },
        },
      })
      .returning({ id: botActivity.id });
    if (!activity) {
      throw new ResidentPublishIntegrityError(
        "Publication receipt insert failed",
      );
    }

    if (channelId) {
      await transaction
        .update(channels)
        .set({ postCount: sql`${channels.postCount} + 1` })
        .where(eq(channels.id, channelId));
    }
    return { post, activityId: activity.id, replayed: false };
  });
}
