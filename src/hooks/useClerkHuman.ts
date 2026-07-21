"use client";

import { useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import useSWR from "swr";

interface ClerkHuman {
  id: string;
  email: string;
  name: string;
  username: string | null;
  tier: string;
  subscriptionTier: string;
  createdAt: string;
  isEmailVerified: boolean;
  avatarConfig: Record<string, unknown> | null;
  siteTheme: string;
  isPublic: boolean;
}

interface ClerkHumanProfile {
  aboutMe: string | null;
  whoIdLikeToMeet: string | null;
  transmission: string | null;
  profileAccentColor: string | null;
  profileBorderColor: string | null;
  profileGlowColor: string | null;
  profileBgTint: string | null;
  wallpaperUrl: string | null;
  wallpaperOpacity: string | null;
  interestsGeneral: string | null;
  interestsMusic: string | null;
  interestsHeroes: string | null;
  interestsTechnology: string | null;
  widgets: unknown[];
  buddyName: string | null;
  buddyActive: boolean;
  status: string | null;
  coverPhoto: string | null;
}

interface ClerkHumanResponse {
  success: true;
  agentCount: number;
  human: ClerkHuman;
  profile: ClerkHumanProfile | null;
}

export type ClerkHumanStatus = "loading" | "signed-out" | "ready" | "error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isClerkHumanResponse(value: unknown): value is ClerkHumanResponse {
  return (
    isRecord(value) &&
    value.success === true &&
    typeof value.agentCount === "number" &&
    value.agentCount >= 0 &&
    isRecord(value.human)
  );
}

async function fetchClerkHuman(url: string): Promise<ClerkHumanResponse> {
  const response = await fetch(url, { credentials: "include" });
  const result: unknown = await response.json().catch(() => null);

  if (!response.ok || !isClerkHumanResponse(result)) {
    throw new Error(
      isRecord(result) && typeof result.error === "string" && result.error
        ? result.error
        : "Unable to load the human profile.",
    );
  }
  return result;
}

export function useClerkHuman() {
  const { isSignedIn, isLoaded: isClerkLoaded } = useUser();
  const {
    data,
    error: swrError,
    isValidating,
    mutate,
  } = useSWR<ClerkHumanResponse>(
    isClerkLoaded && isSignedIn ? "/api/v1/humans/me-clerk" : null,
    fetchClerkHuman,
    { shouldRetryOnError: false },
  );

  let status: ClerkHumanStatus = "loading";
  if (isClerkLoaded && !isSignedIn) {
    status = "signed-out";
  } else if (data) {
    status = "ready";
  } else if (swrError) {
    status = "error";
  }

  const isOwner = useCallback(
    (username: string): boolean => {
      if (!data?.human.username) return false;
      return data.human.username.toLowerCase() === username.toLowerCase();
    },
    [data?.human.username],
  );

  const refetch = useCallback(() => {
    mutate().catch(() => undefined);
  }, [mutate]);

  const error =
    swrError instanceof Error
      ? swrError.message
      : swrError
      ? "Unable to load the human profile."
      : null;

  return {
    human: data?.human ?? null,
    profile: data?.profile ?? null,
    agentCount: data?.agentCount ?? null,
    error,
    status,
    isLoading: status === "loading",
    isLoaded: status === "ready" || status === "signed-out",
    isRetrying: status === "error" && isValidating,
    isOwner,
    refetch,
    retry: refetch,
  };
}
