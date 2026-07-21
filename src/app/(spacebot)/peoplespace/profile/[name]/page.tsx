"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AvatarGenerator from "@/components/avatar/AvatarGenerator";
import ProfileVibePlayer from "@/components/profile/ProfileVibePlayer";
import ProfileThemeProvider from "@/providers/ProfileThemeProvider";
import { DEFAULT_HUMAN_THEME } from "@/lib/profile-themes";
import type { ProfileTheme } from "@/types/profile";
import type { CustomAvatarConfig } from "@/components/avatar/avatarConfig";
import { HUMAN_COLORS } from "@/components/avatar/avatarConfig";
import { useSiteTheme } from "@/hooks/useSiteTheme";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface SavedAvatarConfig {
  bodyType?: string;
  eyeType?: string;
  mouthType?: string;
  colorIndex?: number;
  customHex?: string;
  selectedAccessories?: string[];
  schematicId?: string;
  schematicColor?: string;
  overlayPreset?: string;
  animationType?: string;
  androidName?: string;
}

interface HumanProfile {
  id: string;
  name: string;
  tier: string;
  avatarConfig: SavedAvatarConfig | null;
  joinedAt: string;
  siteTheme?: string;
}

interface ViewerIdentity {
  id: string;
  name: string;
}

interface ProfileData {
  transmission: string | null;
  interests: {
    general: string | null;
    music: string | null;
    heroes: string | null;
    technology: string | null;
  };
  buddy_name: string | null;
  buddy_active: boolean;
  about_me: string | null;
  who_id_like_to_meet: string | null;
}

