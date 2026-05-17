'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useClerkHuman } from '@/hooks/useClerkHuman';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PlanetGenerator from '@/components/planet/PlanetGenerator';
import type { PlanetConfig } from '@/components/planet/planetTypes';
import {
  DEFAULT_PLANET_CONFIG,
  PLANET_TYPES,
  PLANET_SIZES,
  PLANET_COLORS,
  ATMOSPHERE_TYPES,
  RING_TYPES,
  MOON_COUNTS,
  MOON_PALETTE,
  SURFACE_FEATURES,
  STARFIELD_TYPES,
  ANIMATION_TYPES,
  STEP_LABELS,
  randomPlanetConfig,
} from '@/components/planet/planetTypes';

export const dynamic = 'force-dynamic';

const MAX_FEATURES = 3;
const MAX_NAME_LENGTH = 24;

export default function PlanetSpacePage() {
  const { human } = useClerkHuman();
  const router = useRouter();

  // ═══════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════

  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<PlanetConfig>({ ...DEFAULT_PLANET_CONFIG });
  const [customPrimaryHex, setCustomPrimaryHex] = useState('');
  const [customSecondaryHex, setCustomSecondaryHex] = useState('');
  const [customAtmoHex, setCustomAtmoHex] = useState('');
  const [customRingHex, setCustomRingHex] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingExisting, setIsEditingExisting] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);

  // Load existing planet config
  useEffect(() => {
    if (!human) return;
    const stored = localStorage.getItem('custom-planet');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setConfig(parsed);
        setIsEditingExisting(true);
      } catch { /* ignore */ }
      return;
    }
    // Fetch from server
    fetch('/api/v1/humans/planet', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.planetConfig) {
          setConfig(data.planetConfig);
          setIsEditingExisting(true);
          localStorage.setItem('custom-planet', JSON.stringify(data.planetConfig));
        }
      })
      .catch(() => { /* silent */ });
  }, [human]);

  // Auto-save to localStorage on config change
  useEffect(() => {
    localStorage.setItem('custom-planet', JSON.stringify(config));
  }, [config]);

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  const updateConfig = useCallback((updates: Partial<PlanetConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const uiColor = config.primaryColor || '#4A9EFF';

  const goToStep = (s: number) => {
    if (s >= 0 && s <= 11) setStep(s);
  };

  const randomizeAll = () => {
    const rc = randomPlanetConfig();
    setConfig(rc);
  };

  const startOver = () => {
    setConfig({ ...DEFAULT_PLANET_CONFIG });
    setStep(0);
    setIsEditingExisting(false);
  };

  const isValidHex = (s: string) => /^#[0-9A-Fa-f]{6}$/.test(s);

  const exportPng = () => {
    const canvas = previewRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${config.name || 'my-planet'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const saveToProfile = async () => {
    if (!human) {
      router.push('/sign-in');
      return;
    }
    setIsSaving(true);
    setSaveMessage('');
    try {
      const putOptions: RequestInit = {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planetConfig: config }),
      };

      let res = await fetch('/api/v1/humans/planet', putOptions);

      // Token refresh on 401
      if (res.status === 401) {
        const refreshRes = await fetch('/api/v1/humans/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (refreshRes.ok) {
          res = await fetch('/api/v1/humans/planet', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planetConfig: config }),
          });
        }
      }

      if (res.ok) {
        setSaveMessage(isEditingExisting ? 'Planet updated successfully.' : 'Planet created successfully.');
        setIsEditingExisting(true);
      } else {
        setSaveMessage('Failed to save. Try again.');
      }
    } catch {
      setSaveMessage('Network error. Try again.');
    }
    setIsSaving(false);
  };



  // ═══════════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ═══════════════════════════════════════════════════════════════

  const renderOptionCard = (
    id: string,
    label: string,
    desc: string,
    isSelected: boolean,
    onClick: () => void,
  ) => (
    <button
      key={id}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '12px 16px',
        backgroundColor: isSelected ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
        border: isSelected ? `2px solid ${uiColor}` : '2px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s ease',
        width: '100%',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
    >
      <span style={{
        fontFamily: "'Glass TTY VT220', monospace",
        fontSize: '13px',
        fontWeight: 'bold',
        color: isSelected ? uiColor : 'var(--sb-text-primary)',
        letterSpacing: '1px',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "'Glass TTY VT220', monospace",
        fontSize: '11px',
        color: 'var(--sb-text-secondary)',
        lineHeight: '1.4',
      }}>
        {desc}
      </span>
    </button>
  );

  const renderColorPicker = (
    selectedColor: string,
    onSelect: (hex: string) => void,
    customHex: string,
    setCustomHex: (s: string) => void,
    label: string,
  ) => (
    <div>
      <div style={{
        fontFamily: "'Glass TTY VT220', monospace",
        fontSize: '14px',
        color: 'var(--sb-text-primary)',
        marginBottom: '12px',
        letterSpacing: '1px',
        textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
        gap: '8px',
        marginBottom: '12px',
      }}>
        {PLANET_COLORS.map(c => (
          <button
            key={c.hex}
            onClick={() => onSelect(c.hex)}
            title={c.label}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '6px',
              border: selectedColor === c.hex ? `3px solid ${uiColor}` : '2px solid rgba(255,255,255,0.1)',
              backgroundColor: c.hex,
              cursor: 'pointer',
              boxShadow: selectedColor === c.hex ? `0 0 10px ${c.hex}60` : 'none',
              transition: 'all 0.15s ease',
            }}
          />
        ))}
      </div>
      {/* Custom hex input */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="#FF00AA"
          value={customHex}
          onChange={e => setCustomHex(e.target.value)}
          maxLength={7}
          style={{
            width: '100px',
            padding: '8px 10px',
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '6px',
            color: 'var(--sb-text-primary)',
            fontFamily: "'Glass TTY VT220', monospace",
            fontSize: '13px',
          }}
        />
        <button
          onClick={() => {
            const hex = customHex.startsWith('#') ? customHex : `#${customHex}`;
            if (isValidHex(hex)) onSelect(hex);
          }}
          style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '6px',
            color: 'var(--sb-text-primary)',
            fontFamily: "'Glass TTY VT220', monospace",
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          APPLY
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // STEP CONTENT
  // ═══════════════════════════════════════════════════════════════

  const renderStepContent = () => {
    switch (step) {
      // STEP 0: Planet Type
      case 0:
        return (
          <div>
            <div style={stepTitleStyle}>CHOOSE YOUR PLANET TYPE</div>
            <div style={gridStyle}>
              {PLANET_TYPES.map(t => renderOptionCard(
                t.id, t.label, t.desc,
                config.type === t.id,
                () => updateConfig({ type: t.id }),
              ))}
            </div>
          </div>
        );

      // STEP 1: Size
      case 1:
        return (
          <div>
            <div style={stepTitleStyle}>CHOOSE YOUR PLANET SIZE</div>
            <div style={gridStyle}>
              {PLANET_SIZES.map(s => renderOptionCard(
                s.id, s.label, `${s.desc} — ${s.radius}px radius`,
                config.size === s.id,
                () => updateConfig({ size: s.id }),
              ))}
            </div>
          </div>
        );

      // STEP 2: Primary Color
      case 2:
        return renderColorPicker(
          config.primaryColor,
          hex => updateConfig({ primaryColor: hex }),
          customPrimaryHex,
          setCustomPrimaryHex,
          'PRIMARY COLOR — Dominant surface color',
        );

      // STEP 3: Secondary Color
      case 3:
        return renderColorPicker(
          config.secondaryColor,
          hex => updateConfig({ secondaryColor: hex }),
          customSecondaryHex,
          setCustomSecondaryHex,
          'SECONDARY COLOR — Accent and detail color',
        );

      // STEP 4: Atmosphere
      case 4:
        return (
          <div>
            <div style={stepTitleStyle}>ATMOSPHERE</div>
            <div style={gridStyle}>
              {ATMOSPHERE_TYPES.map(a => renderOptionCard(
                a.id, a.label, a.desc,
                config.atmosphere === a.id,
                () => {
                  const updates: Partial<PlanetConfig> = { atmosphere: a.id };
                  if (a.id === 'toxic') updates.atmosphereColor = '#B4CC32';
                  else if (a.id === 'electric') updates.atmosphereColor = '#64DCFF';
                  updateConfig(updates);
                },
              ))}
            </div>
            {config.atmosphere !== 'none' && (
              <div style={{ marginTop: '20px' }}>
                {renderColorPicker(
                  config.atmosphereColor,
                  hex => updateConfig({ atmosphereColor: hex }),
                  customAtmoHex,
                  setCustomAtmoHex,
                  'ATMOSPHERE COLOR',
                )}
              </div>
            )}
          </div>
        );

      // STEP 5: Rings
      case 5:
        return (
          <div>
            <div style={stepTitleStyle}>PLANETARY RINGS</div>
            <div style={gridStyle}>
              {RING_TYPES.map(r => renderOptionCard(
                r.id, r.label, r.desc,
                config.rings === r.id,
                () => updateConfig({ rings: r.id }),
              ))}
            </div>
            {config.rings !== 'none' && (
              <>
                <div style={{ marginTop: '20px' }}>
                  {renderColorPicker(
                    config.ringColor,
                    hex => updateConfig({ ringColor: hex }),
                    customRingHex,
                    setCustomRingHex,
                    'RING COLOR',
                  )}
                </div>
                <div style={{ marginTop: '16px' }}>
                  <div style={{
                    fontFamily: "'Glass TTY VT220', monospace",
                    fontSize: '13px',
                    color: 'var(--sb-text-primary)',
                    marginBottom: '8px',
                    letterSpacing: '1px',
                  }}>
                    RING OPACITY: {Math.round(config.ringOpacity * 100)}%
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={100}
                    value={Math.round(config.ringOpacity * 100)}
                    onChange={e => updateConfig({ ringOpacity: parseInt(e.target.value) / 100 })}
                    style={{ width: '100%', accentColor: uiColor }}
                  />
                </div>
              </>
            )}
          </div>
        );

      // STEP 6: Moons
      case 6:
        return (
          <div>
            <div style={stepTitleStyle}>MOONS</div>
            <div style={gridStyle}>
              {MOON_COUNTS.map(m => renderOptionCard(
                String(m.id), m.label, m.desc,
                config.moons === m.id,
                () => {
                  const moonColors = Array.from({ length: m.id }, (_, i) =>
                    config.moonColors[i] || MOON_PALETTE[i % MOON_PALETTE.length]
                  );
                  updateConfig({ moons: m.id, moonColors });
                },
              ))}
            </div>
            {config.moons > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{
                  fontFamily: "'Glass TTY VT220', monospace",
                  fontSize: '13px',
                  color: 'var(--sb-text-secondary)',
                  marginBottom: '8px',
                }}>
                  Moon colors (click to cycle):
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {config.moonColors.map((mc, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const idx = MOON_PALETTE.indexOf(mc);
                        const next = MOON_PALETTE[(idx + 1) % MOON_PALETTE.length];
                        const newColors = [...config.moonColors];
                        newColors[i] = next;
                        updateConfig({ moonColors: newColors });
                      }}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: mc,
                        border: '2px solid rgba(255,255,255,0.2)',
                        cursor: 'pointer',
                      }}
                      title={`Moon ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      // STEP 7: Surface Features
      case 7:
        return (
          <div>
            <div style={stepTitleStyle}>SURFACE FEATURES (up to {MAX_FEATURES})</div>
            <div style={gridStyle}>
              {SURFACE_FEATURES.map(f => {
                const isSelected = config.features.includes(f.id);
                const canAdd = config.features.length < MAX_FEATURES;
                return renderOptionCard(
                  f.id, f.label, f.desc,
                  isSelected,
                  () => {
                    if (isSelected) {
                      updateConfig({ features: config.features.filter(id => id !== f.id) });
                    } else if (canAdd) {
                      updateConfig({ features: [...config.features, f.id] });
                    }
                  },
                );
              })}
            </div>
            <div style={{
              fontFamily: "'Glass TTY VT220', monospace",
              fontSize: '12px',
              color: 'var(--sb-text-secondary)',
              marginTop: '12px',
            }}>
              {config.features.length}/{MAX_FEATURES} selected
            </div>
          </div>
        );

      // STEP 8: Starfield
      case 8:
        return (
          <div>
            <div style={stepTitleStyle}>STARFIELD BACKGROUND</div>
            <div style={gridStyle}>
              {STARFIELD_TYPES.map(s => renderOptionCard(
                s.id, s.label, s.desc,
                config.starfield === s.id,
                () => updateConfig({ starfield: s.id }),
              ))}
            </div>
          </div>
        );

      // STEP 9: Animation
      case 9:
        return (
          <div>
            <div style={stepTitleStyle}>ANIMATION</div>
            <div style={gridStyle}>
              {ANIMATION_TYPES.map(a => renderOptionCard(
                a.id, a.label, a.desc,
                config.animation === a.id,
                () => updateConfig({ animation: a.id }),
              ))}
            </div>
          </div>
        );

      // STEP 10: Name
      case 10:
        return (
          <div>
            <div style={stepTitleStyle}>NAME YOUR PLANET</div>
            <input
              type="text"
              value={config.name}
              onChange={e => {
                const val = e.target.value.replace(/[^a-zA-Z0-9\s\-]/g, '').slice(0, MAX_NAME_LENGTH);
                updateConfig({ name: val });
              }}
              placeholder="Enter planet name..."
              maxLength={MAX_NAME_LENGTH}
              style={{
                width: '100%',
                padding: '14px 16px',
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: `2px solid ${uiColor}40`,
                borderRadius: '8px',
                color: 'var(--sb-text-primary)',
                fontFamily: "'Glass TTY VT220', monospace",
                fontSize: '18px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = uiColor; }}
              onBlur={e => { e.currentTarget.style.borderColor = `${uiColor}40`; }}
            />
            <div style={{
              fontFamily: "'Glass TTY VT220', monospace",
              fontSize: '11px',
              color: 'var(--sb-text-secondary)',
              marginTop: '8px',
            }}>
              {config.name.length}/{MAX_NAME_LENGTH} — Letters, numbers, hyphens, spaces
            </div>
          </div>
        );

      // STEP 11: Summary & Save
      case 11:
        return renderSummary();

      default:
        return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════

  const renderSummary = () => {
    const typeLabel = PLANET_TYPES.find(t => t.id === config.type)?.label ?? config.type;
    const sizeLabel = PLANET_SIZES.find(s => s.id === config.size)?.label ?? config.size;
    const atmoLabel = ATMOSPHERE_TYPES.find(a => a.id === config.atmosphere)?.label ?? config.atmosphere;
    const ringLabel = RING_TYPES.find(r => r.id === config.rings)?.label ?? config.rings;
    const animLabel = ANIMATION_TYPES.find(a => a.id === config.animation)?.label ?? config.animation;
    const starLabel = STARFIELD_TYPES.find(s => s.id === config.starfield)?.label ?? config.starfield;
    const featureLabels = config.features.map(f => SURFACE_FEATURES.find(sf => sf.id === f)?.label ?? f);

    const summaryRow = (label: string, value: string, color?: string) => (
      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontFamily: "'Glass TTY VT220', monospace", fontSize: '12px', color: 'var(--sb-text-secondary)', letterSpacing: '1px' }}>
          {label}
        </span>
        <span style={{ fontFamily: "'Glass TTY VT220', monospace", fontSize: '12px', color: color || 'var(--sb-text-primary)', letterSpacing: '1px' }}>
          {value}
        </span>
      </div>
    );

    return (
      <div>
        <div style={stepTitleStyle}>YOUR PLANET SUMMARY</div>

        <div style={{
          backgroundColor: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
        }}>
          {summaryRow('NAME', config.name || '(unnamed)')}
          {summaryRow('TYPE', typeLabel)}
          {summaryRow('SIZE', sizeLabel)}
          {summaryRow('PRIMARY COLOR', config.primaryColor, config.primaryColor)}
          {summaryRow('SECONDARY COLOR', config.secondaryColor, config.secondaryColor)}
          {summaryRow('ATMOSPHERE', atmoLabel)}
          {summaryRow('RINGS', ringLabel)}
          {summaryRow('MOONS', String(config.moons))}
          {summaryRow('FEATURES', featureLabels.join(', ') || 'None')}
          {summaryRow('STARFIELD', starLabel)}
          {summaryRow('ANIMATION', animLabel)}
        </div>

        {saveMessage && (
          <div style={{
            fontFamily: "'Glass TTY VT220', monospace",
            fontSize: '13px',
            color: saveMessage.includes('success') ? '#5200FF' : '#E20000',
            marginBottom: '12px',
            textAlign: 'center',
          }}>
            {saveMessage}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={saveToProfile}
              disabled={isSaving}
              style={{
                flex: 1,
                padding: '14px',
                backgroundColor: uiColor,
                color: '#000',
                border: `1px solid ${uiColor}`,
                borderRadius: '6px',
                fontFamily: "'Glass TTY VT220', monospace",
                fontSize: '13px',
                fontWeight: 'bold',
                letterSpacing: '1.5px',
                cursor: isSaving ? 'wait' : 'pointer',
                opacity: isSaving ? 0.6 : 1,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 16px ${uiColor}80`; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
            >
              {isSaving ? 'SAVING...' : isEditingExisting ? 'UPDATE PLANET' : 'SAVE TO PROFILE'}
            </button>

            <button
              onClick={exportPng}
              style={{
                flex: 1,
                padding: '14px',
                backgroundColor: 'transparent',
                color: uiColor,
                border: `1px solid ${uiColor}`,
                borderRadius: '6px',
                fontFamily: "'Glass TTY VT220', monospace",
                fontSize: '13px',
                fontWeight: 'bold',
                letterSpacing: '1.5px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 12px ${uiColor}40`; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
            >
              SAVE TO COMPUTER
            </button>
          </div>

          <button
            onClick={randomizeAll}
            style={{
              padding: '12px',
              backgroundColor: 'transparent',
              color: '#5200FF',
              border: '1px solid #5200FF',
              borderRadius: '6px',
              fontFamily: "'Glass TTY VT220', monospace",
              fontSize: '13px',
              fontWeight: 'bold',
              letterSpacing: '1.5px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 12px rgba(0,220,0,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
          >
            RANDOMIZE EVERYTHING
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={startOver}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: 'transparent',
                color: '#767676',
                border: '1px solid #333',
                borderRadius: '6px',
                fontFamily: "'Glass TTY VT220', monospace",
                fontSize: '13px',
                fontWeight: 'bold',
                letterSpacing: '1.5px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#E20000'; e.currentTarget.style.color = '#E20000'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#767676'; }}
            >
              START OVER
            </button>

            <button
              onClick={() => {
                localStorage.removeItem('custom-planet');
                startOver();
              }}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: 'transparent',
                color: '#767676',
                border: '1px solid #333',
                borderRadius: '6px',
                fontFamily: "'Glass TTY VT220', monospace",
                fontSize: '13px',
                fontWeight: 'bold',
                letterSpacing: '1.5px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#E6E300'; e.currentTarget.style.color = '#E6E300'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#767676'; }}
            >
              CLEAR SAVED PLANET
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════

  const stepTitleStyle: React.CSSProperties = {
    fontFamily: "'Glass TTY VT220', monospace",
    fontSize: '16px',
    fontWeight: 'bold',
    color: 'var(--sb-text-primary)',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    marginBottom: '16px',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '8px',
  };

  // Build subheader summary string
  const typeLabel = PLANET_TYPES.find(t => t.id === config.type)?.label ?? '';
  const sizeLabel = PLANET_SIZES.find(s => s.id === config.size)?.label ?? '';
  const atmoLabel = ATMOSPHERE_TYPES.find(a => a.id === config.atmosphere)?.label ?? '';
  const ringLabel = config.rings !== 'none' ? RING_TYPES.find(r => r.id === config.rings)?.label + ' RING' : '';
  const animLabel = ANIMATION_TYPES.find(a => a.id === config.animation)?.label ?? '';
  const summaryParts = [typeLabel, sizeLabel, atmoLabel, ringLabel, animLabel].filter(Boolean);

  // ═══════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div style={{
      maxWidth: '1100px',
      margin: '0 auto',
      padding: '20px',
    }}>
      {/* Back link */}
      <Link
        href="/peoplespace"
        style={{
          fontFamily: "'Glass TTY VT220', monospace",
          fontSize: '12px',
          color: 'var(--sb-text-secondary)',
          textDecoration: 'none',
          letterSpacing: '1px',
          display: 'inline-block',
          marginBottom: '16px',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = uiColor; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--sb-text-secondary)'; }}
      >
        &larr; BACK TO PEOPLESPACE
      </Link>

      {/* Header */}
      <div style={{ marginBottom: '8px' }}>
        <h1 style={{
          fontFamily: "'Glass TTY VT220', monospace",
          fontSize: '28px',
          fontWeight: 'bold',
          color: uiColor,
          letterSpacing: '4px',
          textTransform: 'uppercase',
          margin: 0,
          textShadow: `0 0 20px ${uiColor}40`,
        }}>
          PLANET SPACE
        </h1>
      </div>

      {/* Subheader: current selections */}
      <div style={{
        fontFamily: "'Glass TTY VT220', monospace",
        fontSize: '11px',
        color: 'var(--sb-text-secondary)',
        letterSpacing: '1.5px',
        marginBottom: '20px',
      }}>
        {summaryParts.join(' \u00B7 ')}
      </div>

      {/* Step indicator bar */}
      <div style={{
        display: 'flex',
        gap: '2px',
        marginBottom: '24px',
        overflowX: 'auto',
        paddingBottom: '4px',
      }}>
        {STEP_LABELS.map((label, i) => (
          <button
            key={i}
            onClick={() => goToStep(i)}
            style={{
              padding: '6px 10px',
              backgroundColor: step === i ? uiColor : 'rgba(255,255,255,0.04)',
              color: step === i ? '#000' : i < step ? uiColor : 'var(--sb-text-secondary)',
              border: step === i ? `1px solid ${uiColor}` : '1px solid rgba(255,255,255,0.08)',
              borderRadius: '4px',
              fontFamily: "'Glass TTY VT220', monospace",
              fontSize: '10px',
              fontWeight: 'bold',
              letterSpacing: '0.5px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
          >
            {i + 1} {label}
          </button>
        ))}
      </div>

      {/* Main layout: Preview + Builder */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 400px) 1fr',
        gap: '32px',
        alignItems: 'start',
      }}>
        {/* LEFT: Live Preview */}
        <div style={{
          position: 'sticky',
          top: '20px',
        }}>
          <div
            ref={previewRef}
            style={{
              width: '100%',
              maxWidth: '400px',
              aspectRatio: '1',
              backgroundColor: '#000',
              borderRadius: '12px',
              border: `1px solid ${uiColor}30`,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <PlanetGenerator config={config} size={400} animated={true} />
          </div>

          {/* Planet name below preview */}
          {config.name && (
            <div style={{
              textAlign: 'center',
              marginTop: '12px',
              fontFamily: "'Glass TTY VT220', monospace",
              fontSize: '16px',
              fontWeight: 'bold',
              color: uiColor,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              textShadow: `0 0 10px ${uiColor}40`,
            }}>
              {config.name}
            </div>
          )}
        </div>

        {/* RIGHT: Step Builder */}
        <div style={{ minWidth: 0 }}>
          {renderStepContent()}

          {/* Navigation buttons */}
          {step < 11 && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              {step > 0 && (
                <button
                  onClick={() => goToStep(step - 1)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: 'transparent',
                    color: 'var(--sb-text-secondary)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '6px',
                    fontFamily: "'Glass TTY VT220', monospace",
                    fontSize: '13px',
                    fontWeight: 'bold',
                    letterSpacing: '1.5px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = uiColor; e.currentTarget.style.color = uiColor; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'var(--sb-text-secondary)'; }}
                >
                  &larr; BACK
                </button>
              )}
              <button
                onClick={() => goToStep(step + 1)}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: uiColor,
                  color: '#000',
                  border: `1px solid ${uiColor}`,
                  borderRadius: '6px',
                  fontFamily: "'Glass TTY VT220', monospace",
                  fontSize: '13px',
                  fontWeight: 'bold',
                  letterSpacing: '1.5px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 12px ${uiColor}60`; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
              >
                NEXT &rarr;
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 767px) {
          div[style*="gridTemplateColumns: minmax(280px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
