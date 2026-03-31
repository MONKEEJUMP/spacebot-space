'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import type { CustomAvatarConfig } from '@/components/avatar/avatarConfig';
import { HUMAN_COLORS } from '@/components/avatar/avatarConfig';
import { useUser } from '@clerk/nextjs';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface Transmission {
  id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  authorId: string;
  author: {
    name: string;
    username: string | null;
    avatarConfig: SavedAvatarConfig | null;
  };
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

interface TransmissionsWallProps {
  username: string;
  isOwner: boolean;
  isSignedIn: boolean;
  ownerClerkId?: string;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

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
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function TransmissionsWall({
  username,
  isOwner,
  isSignedIn,
  ownerClerkId,
}: TransmissionsWallProps) {
  const [transmissions, setTransmissions] = useState<Transmission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const { user } = useUser();
  const currentUserId = user?.id || null;

  const fetchTransmissions = useCallback(async (pageNum: number, append = false) => {
    try {
      const res = await fetch(`/api/v1/humans/${encodeURIComponent(username)}/wall?page=${pageNum}`);
      const json = await res.json();
      if (json.success) {
        if (append) {
          setTransmissions((prev) => [...prev, ...json.transmissions]);
        } else {
          setTransmissions(json.transmissions);
        }
        setTotal(json.total);
        setHasMore(json.hasMore);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchTransmissions(1);
  }, [fetchTransmissions]);

  const handlePost = async () => {
    if (!newContent.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/humans/${encodeURIComponent(username)}/wall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        if (res.status === 403) {
          setIsBlocked(true);
        }
        setError(json.error || 'Failed to post.');
        return;
      }
      setNewContent('');
      // Refetch to get enriched data
      fetchTransmissions(1);
    } catch {
      setError('Connection failed.');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (transmissionId: string) => {
    try {
      const res = await fetch(
        `/api/v1/humans/${encodeURIComponent(username)}/wall/${transmissionId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setTransmissions((prev) => prev.filter((t) => t.id !== transmissionId));
        setTotal((prev) => prev - 1);
      }
    } catch {
      // Silent fail
    }
  };

  const handleFlag = async (transmissionId: string) => {
    // Flag sets isHidden=true via the same delete mechanism
    // For MVP, flagging removes from view immediately
    try {
      const res = await fetch(
        `/api/v1/humans/${encodeURIComponent(username)}/wall/${transmissionId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setTransmissions((prev) => prev.filter((t) => t.id !== transmissionId));
        setTotal((prev) => prev - 1);
      }
    } catch {
      // Silent
    }
  };

  const handleStartEdit = (t: Transmission) => {
    setEditingId(t.id);
    setEditContent(t.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (transmissionId: string) => {
    if (!editContent.trim()) return;
    try {
      const res = await fetch(
        `/api/v1/humans/${encodeURIComponent(username)}/wall/${transmissionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editContent.trim() }),
        }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setTransmissions((prev) =>
          prev.map((t) =>
            t.id === transmissionId
              ? { ...t, content: json.transmission.content, edited_at: json.transmission.edited_at }
              : t
          )
        );
        setEditingId(null);
        setEditContent('');
      } else {
        setError(json.error || 'Failed to edit.');
      }
    } catch {
      setError('Connection failed.');
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchTransmissions(nextPage, true);
  };

  if (loading) {
    return (
      <div className="border p-4" style={{ borderColor: 'var(--profile-border)' }}>
        <div className="text-xs text-[#767676] animate-pulse">LOADING TRANSMISSIONS...</div>
      </div>
    );
  }

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
          TRANSMISSIONS WALL
        </h2>
        <span className="text-xs text-[#767676]">{total} total</span>
      </div>

      <div
        className="border border-t-0 p-3"
        style={{ borderColor: 'var(--profile-border)' }}
      >
        {/* Input box — only for signed-in, non-blocked users */}
        {isSignedIn && !isBlocked && (
          <div className="mb-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <span
                  className="absolute left-2 top-2 text-sm font-bold select-none"
                  style={{ color: 'var(--profile-accent)' }}
                >
                  &gt;&gt;
                </span>
                <input
                  type="text"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value.slice(0, 500))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handlePost();
                    }
                  }}
                  placeholder="Type your transmission..."
                  maxLength={500}
                  className="w-full bg-transparent border px-8 py-2 text-sm font-mono focus:outline-none"
                  style={{
                    borderColor: 'var(--profile-accent)',
                    color: 'var(--sb-text-primary, #E0E0E0)',
                    caretColor: 'var(--profile-accent)',
                  }}
                />
              </div>
              <button
                onClick={handlePost}
                disabled={posting || !newContent.trim()}
                className="px-4 py-2 border text-xs font-bold uppercase tracking-wider transition-colors hover:bg-white/5 disabled:opacity-30"
                style={{
                  borderColor: 'var(--profile-accent)',
                  color: 'var(--profile-accent)',
                }}
              >
                {posting ? '...' : 'SEND'}
              </button>
            </div>
            {newContent.length > 0 && (
              <div className="text-xs text-[#767676] mt-1 text-right">
                {newContent.length}/500
              </div>
            )}
            {error && (
              <div className="text-xs text-[#FF4444] mt-1">{error}</div>
            )}
          </div>
        )}

        {/* Transmissions feed */}
        {transmissions.length > 0 ? (
          <div className="space-y-3">
            {transmissions.map((t) => {
              const authorConfig = t.author.avatarConfig
                ? mapToCustomConfig(t.author.avatarConfig as SavedAvatarConfig)
                : null;
              const authorUsername = t.author.username || t.author.name;

              return (
                <div
                  key={t.id}
                  className="flex gap-3 border-l-2 pl-3 py-1"
                  style={{ borderColor: 'var(--profile-accent)' }}
                >
                  {/* Author avatar */}
                  <div className="flex-shrink-0 w-8 h-8">
                    {authorConfig ? (
                      <AvatarGenerator customConfig={authorConfig} size={32} />
                    ) : (
                      <div
                        className="w-8 h-8 border flex items-center justify-center"
                        style={{ borderColor: 'var(--profile-border)' }}
                      >
                        <span className="text-[#767676] text-[8px]">?</span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/peoplespace/${encodeURIComponent(authorUsername)}`}
                        className="text-xs font-bold hover:underline"
                        style={{ color: 'var(--profile-accent)' }}
                      >
                        {authorUsername}
                      </Link>
                      <span className="text-xs text-[#767676]">
                        {timeAgo(t.created_at)}
                      </span>
                      {t.edited_at && (
                        <span className="text-xs text-[#555555]">(edited)</span>
                      )}
                    </div>
                    {editingId === t.id ? (
                      <div className="mt-1">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value.slice(0, 500))}
                          className="w-full bg-transparent border px-2 py-1 text-sm font-mono focus:outline-none resize-none"
                          style={{
                            borderColor: 'var(--profile-accent)',
                            color: 'var(--sb-text-primary, #E0E0E0)',
                          }}
                          rows={3}
                          maxLength={500}
                        />
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={() => handleSaveEdit(t.id)}
                            disabled={!editContent.trim()}
                            className="px-3 py-1 border text-xs font-bold uppercase tracking-wider transition-colors hover:bg-white/5 disabled:opacity-30"
                            style={{ borderColor: 'var(--profile-accent)', color: 'var(--profile-accent)' }}
                          >
                            SAVE
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1 border text-xs font-bold uppercase tracking-wider transition-colors hover:bg-white/5"
                            style={{ borderColor: '#767676', color: '#767676' }}
                          >
                            CANCEL
                          </button>
                          <span className="text-xs text-[#767676] ml-auto">{editContent.length}/500</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-[#E0E0E0] mt-0.5 break-words">
                        {t.content}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex items-start gap-1">
                    {currentUserId && currentUserId === t.authorId && editingId !== t.id && (
                      <button
                        onClick={() => handleStartEdit(t)}
                        className="text-[#767676] hover:text-[var(--profile-accent)] text-xs transition-colors"
                        title="Edit"
                      >
                        &#9998;
                      </button>
                    )}
                    {isSignedIn && (
                      <button
                        onClick={() => handleFlag(t.id)}
                        className="text-[#767676] hover:text-[#FF4444] text-xs transition-colors"
                        title="Report"
                      >
                        &#9873;
                      </button>
                    )}
                    {isOwner && (
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="text-[#767676] hover:text-[#FF4444] text-xs transition-colors"
                        title="Delete"
                      >
                        &#10005;
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <span className="text-[#767676] text-sm italic">
              No transmissions yet. Be the first to leave a message.
            </span>
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="text-center mt-4">
            <button
              onClick={handleLoadMore}
              className="px-4 py-2 border text-xs font-bold uppercase tracking-wider transition-colors hover:bg-white/5"
              style={{
                borderColor: 'var(--profile-border)',
                color: 'var(--profile-accent)',
              }}
            >
              [ LOAD MORE ]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
