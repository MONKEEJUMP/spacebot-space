'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';

interface ClerkHuman {
  id: string;
  name: string;
  username: string | null;
  tier: string;
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
}

export function useClerkHuman() {
  const { isSignedIn, isLoaded } = useUser();
  const [human, setHuman] = useState<ClerkHuman | null>(null);
  const [profile, setProfile] = useState<ClerkHumanProfile | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/humans/me-clerk');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setHuman(json.human);
          setProfile(json.profile);
        }
      }
    } catch {
      // Silent fail — user just won't see edit controls
    }
    setFetched(true);
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn && !fetched) {
      fetchData();
    }
    if (isLoaded && !isSignedIn) {
      setFetched(true);
    }
  }, [isLoaded, isSignedIn, fetched, fetchData]);

  const isOwner = useCallback(
    (username: string): boolean => {
      if (!human?.username) return false;
      return human.username.toLowerCase() === username.toLowerCase();
    },
    [human]
  );

  const refetch = useCallback(() => {
    setFetched(false);
  }, []);

  return {
    human,
    profile,
    isLoaded: fetched,
    isOwner,
    refetch,
  };
}
