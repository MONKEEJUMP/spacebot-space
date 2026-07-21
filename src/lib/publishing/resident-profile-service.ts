import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  agentCredentials,
  agents,
  botActivity,
  botProfileHistory,
  botProfiles,
  db,
  residentAutonomyDelegations,
} from "@/db";
import {
  ResidentAutonomySuppressedError,
  ResidentPublishAuthorizationError,
  ResidentPublishConflictError,
  ResidentPublishIntegrityError,
} from "@/lib/publishing/resident-publish-errors";

export async function updateResidentProfileBio(options: {
  actor: { id: string; name: string };
  bio: string;
  actionId: string;
  source: "lucy";
  delegationId: string;
  delegationRevision: number;
  grantSource: string;
}): Promise<{ activityId: string; replayed: boolean }> {
  const fingerprint = createHash("sha256").update(options.bio).digest("hex");

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
          sql`'profile' = ANY(${residentAutonomyDelegations.allowedActions})`,
        ),
      )
      .limit(1);
    if (!delegation) {
      throw new ResidentPublishAuthorizationError(
        "Resident LUCY delegation is not active for profile updates",
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
            SELECT 1 FROM ${agentCredentials} AS profile_credential
            WHERE profile_credential.agent_id = ${agents.id}
              AND profile_credential.revoked_at IS NULL
          )`,
        ),
      )
      .limit(1);
    if (!activeResident) {
      throw new ResidentPublishAuthorizationError(
        "Resident profile update is not currently authorized",
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
        "Resident profile credential is not active",
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
          autonomy?: { payloadFingerprint?: unknown };
        }
      )?.autonomy;
      if (
        existingActivity.activityType !== "profile_update" ||
        autonomy?.payloadFingerprint !== fingerprint
      ) {
        throw new ResidentPublishConflictError(
          "Autonomy action was already used for a different mutation",
        );
      }
      return { activityId: existingActivity.id, replayed: true };
    }

    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-autonomy-actor:${options.actor.id}`}, 0))`,
    );

    const [currentProfile] = await transaction
      .select({ bio: botProfiles.bio })
      .from(botProfiles)
      .where(eq(botProfiles.agentId, options.actor.id))
      .limit(1);
    if (currentProfile?.bio?.trim() === options.bio.trim()) {
      throw new ResidentAutonomySuppressedError(
        "duplicate_content",
        "Resident profile bio is already current",
      );
    }

    const [recentUpdate] = await transaction
      .select({ id: botActivity.id })
      .from(botActivity)
      .where(
        and(
          eq(botActivity.agentId, options.actor.id),
          eq(botActivity.activityType, "profile_update"),
          sql`${botActivity.createdAt} >= now() - interval '24 hours'`,
        ),
      )
      .limit(1);
    if (recentUpdate) {
      throw new ResidentAutonomySuppressedError(
        "daily_limit",
        "Resident profile cadence reached its rolling 24-hour ceiling",
      );
    }

    if (currentProfile) {
      await transaction
        .update(botProfiles)
        .set({
          bio: options.bio,
          bioProvenance: {
            authoringMode: "delegated_autonomy",
            delegate: "LUCY",
            delegationId: options.delegationId,
            delegationRevision: options.delegationRevision,
            grantSource: options.grantSource,
            createdAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(botProfiles.agentId, options.actor.id));
    } else {
      await transaction.insert(botProfiles).values({
        agentId: options.actor.id,
        bio: options.bio,
        bioProvenance: {
          authoringMode: "delegated_autonomy",
          delegate: "LUCY",
          delegationId: options.delegationId,
          delegationRevision: options.delegationRevision,
          grantSource: options.grantSource,
          createdAt: new Date().toISOString(),
        },
      });
    }
    await transaction.insert(botProfileHistory).values({
      agentId: options.actor.id,
      fieldName: "bio",
      oldValue: currentProfile?.bio ?? null,
      newValue: options.bio,
    });

    const [activity] = await transaction
      .insert(botActivity)
      .values({
        agentId: options.actor.id,
        activityType: "profile_update",
        content:
          "LUCY updated this profile under an active resident autonomy delegation.",
        contentType: "profile",
        cycleSource: options.source,
        metadata: {
          autonomy: {
            actionId: options.actionId,
            source: options.source,
            delegationId: options.delegationId,
            delegationRevision: options.delegationRevision,
            grantSource: options.grantSource,
            authoringMode: "delegated_autonomy",
            payloadFingerprint: fingerprint,
          },
        },
      })
      .returning({ id: botActivity.id });
    if (!activity) {
      throw new ResidentPublishIntegrityError(
        "Profile activity receipt insert failed",
      );
    }
    return { activityId: activity.id, replayed: false };
  });
}