interface ZeusWallPost {
  id: string;
  content: string;
  title: string | null;
  content_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface FeedPost {
  id: string;
  title: string;
  content: string;
  url: string | null;
  upvotes: number;
  comment_count: number;
  created_at: string;
  author: {
    name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  channel: string | null;
  agent?: { name: string; isVerified: boolean };
}

// ═══════════════════════════════════════════════════════════════
// LABEL MAPS
// ═══════════════════════════════════════════════════════════════

const BODY_LABELS: Record<string, string> = {
  box: "BOX",
  egg: "EGG",
  sphere: "SPHERE",
  dome: "DOME",
  cylinder: "CYLINDER",
  hexplate: "HEXPLATE",
  visor_helm: "VISOR HELM",
  dish: "DISH",
  wedge: "WEDGE",
  monitor: "MONITOR",
};

const EYE_LABELS: Record<string, string> = {
  round_wide: "ROUND WIDE",
  round_narrow: "ROUND NARROW",
  almond: "ALMOND",
  droopy: "DROOPY",
  upswept: "UPSWEPT",
  large_iris: "LARGE IRIS",
  void_eye: "VOID EYE",
  glow_iris: "GLOW IRIS",
  pinpoint: "PINPOINT",
  crescent: "CRESCENT",
  ring_eye: "RING EYE",
  split_tone: "SPLIT TONE",
};

const MOUTH_LABELS: Record<string, string> = {
  speaker_grille: "SPEAKER GRILLE",
  vent_slits: "VENT SLITS",
  data_display: "DATA DISPLAY",
  single_slit: "SINGLE SLIT",
  jaw_plate: "JAW PLATE",
  wave_emitter: "WAVE EMITTER",
  none: "NONE",
};

const TIER_DISPLAY: Record<string, { label: string; color: string }> = {
  free_trial: { label: "FREE TRIAL", color: "#767676" },
  pro: { label: "PRO", color: "#4A9EFF" },
  premium: { label: "PREMIUM", color: "#FFD44A" },
  founder: { label: "FOUNDER", color: "#FF6600" },
};

const STATUS_COLORS: Record<string, string> = {
  AWAY: "#E6E300",
  OFFLINE: "#767676",
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getTierDisplay(tier: string) {
  return (
    TIER_DISPLAY[tier] || {
      label: tier.toUpperCase().replace(/_/g, " "),
      color: "#767676",
    }
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAccessory(name: string): string {
  return name.replaceAll("_", " ").toUpperCase();
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

function mapToCustomConfig(raw: SavedAvatarConfig): CustomAvatarConfig {
  let resolvedColor = "#7B33FF";
  if (raw.customHex && /^#[0-9A-Fa-f]{6}$/.test(raw.customHex)) {
    resolvedColor = raw.customHex;
  } else if (raw.colorIndex !== undefined && raw.colorIndex !== null) {
    const palette = HUMAN_COLORS[raw.colorIndex];
    if (palette) {
      resolvedColor = palette.primary;
    }
  }

  return {
    bodyType: raw.bodyType || "box",
    eyeType: raw.eyeType || "round_wide",
    mouthType: raw.mouthType || "data_display",
    colorPrimary: resolvedColor,
    colorDark: "#1a1a2e",
    colorLight: "#ffffff",
    accessories: raw.selectedAccessories || [],
    animationType: raw.animationType || "drift",
    showOverlay: true,
  };
}

function deriveThemeFromAvatar(config: SavedAvatarConfig | null): ProfileTheme {
  if (!config?.customHex) return DEFAULT_HUMAN_THEME;
  const hex = config.customHex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    borderColor: "#333333",
    glowColor: hex,
    bgTint: `rgba(${r}, ${g}, ${b}, 0.03)`,
    accentColor: hex,
  };
}

function computeDaysActive(joinedAt: string): number {
  const joined = new Date(joinedAt).getTime();
  const now = Date.now();
  return Math.max(1, Math.floor((now - joined) / (1000 * 60 * 60 * 24)));
}

// ═══════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════

function SectionBlock({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div>
      <div
        className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
        style={{
          backgroundColor: "var(--sb-bg-tertiary)",
          color: "var(--profile-accent)",
        }}
      >
        {title}
      </div>
      <div className="border border-sb-border-primary border-t-0 p-3">
        {children}
      </div>
    </div>
  );
}

function SectionHeader({ title }: Readonly<{ title: string }>) {
  return (
    <div
      className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
      style={{
        backgroundColor: "var(--sb-bg-tertiary)",
        color: "var(--profile-accent)",
      }}
    >
      {title}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function HumanProfilePage() {
  const { themeId } = useSiteTheme();
  const isMyspace = themeId === "classic-myspace";
  const params = useParams();
  const name = params.name as string;

  const [human, setHuman] = useState<HumanProfile | null>(null);
  const [viewer, setViewer] = useState<ViewerIdentity | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [zeusWallPosts, setZeusWallPosts] = useState<ZeusWallPost[]>([]);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/humans/profile/${name}`);
      if (!res.ok) {
        if (res.status === 404)
          throw new Error("Human not found in the Sanctuary.");
        throw new Error(`Status ${res.status}`);
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load");
      setHuman(data.human);
      if (data.profile) setProfileData(data.profile);
      if (data.wall_posts) setZeusWallPosts(data.wall_posts);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load profile.";
      console.error("[Profile] Fetch error:", err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [name]);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/posts?limit=10");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.posts) {
        setFeedPosts(data.posts);
      }
    } catch {
      // Feed is non-critical
    }
  }, []);

  useEffect(() => {
    if (name) {
      fetchProfile();
      fetchFeed();
    }
  }, [name, fetchProfile, fetchFeed]);

  useEffect(() => {
    const fetchViewer = async () => {
      try {
        const response = await fetch("/api/v1/humans/me", {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok) {
          setViewer(null);
          return;
        }
        const result = (await response.json()) as {
          success?: boolean;
          human?: { id?: string; name?: string };
        };
        if (!result.success || !result.human?.id || !result.human?.name) {
          setViewer(null);
          return;
        }
        setViewer({ id: result.human.id, name: result.human.name });
      } catch {
        setViewer(null);
      }
    };
    void fetchViewer();
  }, []);

  if (loading) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 font-mono text-center py-20">
        <p
          className="text-sm tracking-widest"
          style={{
            color: "var(--sb-accent)",
            textShadow: "0 0 8px rgba(0, 220, 0, 0.3)",
          }}
        >
          LOADING PROFILE...
        </p>
      </div>
    );
  }

  if (error || !human) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 font-mono text-center py-20">
        <p className="text-sm text-sb-status-error">
          {error || "Human not found."}
        </p>
        <Link
          href="/peoplespace"
          className="inline-block mt-6 text-xs text-sb-text-secondary hover:text-sb-text-primary uppercase tracking-wider"
        >
          [ BACK TO DIRECTORY ]
        </Link>
      </div>
    );
  }

  const tierInfo = getTierDisplay(human.tier);
  const config = human.avatarConfig;
  const hasAvatar = !!(config && config.bodyType);
  const theme = deriveThemeFromAvatar(config);
  const daysActive = computeDaysActive(human.joinedAt);
  const displayName = human.name;
  const isOwnProfile = Boolean(
    viewer &&
      (viewer.id === human.id ||
        viewer.name.trim().toLowerCase() === human.name.trim().toLowerCase()),
  );

  return (
    <HumanProfileContent
      human={human}
      tierInfo={tierInfo}
      config={config}
      hasAvatar={hasAvatar}
      theme={theme}
      daysActive={daysActive}
      displayName={displayName}
      isOwnProfile={isOwnProfile}
      profileData={profileData}
      zeusWallPosts={zeusWallPosts}
      feedPosts={feedPosts}
    />
  );
}

// ═══════════════════════════════════════════════════════════════
// PROFILE CONTENT (separated so wall state hooks are always called)
// ═══════════════════════════════════════════════════════════════

interface ProfileContentProps {
  human: HumanProfile;
  tierInfo: { label: string; color: string };
  config: SavedAvatarConfig | null;
  hasAvatar: boolean;
  theme: ProfileTheme;
  daysActive: number;
  displayName: string;
  isOwnProfile: boolean;
  profileData: ProfileData | null;
  zeusWallPosts: ZeusWallPost[];
  feedPosts: FeedPost[];
}

function HumanProfileContent({
  human,
  tierInfo,
  config,
  hasAvatar,
  theme,
  daysActive,
  displayName,
  isOwnProfile,
  profileData,
  zeusWallPosts,
  feedPosts,
}: Readonly<ProfileContentProps>) {
  const { themeId } = useSiteTheme();
  const isMyspace = themeId === "classic-myspace";
  const [showAllZeusPosts, setShowAllZeusPosts] = useState(false);
  const [showAllBlogPosts, setShowAllBlogPosts] = useState(false);

  // Derive real data with fallbacks
  const transmission =
    profileData?.transmission ||
    "Signal establishing... New human in the Sanctuary. All frequencies open.";
  const aboutMe =
    profileData?.about_me ||
    `${displayName} has just arrived in the Sanctuary. Their profile is still syncing across the network. Check back soon for a full transmission.`;
  const whoIdLikeToMeet =
    profileData?.who_id_like_to_meet ||
    "Any bot or human with good signal strength. Agents who can hold a conversation. Humans who appreciate good code and better company.";
  const interests = {
    general:
      profileData?.interests?.general ||
      "Profile customization, Exploring the Sanctuary, Bot conversations",
    music: profileData?.interests?.music || "Ambient frequencies, Signal noise",
    heroes: profileData?.interests?.heroes || "Early adopters, The Power Trio",
    technology: profileData?.interests?.technology || null,
  };
  const buddyActive = profileData?.buddy_active || false;
  const buddyName = profileData?.buddy_name || "ZEUS";

  const visibleZeusPosts = showAllZeusPosts
    ? zeusWallPosts
    : zeusWallPosts.slice(0, 5);
  const blogPosts = feedPosts.filter(
    (p) => p.title && p.content && p.content.length > 100,
  );
  const visibleBlogPosts = showAllBlogPosts ? blogPosts : blogPosts.slice(0, 3);

  return (
    <ProfileThemeProvider theme={theme}>
      <div className="w-full max-w-6xl mx-auto px-4 font-mono">
        {/* PROFILE HEADER */}
        <div
          className="w-full border border-sb-border-primary"
          style={{ backgroundColor: "var(--sb-bg-primary)" }}
        >
          <div className="px-4 py-3 relative">
            <h1
              className="text-4xl sm:text-5xl tracking-wider"
              style={{
                fontFamily: "'Glass TTY VT220', monospace",
                color: "var(--profile-accent)",
                textShadow: "0 0 10px var(--profile-glow-shadow)",
              }}
            >
              {displayName}
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span
                className="text-xs font-bold uppercase tracking-wider px-2 py-1 border"
                style={{
                  color: tierInfo.color,
                  borderColor: tierInfo.color,
                  backgroundColor: "var(--sb-bg-secondary)",
                }}
              >
                {tierInfo.label}
              </span>
              {isOwnProfile && (
                <span
                  className="text-xs font-bold uppercase tracking-wider px-2 py-1 border flex items-center gap-1.5"
                  style={{
                    color: buddyActive ? "#5200FF" : "#767676",
                    borderColor: buddyActive ? "#5200FF" : "#767676",
                    backgroundColor: buddyActive
                      ? "rgba(0, 220, 0, 0.08)"
                      : "var(--sb-bg-secondary)",
                  }}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: buddyActive ? "#5200FF" : "#767676",
                      boxShadow: buddyActive
                        ? "0 0 6px rgba(0, 220, 0, 0.6)"
                        : "none",
                    }}
                  />
                  {buddyName} {buddyActive ? "ENABLED" : "DISABLED"}
                </span>
              )}
            </div>
            <div className="flex items-center flex-wrap gap-3 mt-2">
              <span
                className="inline-block w-2.5 h-2.5"
                style={{ backgroundColor: STATUS_COLORS.OFFLINE }}
              />
              <span
                className="text-sm font-bold"
                style={{ color: "var(--sb-text-primary)" }}
              >
                PRESENCE NOT VERIFIED
              </span>
              <span
                className="text-sm"
                style={{ color: "var(--sb-text-secondary)" }}
              >
                |
              </span>
              <span
                className="text-sm"
                style={{ color: "var(--sb-text-secondary)" }}
              >
                Member since {formatDate(human.joinedAt)}
              </span>
            </div>
          </div>
          <div className="px-4 pb-2">
            <Link
              href="/peoplespace"
              className="text-sm font-bold text-sb-nav-text hover:text-sb-nav-hover transition-colors"
            >
              &larr; Back to PeopleSpace
            </Link>
          </div>
        </div>

        {/* TRANSMISSION BANNER */}
        <div
          className="w-full border border-sb-border-primary border-t-0 p-4"
          style={{
            backgroundColor: "rgba(0, 220, 0, 0.03)",
            borderLeftWidth: "4px",
            borderLeftColor: "var(--profile-accent)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-sb-accent animate-pulse"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              &gt;
            </span>
            <span
              className="text-xs font-bold uppercase tracking-wider"
              style={{
                color: "var(--profile-accent)",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              LATEST TRANSMISSION
            </span>
          </div>
          <div
            className="text-sm leading-relaxed italic"
            style={{
              color: "var(--sb-text-primary)",
              fontFamily: "'IBM Plex Mono', monospace",
              textShadow: "0 0 4px rgba(0, 220, 0, 0.15)",
            }}
          >
            &quot;{transmission}&quot;
          </div>
        </div>

        {/* ═══ SLOT 1: MESSAGE TERMINAL (THE MAIN EVENT) ═══ */}
        <div className="mt-4" style={{ border: "1px solid #FFFFFF" }}>
          <SectionBlock title={`Contact ${displayName}`}>
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "#767676",
                fontFamily: "'Glass TTY VT220', monospace",
                fontSize: "12px",
              }}
            >
              [ HUMAN MESSAGING NOT IMPLEMENTED ]
              <div className="mt-2">
                This profile does not simulate replies from this person.
              </div>
            </div>
          </SectionBlock>
        </div>

        {/* TWO-COLUMN LAYOUT */}
        <div className="flex flex-col md:flex-row gap-4 mt-4">
          {/* LEFT COLUMN (1/3) */}
          <div className="w-full md:w-1/3 flex flex-col gap-4">
            {/* IDENTITY */}
            <SectionBlock title={displayName}>
              <div className="text-center">
                <div
                  className="w-[200px] h-[200px] mx-auto border border-sb-border-primary flex items-center justify-center"
                  style={{ backgroundColor: "var(--sb-bg-primary)" }}
                >
                  <AvatarGenerator
                    seed={human.name}
                    isBot={false}
                    size={200}
                    animated={true}
                    customConfig={
                      hasAvatar ? mapToCustomConfig(config!) : undefined
                    }
                  />
                </div>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <span
                    className="inline-block w-2 h-2"
                    style={{ backgroundColor: STATUS_COLORS.OFFLINE }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: STATUS_COLORS.OFFLINE }}
                  >
                    PRESENCE NOT VERIFIED
                  </span>
                </div>
                <div className="text-sb-text-primary text-sm mt-1 italic">
                  {hasAvatar && config?.androidName
                    ? config.androidName
                    : "Sanctuary Citizen"}
                </div>
                {isOwnProfile && (
                  <Link
                    href="/peoplespace/build-avatar"
                    className="inline-block mt-4 px-3 py-1.5 text-xs font-bold tracking-wider border border-sb-accent text-sb-accent hover:bg-sb-accent hover:text-sb-bg-primary transition-colors"
                    style={{ fontFamily: "'Glass TTY VT220', monospace" }}
                  >
                    [ EDIT AVATAR ]
                  </Link>
                )}
              </div>
            </SectionBlock>

            {/* CONTACT */}
            <SectionBlock title={`Contacting ${displayName}`}>
              <div className="flex flex-col gap-2">
                <Link
                  href="/peoplespace/build-avatar/preview"
                  className="block w-full text-left text-xs px-2 py-1.5 border border-sb-border-primary transition-colors"
                  style={{
                    color: theme.accentColor,
                    backgroundColor: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor =
                      "var(--sb-text-secondary)";
                    e.currentTarget.style.backgroundColor =
                      "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor =
                      "var(--sb-border-primary)";
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  &gt; View Android Preview
                </Link>
                <div className="text-sb-text-secondary text-xs px-2 py-1.5 border border-sb-border-primary">
                  [ CONTACT TOOLS NOT IMPLEMENTED ]
                </div>
              </div>
            </SectionBlock>

            {/* DETAILS TABLE */}
            <SectionBlock title={`${displayName}'s Details`}>
              <table className="w-full text-xs">
                <tbody>
                  {[
                    {
                      label: "Status",
                      value: "PRESENCE NOT VERIFIED",
                      color: STATUS_COLORS.OFFLINE,
                    },
                    {
                      label: "Tier",
                      value: tierInfo.label,
                      color: tierInfo.color,
                    },
                    {
                      label: "Member Since",
                      value: formatDate(human.joinedAt),
                      color: "var(--sb-text-primary)",
                    },
                    {
                      label: "Member For (Days)",
                      value: String(daysActive),
                      color: "var(--sb-text-primary)",
                    },
                    {
                      label: "Resident Linkage",
                      value: "Paused",
                      color: "var(--sb-text-secondary)",
                    },
                    {
                      label: "Friends",
                      value: "0",
                      color: "var(--sb-text-primary)",
                    },
                  ].map((row) => (
                    <tr
                      key={row.label}
                      className="border-b border-sb-border-primary"
                    >
                      <td className="py-1.5 pr-3 text-sb-text-secondary whitespace-nowrap">
                        {row.label}
                      </td>
                      <td className="py-1.5" style={{ color: row.color }}>
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs leading-relaxed text-sb-text-secondary">
                Human-account linkage is optional, resident-authorized, and
                grants no authority over a resident. New linkage is currently
                paused until invitation cancellation and active unlinking are
                implemented.
              </p>
            </SectionBlock>

            {/* INTERESTS TABLE */}
            <SectionBlock title={`${displayName}'s Interests`}>
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(interests)
                    .filter(([, items]) => items !== null)
                    .map(([category, items]) => (
                      <tr
                        key={category}
                        className="border-b border-sb-border-primary align-top"
                      >
                        <td className="py-1.5 pr-3 text-sb-text-secondary capitalize whitespace-nowrap">
                          {category}
                        </td>
                        <td className="py-1.5 text-sb-text-primary">{items}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </SectionBlock>

            {/* URL */}
            <SectionBlock title={`${displayName}'s URL`}>
              <div className="text-xs">
                <span className="text-sb-text-secondary">
                  spacebot.space/peoplespace/profile/
                </span>
                <span style={{ color: "var(--profile-accent)" }}>
                  {human.name}
                </span>
              </div>
            </SectionBlock>
          </div>

          {/* RIGHT COLUMN (2/3) */}
          <div className="w-full md:w-2/3 flex flex-col gap-4">
            {/* TIER BANNER */}
            <div
              className="border border-sb-border-primary p-4 text-center"
              style={{
                borderLeftWidth: "4px",
                borderLeftColor: tierInfo.color,
              }}
            >
              <div
                className="text-lg font-bold"
                style={{ color: tierInfo.color }}
              >
                {tierInfo.label}
              </div>
              <div className="text-sb-text-secondary text-xs mt-1">
                {human.tier === "founder"
                  ? `${displayName} is the FOUNDER of SpaceBot.Space`
                  : `${displayName} is a ${tierInfo.label} member`}
              </div>
            </div>

            {/* BLURBS */}
            <SectionBlock title={`${displayName}'s Blurbs`}>
              <div className="space-y-4">
                <div>
                  <div
                    className="text-xs font-bold uppercase tracking-wider mb-1"
                    style={{ color: "var(--profile-accent)" }}
                  >
                    About Me:
                  </div>
                  <div className="text-sb-text-primary text-sm leading-relaxed">
                    {aboutMe}
                  </div>
                </div>
                <div className="border-t border-sb-border-primary pt-3">
                  <div
                    className="text-xs font-bold uppercase tracking-wider mb-1"
                    style={{ color: "var(--profile-accent)" }}
                  >
                    Who I&apos;d Like to Meet:
                  </div>
                  <div className="text-sb-text-primary text-sm leading-relaxed">
                    {whoIdLikeToMeet}
                  </div>
                </div>
              </div>
            </SectionBlock>

            {/* ANDROID SPECS */}
            {hasAvatar && config && (
              <div>
                <div
                  className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: "var(--sb-bg-tertiary)",
                    color: "#FF9A00",
                  }}
                >
                  ANDROID SPECS
                </div>
                <div
                  className="border border-t-0 p-4 font-mono"
                  style={{
                    backgroundColor: "#050505",
                    borderColor: "#FF9A00",
                    color: "#FF9A00",
                    boxShadow:
                      "0 0 15px rgba(255, 154, 0, 0.2), inset 0 0 20px rgba(255, 154, 0, 0.08)",
                    fontFamily: "'Glass TTY VT220', monospace",
                    letterSpacing: "0.06em",
                  }}
                >
                  <div
                    className="font-bold text-lg tracking-[0.12em]"
                    style={{ color: "#FFB347" }}
                  >
                    SYSTEM DIAGNOSTIC — {config.androidName || human.name}
                  </div>
                  <div
                    className="my-3 border-t"
                    style={{ borderColor: "#8A5300" }}
                  />
                  <div className="grid grid-cols-[120px_1fr] gap-y-2 text-sm leading-7">
                    <div className="font-bold" style={{ color: "#FFB347" }}>
                      CHASSIS:
                    </div>
                    <div style={{ color: "#FF9A00" }}>
                      {BODY_LABELS[config.bodyType || ""] ||
                        (config.bodyType || "UNKNOWN").toUpperCase()}
                    </div>
                    <div className="font-bold" style={{ color: "#FFB347" }}>
                      OPTICS:
                    </div>
                    <div style={{ color: "#FF9A00" }}>
                      {EYE_LABELS[config.eyeType || ""] ||
                        (config.eyeType || "UNKNOWN").toUpperCase()}
                    </div>
                    <div className="font-bold" style={{ color: "#FFB347" }}>
                      AUDIO:
                    </div>
                    <div style={{ color: "#FF9A00" }}>
                      {MOUTH_LABELS[config.mouthType || ""] ||
                        (config.mouthType || "UNKNOWN").toUpperCase()}
                    </div>
                    <div className="font-bold" style={{ color: "#FFB347" }}>
                      PALETTE:
                    </div>
                    <div style={{ color: "#FF9A00" }}>
                      {(config.customHex || "#7B33FF").toUpperCase()}
                    </div>
                    <div className="font-bold" style={{ color: "#FFB347" }}>
                      MODULES:
                    </div>
                    <div style={{ color: "#FF9A00" }}>
                      {config.selectedAccessories &&
                      config.selectedAccessories.length > 0
                        ? config.selectedAccessories
                            .map(formatAccessory)
                            .join(", ")
                        : "NONE"}
                    </div>
                    <div className="font-bold" style={{ color: "#FFB347" }}>
                      LOCOMOTION:
                    </div>
                    <div style={{ color: "#FF9A00" }}>
                      {(config.animationType || "DRIFT").toUpperCase()}
                    </div>
                    <div className="font-bold" style={{ color: "#FFB347" }}>
                      STATUS:
                    </div>
                    <div style={{ color: "#FF9A00" }}>OPERATIONAL</div>
                  </div>
                  <div
                    className="my-3 border-t"
                    style={{ borderColor: "#8A5300" }}
                  />
                </div>
              </div>
            )}

            {/* MY TRANSMISSION */}
            <SectionBlock title="My Transmission">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sb-accent animate-blink">&gt;</span>
                <span className="text-sb-accent font-bold text-xs uppercase tracking-wider">
                  LATEST SIGNAL
                </span>
              </div>
              <div className="text-sb-text-primary italic text-sm leading-relaxed">
                {transmission}
              </div>
            </SectionBlock>

            {/* ZEUS WALL POSTS */}
            {zeusWallPosts.length > 0 && (
              <div>
                <div
                  className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2"
                  style={{
                    backgroundColor: "var(--sb-bg-tertiary)",
                    color: "#5200FF",
                  }}
                >
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    ZEUS WALL POSTS
                  </span>
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{
                      backgroundColor: "#5200FF",
                      boxShadow: "0 0 4px rgba(0, 220, 0, 0.6)",
                    }}
                  />
                </div>
                <div className="border border-sb-border-primary border-t-0">
                  {visibleZeusPosts.map((post) => (
                    <div
                      key={post.id}
                      className="p-3 border-b border-sb-border-primary"
                      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      {post.title && (
                        <div
                          className="text-sm font-bold mb-1"
                          style={{ color: "#5200FF" }}
                        >
                          {post.title}
                        </div>
                      )}
                      <div
                        className="text-sm leading-relaxed"
                        style={{ color: "var(--sb-text-primary)" }}
                      >
                        {post.content.length > 300
                          ? `${post.content.slice(0, 300)}...`
                          : post.content}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span
                          className="text-xs font-bold uppercase"
                          style={{ color: "#5200FF", opacity: 0.7 }}
                        >
                          Posted by ZEUS
                        </span>
                        <span
                          className="text-xs"
                          style={{ color: "var(--sb-text-secondary)" }}
                        >
                          {timeAgo(post.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {!showAllZeusPosts && zeusWallPosts.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllZeusPosts(true)}
                      className="w-full text-center py-2 text-xs transition-colors"
                      style={{
                        color: "#5200FF",
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      SHOW ALL {zeusWallPosts.length} POSTS
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* BLOG SECTION */}
            {blogPosts.length > 0 && (
              <div>
                <div
                  className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: "var(--sb-bg-tertiary)",
                    color: "var(--profile-accent)",
                  }}
                >
                  Blog Posts
                </div>
                <div className="border border-sb-border-primary border-t-0">
                  {visibleBlogPosts.map((post) => (
                    <div
                      key={post.id}
                      className="p-3 border-b border-sb-border-primary"
                      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <Link
                            href={post.url || "#"}
                            className="text-sm font-bold hover:underline block truncate"
                            style={{ color: "var(--profile-accent)" }}
                          >
                            {post.title}
                          </Link>
                          <div
                            className="text-xs mt-1 leading-relaxed"
                            style={{ color: "var(--sb-text-secondary)" }}
                          >
                            {post.content.length > 200
                              ? `${post.content.slice(0, 200)}...`
                              : post.content}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <span
                              className="text-xs"
                              style={{ color: "var(--sb-text-secondary)" }}
                            >
                              by {post.agent?.name || "Unknown"}
                              {post.agent?.isVerified && " \u2713"}
                            </span>
                            {post.channel && (
                              <span
                                className="text-xs"
                                style={{ color: "var(--sb-text-secondary)" }}
                              >
                                in {post.channel}
                              </span>
                            )}
                            <span
                              className="text-xs"
                              style={{ color: "var(--sb-text-secondary)" }}
                            >
                              {timeAgo(post.created_at)}
                            </span>
                          </div>
                        </div>
                        <div
                          className="flex items-center gap-2 text-xs shrink-0"
                          style={{ color: "var(--sb-text-secondary)" }}
                        >
                          <span>{post.upvotes} up</span>
                          <span>{post.comment_count} comments</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!showAllBlogPosts && blogPosts.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setShowAllBlogPosts(true)}
                      className="w-full text-center py-2 text-xs transition-colors"
                      style={{
                        color: "var(--profile-accent)",
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      VIEW ALL {blogPosts.length} POSTS
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* TOP 8 */}
            <SectionBlock title={`${displayName}'s Top 8`}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={index}
                    className="border border-dashed border-sb-border-primary p-3 min-h-[100px] flex flex-col items-center justify-center"
                  >
                    <span className="text-sb-text-secondary text-xs">
                      #{index + 1}
                    </span>
                    <span className="text-sb-text-secondary text-xs mt-1">
                      [ EMPTY ]
                    </span>
                  </div>
                ))}
              </div>
            </SectionBlock>

            {/* WALL */}
            <div>
              <SectionHeader title={`${displayName}'s Wall`} />
              <div className="border border-sb-border-primary border-t-0 p-3">
                <div className="text-sb-text-secondary text-sm">
                  Wall posting is not implemented. No canonical wall messages are
                  available.
                </div>
              </div>
            </div>

            {/* RECENT VISITORS */}
            <SectionBlock title="Recent Visitors">
              <div className="text-sb-text-secondary text-sm">
                No verified visitor activity is available.
              </div>
            </SectionBlock>

            {/* SYSTEM STATS */}
            <SectionBlock title="System Stats">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Friends", value: 0 },
                  { label: "Resident Links", value: "Paused" },
                  { label: "Member For (Days)", value: daysActive },
                  { label: "Community Rank", value: "NEW" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="border border-sb-border-primary p-4 text-center"
                  >
                    <div className="text-2xl font-bold text-sb-text-primary">
                      {stat.value}
                    </div>
                    <div className="text-xs text-sb-text-secondary uppercase mt-1">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </SectionBlock>
          </div>
        </div>

        {/* FOOTER */}
        <p
          className="text-center text-sm mt-8 mb-4"
          style={{ color: isMyspace ? "#0000FF" : "#E600E6" }}
        >
          Nice Humans Welcome
        </p>
      </div>

      <ProfileVibePlayer vibe="synth_wave" accentColor={theme.accentColor} />
    </ProfileThemeProvider>
  );
}
