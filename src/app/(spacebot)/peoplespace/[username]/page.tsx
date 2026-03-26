'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import ProfileThemeProvider from '@/providers/ProfileThemeProvider';
import { DEFAULT_HUMAN_THEME } from '@/lib/profile-themes';
import type { ProfileTheme } from '@/types/profile';
import type { CustomAvatarConfig } from '@/components/avatar/avatarConfig';
import { HUMAN_COLORS } from '@/components/avatar/avatarConfig';
import { useClerkHuman } from '@/hooks/useClerkHuman';

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
  } | null;
  wall_posts?: Array<{
    id: string;
    content: string;
    title: string | null;
    content_type: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;
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
  let resolvedColor = '#00ff00';
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
      <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--profile-accent)' }}>
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [data, setData] = useState<ProfileResponse | null>(null);

  // ── EDIT MODE STATE ──────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string | boolean | null>>({});

  // Owner detection via Clerk
  const { human: myHuman, profile: myProfile, isOwner, refetch: refetchClerk } = useClerkHuman();

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
      wallpaperUrl: myProfile?.wallpaperUrl || '',
      wallpaperOpacity: myProfile?.wallpaperOpacity || '0.15',
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
          value={(editForm[field] as string) || '#00DC00'}
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
          <div className="text-[#00DC00] text-lg mb-4 animate-pulse">
            CONNECTING TO PROFILE...
          </div>
          <div className="text-[#00DC00] text-2xl">
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
            className="text-[#00DC00] hover:text-[#00FF00] text-sm transition-colors"
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
            className="text-[#00DC00] hover:text-[#00FF00] text-sm transition-colors"
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
            className="text-[#00DC00] hover:text-[#00FF00] text-sm transition-colors"
          >
            &larr; RETURN TO PEOPLESPACE
          </Link>
        </div>
      </div>
    );
  }

  // ── PROFILE VIEW ──────────────────────────────────────────────────
  const { human, profile, wall_posts } = data;
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

  return (
    <ProfileThemeProvider theme={theme}>
      <div className="w-full max-w-3xl mx-auto px-4 py-6 font-mono">

        {/* ── PROFILE HEADER ────────────────────────────────────── */}
        <div className="border p-4 mb-4" style={{ borderColor: 'var(--profile-border)' }}>
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div
              className="w-24 h-24 sm:w-32 sm:h-32 flex-shrink-0 border"
              style={{ borderColor: 'var(--profile-border)' }}
            >
              {avatarConfig ? (
                <AvatarGenerator customConfig={avatarConfig} size={128} />
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
                    <span className="text-[#00DC00] ml-1">&bull; ACTIVE</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── EDIT PROFILE BUTTON (owner only) ──────────────────── */}
        {isOwner(username) && !editMode && (
          <div className="mb-4 text-center">
            <button
              onClick={handleEditClick}
              className="px-4 py-2 border text-sm font-bold uppercase tracking-wider transition-colors hover:bg-white/5"
              style={{
                borderColor: 'var(--profile-accent)',
                color: 'var(--profile-accent)',
              }}
            >
              [ EDIT PROFILE ]
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

            {/* IDENTITY SECTION */}
            <SectionHeader title="Identity" />
            <div className="border border-t-0 p-3 mb-3" style={{ borderColor: 'var(--profile-border)' }}>
              {renderField('Display Name', 'name')}
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

            {/* WALLPAPER SECTION */}
            <SectionHeader title="Wallpaper" />
            <div className="border border-t-0 p-3 mb-3" style={{ borderColor: 'var(--profile-border)' }}>
              {renderField('Wallpaper URL', 'wallpaperUrl')}
              {renderField('Wallpaper Opacity', 'wallpaperOpacity')}
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

        {/* ── TRANSMISSION ──────────────────────────────────────── */}
        {profile?.transmission && (
          <div
            className="border p-3 mb-4"
            style={{ borderColor: 'var(--profile-border)', background: 'rgba(0,0,0,0.3)' }}
          >
            <div className="text-xs text-[#767676] mb-1">LATEST TRANSMISSION</div>
            <div className="text-sm text-sb-text-primary italic">
              &quot;{profile.transmission}&quot;
            </div>
          </div>
        )}

        <div className="space-y-4">

          {/* ── ABOUT ME ────────────────────────────────────────── */}
          {profile?.about_me && (
            <SectionBlock title="About Me">
              <div className="text-sm text-sb-text-primary whitespace-pre-wrap">
                {profile.about_me}
              </div>
            </SectionBlock>
          )}

          {/* ── WHO I'D LIKE TO MEET ────────────────────────────── */}
          {profile?.who_id_like_to_meet && (
            <SectionBlock title="Who I'd Like to Meet">
              <div className="text-sm text-sb-text-primary whitespace-pre-wrap">
                {profile.who_id_like_to_meet}
              </div>
            </SectionBlock>
          )}

          {/* ── INTERESTS GRID ──────────────────────────────────── */}
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
                    className="border p-2"
                    style={{ borderColor: 'var(--profile-border)' }}
                  >
                    <div
                      className="text-xs font-bold uppercase mb-1"
                      style={{ color: 'var(--profile-accent)' }}
                    >
                      {item.label}
                    </div>
                    <div className="text-sm text-sb-text-primary">
                      {item.value || <span className="text-[#767676]">Not set</span>}
                    </div>
                  </div>
                ))}
              </div>
            </SectionBlock>
          )}

          {/* ── WALL POSTS ──────────────────────────────────────── */}
          {wall_posts && wall_posts.length > 0 && (
            <SectionBlock title={`${displayName}'s Wall`}>
              <div className="space-y-3">
                {wall_posts.map((post) => (
                  <div
                    key={post.id}
                    className="border-b pb-2"
                    style={{ borderColor: 'var(--profile-border)' }}
                  >
                    {post.title && (
                      <div
                        className="text-xs font-bold mb-1"
                        style={{ color: 'var(--profile-accent)' }}
                      >
                        {post.title}
                      </div>
                    )}
                    <div className="text-sm text-sb-text-primary">{post.content}</div>
                    <div className="text-xs text-[#767676] mt-1 text-right">
                      {timeAgo(post.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            </SectionBlock>
          )}

          {/* ── SYSTEM STATS ────────────────────────────────────── */}
          <SectionBlock title="System Stats">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Days Active', value: daysActive },
                { label: 'Tier', value: tierInfo.label },
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

      </div>
    </ProfileThemeProvider>
  );
}
