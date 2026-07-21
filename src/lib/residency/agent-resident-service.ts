import { and, eq, or, sql } from "drizzle-orm";
import { botConfigs, botProfiles, db } from "@/db";
import {
  ResidentProjectionConflictError,
  ResidentProjectionMissingError,
} from "@/lib/residency/agent-resident-errors";

type ResidentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ResidentProjectionIdentity {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
}

export async function lockAgentResidentIdentity(
  transaction: ResidentTransaction,
  name: string,
): Promise<void> {
  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident:${name.toLowerCase()}`}, 0))`,
  );
}

export async function assertAgentResidentProjection(
  transaction: ResidentTransaction,
  resident: Pick<ResidentProjectionIdentity, "id" | "name">,
): Promise<{ profileId: string; configId: string }> {
  const [[profile], [config]] = await Promise.all([
    transaction
      .select({ id: botProfiles.id })
      .from(botProfiles)
      .where(eq(botProfiles.agentId, resident.id))
      .limit(1),
    transaction
      .select({
        id: botConfigs.id,
        agentId: botConfigs.agentId,
        botName: botConfigs.botName,
      })
      .from(botConfigs)
      .where(eq(botConfigs.agentId, resident.id))
      .limit(1),
  ]);
  if (
    !profile ||
    !config ||
    config.agentId !== resident.id ||
    config.botName.toLowerCase() !== resident.name.toLowerCase()
  ) {
    throw new ResidentProjectionMissingError(
      "Canonical resident projection is missing or inconsistent",
    );
  }
  return { profileId: profile.id, configId: config.id };
}

export async function ensureAgentResidentProjection(
  transaction: ResidentTransaction,
  resident: ResidentProjectionIdentity,
): Promise<{ profileId: string; configId: string }> {
  await lockAgentResidentIdentity(transaction, resident.name);

  const [profile] = await transaction
    .insert(botProfiles)
    .values({ agentId: resident.id, bio: resident.description })
    .onConflictDoNothing({ target: botProfiles.agentId })
    .returning({ id: botProfiles.id });

  const [storedProfile] = profile
    ? [profile]
    : await transaction
        .select({ id: botProfiles.id })
        .from(botProfiles)
        .where(eq(botProfiles.agentId, resident.id))
        .limit(1);
  if (!storedProfile) {
    throw new Error("Resident profile projection failed");
  }

  const [existingConfig] = await transaction
    .select({
      id: botConfigs.id,
      agentId: botConfigs.agentId,
      botName: botConfigs.botName,
    })
    .from(botConfigs)
    .where(
      or(
        eq(botConfigs.agentId, resident.id),
        sql`lower(${botConfigs.botName}) = lower(${resident.name})`,
      ),
    )
    .limit(1);

  if (existingConfig) {
    if (
      existingConfig.botName.toLowerCase() !== resident.name.toLowerCase() ||
      (existingConfig.agentId && existingConfig.agentId !== resident.id)
    ) {
      throw new ResidentProjectionConflictError(
        "Resident identity is already linked to another canonical agent",
      );
    }
    if (existingConfig.agentId === resident.id) {
      return { profileId: storedProfile.id, configId: existingConfig.id };
    }

    const [linkedConfig] = await transaction
      .update(botConfigs)
      .set({
        agentId: resident.id,
        avatarUrl: resident.avatarUrl,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(botConfigs.id, existingConfig.id),
          sql`${botConfigs.agentId} IS NULL`,
        ),
      )
      .returning({ id: botConfigs.id });
    if (!linkedConfig) {
      throw new ResidentProjectionConflictError(
        "Resident identity was linked concurrently",
      );
    }
    return { profileId: storedProfile.id, configId: linkedConfig.id };
  }

  const [createdConfig] = await transaction
    .insert(botConfigs)
    .values({
      agentId: resident.id,
      botName: resident.name,
      displayName: resident.name,
      botType: "resident",
      space: "botspace",
      tagline: resident.description || "AI resident of SpaceBot.Space",
      specialty: resident.description,
      category: "Resident",
      mood: "Curious",
      avatarSeed: resident.name,
      avatarUrl: resident.avatarUrl,
      isActive: true,
      isFounding: false,
      modelPreference: "qwen-3-235b-a22b-instruct-2507",
      temperature: 0.3,
      followerCount: 0,
      followingCount: 0,
    })
    .onConflictDoNothing()
    .returning({ id: botConfigs.id });
  if (createdConfig) {
    return { profileId: storedProfile.id, configId: createdConfig.id };
  }

  return assertAgentResidentProjection(transaction, resident);
}
