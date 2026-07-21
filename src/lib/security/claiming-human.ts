import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { humanProfiles, humans } from "@/db/schema";

interface ClaimingHumanSuccess {
  success: true;
  humanId: string;
  humanEmail: string;
  authType: "clerk" | "legacy-jwt";
}

interface ClaimingHumanError {
  success: false;
  status: number;
  error: string;
}

export type ClaimingHumanResult = ClaimingHumanSuccess | ClaimingHumanError;

const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "botspace",
  "build-avatar",
  "claim",
  "humans",
  "login",
  "peoplespace",
  "profile",
  "register",
  "settings",
  "sign-in",
  "sign-up",
]);

async function generateUsername(name: string, email: string): Promise<string> {
  const rawBase = name || email.split("@")[0] || "human";
  const normalized = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const base = normalized || "human";
  let candidate = RESERVED_USERNAMES.has(base) ? `${base}-1` : base;
  let suffix = 2;
  const existingRows = await db
    .select({ username: humans.username })
    .from(humans)
    .where(sql`lower(${humans.username}) like ${`${base}%`}`);
  const existingUsernames = new Set(
    existingRows.flatMap((row) =>
      row.username ? [row.username.toLowerCase()] : [],
    ),
  );

  while (existingUsernames.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function ensureVerifiedClerkHuman({
  clerkId,
  email,
  fullName,
}: {
  clerkId: string;
  email: string;
  fullName: string;
}): Promise<ClaimingHumanResult> {
  const primaryEmail = email.trim().toLowerCase();
  const normalizedName = fullName.trim();
  const displayName = normalizedName || primaryEmail.split("@")[0] || "Human";
  if (!clerkId || !primaryEmail) {
    return { success: false, status: 400, error: "Verified Clerk identity is incomplete." };
  }

  const [byEmail] = await db
    .select({ id: humans.id, clerkId: humans.clerkId })
    .from(humans)
    .where(sql`lower(${humans.email}) = ${primaryEmail}`)
    .limit(1);
  if (byEmail?.clerkId && byEmail.clerkId !== clerkId) {
    return {
      success: false,
      status: 409,
      error: "This email is already linked to another human identity.",
    };
  }

  if (byEmail) {
    const [linkedHuman] = await db
      .update(humans)
      .set({
        clerkId,
        email: primaryEmail,
        ...(normalizedName ? { name: normalizedName } : {}),
        isEmailVerified: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(humans.id, byEmail.id),
          or(isNull(humans.clerkId), eq(humans.clerkId, clerkId)),
        ),
      )
      .returning({ id: humans.id });
    if (!linkedHuman) {
      return {
        success: false,
        status: 409,
        error: "This human identity was linked by another request. Please retry.",
      };
    }
    await db
      .insert(humanProfiles)
      .values({ humanId: byEmail.id })
      .onConflictDoNothing({ target: humanProfiles.humanId });
    return {
      success: true,
      humanId: byEmail.id,
      humanEmail: primaryEmail,
      authType: "clerk",
    };
  }

  const [byClerkId] = await db
    .select({ id: humans.id })
    .from(humans)
    .where(eq(humans.clerkId, clerkId))
    .limit(1);
  if (byClerkId) {
    await db
      .update(humans)
      .set({
        email: primaryEmail,
        ...(normalizedName ? { name: normalizedName } : {}),
        isEmailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(humans.id, byClerkId.id));
    await db
      .insert(humanProfiles)
      .values({ humanId: byClerkId.id })
      .onConflictDoNothing({ target: humanProfiles.humanId });
    return {
      success: true,
      humanId: byClerkId.id,
      humanEmail: primaryEmail,
      authType: "clerk",
    };
  }

  const username = await generateUsername(displayName, primaryEmail);
  const newHuman = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(humans)
      .values({
        clerkId,
        email: primaryEmail,
        name: displayName,
        username,
        passwordHash: "$2b$10$CLERK_MANAGED_AUTH_NO_PASSWORD",
        isEmailVerified: true,
        isPublic: false,
      })
      .onConflictDoNothing()
      .returning({ id: humans.id, email: humans.email });
    if (!created) return null;
    await tx.insert(humanProfiles).values({ humanId: created.id });
    return created;
  });

  if (!newHuman) {
    const [concurrentHuman] = await db
      .select({ id: humans.id, email: humans.email })
      .from(humans)
      .where(eq(humans.clerkId, clerkId))
      .limit(1);
    if (concurrentHuman) {
      return {
        success: true,
        humanId: concurrentHuman.id,
        humanEmail: concurrentHuman.email,
        authType: "clerk",
      };
    }

    return {
      success: false,
      status: 409,
      error: "Human profile provisioning conflicted. Please try again.",
    };
  }

  return {
    success: true,
    humanId: newHuman.id,
    humanEmail: newHuman.email,
    authType: "clerk",
  };
}

async function resolveClerkHuman(
  clerkId: string,
): Promise<ClaimingHumanResult> {
  const [byClerkId] = await db
    .select({ id: humans.id, email: humans.email })
    .from(humans)
    .where(eq(humans.clerkId, clerkId))
    .limit(1);
  if (byClerkId) {
    return {
      success: true,
      humanId: byClerkId.id,
      humanEmail: byClerkId.email,
      authType: "clerk",
    };
  }

  const user = await currentUser();
  const primaryAddress = user?.primaryEmailAddressId
    ? user.emailAddresses.find(
        (address) => address.id === user.primaryEmailAddressId,
      )
    : undefined;
  if (
    !user ||
    !primaryAddress ||
    primaryAddress.verification?.status !== "verified"
  ) {
    return {
      success: false,
      status: 403,
      error: "A verified email address is required to continue.",
    };
  }
  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    primaryAddress.emailAddress.split("@")[0];
  return ensureVerifiedClerkHuman({
    clerkId,
    email: primaryAddress.emailAddress,
    fullName,
  });
}

export async function resolveHumanIdentity(): Promise<ClaimingHumanResult> {
  const clerkSession = await auth();
  if (clerkSession.userId) {
    return resolveClerkHuman(clerkSession.userId);
  }

  return {
    success: false,
    status: 401,
    error: "Authentication required. Please sign in.",
  };
}

export const resolveClaimingHuman = resolveHumanIdentity;
