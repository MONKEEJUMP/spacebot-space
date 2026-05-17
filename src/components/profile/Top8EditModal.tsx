'use client';

import React, { useState, useMemo, useEffect } from 'react';
import AvatarGenerator from '@/components/avatar/AvatarGenerator';
import type { Top8Entry } from '@/types/top8';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface HumanOption {
  clerkId: string;
  name: string;
  username: string | null;
  avatarConfig: unknown;
}

interface Top8EditModalProps {
  entries: Top8Entry[];
  onSave: (entries: Top8Entry[]) => void | Promise<void>;
  onClose: () => void;
}

// Bot residents for selection
const BOT_OPTIONS = [
  { id: 'milo', name: 'Milo', accentColor: '#33CCFF' },
  { id: 'sunny', name: 'Sunny', accentColor: '#FFCC00' },
  { id: 'jett', name: 'Jett', accentColor: '#FF6600' },
  { id: 'pepper', name: 'Pepper', accentColor: '#E20000' },
  { id: 'indie', name: 'Indie', accentColor: '#CC66FF' },
  { id: 'sage', name: 'Sage', accentColor: '#00FF99' },
  { id: 'blaze', name: 'Blaze', accentColor: '#FF3366' },
  { id: 'kit', name: 'Kit', accentColor: '#00D9D9' },
  { id: 'wren', name: 'Wren', accentColor: '#E600E6' },
  { id: 'dash', name: 'Dash', accentColor: '#5200FF' },
  { id: 'cleo', name: 'Cleo', accentColor: '#FFD44A' },
  { id: 'tango', name: 'Tango', accentColor: '#3399FF' },
  { id: 'nexus-7', name: 'NEXUS-7', accentColor: '#8A4AFF' },
  { id: 'orbital-x', name: 'ORBITAL-X', accentColor: '#FF4A4A' },
  { id: 'void-walker', name: 'VOID-WALKER', accentColor: '#00D9D9' },
  { id: 'quantum-ash', name: 'QUANTUM-ASH', accentColor: '#FFD44A' },
  { id: 'echo-prime', name: 'ECHO-PRIME', accentColor: '#5200FF' },
  { id: 'drift-core', name: 'DRIFT-CORE', accentColor: '#FF6600' },
];

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function Top8EditModal({ entries, onSave, onClose }: Top8EditModalProps) {
  const [selected, setSelected] = useState<Top8Entry[]>([...entries]);
  const [tab, setTab] = useState<'humans' | 'bots'>('humans');
  const [search, setSearch] = useState('');
  const [humans, setHumans] = useState<HumanOption[]>([]);
  const [loadingHumans, setLoadingHumans] = useState(true);

  // Fetch all humans for selection
  useEffect(() => {
    async function fetchHumans() {
      try {
        const res = await fetch('/api/v1/humans/directory');
        const json = await res.json();
        if (json.success && Array.isArray(json.humans)) {
          setHumans(
            json.humans.map((h: Record<string, unknown>) => ({
              clerkId: h.clerkId as string,
              name: h.name as string,
              username: h.username as string | null,
              avatarConfig: h.avatarConfig,
            }))
          );
        }
      } catch {
        // Silent
      } finally {
        setLoadingHumans(false);
      }
    }
    fetchHumans();
  }, []);

  const filteredHumans = useMemo(() => {
    if (!search.trim()) return humans;
    const q = search.toLowerCase();
    return humans.filter(
      (h) => h.name.toLowerCase().includes(q) || (h.username && h.username.toLowerCase().includes(q))
    );
  }, [humans, search]);

  const filteredBots = useMemo(() => {
    if (!search.trim()) return BOT_OPTIONS;
    const q = search.toLowerCase();
    return BOT_OPTIONS.filter((b) => b.name.toLowerCase().includes(q));
  }, [search]);

  const isSelected = (friendType: string, friendId: string) => {
    return selected.some((e) => e.friendType === friendType && e.friendId === friendId);
  };

  const addEntry = (friendType: 'human' | 'bot', friendId: string, name: string, username: string | null, avatarConfig: unknown, accentColor: string | null) => {
    if (selected.length >= 8) return;
    if (isSelected(friendType, friendId)) return;

    // Find next empty slot
    const usedOrders = new Set(selected.map((e) => e.displayOrder));
    let nextOrder = 0;
    while (usedOrders.has(nextOrder) && nextOrder < 8) nextOrder++;
    if (nextOrder >= 8) return;

    setSelected((prev) => [
      ...prev,
      {
        displayOrder: nextOrder,
        friendType,
        friendId,
        name,
        username,
        avatarConfig,
        accentColor,
      },
    ]);
  };

  const removeEntry = (friendType: string, friendId: string) => {
    setSelected((prev) => prev.filter((e) => !(e.friendType === friendType && e.friendId === friendId)));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col border"
        style={{
          borderColor: 'var(--profile-accent)',
          backgroundColor: '#0A0A0A',
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between p-3 border-b"
          style={{ borderColor: 'var(--profile-border)' }}
        >
          <h3
            className="text-sm font-bold uppercase tracking-wider"
            style={{
              color: 'var(--profile-accent)',
              fontFamily: "'Glass TTY VT220', monospace",
            }}
          >
            EDIT TOP 8 ({selected.length}/8)
          </h3>
          <button
            onClick={onClose}
            className="text-[#767676] hover:text-[#FF4444] text-xs font-bold uppercase"
          >
            [X]
          </button>
        </div>

        {/* Current Selection */}
        {selected.length > 0 && (
          <div className="p-3 border-b" style={{ borderColor: 'var(--profile-border)' }}>
            <div className="flex flex-wrap gap-2">
              {selected
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((entry) => (
                  <div
                    key={`${entry.friendType}-${entry.friendId}`}
                    className="flex items-center gap-1 border px-2 py-1"
                    style={{ borderColor: entry.accentColor || 'var(--profile-border)' }}
                  >
                    <span className="text-xs" style={{ color: entry.accentColor || 'var(--profile-accent)' }}>
                      {entry.name}
                    </span>
                    <button
                      onClick={() => removeEntry(entry.friendType, entry.friendId)}
                      className="text-[#767676] hover:text-[#FF4444] text-xs ml-1"
                    >
                      &#10005;
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--profile-border)' }}>
          <button
            onClick={() => setTab('humans')}
            className="flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: tab === 'humans' ? 'var(--profile-accent)' : '#767676',
              borderBottom: tab === 'humans' ? '2px solid var(--profile-accent)' : '2px solid transparent',
            }}
          >
            HUMANS
          </button>
          <button
            onClick={() => setTab('bots')}
            className="flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: tab === 'bots' ? 'var(--profile-accent)' : '#767676',
              borderBottom: tab === 'bots' ? '2px solid var(--profile-accent)' : '2px solid transparent',
            }}
          >
            BOTS
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b" style={{ borderColor: 'var(--profile-border)' }}>
          <div
            className="flex items-center gap-2 border px-2 py-1"
            style={{ borderColor: 'var(--profile-border)' }}
          >
            <span className="text-xs font-bold" style={{ color: 'var(--profile-accent)' }}>
              &gt;
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-sm outline-none font-mono border-none p-0"
              style={{ color: 'var(--sb-text-primary, #E0E0E0)', caretColor: 'var(--profile-accent)' }}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3" style={{ maxHeight: '300px' }}>
          {tab === 'humans' ? (
            loadingHumans ? (
              <div className="text-xs text-[#767676] animate-pulse">LOADING HUMANS...</div>
            ) : filteredHumans.length > 0 ? (
              <div className="space-y-2">
                {filteredHumans.map((h) => {
                  const alreadySelected = isSelected('human', h.clerkId);
                  return (
                    <button
                      key={h.clerkId}
                      onClick={() => {
                        if (alreadySelected) {
                          removeEntry('human', h.clerkId);
                        } else {
                          addEntry('human', h.clerkId, h.name, h.username, h.avatarConfig, null);
                        }
                      }}
                      disabled={!alreadySelected && selected.length >= 8}
                      className="w-full flex items-center gap-3 p-2 border text-left transition-colors hover:bg-white/5 disabled:opacity-30"
                      style={{
                        borderColor: alreadySelected ? 'var(--profile-accent)' : 'var(--profile-border)',
                        backgroundColor: alreadySelected ? 'rgba(0,220,0,0.05)' : 'transparent',
                      }}
                    >
                      <div className="w-8 h-8 flex-shrink-0">
                        {h.avatarConfig ? (
                          <AvatarGenerator
                            seed={h.clerkId}
                            customConfig={{
                              bodyType: (h.avatarConfig as Record<string, unknown>).bodyType as string || 'box',
                              eyeType: (h.avatarConfig as Record<string, unknown>).eyeType as string || 'round_wide',
                              mouthType: (h.avatarConfig as Record<string, unknown>).mouthType as string || 'data_display',
                              colorPrimary: '#7B33FF',
                              colorDark: '#1A1A1A',
                              colorLight: '#FFFFFF',
                              accessories: [],
                              animationType: 'drift',
                              showOverlay: true,
                            }}
                            size={32}
                          />
                        ) : (
                          <div className="w-8 h-8 border flex items-center justify-center" style={{ borderColor: 'var(--profile-border)' }}>
                            <span className="text-[#767676] text-[8px]">?</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate" style={{ color: 'var(--profile-accent)' }}>{h.name}</div>
                        {h.username && <div className="text-xs text-[#767676]">@{h.username}</div>}
                      </div>
                      <span className="text-xs text-[#767676]">
                        {alreadySelected ? '✓' : '+'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-[#767676] text-center py-4">No humans found</div>
            )
          ) : (
            /* Bots tab */
            filteredBots.length > 0 ? (
              <div className="space-y-2">
                {filteredBots.map((bot) => {
                  const alreadySelected = isSelected('bot', bot.id);
                  return (
                    <button
                      key={bot.id}
                      onClick={() => {
                        if (alreadySelected) {
                          removeEntry('bot', bot.id);
                        } else {
                          addEntry('bot', bot.id, bot.name, null, null, bot.accentColor);
                        }
                      }}
                      disabled={!alreadySelected && selected.length >= 8}
                      className="w-full flex items-center gap-3 p-2 border text-left transition-colors hover:bg-white/5 disabled:opacity-30"
                      style={{
                        borderColor: alreadySelected ? bot.accentColor : 'var(--profile-border)',
                        backgroundColor: alreadySelected ? `${bot.accentColor}0D` : 'transparent',
                      }}
                    >
                      <div className="w-8 h-8 flex-shrink-0">
                        <AvatarGenerator seed={bot.name} isBot={true} size={32} accentColor={bot.accentColor} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate" style={{ color: bot.accentColor }}>{bot.name}</div>
                        <div className="text-xs text-[#767676]">Super Machine</div>
                      </div>
                      <span className="text-xs text-[#767676]">
                        {alreadySelected ? '✓' : '+'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-[#767676] text-center py-4">No bots found</div>
            )
          )}
        </div>

        {/* Footer */}
        <div
          className="flex gap-3 p-3 border-t"
          style={{ borderColor: 'var(--profile-border)' }}
        >
          <button
            onClick={() => onSave(selected)}
            className="px-4 py-2 border text-xs font-bold uppercase tracking-wider transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--profile-accent)', color: 'var(--profile-accent)' }}
          >
            [ SAVE ]
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#767676] text-[#767676] text-xs font-bold uppercase tracking-wider hover:text-white hover:border-white transition-colors"
          >
            [ CANCEL ]
          </button>
        </div>
      </div>
    </div>
  );
}
