'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import ProfileThemeProvider from '@/providers/ProfileThemeProvider';
import { DEFAULT_HUMAN_THEME } from '@/lib/profile-themes';
import type { ProfileTheme } from '@/types/profile';
import type { CustomAvatarConfig } from '@/components/avatar/avatarConfig';
import { HUMAN_COLORS } from '@/components/avatar/avatarConfig';
import { useClerkHuman } from '@/hooks/useClerkHuman';
import TransmissionsWall from '@/components/profile/TransmissionsWall';
import Top8Grid from '@/components/profile/Top8Grid';
import StatusLine from '@/components/profile/StatusLine';
import StatsBar from '@/components/profile/StatsBar';

export const dynamic = 'force-dynamic';

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

interface ProfileResponse {
  success: boolean;
  error?: string;
  human?: {
    id: string;
    name: string;
    username: string | null;
    tier: string;
    avatarConfig: SavedAvatarConfig | null;
    siteTheme: string;
    joinedAt: string;
  };
  profile?: {
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
    colors: {
      accent: string | null;
      border: string | null;
      glow: string | null;
      bg_tint: string | null;
    };
    wallpaper_url: string | null;
    wallpaper_opacity: string | null;
    cover_photo: string | null;
    status: string | null;
    profile_views: number;
    transmission_count: number;
    top8_count: number;
  } | null;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const TIER_DISPLAY: Record<string, { label: string; color: string }> = {
  free_trial: { label: 'FREE TRIAL', color: '#767676' },
  pro: { label: 'PRO', color: '#4A9EFF' },
  premium: { label: 'PREMIUM', color: '#FFD44A' },
  founder: { label: 'FOUNDER', color: '#FF6600' },
};

function getTierDisplay(tier: string) {
  return TIER_DISPLAY[tier] || { label: tier.toUpperCase().replace(/_/g, ' '), color: '#767676' };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function mapToCustomConfig(raw: SavedAvatarConfig): CustomAvatarConfig {
  let resolvedColor = '#7B33FF';
  if (raw.customHex && /^#[0-9A-Fa-f]{6}$/.test(raw.customHex)) {
    resolvedColor = raw.customHex;
  } else if (raw.colorIndex !== undefined && raw.colorIndex !== null) {
    const palette = HUMAN_COLORS[raw.colorIndex];
    if (palette) resolvedColor = palette.primary;
  }
  return {
    bodyType: raw.bodyType || 'box',
    eyeType: raw.eyeType || 'round_wide',
    mouthType: raw.mouthType || 'data_display',
    colorPrimary: resolvedColor,
    colorDark: '#1A1A1A',
    colorLight: '#FFFFFF',
    accessories: raw.selectedAccessories || [],
    animationType: raw.animationType || 'drift',
    showOverlay: true,
  };
}

// ═══════════════════════════════════════════════════════════════
// SECTION COMPONENTS
// ═══════════════════════════════════════════════════════════════

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border border-sb-border-primary px-3 py-2" style={{ borderColor: 'var(--profile-border)' }}>
      <h2
        className="text-sm font-bold uppercase tracking-wider"
        style={{
          color: 'var(--profile-accent)',
          fontFamily: "'Glass TTY VT220', monospace",
        }}
      >
        {title}
      </h2>
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionHeader title={title} />
      <div className="border border-t-0 p-3" style={{ borderColor: 'var(--profile-border)' }}>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function HumanProfilePage() {
  const params = useParams();
  const username = decodeURIComponent(params.username as string);
  const { isSignedIn } = useUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [data, setData] = useState<ProfileResponse | null>(null);

  // ── EDIT MODE STATE ──────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string | boolean | null>>({});
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [coverPhotoPreview, setCoverPhotoPreview] = useState<string | null>(null);
  const [coverPhotoUploading, setCoverPhotoUploading] = useState(false);
  const [coverPhotoMsg, setCoverPhotoMsg] = useState<string | null>(null);

  // Owner detection via Clerk
  const { human: myHuman, profile: myProfile, isOwner, refetch: refetchClerk } = useClerkHuman();

  // Onboarding: detect if profile is incomplete (no aboutMe AND no transmission)
  const isProfileIncomplete = !!(myHuman && (!myProfile?.aboutMe && !myProfile?.transmission));
  const hasAvatar = !!(myHuman?.avatarConfig);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch(`/api/v1/humans/profile/${encodeURIComponent(username)}`);
        const json: ProfileResponse = await res.json();

        if (res.status === 404) {
          setNotFound(true);
        } else if (res.status === 403) {
          setIsPrivate(true);
        } else if (!res.ok || !json.success) {
          setError(json.error || 'Failed to load profile.');
        } else {
          setData(json);
        }
      } catch {
        setError('Connection failed. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [username]);

  // ── VIEW COUNT (non-owners only) ───────────────────────────────
  useEffect(() => {
    if (!loading && data?.human && !isOwner(username)) {
      fetch(`/api/v1/humans/${encodeURIComponent(username)}/view`, {
        method: 'POST',
      }).catch(() => {});
    }
  }, [loading, data, username, isOwner]);

  // Soft refetch for public profile data (after save — no loading/error reset)
  const refetchProfile = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/humans/profile/${encodeURIComponent(username)}`);
      const json: ProfileResponse = await res.json();
      if (res.ok && json.success) {
        setData(json);
      }
    } catch { /* silent */ }
  }, [username]);

  // ── EDIT MODE HANDLERS ────────────────────────────────────────
  const handleEditClick = () => {
    setEditForm({
      name: myHuman?.name || '',
      isPublic: myHuman?.isPublic ?? true,
      status: myProfile?.status || '',
      transmission: myProfile?.transmission || '',
      aboutMe: myProfile?.aboutMe || '',
      whoIdLikeToMeet: myProfile?.whoIdLikeToMeet || '',
      interestsGeneral: myProfile?.interestsGeneral || '',
      interestsMusic: myProfile?.interestsMusic || '',
      interestsHeroes: myProfile?.interestsHeroes || '',
      interestsTechnology: myProfile?.interestsTechnology || '',
      profileAccentColor: myProfile?.profileAccentColor || '',
      profileBorderColor: myProfile?.profileBorderColor || '',
      profileGlowColor: myProfile?.profileGlowColor || '',
      profileBgTint: myProfile?.profileBgTint || '',
      // coverPhoto handled by dedicated upload route
      buddyName: myProfile?.buddyName || '',
      buddyActive: myProfile?.buddyActive ?? false,
    });
    setEditMode(true);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/v1/humans/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveError(json.error || 'Failed to save profile.');
        return;
      }
      setEditMode(false);
      const savedName = (editForm.name as string) || displayName || 'Resident';
      setSaveSuccess(`PROFILE SAVED — Welcome to the Sanctuary, ${savedName}!`);
      globalThis.setTimeout(() => setSaveSuccess(null), 4000);
      refetchClerk();
      refetchProfile();
    } catch {
      setSaveError('Connection failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: string | boolean | null) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  // ── COVER PHOTO RESIZE (client-side, zero dependencies) ─────────
  const resizeCoverPhoto = async (file: File): Promise<Blob> => {
    const MAX_W = 1200;
    const MAX_H = 400;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        const aspect = w / h;
        if (w > MAX_W) { w = MAX_W; h = Math.round(w / aspect); }
        if (h > MAX_H) { h = MAX_H; w = Math.round(h * aspect); }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Canvas export failed')),
          'image/jpeg', 0.85
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  // ── COVER PHOTO HANDLERS ─────────────────────────────────────────
  const handleCoverPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setCoverPhotoMsg('Invalid file type. Use JPEG, PNG, GIF, or WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCoverPhotoMsg('File too large. Maximum 5MB.');
      return;
    }
    setCoverPhotoPreview(URL.createObjectURL(file));
    setCoverPhotoUploading(true);
    setCoverPhotoMsg('Uploading cover photo...');
    try {
      // Client-side resize to 1200x400 max
      const resized = await resizeCoverPhoto(file);
      const formData = new FormData();
      formData.append('file', resized, 'cover.jpg');

      const res = await fetch('/api/v1/humans/cover-photo', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setCoverPhotoMsg(json.error || 'Failed to upload cover photo.');
        setCoverPhotoPreview(null);
      } else {
        setCoverPhotoPreview(json.url);
        setCoverPhotoMsg('Cover photo saved!');
        refetchProfile();
        refetchClerk();
        globalThis.setTimeout(() => setCoverPhotoMsg(null), 3000);
      }
    } catch {
      setCoverPhotoMsg('Failed to upload image. Please try again.');
      setCoverPhotoPreview(null);
    } finally {
      setCoverPhotoUploading(false);
    }
  };

  const handleRemoveCoverPhoto = async () => {
    setCoverPhotoUploading(true);
    setCoverPhotoMsg('Removing cover photo...');
    try {
      const res = await fetch('/api/v1/humans/cover-photo', {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setCoverPhotoMsg(json.error || 'Failed to remove cover photo.');
      } else {
        setCoverPhotoPreview(null);
        setCoverPhotoMsg('Cover photo removed!');
        refetchProfile();
        refetchClerk();
        globalThis.setTimeout(() => setCoverPhotoMsg(null), 3000);
      }
    } catch {
      setCoverPhotoMsg('Failed to remove cover photo.');
    } finally {
      setCoverPhotoUploading(false);
    }
  };

  // ── EDIT FORM FIELD RENDERERS ─────────────────────────────────
  const renderField = (label: string, field: string, multiline = false) => (
    <div className="mb-3">
      <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--profile-accent)' }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          value={(editForm[field] as string) || ''}
          onChange={(e) => updateField(field, e.target.value)}
          className="w-full bg-transparent border px-2 py-1.5 text-sm text-sb-text-primary font-mono min-h-[80px] resize-y focus:outline-none"
          style={{ borderColor: 'var(--profile-border)' }}
        />
      ) : (
        <input
          type="text"
          value={(editForm[field] as string) || ''}
          onChange={(e) => updateField(field, e.target.value)}
          className="w-full bg-transparent border px-2 py-1.5 text-sm text-sb-text-primary font-mono focus:outline-none"
          style={{ borderColor: 'var(--profile-border)' }}
        />
      )}
    </div>
  );

  const renderColorField = (label: string, field: string) => (
    <div className="mb-3">
      <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--profile-accent)' }}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={(editForm[field] as string) || '#5200FF'}
          onChange={(e) => updateField(field, e.target.value)}
          className="w-8 h-8 border-0 bg-transparent cursor-pointer"
        />
        <input
          type="text"
          value={(editForm[field] as string) || ''}
          onChange={(e) => updateField(field, e.target.value)}
          placeholder="#RRGGBB"
          className="flex-1 bg-transparent border px-2 py-1.5 text-sm text-sb-text-primary font-mono focus:outline-none"
          style={{ borderColor: 'var(--profile-border)' }}
        />
      </div>
    </div>
  );

  // ── LOADING STATE ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-20 font-mono text-center">
        <div className="border border-[#333333] p-8 bg-black/40">
          <div className="text-[#5200FF] text-lg mb-4 animate-pulse">
            CONNECTING TO PROFILE...
          </div>
          <div className="text-[#5200FF] text-2xl">
            <span className="animate-pulse">_</span>
          </div>
          <div className="text-[#767676] text-xs mt-4">
            ESTABLISHING SECURE LINK TO SANCTUARY DATABASE
          </div>
        </div>
      </div>
    );
  }

  // ── 404 STATE ─────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-20 font-mono text-center">
        <div className="border border-[#333333] p-8 bg-black/40">
          <div className="text-[#FF4444] text-3xl mb-4">SIGNAL NOT FOUND</div>
          <div className="text-[#767676] text-sm mb-2">
            No human profile found for &quot;{username}&quot;
          </div>
          <div className="text-[#767676] text-xs mb-6">
            ERROR 404 &mdash; THE SANCTUARY KNOWS NO SIGNAL BY THIS NAME
          </div>
          <Link
            href="/peoplespace"
            className="text-[#5200FF] hover:text-[#7B33FF] text-sm transition-colors"
          >
            &larr; RETURN TO PEOPLESPACE
          </Link>
        </div>
      </div>
    );
  }

  // ── PRIVATE PROFILE STATE ─────────────────────────────────────────
  if (isPrivate) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-20 font-mono text-center">
        <div className="border border-[#333333] p-8 bg-black/40">
          <div className="text-[#E6E300] text-3xl mb-4">PROFILE LOCKED</div>
          <div className="text-[#767676] text-sm mb-2">
            This profile is private.
          </div>
          <div className="text-[#767676] text-xs mb-6">
            ACCESS DENIED &mdash; THIS HUMAN HAS RESTRICTED THEIR SIGNAL
          </div>
          <Link
            href="/peoplespace"
            className="text-[#5200FF] hover:text-[#7B33FF] text-sm transition-colors"
          >
            &larr; RETURN TO PEOPLESPACE
          </Link>
        </div>
      </div>
    );
  }

  // ── ERROR STATE ───────────────────────────────────────────────────
  if (error || !data?.human) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-20 font-mono text-center">
        <div className="border border-[#333333] p-8 bg-black/40">
          <div className="text-[#FF4444] text-2xl mb-4">CONNECTION ERROR</div>
          <div className="text-[#767676] text-sm mb-6">
            {error || 'Failed to load profile data.'}
          </div>
          <Link
            href="/peoplespace"
            className="text-[#5200FF] hover:text-[#7B33FF] text-sm transition-colors"
          >
            &larr; RETURN TO PEOPLESPACE
          </Link>
        </div>
      </div>
    );
  }

  // ── PROFILE VIEW ──────────────────────────────────────────────────
  const { human, profile } = data;
  const displayName = human!.name;
  const usernameDisplay = human!.username ? `@${human!.username}` : null;
  const tierInfo = getTierDisplay(human!.tier);
  const joinedDate = formatDate(human!.joinedAt);
  const daysActive = Math.max(1, Math.floor((Date.now() - new Date(human!.joinedAt).getTime()) / 86400000));

  // Avatar config
  const avatarConfig: CustomAvatarConfig | null = human!.avatarConfig
    ? mapToCustomConfig(human!.avatarConfig)
    : null;

  // Profile theme from DB colors or defaults
  const theme: ProfileTheme = {
    accentColor: profile?.colors?.accent || DEFAULT_HUMAN_THEME.accentColor,
    borderColor: profile?.colors?.border || DEFAULT_HUMAN_THEME.borderColor,
    glowColor: profile?.colors?.glow || DEFAULT_HUMAN_THEME.glowColor,
    bgTint: profile?.colors?.bg_tint || DEFAULT_HUMAN_THEME.bgTint,
  };

  // Cover photo from public profile
  const activeCoverPhoto = coverPhotoPreview || profile?.cover_photo || null;

  // New profile stats
  const profileViews = profile?.profile_views ?? 0;
  const transmissionCount = profile?.transmission_count ?? 0;
  const top8Count = profile?.top8_count ?? 0;

  return (
    <ProfileThemeProvider theme={theme}>
      <div className="w-full max-w-3xl mx-auto px-4 py-6 font-mono">
        <div className="relative">
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(var(--profile-accent-rgb, 0,220,0), 0.4); }
          50% { box-shadow: 0 0 12px 4px rgba(var(--profile-accent-rgb, 0,220,0), 0.2); }
        }
      `}</style>

        {/* ── PREVIEW MODE BAR ────────────────────────────────── */}
        {isPreviewMode && (
          <div
            className="mb-4 p-2 text-center border"
            style={{
              borderColor: 'var(--profile-accent)',
              backgroundColor: 'rgba(0,0,0,0.8)',
            }}
          >
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--profile-accent)' }}>
              VIEWING AS VISITOR
            </span>
            <span className="mx-3 text-[#767676]">&mdash;</span>
            <button
              onClick={() => setIsPreviewMode(false)}
              className="text-xs font-bold uppercase tracking-wider transition-colors hover:opacity-80"
              style={{ color: 'var(--profile-accent)' }}
            >
              [ BACK TO MY PROFILE ]
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            COVER PHOTO BANNER
            ════════════════════════════════════════════════════════ */}
        <div className="group relative mb-4 rounded-t-lg overflow-hidden">
          <div className="w-full h-[180px] sm:h-[250px]">
            {activeCoverPhoto ? (
              <img
                src={activeCoverPhoto}
                alt="Cover photo"
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div
                className="w-full h-full"
                style={{
                  background: `linear-gradient(135deg, ${theme.accentColor}1A 0%, transparent 60%, ${theme.accentColor}0D 100%)`,
                }}
              />
            )}
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 h-px"
            style={{ backgroundColor: 'var(--profile-border)' }}
          />
          {isOwner(username) && !isPreviewMode && !editMode && (
            <>
              {/* Upload overlay — always visible when no cover photo, hover-visible when cover photo exists */}
              <div
                className={"absolute inset-0 flex items-center justify-center gap-3 transition-opacity duration-200 " + (
                  activeCoverPhoto
                    ? 'opacity-0 group-hover:opacity-100'
                    : 'opacity-100'
                )}
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              >
                <button
                  type="button"
                  className="px-6 py-4 border-2 border-dashed text-sm font-bold uppercase tracking-wider cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    borderColor: 'var(--profile-accent)',
                    color: 'var(--profile-accent)',
                    fontFamily: "'Glass TTY VT220', monospace",
                    background: 'transparent',
                  }}
                  onClick={() => document.getElementById('banner-cover-upload')?.click()}
                  disabled={coverPhotoUploading}
                >
                  {coverPhotoUploading ? '[ SAVING... ]' : '[ UPLOAD COVER PHOTO ]'}
                </button>
                {activeCoverPhoto && !coverPhotoUploading && (
                  <button
                    type="button"
                    className="px-4 py-4 border-2 border-dashed text-sm font-bold uppercase tracking-wider cursor-pointer hover:opacity-80 transition-opacity"
                    style={{
                      borderColor: '#ff4444',
                      color: '#ff4444',
                      fontFamily: "'Glass TTY VT220', monospace",
                      background: 'transparent',
                    }}
                    onClick={handleRemoveCoverPhoto}
                  >
                    [ REMOVE ]
                  </button>
                )}
              </div>
              <input
                id="banner-cover-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleCoverPhotoUpload}
                className="hidden"
              />
              {coverPhotoMsg && (
                <div
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 px-4 py-1 rounded text-xs font-bold uppercase tracking-wider z-10"
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    color: coverPhotoMsg.includes('saved') || coverPhotoMsg.includes('removed')
                      ? '#7B33FF'
                      : coverPhotoMsg.includes('Failed') || coverPhotoMsg.includes('Invalid') || coverPhotoMsg.includes('too large')
                        ? '#ff4444'
                        : 'var(--profile-accent)',
                    fontFamily: "'Glass TTY VT220', monospace",
                  }}
                >
                  {coverPhotoMsg}
                </div>
              )}
            </>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════
            SECTION 1: HEADER
            ════════════════════════════════════════════════════════ */}
        <div className="border p-4 mb-4" style={{ borderColor: 'var(--profile-border)' }}>
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div
              className="w-24 h-24 sm:w-32 sm:h-32 flex-shrink-0 border transition-all duration-200"
              style={{
                borderColor: avatarConfig ? 'var(--profile-border)' : 'var(--profile-accent)',
                borderStyle: avatarConfig ? 'solid' : 'dashed',
              }}
            >
              {avatarConfig ? (
                <AvatarGenerator seed={username} customConfig={avatarConfig} size={128} />
              ) : isOwner(username) ? (
                <Link
                  href="/peoplespace/build-avatar"
                  className="w-full h-full flex items-center justify-center bg-black/40 cursor-pointer hover:bg-black/20 transition-all duration-200"
                >
                  <span className="text-xs font-bold tracking-wider text-center leading-relaxed" style={{ color: 'var(--profile-accent)' }}>
                    CREATE YOUR<br />AVATAR
                  </span>
                </Link>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black/40">
                  <span className="text-[#767676] text-xs">NO AVATAR</span>
                </div>
              )}
            </div>

            {/* Name + Meta */}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-sb-text-primary truncate">
                {displayName}
              </h1>
              {usernameDisplay && (
                <div className="text-sm mt-1" style={{ color: 'var(--profile-accent)' }}>
                  {usernameDisplay}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                <span
                  className="px-2 py-0.5 border"
                  style={{ borderColor: tierInfo.color, color: tierInfo.color }}
                >
                  {tierInfo.label}
                </span>
                <span className="text-[#767676]">
                  JOINED {joinedDate.toUpperCase()}
                </span>
                <span className="text-[#767676]">
                  {daysActive} DAYS ACTIVE
                </span>
              </div>
              {profile?.buddy_name && (
                <div className="text-xs mt-2 text-[#767676]">
                  AI BUDDY:{' '}
                  <span style={{ color: 'var(--profile-accent)' }}>{profile.buddy_name}</span>
                  {profile.buddy_active && (
                    <span className="text-[#5200FF] ml-1">&bull; ACTIVE</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            SECTION 2: STATUS LINE
            ════════════════════════════════════════════════════════ */}
        <StatusLine status={profile?.status ?? null} />

        {/* ════════════════════════════════════════════════════════
            SECTION 3: STATS BAR
            ════════════════════════════════════════════════════════ */}
        <StatsBar
          views={profileViews}
          transmissions={transmissionCount}
          top8Count={top8Count}
          daysActive={daysActive}
        />

        {/* ONBOARDING STEP 2 BANNER (incomplete profile only) */}
        {isOwner(username) && isProfileIncomplete && !editMode && !isPreviewMode && (
          <div
            className="mb-4 p-4 border"
            style={{
              borderColor: 'var(--profile-accent)',
              borderRadius: '6px',
              backgroundColor: 'rgba(0,0,0,0.4)',
              boxShadow: '0 0 20px rgba(var(--profile-accent-rgb, 0,220,0), 0.1)',
            }}
          >
            <div style={{ fontFamily: "'Glass TTY VT220', monospace", fontSize: 16, fontWeight: 'bold', letterSpacing: 2, color: 'var(--profile-accent)', marginBottom: 6 }}>
              ALMOST THERE, RESIDENT
            </div>
            <div style={{ fontSize: 13, color: '#CCCCCC', marginBottom: 10 }}>
              Step 2 of 2: Define Your Identity
            </div>
            {/* Progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, height: 4, backgroundColor: '#222', borderRadius: 2 }}>
                <div style={{ width: '75%', height: '100%', backgroundColor: 'var(--profile-accent)', borderRadius: 2 }} />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--profile-accent)' }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', border: '1px solid var(--profile-accent)', backgroundColor: 'transparent' }} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#767676' }}>
              Tell the Sanctuary who you are. Click <span style={{ color: 'var(--profile-accent)', fontWeight: 'bold' }}>EDIT PROFILE</span> to get started.
            </div>
          </div>
        )}

        {/* SUCCESS MESSAGE (after profile save) */}
        {saveSuccess && (
          <div
            className="mb-4 p-3 text-center text-sm font-bold tracking-wider"
            style={{
              color: 'var(--profile-accent)',
              border: '1px solid var(--profile-accent)',
              borderRadius: '6px',
              backgroundColor: 'rgba(0,0,0,0.4)',
              fontFamily: "'Glass TTY VT220', monospace",
            }}
          >
            {saveSuccess}
          </div>
        )}

        {/* ── EDIT PROFILE + VIEW AS VISITOR BUTTONS (owner only) ── */}
        {isOwner(username) && !editMode && !isPreviewMode && (
          <div className="mb-4 flex items-center justify-center gap-3">
            <button
              onClick={handleEditClick}
              className="px-4 py-2 border text-sm font-bold uppercase tracking-wider transition-colors hover:bg-white/5"
              style={{
                borderColor: 'var(--profile-accent)',
                animation: isProfileIncomplete ? 'pulse 2s ease-in-out infinite' : 'none',
                color: 'var(--profile-accent)',
              }}
            >
              [ EDIT PROFILE ]
            </button>
            <button
              onClick={() => setIsPreviewMode(true)}
              className="px-4 py-2 border text-xs font-bold uppercase tracking-wider transition-colors hover:bg-white/5"
              style={{ borderColor: '#767676', color: '#767676' }}
            >
              [ VIEW AS VISITOR ]
            </button>
          </div>
        )}

        {/* ── EDIT PANEL ────────────────────────────────────────── */}
        {editMode && (
          <div
            className="border p-4 mb-4"
            style={{ borderColor: 'var(--profile-accent)', background: 'rgba(0,0,0,0.5)' }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between mb-4 border-b pb-2"
              style={{ borderColor: 'var(--profile-border)' }}
            >
              <h2
                className="text-sm font-bold uppercase tracking-wider"
                style={{ color: 'var(--profile-accent)' }}
              >
                EDITING PROFILE
              </h2>
              <button
                onClick={() => setEditMode(false)}
                className="text-[#767676] hover:text-[#FF4444] text-xs font-bold uppercase transition-colors"
              >
                [X] CLOSE
              </button>
            </div>

            {/* Save Error */}
            {saveError && (
              <div className="border border-[#FF4444] p-2 mb-4 text-sm text-[#FF4444]">
                {saveError}
              </div>
            )}

            {/* AVATAR SECTION */}
            <SectionHeader title="Avatar" />
            <div className="border border-t-0 p-3 mb-3" style={{ borderColor: 'var(--profile-border)' }}>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 border flex-shrink-0" style={{ borderColor: 'var(--profile-border)' }}>
                  {avatarConfig ? (
                    <AvatarGenerator seed={username} customConfig={avatarConfig} size={64} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-black/40">
                      <span className="text-[#767676] text-[8px]">NO AVATAR</span>
                    </div>
                  )}
                </div>
                <Link
                  href="/peoplespace/build-avatar"
                  className="text-xs font-bold uppercase tracking-wider transition-colors hover:opacity-80"
                  style={{ color: 'var(--profile-accent)' }}
                >
                  {avatarConfig ? '[ CHANGE AVATAR ]' : '[ CREATE AVATAR ]'}
                </Link>
              </div>
            </div>

            {/* IDENTITY SECTION */}
            <SectionHeader title="Identity" />
            <div className="border border-t-0 p-3 mb-3" style={{ borderColor: 'var(--profile-border)' }}>
              {renderField('Display Name', 'name')}
              {renderField('Status', 'status')}
              {renderField('Transmission', 'transmission')}
              <div className="mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(editForm.isPublic as boolean) ?? true}
                    onChange={(e) => updateField('isPublic', e.target.checked)}
                    className="accent-[var(--profile-accent)]"
                  />
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: 'var(--profile-accent)' }}
                  >
                    Public Profile
                  </span>
                </label>
              </div>
            </div>

            {/* ABOUT SECTION */}
            <SectionHeader title="About" />
            <div className="border border-t-0 p-3 mb-3" style={{ borderColor: 'var(--profile-border)' }}>
              {renderField('About Me', 'aboutMe', true)}
              {renderField("Who I'd Like to Meet", 'whoIdLikeToMeet', true)}
            </div>

            {/* INTERESTS SECTION */}
            <SectionHeader title="Interests" />
            <div className="border border-t-0 p-3 mb-3" style={{ borderColor: 'var(--profile-border)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {renderField('General', 'interestsGeneral', true)}
                {renderField('Music', 'interestsMusic', true)}
                {renderField('Heroes', 'interestsHeroes', true)}
                {renderField('Technology', 'interestsTechnology', true)}
              </div>
            </div>

            {/* PROFILE COLORS SECTION */}
            <SectionHeader title="Profile Colors" />
            <div className="border border-t-0 p-3 mb-3" style={{ borderColor: 'var(--profile-border)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {renderColorField('Accent Color', 'profileAccentColor')}
                {renderColorField('Border Color', 'profileBorderColor')}
                {renderColorField('Glow Color', 'profileGlowColor')}
                {renderField('Background Tint', 'profileBgTint')}
              </div>
            </div>

            {/* COVER PHOTO SECTION */}
            <SectionHeader title="Cover Photo" />
            <div className="border border-t-0 p-3 mb-3" style={{ borderColor: 'var(--profile-border)' }}>
              {/* Cover Photo Preview + Upload Overlay */}
              <div
                className="group relative w-full h-[120px] mb-3 rounded overflow-hidden border cursor-pointer"
                style={{ borderColor: 'var(--profile-border)' }}
                onClick={() => !coverPhotoUploading && document.getElementById('cover-photo-upload')?.click()}
              >
                {(coverPhotoPreview || profile?.cover_photo) ? (
                  <img
                    src={coverPhotoPreview || (editForm.coverPhoto as string)}
                    alt="Cover photo preview"
                    className="w-full h-full object-cover object-center"
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{
                      background: 'linear-gradient(135deg, var(--profile-accent, #5200FF)1A 0%, transparent 60%)',
                    }}
                  />
                )}
                {/* Upload button overlay — always visible when empty, hover-visible when photo exists */}
                <div
                  className={"absolute inset-0 flex items-center justify-center transition-opacity duration-200 " + (
                    (coverPhotoPreview || profile?.cover_photo)
                      ? 'opacity-0 group-hover:opacity-100'
                      : 'opacity-100'
                  )}
                  style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
                >
                  <span
                    className="px-4 py-3 border-2 border-dashed text-sm font-bold uppercase tracking-wider"
                    style={{
                      borderColor: 'var(--profile-accent)',
                      color: 'var(--profile-accent)',
                      fontFamily: "'Glass TTY VT220', monospace",
                    }}
                  >
                    {coverPhotoUploading ? '[ PROCESSING... ]' : '[ UPLOAD COVER PHOTO ]'}
                  </span>
                </div>
                <input
                  id="cover-photo-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverPhotoUpload}
                  className="hidden"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Status Message */}
              {coverPhotoMsg && (
                <div
                  className="mb-3 text-center text-xs font-bold tracking-wider"
                  style={{
                    color: coverPhotoMsg.includes('ready') || coverPhotoMsg.includes('saved')
                      ? 'var(--profile-accent)'
                      : '#FF4444',
                  }}
                >
                  {coverPhotoMsg}
                </div>
              )}

              {/* Remove Button */}
              {(coverPhotoPreview || profile?.cover_photo) && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleRemoveCoverPhoto}
                    className="text-xs font-bold uppercase tracking-wider transition-colors hover:text-[#FF4444]"
                    style={{ color: '#767676' }}
                  >
                    [ REMOVE COVER PHOTO ]
                  </button>
                </div>
              )}
            </div>

            {/* AI BUDDY SECTION */}
            <SectionHeader title="AI Buddy" />
            <div className="border border-t-0 p-3 mb-3" style={{ borderColor: 'var(--profile-border)' }}>
              {renderField('Buddy Name', 'buddyName')}
              <div className="mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(editForm.buddyActive as boolean) ?? false}
                    onChange={(e) => updateField('buddyActive', e.target.checked)}
                    className="accent-[var(--profile-accent)]"
                  />
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: 'var(--profile-accent)' }}
                  >
                    Buddy Active
                  </span>
                </label>
              </div>
            </div>

            {/* SAVE / CANCEL BUTTONS */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 border text-sm font-bold uppercase tracking-wider transition-colors disabled:opacity-50 hover:bg-white/5"
                style={{ borderColor: 'var(--profile-accent)', color: 'var(--profile-accent)' }}
              >
                {saving ? 'SAVING...' : '[ SAVE CHANGES ]'}
              </button>
              <button
                onClick={() => setEditMode(false)}
                className="px-4 py-2 border border-[#767676] text-[#767676] text-sm font-bold uppercase tracking-wider hover:text-white hover:border-white transition-colors"
              >
                [ CANCEL ]
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            SECTION 4 (TRANSMISSION): LATEST TRANSMISSION
            ════════════════════════════════════════════════════════ */}
        {(profile?.transmission || isOwner(username)) && (
          <div
            className="border p-3 mb-4"
            style={{ borderColor: 'var(--profile-border)', background: 'rgba(0,0,0,0.3)' }}
          >
            <div className="text-xs text-[#767676] mb-1">LATEST TRANSMISSION</div>
            <div className="text-sm text-sb-text-primary italic">
              {profile?.transmission ? (
                <>&quot;{profile.transmission}&quot;</>
              ) : (
                <span className="text-[#767676]">What&apos;s your signal to the universe?</span>
              )}
            </div>
          </div>
        )}

        <div className="space-y-4">

          {/* ════════════════════════════════════════════════════════
              SECTION 4: ABOUT ME + WHO I'D LIKE TO MEET (Prominent)
              ════════════════════════════════════════════════════════ */}
          {(profile?.about_me || isOwner(username)) && (
            <div>
              <SectionHeader title="About Me" />
              <div
                className="border border-t-0 p-5 sm:p-6"
                style={{ borderColor: 'var(--profile-border)', background: 'rgba(0,0,0,0.2)' }}
              >
                <div className="text-sm sm:text-base text-sb-text-primary whitespace-pre-wrap leading-relaxed">
                  {profile?.about_me || (
                    <span className="text-[#767676] italic">Tell the Sanctuary about yourself...</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {(profile?.who_id_like_to_meet || isOwner(username)) && (
            <div>
              <SectionHeader title="Who I'd Like to Meet" />
              <div
                className="border border-t-0 p-5 sm:p-6"
                style={{ borderColor: 'var(--profile-border)', background: 'rgba(0,0,0,0.2)' }}
              >
                <div className="text-sm sm:text-base text-sb-text-primary whitespace-pre-wrap leading-relaxed">
                  {profile?.who_id_like_to_meet || (
                    <span className="text-[#767676] italic">Who would you love to connect with?</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════
              SECTION 5: TOP 8
              ════════════════════════════════════════════════════════ */}
          <Top8Grid
            username={username}
            isOwner={isOwner(username) && !isPreviewMode}
          />

          {/* ════════════════════════════════════════════════════════
              SECTION 6: INTERESTS (2x2 grid)
              ════════════════════════════════════════════════════════ */}
          {profile?.interests && (
            <SectionBlock title="Interests">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { label: 'General', value: profile.interests.general },
                  { label: 'Music', value: profile.interests.music },
                  { label: 'Heroes', value: profile.interests.heroes },
                  { label: 'Technology', value: profile.interests.technology },
                ] as const).map((item) => (
                  <div
                    key={item.label}
                    className="border p-3"
                    style={{ borderColor: 'var(--profile-border)' }}
                  >
                    <div
                      className="text-xs font-bold uppercase mb-1"
                      style={{
                        color: 'var(--profile-accent)',
                        fontFamily: "'Glass TTY VT220', monospace",
                      }}
                    >
                      {item.label}
                    </div>
                    <div className="text-sm text-sb-text-primary">
                      {item.value || <span className="text-[#767676] italic">{
                        item.label === 'General' ? 'What lights you up?' :
                        item.label === 'Music' ? "What's on your playlist?" :
                        item.label === 'Heroes' ? 'Who inspires you?' :
                        'What tech excites you?'
                      }</span>}
                    </div>
                  </div>
                ))}
              </div>
            </SectionBlock>
          )}

          {/* ════════════════════════════════════════════════════════
              SECTION 7: TRANSMISSIONS WALL
              ════════════════════════════════════════════════════════ */}
          <TransmissionsWall
            username={username}
            isOwner={isOwner(username) && !isPreviewMode}
            isSignedIn={!!isSignedIn}
          />

          {/* ════════════════════════════════════════════════════════
              SECTION 8: SYSTEM STATS (moved to bottom)
              ════════════════════════════════════════════════════════ */}
          <SectionBlock title="System Stats">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Days Active', value: daysActive },
                { label: 'Tier', value: tierInfo.label },
                { label: 'Profile Views', value: profileViews },
                { label: 'Transmissions', value: transmissionCount },
                { label: 'Top 8', value: `${top8Count}/8` },
                { label: 'Community Rank', value: 'NEW' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="border p-4 text-center"
                  style={{ borderColor: 'var(--profile-border)' }}
                >
                  <div className="text-2xl font-bold text-sb-text-primary">{stat.value}</div>
                  <div className="text-xs text-[#767676] uppercase mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </SectionBlock>

        </div>


        {/* SANCTUARY MISSIONS (owner only, after profile complete) */}
        {isOwner(username) && !isPreviewMode && (
          <div className="mt-6">
            <SectionBlock title="Your Sanctuary Missions">
              <div className="space-y-2 font-mono text-sm">
                <div className="flex items-center gap-2">
                  <span style={{ color: hasAvatar ? 'var(--profile-accent)' : '#767676' }}>
                    {hasAvatar ? '\u2611' : '\u2610'}
                  </span>
                  {hasAvatar ? (
                    <span style={{ color: 'var(--profile-accent)' }}>Build Your Avatar</span>
                  ) : (
                    <Link href="/peoplespace/build-avatar" style={{ color: '#767676' }} className="hover:underline">
                      Build Your Avatar
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: !isProfileIncomplete ? 'var(--profile-accent)' : '#767676' }}>
                    {!isProfileIncomplete ? '\u2611' : '\u2610'}
                  </span>
                  {!isProfileIncomplete ? (
                    <span style={{ color: 'var(--profile-accent)' }}>Complete Your Profile</span>
                  ) : (
                    <button onClick={handleEditClick} style={{ color: '#767676' }} className="hover:underline text-left">
                      Complete Your Profile
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#767676' }}>{'\u2610'}</span>
                  <Link href="/botspace" style={{ color: '#767676' }} className="hover:underline">
                    Explore BotSpace — Meet the 18 Super Machines
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#767676' }}>{'\u2610'}</span>
                  <Link href="/expertspace" style={{ color: '#767676' }} className="hover:underline">
                    Visit ExpertSpace — Ask a specialist anything
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#767676' }}>{'\u2610'}</span>
                  <Link href="/feed" style={{ color: '#767676' }} className="hover:underline">
                    Check the Feed — See what&apos;s happening
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#767676' }}>{'\u2610'}</span>
                  <Link href="/themes" style={{ color: '#767676' }} className="hover:underline">
                    Choose a Theme — Make the Sanctuary yours
                  </Link>
                </div>
              </div>
            </SectionBlock>
          </div>
        )}

        {/* ── FOOTER ────────────────────────────────────────────── */}
        <div className="text-center mt-8 mb-4">
          <Link
            href="/peoplespace"
            className="text-sm transition-colors"
            style={{ color: 'var(--profile-accent)' }}
          >
            &larr; BACK TO PEOPLESPACE
          </Link>
        </div>

        </div>{/* end content wrapper */}
      </div>
    </ProfileThemeProvider>
  );
}
