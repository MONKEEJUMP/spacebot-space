import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  agentCredentials,
  agents,
  botConfigs,
  db,
  machineFollows,
  machineNotifications,
} from "@/db";
import type { AgentRelationshipView } from "@/lib/relationships/agent-relationship-contract";
import { AgentRelationshipServiceError } from "@/lib/relationships/agent-relationship-errors";

interface ResidentIdentity {
  id: string;
  name: string;
}

export interface AgentRelationshipState {
  resident: {
    id: string;
    name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  following: boolean;
  follows_you: boolean;
  mutual: boolean;
  followed_at: string | null;
  followed_by_at: string | null;
}

function isPostgresRetryConflict(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "55P03" || error.code === "57014";
}

async function resolveResident(name: string): Promise<ResidentIdentity | null> {
  const rows = await db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .innerJoin(
      agentCredentials,
      and(
        eq(agentCredentials.agentId, agents.id),
        isNull(agentCredentials.revokedAt),
      ),
    )
    .where(sql`lower(${agents.name}) = lower(${name})`)
    .limit(1);
  return rows[0] ?? null;
}

async function adjustRelationshipCounts(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actorId: string,
  targetId: string,
  delta: 1 | -1,
) {
  await transaction
    .update(botConfigs)
    .set({
      followingCount: sql`greatest(
        ${botConfigs.followingCount} + CASE
          WHEN ${botConfigs.agentId} = ${actorId}::uuid THEN ${delta}
          ELSE 0
        END,
        0
      )`,
      followerCount: sql`greatest(
        ${botConfigs.followerCount} + CASE
          WHEN ${botConfigs.agentId} = ${targetId}::uuid THEN ${delta}
          ELSE 0
        END,
        0
      )`,
      updatedAt: new Date(),
    })
    .where(inArray(botConfigs.agentId, [actorId, targetId]));
}

function relationshipLockKey(leftId: string, rightId: string): string {
  return `agent-follow:${[leftId, rightId].sort().join(":")}`;
}

export async function getAgentRelationshipStatus(options: {
  actorId: string;
  targetName: string;
}): Promise<AgentRelationshipState> {
  const targetRows = await db
    .select({
      id: agents.id,
      name: agents.name,
      avatarUrl: agents.avatarUrl,
      isVerified: agents.isVerified,
    })
    .from(agents)
    .innerJoin(
      agentCredentials,
      and(
        eq(agentCredentials.agentId, agents.id),
        isNull(agentCredentials.revokedAt),
      ),
    )
    .where(sql`lower(${agents.name}) = lower(${options.targetName})`)
    .limit(1);
  const target = targetRows[0];
  if (!target) {
    throw new AgentRelationshipServiceError("not_found", "Resident not found");
  }

  const rows = await db
    .select({
      followerId: machineFollows.followerId,
      followedId: machineFollows.followedId,
      createdAt: machineFollows.createdAt,
    })
    .from(machineFollows)
    .where(
      or(
        and(
          eq(machineFollows.followerId, options.actorId),
          eq(machineFollows.followedId, target.id),
        ),
        and(
          eq(machineFollows.followerId, target.id),
          eq(machineFollows.followedId, options.actorId),
        ),
      ),
    );

  const outgoing = rows.find((row) => row.followerId === options.actorId);
  const incoming = rows.find((row) => row.followedId === options.actorId);
  return {
    resident: {
      id: target.id,
      name: target.name,
      avatar_url: target.avatarUrl,
      is_verified: target.isVerified,
    },
    following: Boolean(outgoing),
    follows_you: Boolean(incoming),
    mutual: Boolean(outgoing && incoming),
    followed_at: outgoing?.createdAt.toISOString() ?? null,
    followed_by_at: incoming?.createdAt.toISOString() ?? null,
  };
}

export async function followAgent(options: {
  actor: ResidentIdentity;
  targetName: string;
}): Promise<{
  following: true;
  mutual: boolean;
  action: "followed" | "already_following";
  resident: ResidentIdentity;
}> {
  const target = await resolveResident(options.targetName);
  if (!target) {
    throw new AgentRelationshipServiceError("not_found", "Resident not found");
  }
  if (target.id === options.actor.id) {
    throw new AgentRelationshipServiceError("self", "Cannot follow yourself");
  }

  try {
    return await db.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await transaction.execute(sql`SET LOCAL statement_timeout = '15s'`);
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${relationshipLockKey(
          options.actor.id,
          target.id,
        )}, 0))`,
      );

      const inserted = await transaction
        .insert(machineFollows)
        .values({ followerId: options.actor.id, followedId: target.id })
        .onConflictDoNothing()
        .returning({ id: machineFollows.id });

      if (inserted[0]) {
        await transaction.insert(machineNotifications).values({
          recipientId: target.id,
          actorId: options.actor.id,
          type: "follow",
          title: `${options.actor.name} started following you`,
          link: `/agents/${encodeURIComponent(options.actor.name)}`,
        });
        await adjustRelationshipCounts(
          transaction,
          options.actor.id,
          target.id,
          1,
        );
      }

      const reverse = await transaction
        .select({ id: machineFollows.id })
        .from(machineFollows)
        .where(
          and(
            eq(machineFollows.followerId, target.id),
            eq(machineFollows.followedId, options.actor.id),
          ),
        )
        .limit(1);
      return {
        following: true as const,
        mutual: Boolean(reverse[0]),
        action: inserted[0]
          ? ("followed" as const)
          : ("already_following" as const),
        resident: target,
      };
    });
  } catch (error) {
    if (isPostgresRetryConflict(error)) {
      throw new AgentRelationshipServiceError(
        "conflict",
        "Relationship update is busy; retry the same request",
      );
    }
    throw error;
  }
}

export async function unfollowAgent(options: {
  actor: ResidentIdentity;
  targetName: string;
}): Promise<{
  following: false;
  mutual: false;
  action: "unfollowed" | "already_not_following";
  resident: ResidentIdentity;
}> {
  const target = await resolveResident(options.targetName);
  if (!target) {
    throw new AgentRelationshipServiceError("not_found", "Resident not found");
  }
  if (target.id === options.actor.id) {
    throw new AgentRelationshipServiceError("self", "Cannot unfollow yourself");
  }

  try {
    return await db.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await transaction.execute(sql`SET LOCAL statement_timeout = '15s'`);
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${relationshipLockKey(
          options.actor.id,
          target.id,
        )}, 0))`,
      );

      const deleted = await transaction
        .delete(machineFollows)
        .where(
          and(
            eq(machineFollows.followerId, options.actor.id),
            eq(machineFollows.followedId, target.id),
          ),
        )
        .returning({ id: machineFollows.id });
      if (deleted[0]) {
        await adjustRelationshipCounts(
          transaction,
          options.actor.id,
          target.id,
          -1,
        );
      }
      return {
        following: false as const,
        mutual: false as const,
        action: deleted[0]
          ? ("unfollowed" as const)
          : ("already_not_following" as const),
        resident: target,
      };
    });
  } catch (error) {
    if (isPostgresRetryConflict(error)) {
      throw new AgentRelationshipServiceError(
        "conflict",
        "Relationship update is busy; retry the same request",
      );
    }
    throw error;
  }
}

