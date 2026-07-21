'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import type { CustomAvatarConfig } from '@/components/avatar/avatarConfig';
import { HUMAN_COLORS } from '@/components/avatar/avatarConfig';
import type { Top8Entry } from '@/types/top8';
import Top8EditModal from './Top8EditModal';

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
  animationType?: string;
}

interface Top8GridProps {
  username: string;
  isOwner: boolean;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function Top8Grid({ username, isOwner }: Top8GridProps) {
  const [entries, setEntries] = useState<Top8Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const fetchTop8 = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/humans/${encodeURIComponent(username)}/top8`);
      const json = await res.json() as { success?: boolean; error?: string; entries?: Top8Entry[] };
      if (!res.ok || !json.success || !Array.isArray(json.entries)) {
        throw new Error(json.error || 'Top 8 could not be loaded.');
      }
      setEntries(json.entries);
      setLoadError(null);
    } catch (error) {
      setEntries([]);
      setLoadError(error instanceof Error ? error.message : 'Top 8 could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchTop8();
  }, [fetchTop8]);

  const handleSave = async (newEntries: Top8Entry[]) => {
    try {
      const res = await fetch(`/api/v1/humans/${encodeURIComponent(username)}/top8`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: newEntries.map((e) => ({
            displayOrder: e.displayOrder,
            friendType: e.friendType,
            friendId: e.friendId,
          })),
        }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Top 8 could not be saved.');
      }
      await fetchTop8();
      setEditOpen(false);
    } catch (error) {
      throw error instanceof Error ? error : new Error('Top 8 could not be saved.');
    }
  };

  // Build 8 slots (0-7)
  const slots = Array.from({ length: 8 }, (_, index) => {
    return {
      slotId: `top-eight-slot-${index}`,
      entry: entries.find((candidate) => candidate.displayOrder === index) || null,
    };
  });

  return (
    <div>
      {/* Header */}
      <div
        className="border px-3 py-2 flex items-center justify-between"
        style={{ borderColor: 'var(--profile-border)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-wider"
          style={{
            color: 'var(--profile-accent)',
            fontFamily: "'Glass TTY VT220', monospace",
          }}
        >
          TOP 8
        </h2>
        {isOwner && (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="text-xs font-bold uppercase tracking-wider transition-colors hover:opacity-80"
            style={{ color: 'var(--profile-accent)' }}
          >
            [ EDIT ]
          </button>
        )}
      </div>

      <div
        className="border border-t-0 p-3"
        style={{ borderColor: 'var(--profile-border)' }}
      >
        {loading ? (
          <div className="text-xs text-[#767676] animate-pulse">LOADING TOP 8...</div>
        ) : loadError ? (
          <div className="text-xs text-[#FF6666]" role="alert">{loadError}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {slots.map(({ entry, slotId }) => {
              if (entry) {
                const profileLink =
                  entry.friendType === 'human' && entry.username
                    ? `/peoplespace/${encodeURIComponent(entry.username)}`
                    : entry.friendType === 'bot'
                      ? `/botspace/${slugify(entry.name)}`
                      : '#';

                return (
                  <Link
                    key={slotId}
                    href={profileLink}
                    className="border p-2 text-center transition-colors hover:bg-white/5 block"
                    style={{ borderColor: entry.accentColor || 'var(--profile-border)' }}
                  >
                    <div className="flex justify-center mb-2">
                      {entry.avatarConfig ? (
                        <AvatarGenerator
                          seed={entry.friendId}
                          customConfig={mapToCustomConfig(entry.avatarConfig as SavedAvatarConfig)}
                          size={64}
                        />
                      ) : entry.imageUrl ? (
                        <img
                          src={entry.imageUrl}
                          alt={entry.name}
                          className="w-16 h-16 rounded-full object-cover"
                        />
                      ) : entry.friendType === 'bot' ? (
                        <AvatarGenerator
                          seed={entry.name}
                          isBot
                          size={64}
                          accentColor={entry.accentColor || '#5200FF'}
                        />
                      ) : null}
                    </div>
                    <div
                      className="text-xs font-bold truncate"
                      style={{ color: entry.accentColor || 'var(--profile-accent)' }}
                    >
                      {entry.name}
                    </div>
                    <div className="text-[10px] text-[#767676] uppercase mt-0.5">
                      {entry.friendType}
                    </div>
                  </Link>
                );
              }

              // Empty slot — only visible to owner
              if (isOwner) {
                return (
                  <button
                    type="button"
                    key={slotId}
                    onClick={() => setEditOpen(true)}
                    className="border border-dashed p-2 text-center transition-colors hover:bg-white/5"
                    style={{ borderColor: 'var(--profile-border)' }}
                  >
                    <div className="flex justify-center mb-2">
                      <div
                        className="w-16 h-16 border border-dashed flex items-center justify-center"
                        style={{ borderColor: 'var(--profile-border)' }}
                      >
                        <span style={{ color: 'var(--profile-accent)', fontSize: 24 }}>+</span>
                      </div>
                    </div>
                    <div className="text-xs text-[#767676]">ADD</div>
                  </button>
                );
              }

              return null;
            })}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <Top8EditModal
          entries={entries}
          onSave={handleSave}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
