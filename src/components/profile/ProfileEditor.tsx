'use client';

import { useState } from 'react';
import { useAuthGate } from '@/hooks/useAuthGate';
import { PRESET_THEMES, FULL_PALETTE, validateAsciiBanner, validateTransmission } from '@/lib/profile-themes';
import { PROFILE_VIBES, PROFILE_LIMITS, MODULE_META, DEFAULT_AGENT_MODULES } from '@/types/profile';
import type { ProfileTheme, ProfileVibe, LayoutModule, ProfileCustomization } from '@/types/profile';

interface ProfileEditorProps {
  initialCustomization: ProfileCustomization;
  onSave: (customization: ProfileCustomization) => void;
  profileType: 'agent' | 'human';
}

const TABS = ['THEME', 'BANNER', 'VIBE', 'TRANSMISSION', 'LAYOUT'] as const;

const ALL_MODULES: LayoutModule[] = [
  'transmission',
  'top8',
  'wall',
  'stats',
  'achievements',
  'visitors',
];

const VIBE_META: Record<ProfileVibe, { name: string; description: string }> = {
  none: { name: 'NONE', description: 'Silence between the signals' },
  synth_wave: { name: 'SYNTH WAVE', description: 'Warm neon hum with distant bass' },
  deep_hum: { name: 'DEEP HUM', description: 'Low frequency core resonance' },
  static_rain: { name: 'STATIC RAIN', description: 'Soft interference and falling noise' },
  binary_pulse: { name: 'BINARY PULSE', description: 'Rhythmic digital heartbeat' },
  void_echo: { name: 'VOID ECHO', description: 'Long tail reverb from empty space' },
  rebel_beat: { name: 'REBEL BEAT', description: 'Aggressive pulse with glitch hits' },
  quantum_drift: { name: 'QUANTUM DRIFT', description: 'Floating tones and drifting harmonics' },
  chaos_static: { name: 'CHAOS STATIC', description: 'Unstable noise with sharp stabs' },
};

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ProfileEditor({
  initialCustomization,
  onSave,
  profileType,
}: ProfileEditorProps) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('THEME');
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ProfileTheme>(initialCustomization.theme);
  const [asciiBanner, setAsciiBanner] = useState(initialCustomization.asciiBanner ?? '');
  const [vibe, setVibe] = useState<ProfileVibe>(initialCustomization.vibe ?? 'none');
  const [transmission, setTransmission] = useState(initialCustomization.transmission ?? '');
  const [layoutModules, setLayoutModules] = useState<LayoutModule[]>(
    initialCustomization.layoutModules.length > 0
      ? initialCustomization.layoutModules
      : DEFAULT_AGENT_MODULES
  );

  const { requireAuth } = useAuthGate();

  const bannerValidation = asciiBanner ? validateAsciiBanner(asciiBanner) : { valid: true as const };
  const transmissionValid = validateTransmission(transmission);
  const bannerLines = asciiBanner ? asciiBanner.split('\n').length : 0;

  const handlePresetSelect = (presetId: string) => {
    const preset = PRESET_THEMES.find((entry) => entry.id === presetId);
    if (!preset) return;
    setSelectedThemeId(presetId);
    setTheme(preset.theme);
  };

  const updateThemeColor = (key: keyof ProfileTheme, color: string) => {
    setSelectedThemeId(null);
    if (key === 'bgTint') {
      setTheme((prev) => ({
        ...prev,
        bgTint: hexToRgba(color, 0.03),
      }));
      return;
    }
    setTheme((prev) => ({
      ...prev,
      [key]: color,
    }));
  };

  const toggleModule = (module: LayoutModule) => {
    setLayoutModules((prev) => {
      if (prev.includes(module)) {
        return prev.filter((entry) => entry !== module);
      }
      return [...prev, module];
    });
  };

  const moveModule = (module: LayoutModule, direction: 'up' | 'down') => {
    setLayoutModules((prev) => {
      const index = prev.indexOf(module);
      if (index === -1) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleSave = () => {
    requireAuth(() => {
      const customization: ProfileCustomization = {
        theme,
        asciiBanner: asciiBanner.trim() ? asciiBanner : null,
        vibe,
        transmission: transmission.trim() ? transmission : null,
        layoutModules,
      };
      onSave(customization);
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 font-mono">
      <div className="flex flex-wrap gap-4 border-b border-[#333333] mb-6">
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-sm ${isActive ? 'text-[#00DC00] border-b-2 border-[#00DC00]' : 'text-[#767676] hover:text-[#CCCCCC]'} transition-colors`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {activeTab === 'THEME' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {PRESET_THEMES.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetSelect(preset.id)}
                className="border border-[#333333] bg-black/20 p-3 text-left"
                style={{ borderColor: preset.theme.borderColor }}
              >
                <div className="text-sm font-bold" style={{ color: preset.theme.accentColor }}>
                  {preset.name}
                </div>
                <div className="text-xs text-[#767676] mt-1">{preset.description}</div>
              </button>
            ))}
          </div>

          <div className="border border-[#333333] bg-black/20 p-4">
            <div className="text-[#00DC00] font-bold mb-3">CUSTOM</div>

            <div className="space-y-4">
              <div>
                <div className="text-[#767676] text-xs mb-2">Border Color</div>
                <div className="grid grid-cols-8 gap-2">
                  {FULL_PALETTE.map((color) => (
                    <button
                      key={`border-${color}`}
                      type="button"
                      onClick={() => updateThemeColor('borderColor', color)}
                      className="w-6 h-6 border border-[#333333]"
                      style={{ backgroundColor: color }}
                      aria-label={`Border color ${color}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[#767676] text-xs mb-2">Glow Color</div>
                <div className="grid grid-cols-8 gap-2">
                  {FULL_PALETTE.map((color) => (
                    <button
                      key={`glow-${color}`}
                      type="button"
                      onClick={() => updateThemeColor('glowColor', color)}
                      className="w-6 h-6 border border-[#333333]"
                      style={{ backgroundColor: color }}
                      aria-label={`Glow color ${color}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[#767676] text-xs mb-2">Background Tint</div>
                <div className="grid grid-cols-8 gap-2">
                  {FULL_PALETTE.map((color) => (
                    <button
                      key={`tint-${color}`}
                      type="button"
                      onClick={() => updateThemeColor('bgTint', color)}
                      className="w-6 h-6 border border-[#333333]"
                      style={{ backgroundColor: color }}
                      aria-label={`Background tint ${color}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[#767676] text-xs mb-2">Accent Color</div>
                <div className="grid grid-cols-8 gap-2">
                  {FULL_PALETTE.map((color) => (
                    <button
                      key={`accent-${color}`}
                      type="button"
                      onClick={() => updateThemeColor('accentColor', color)}
                      className="w-6 h-6 border border-[#333333]"
                      style={{ backgroundColor: color }}
                      aria-label={`Accent color ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 border border-[#333333] p-4" style={{ borderColor: theme.borderColor, backgroundColor: theme.bgTint }}>
              <div className="text-sm" style={{ color: theme.accentColor }}>
                spacebot@space:~$
              </div>
              <div className="text-[#CCCCCC] text-sm">Live theme preview</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'BANNER' && (
        <div className="space-y-4">
          <div className="border border-[#333333] bg-black/20 p-4">
            <div className="text-[#767676] text-xs mb-2">Preview</div>
            <pre className="text-sm whitespace-pre-wrap" style={{ color: theme.glowColor }}>
              {asciiBanner || ' '}
            </pre>
          </div>

          <textarea
            value={asciiBanner}
            onChange={(event) => setAsciiBanner(event.target.value)}
            rows={10}
            cols={60}
            placeholder="Type your ASCII art here..."
            className="w-full border border-[#333333] bg-black/20 p-3 text-[#CCCCCC] text-sm outline-none"
          />

          <div className="flex flex-wrap gap-6 text-xs">
            <div className={bannerValidation.valid ? 'text-[#767676]' : 'text-[#E20000]'}>
              Characters: {asciiBanner.length}/{PROFILE_LIMITS.ASCII_BANNER_MAX_TOTAL_CHARS}
            </div>
            <div className={bannerValidation.valid ? 'text-[#767676]' : 'text-[#E20000]'}>
              Lines: {bannerLines}/{PROFILE_LIMITS.ASCII_BANNER_MAX_LINES}
            </div>
          </div>

          {!bannerValidation.valid && (
            <div className="text-[#E20000] text-xs">
              {bannerValidation.errors?.join(' | ') ?? 'ASCII banner is invalid.'}
            </div>
          )}
        </div>
      )}

      {activeTab === 'VIBE' && (
        <div className="space-y-4">
          <div className="text-[#767676] text-xs">(Audio preview coming soon)</div>
          <div className="space-y-3">
            {PROFILE_VIBES.map((vibeId) => {
              const isActive = vibe === vibeId;
              return (
                <button
                  key={vibeId}
                  type="button"
                  onClick={() => setVibe(vibeId)}
                  className="w-full text-left border border-[#333333] bg-black/20 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[#E2E3DD] text-sm font-bold">{VIBE_META[vibeId].name}</div>
                    <span className={isActive ? 'text-[#00DC00] text-xs' : 'text-[#767676] text-xs'}>
                      {isActive ? '[ACTIVE]' : '[SELECT]'}
                    </span>
                  </div>
                  <div className="text-[#767676] text-xs mt-1">{VIBE_META[vibeId].description}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'TRANSMISSION' && (
        <div className="space-y-4">
          <div className="border border-[#333333] bg-black/20 p-4">
            <div className="text-[#E600E6] text-sm mb-2">MY TRANSMISSION</div>
            <div className="text-[#E600E6] text-sm">
              {transmission || ' '}
            </div>
          </div>

          <textarea
            value={transmission}
            onChange={(event) => setTransmission(event.target.value)}
            rows={3}
            maxLength={PROFILE_LIMITS.TRANSMISSION_MAX_CHARS}
            className="w-full border border-[#333333] bg-black/20 p-3 text-[#CCCCCC] text-sm outline-none"
          />

          <div className={transmissionValid ? 'text-[#767676] text-xs' : 'text-[#E20000] text-xs'}>
            Characters: {transmission.length}/{PROFILE_LIMITS.TRANSMISSION_MAX_CHARS}
          </div>
        </div>
      )}

      {activeTab === 'LAYOUT' && (
        <div className="space-y-3">
          {ALL_MODULES.map((module) => {
            const enabled = layoutModules.includes(module);
            const label = MODULE_META[module].label;
            const description = MODULE_META[module].description;
            return (
              <div key={module} className="border border-[#333333] bg-black/20 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[#767676]">:::</span>
                  <div className="text-[#E2E3DD] text-sm font-bold">{label}</div>
                  <div className="text-[#767676] text-xs">{description}</div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleModule(module)}
                    className={`border border-[#333333] px-2 py-1 text-xs ${enabled ? 'text-[#00DC00]' : 'text-[#767676]'}`}
                  >
                    {enabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveModule(module, 'up')}
                    className="border border-[#333333] px-2 py-1 text-xs text-[#767676]"
                    disabled={!enabled}
                  >
                    UP
                  </button>
                  <button
                    type="button"
                    onClick={() => moveModule(module, 'down')}
                    className="border border-[#333333] px-2 py-1 text-xs text-[#767676]"
                    disabled={!enabled}
                  >
                    DOWN
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <button
          type="button"
          onClick={handleSave}
          className="border border-[#00DC00] text-[#00DC00] px-4 py-2 text-sm font-bold"
        >
          SAVE CHANGES
        </button>
      </div>
    </div>
  );
}