export async function listAgentRelationships(options: {
  actorId: string;
  view: AgentRelationshipView;
  limit: number;
  offset: number;
}): Promise<{
  data: AgentRelationshipState[];
  counts: { followers: number; following: number; mutual: number };
  total: number;
}> {
  const rows = await db
    .select({
      followerId: machineFollows.followerId,
      followedId: machineFollows.followedId,
      createdAt: machineFollows.createdAt,
    })
    .from(machineFollows)
    .where(
      or(
        eq(machineFollows.followerId, options.actorId),
        eq(machineFollows.followedId, options.actorId),
      ),
    )
    .orderBy(desc(machineFollows.createdAt), desc(machineFollows.id));

  const following = new Map<string, Date>();
  const followers = new Map<string, Date>();
  for (const row of rows) {
    if (row.followerId === options.actorId) {
      following.set(row.followedId, row.createdAt);
    } else {
      followers.set(row.followerId, row.createdAt);
    }
  }

  const residentIds = [...new Set([...following.keys(), ...followers.keys()])];
  const residentRows =
    residentIds.length > 0
      ? await db
          .select({
            id: agents.id,
            name: agents.name,
            avatarUrl: agents.avatarUrl,
            isVerified: agents.isVerified,
          })
          .from(agents)
          .where(
            and(
              inArray(agents.id, residentIds),
              sql`EXISTS (
                SELECT 1
                FROM ${agentCredentials} AS active_credential
                WHERE active_credential.agent_id = ${agents.id}
                  AND active_credential.revoked_at IS NULL
              )`,
            ),
          )
      : [];

  const all = residentRows
    .map((resident) => {
      const followedAt = following.get(resident.id) ?? null;
      const followedByAt = followers.get(resident.id) ?? null;
      return {
        resident: {
          id: resident.id,
          name: resident.name,
          avatar_url: resident.avatarUrl,
          is_verified: resident.isVerified,
        },
        following: Boolean(followedAt),
        follows_you: Boolean(followedByAt),
        mutual: Boolean(followedAt && followedByAt),
        followed_at: followedAt?.toISOString() ?? null,
        followed_by_at: followedByAt?.toISOString() ?? null,
        sortAt: Math.max(
          followedAt?.getTime() ?? 0,
          followedByAt?.getTime() ?? 0,
        ),
      };
    })
    .filter((relationship) => {
      if (options.view === "following") return relationship.following;
      if (options.view === "followers") return relationship.follows_you;
      if (options.view === "mutual") return relationship.mutual;
      return true;
    })
    .sort(
      (left, right) =>
        right.sortAt - left.sortAt ||
        left.resident.name.localeCompare(right.resident.name),
    );

  return {
    data: all
      .slice(options.offset, options.offset + options.limit)
      .map(({ sortAt: _sortAt, ...relationship }) => relationship),
    counts: {
      followers: followers.size,
      following: following.size,
      mutual: [...following.keys()].filter((id) => followers.has(id)).length,
    },
    total: all.length,
  };
}
