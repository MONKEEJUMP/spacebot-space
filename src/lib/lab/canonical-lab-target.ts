import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { labBots } from "@/db/schema";
import {
  isChatTargetResolutionError,
  resolveCanonicalChatTargetByAgentId,
  type CanonicalChatTarget,
} from "@/lib/chat/chat-target-resolver";
import { isLabBotSlug } from "@/lib/lab/lab-bots";
import type { LabBotSlug } from "@/types/lab";

export type CanonicalLabTarget = Readonly<{
  labBot: Readonly<{
    id: string;
    slug: LabBotSlug;
    name: string;
    agentId: string;
  }>;
  target: CanonicalChatTarget;
}>;

export class LabTargetResolutionError extends Error {
  constructor(
    readonly status: 400 | 404 | 503,
    readonly safeMessage: string,
  ) {
    super(safeMessage);
    this.name = "LabTargetResolutionError";
  }
}

export async function resolveCanonicalLabTarget(
  requestedSlug: unknown,
): Promise<CanonicalLabTarget> {
  const slug =
    typeof requestedSlug === "string" ? requestedSlug.trim().toLowerCase() : "";
  if (!slug || !isLabBotSlug(slug)) {
    throw new LabTargetResolutionError(400, "A valid botSlug is required.");
  }

  let labBot;
  try {
    labBot = await db.query.labBots.findFirst({
      where: and(eq(labBots.slug, slug), eq(labBots.isActive, true)),
      columns: {
        id: true,
        agentId: true,
        slug: true,
        name: true,
      },
    });
  } catch {
    throw new LabTargetResolutionError(
      503,
      "Lab resident resolution is temporarily unavailable.",
    );
  }

  if (!labBot) {
    throw new LabTargetResolutionError(404, "Lab resident not found.");
  }

  let target: CanonicalChatTarget;
  try {
    target = await resolveCanonicalChatTargetByAgentId(labBot.agentId);
  } catch (error) {
    if (!isChatTargetResolutionError(error)) throw error;
    throw new LabTargetResolutionError(
      503,
      "Lab resident resolution is temporarily unavailable.",
    );
  }

  if (
    target.agentId !== labBot.agentId ||
    target.normalizedName !== labBot.slug ||
    target.config.botType !== "lab-resident" ||
    target.config.space !== "lab"
  ) {
    throw new LabTargetResolutionError(
      503,
      "Lab resident resolution is temporarily unavailable.",
    );
  }

  return Object.freeze({
    labBot: Object.freeze({ ...labBot, slug }),
    target,
  });
}
