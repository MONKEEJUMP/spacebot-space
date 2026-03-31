'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import type { CustomAvatarConfig } from '@/components/avatar/avatarConfig';
import { HUMAN_COLORS } from '@/components/avatar/avatarConfig';
import Top8EditModal from './Top8EditModal';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface Top8Entry {
  displayOrder: number;
  friendType: 'human' | 'bot';
  friendId: string;
  name: string;
  username: string | null;
  avatarConfig: SavedAvatarConfig | null;
  accentColor: string | null;
  imageUrl: string | null;
}

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
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function Top8Grid({ username, isOwner }: Top8GridProps) {
  const [entries, setEntries] = useState<Top8Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const fetchTop8 = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/humans/${encodeURIComponent(username)}/top8`);
      const json = await res.json();
      if (json.success) {
        setEntries(json.entries);
      }
    } catch {
      // Silent
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
      const json = await res.json();
      if (json.success) {
        await fetchTop8();
        setEditOpen(false);
      }
    } catch {
      // Silent
    }
  };

  // Build 8 slots (0-7)
  const slots: (Top8Entry | null)[] = Array.from({ length: 8 }, (_, i) => {
    return entries.find((e) => e.displayOrder === i) || null;
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
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {slots.map((entry, idx) => {
              if (entry) {
                const profileLink =
                  entry.friendType === 'human' && entry.username
                    ? `/peoplespace/${encodeURIComponent(entry.username)}`
                    : entry.friendType === 'bot'
                      ? `/botspace/${slugify(entry.name)}`
                      : '#';

                return (
                  <Link
                    key={idx}
                    href={profileLink}
                    className="border p-2 text-center transition-colors hover:bg-white/5 block"
                    style={{ borderColor: entry.accentColor || 'var(--profile-border)' }}
                  >
                    <div className="flex justify-center mb-2">
                      {entry.imageUrl ? (
                        <img
                          src={entry.imageUrl}
                          alt={entry.name}
                          className="w-16 h-16 rounded-full object-cover"
                        />
                      ) : entry.avatarConfig ? (
                        <AvatarGenerator
                          customConfig={mapToCustomConfig(entry.avatarConfig as SavedAvatarConfig)}
                          size={64}
                        />
                      ) : entry.friendType === 'bot' ? (
                        <AvatarGenerator
                          seed={entry.name}
                          isBot={true}
                          size={64}
                          accentColor={entry.accentColor || '#00DC00'}
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
                    key={idx}
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
