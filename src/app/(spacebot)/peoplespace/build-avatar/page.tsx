'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuthGate } from '@/hooks/useAuthGate';
import { useClerkHuman } from '@/hooks/useClerkHuman';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import type { RobotConfig, FactionPalette } from '@/components/avatar/avatarConfig';
import {
  BODY_TYPES, HUMAN_EYE_TYPES, MOUTH_TYPES, HUMAN_COLORS,
  HUMAN_ACCESSORIES, SHARED_ACCESSORIES, ANIMATION_TYPES,
} from '@/components/avatar/avatarConfig';
import { drawRobot } from '@/components/avatar/avatarRenderer';
import { drawHumanAccessories } from '@/components/avatar/avatarHumanAccessories';
import { drawSharedAccessories } from '@/components/avatar/avatarSharedAccessories';
import { drawHumanOverlay } from '@/components/avatar/avatarHumanOverlay';
import { drawSchematicOverlay, SCHEMATIC_INFO } from '@/components/avatar/avatarSchematicOverlays';
import { seededRandom, generateConfig, getColors } from '@/components/avatar/avatarSeeder';
import { darkenColor, lightenColor } from '@/components/avatar/avatarUtils';

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// DISPLAY INFO MAPS
// ═══════════════════════════════════════════════════════════════

const BODY_INFO: Record<string, { label: string; desc: string }> = {
  box:        { label: 'BOX',        desc: 'Industrial rounded rectangle' },
  egg:        { label: 'EGG',        desc: 'Smooth glossy oval' },
  sphere:     { label: 'SPHERE',     desc: 'Perfect metallic sphere' },
  dome:       { label: 'DOME',       desc: 'Helmet with flat collar' },
  cylinder:   { label: 'CYLINDER',   desc: 'Tall pill capsule' },
  hexplate:   { label: 'HEXPLATE',   desc: 'Hexagonal armor plate' },
  visor_helm: { label: 'VISOR HELM', desc: 'Tactical helmet visor' },
  dish:       { label: 'DISH',       desc: 'Satellite dish bowl' },
  wedge:      { label: 'WEDGE',      desc: 'Angular triangular wedge' },
  monitor:    { label: 'MONITOR',    desc: 'Retro CRT screen' },
};

const EYE_INFO: Record<string, { label: string; desc: string }> = {
  round_wide:   { label: 'WIDE',       desc: 'Big open friendly eyes' },
  round_narrow: { label: 'NARROW',     desc: 'Squinted suspicious eyes' },
  almond:       { label: 'ALMOND',     desc: 'Elegant almond shape' },
  droopy:       { label: 'DROOPY',     desc: 'Downturned gentle eyes' },
  upswept:      { label: 'UPSWEPT',    desc: 'Fierce commanding eyes' },
  large_iris:   { label: 'LARGE IRIS', desc: 'Huge dark intense iris' },
  void_eye:     { label: 'VOID',       desc: 'Black sclera white ring' },
  glow_iris:    { label: 'GLOW',       desc: 'Softly glowing ethereal' },
  pinpoint:     { label: 'PINPOINT',   desc: 'Tiny bright watchful pupil' },
  crescent:     { label: 'CRESCENT',   desc: 'Dark with crescent light' },
  ring_eye:     { label: 'RING',       desc: 'Thin bright ring' },
  split_tone:   { label: 'SPLIT',      desc: 'Half light half dark iris' },
  binocular:     { label: 'BINOCULAR',    desc: 'Dual camera lens bridge' },
  led_visor:     { label: 'LED VISOR',    desc: 'Horizontal glowing bar' },
  dot_sensors:   { label: 'SENSORS',      desc: 'Large glowing circles' },
  camera_lens:   { label: 'CYCLOPS',      desc: 'Single centered lens' },
  scanner_bar:   { label: 'SCANNER',      desc: 'Scanning laser line' },
  pixel_display: { label: 'PIXEL',        desc: 'LED matrix grid eyes' },
  ring_optic:    { label: 'RING OPTIC',   desc: 'Hollow glowing rings' },
  slit_visor:    { label: 'SLIT',         desc: 'Narrow menacing slit' },
  compound:      { label: 'COMPOUND',     desc: 'Insect cluster eyes' },
  projector:     { label: 'PROJECTOR',    desc: 'Rectangular lens' },
};

const MOUTH_INFO: Record<string, { label: string; desc: string }> = {
  speaker_grille: { label: 'SPEAKER GRILLE', desc: 'Rectangle with horizontal slits' },
  vent_slits:     { label: 'VENT SLITS',     desc: 'Three cooling vent slots' },
  data_display:   { label: 'DATA DISPLAY',   desc: 'Small status screen' },
  single_slit:    { label: 'SINGLE SLIT',    desc: 'Minimal dark groove' },
  jaw_plate:      { label: 'JAW PLATE',      desc: 'Metal chin guard' },
  wave_emitter:   { label: 'WAVE EMITTER',   desc: 'Circular sound emitter' },
};

const HUMAN_MOUTHS = MOUTH_TYPES.filter(m => m !== 'none');

const SORTED_EYE_TYPES = [...HUMAN_EYE_TYPES].sort((a, b) => {
  const labelA = EYE_INFO[a]?.label ?? a.toUpperCase();
  const labelB = EYE_INFO[b]?.label ?? b.toUpperCase();
  return labelA.localeCompare(labelB);
});

const STEP_LABELS = [
  'Body', 'Eyes', 'Mouth', 'Color', 'Acc',
  'Schem', 'Anim', 'Name', 'Done',
];

const COLOR_NAMES = ['Blue', 'Pink', 'Purple', 'Teal', 'Gold', 'Coral', 'Cyan', 'Magenta', 'Yellow', 'Red', 'Green', 'Orange', 'White', 'Hot Pink', 'Sky Blue', 'Red-Orange', 'Slate Blue', 'Spring Green', 'Bubblegum', 'Dodger Blue'];

const ACC_INFO: Record<string, string> = {
  gold_halo: 'Floating golden ring', gold_crown: 'Ornate crown with jewels',
  diamond_tiara: 'Sparkling gem tiara', gold_headband: 'Sleek metallic band',
  designer_shades: 'Premium gold sunglasses', gold_monocle: 'Gold-rimmed lens chain',
  pearl_earrings: 'Glowing pearl spheres', diamond_nose_stud: 'Brilliant nose piercing',
  gold_chain: 'Thick luxury necklace', blush: 'Soft warm cheek glow',
  freckles: 'Scattered organic dots', beauty_mark: 'Single elegant dot',
  tears: 'Crystal clear teardrops', scar: 'Battle line worn proud',
  dj_headphones: 'Premium gold headphones', metallic_snapback: 'Gold metallic cap',
  hair_bow: 'Decorative luxury bow', flower: 'Elegant flower behind ear',
  neural_band: 'Neural interface headset', hud_lens: 'Holographic HUD display',
  electron_orbits: 'Atomic rings circle head', dna_helix: 'Double helix spiral',
  saturn_rings: 'Planetary ring around head', particle_cloud: 'Floating glowing particles',
  fibonacci_spiral: 'Golden ratio spiral', atom_burst: 'Radiating energy lines',
  shield_arcs_orbital: 'Orbiting energy arcs', binary_rain: 'Matrix falling code',
  sound_waves: 'Concentric sound arcs', gravitational_lens: 'Space-time distortion',
  quantum_link: 'Entangled particle pair', star_field: 'Deep space pinpoint stars',
  holographic_horns: 'Translucent energy horns', propeller_cap: 'Spinning propeller beanie',
  earbuds_wire: 'In-ear buds with wire', square_ears: 'Rectangular sensor panels',
  ear_cuffs: 'Metallic side rings', round_glasses: 'Wire frame circles',
  eye_patch: 'Single eye covering', mohawk_fin: 'Metallic dorsal ridge',
};

const LUXURY_ACCS: readonly string[] = HUMAN_ACCESSORIES;
const ORBITAL_ACCS = SHARED_ACCESSORIES.slice(0, 12);
const GEAR_ACCS = SHARED_ACCESSORIES.slice(12);

const SCHEMATIC_COLORS: { hex: string; label: string }[] = [
  { hex: 'match',   label: 'MATCH AVATAR' },
  { hex: '#E6E300', label: 'Yellow' },
  { hex: '#E20000', label: 'Red' },
  { hex: '#00DC00', label: 'Green' },
  { hex: '#FF6600', label: 'Orange' },
  { hex: '#4A9EFF', label: 'Blue' },
  { hex: '#FF4A8D', label: 'Pink' },
  { hex: '#8A4AFF', label: 'Purple' },
  { hex: '#4AFFF0', label: 'Cyan' },
  { hex: '#FFFFFF', label: 'White' },
];

const ANIM_INFO: Record<string, { label: string; desc: string }> = {
  drift:   { label: 'DRIFT',   desc: 'Gentle floating hover' },
  jolt:    { label: 'JOLT',    desc: 'Electric surge pulse' },
  glitch:  { label: 'GLITCH',  desc: 'Digital flicker effect' },
  breathe: { label: 'BREATHE', desc: 'Slow core pulse' },
  bounce:  { label: 'BOUNCE',  desc: 'Double bounce energy' },
  scan:    { label: 'SCAN',    desc: 'Sweeping scan line' },
};

interface StoredAvatarConfig {
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

function applyAvatarConfig(
  config: StoredAvatarConfig,
  setters: {
    setBodyType: (value: string) => void;
    setEyeType: (value: string) => void;
    setMouthType: (value: string) => void;
    setColorIndex: (value: number) => void;
    setCustomHex: (value: string) => void;
    setSelectedAccessories: (value: string[]) => void;
    setSchematicId: (value: string) => void;
    setSchematicColor: (value: string) => void;
    setOverlayPreset: (value: string) => void;
    setAnimationType: (value: string) => void;
    setAndroidName: (value: string) => void;
  }
) {
  setters.setBodyType(config.bodyType || BODY_TYPES[0]);
  setters.setEyeType(config.eyeType || HUMAN_EYE_TYPES[0]);
  setters.setMouthType(config.mouthType || HUMAN_MOUTHS[0]);
  setters.setColorIndex(config.colorIndex ?? 0);
  setters.setCustomHex(config.customHex || '');
  setters.setSelectedAccessories(config.selectedAccessories || []);
  setters.setSchematicId(config.schematicId || 'none');
  setters.setSchematicColor(config.schematicColor || 'match');
  setters.setOverlayPreset(config.overlayPreset || 'minimal');
  setters.setAnimationType(config.animationType || 'drift');
  setters.setAndroidName(config.androidName || '');
}

// ═══════════════════════════════════════════════════════════════
// ANIMATION KEYFRAMES & HELPERS
// ═══════════════════════════════════════════════════════════════

const KEYFRAMES = `
@keyframes avatar-drift {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-3px); }
}
@keyframes avatar-jolt {
  0%, 90%, 100% { transform: translate(0, 0) rotate(0deg); }
  92% { transform: translate(2px, -1px) rotate(1.5deg); }
  94% { transform: translate(-1px, 1px) rotate(-1deg); }
  96% { transform: translate(1px, 0px) rotate(0.5deg); }
  98% { transform: translate(0, 0) rotate(0deg); }
}
@keyframes avatar-glitch {
  0%, 85%, 100% { transform: translate(0, 0); opacity: 1; }
  86% { transform: translate(3px, 0); opacity: 0.8; }
  87% { transform: translate(-2px, 0); opacity: 0.9; }
  88% { transform: translate(1px, 0); opacity: 0.7; }
  89% { transform: translate(0, 0); opacity: 1; }
}
@keyframes avatar-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}
@keyframes avatar-bounce {
  0%, 100% { transform: translateY(0); }
  15% { transform: translateY(-4px); }
  30% { transform: translateY(0); }
  40% { transform: translateY(-2px); }
  50% { transform: translateY(0); }
}
@keyframes avatar-scan {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(2px) rotate(0.5deg); }
  75% { transform: translateX(-2px) rotate(-0.5deg); }
}
`;

function getDuration(type: string): number {
  const map: Record<string, number> = {
    drift: 4, jolt: 6, glitch: 5, breathe: 5, bounce: 3, scan: 7,
  };
  return map[type] ?? 4;
}

function getEasing(type: string): string {
  const map: Record<string, string> = {
    drift: 'ease-in-out', jolt: 'linear', glitch: 'linear',
    breathe: 'ease-in-out', bounce: 'ease-in-out', scan: 'ease-in-out',
  };
  return map[type] ?? 'ease-in-out';
}

// ═══════════════════════════════════════════════════════════════
// AVATAR PREVIEW — direct canvas rendering (no seeder)
// ═══════════════════════════════════════════════════════════════

function AvatarPreview({
  config,
  colors,
  size,
  showOverlay = false,
  schematicId,
  schematicColor,
}: {
  config: RobotConfig;
  colors: FactionPalette;
  size: number;
  showOverlay?: boolean;
  schematicId?: string;
  schematicColor?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const UNDERLAY_SCHEMATICS = new Set([
    'pcb_circuit',
    'pcb_dense',
    'circuit_radial',
    'hex_grid',
    'triangle_mesh',
    'isometric_grid',
    'waveform',
    'data_matrix',
  ]);

  useEffect(() => {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const hasSchematic = Boolean(schematicId && schematicId !== 'none' && schematicColor);
    const isUnderlaySchematic = Boolean(hasSchematic && schematicId && UNDERLAY_SCHEMATICS.has(schematicId));

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);
        drawRobot(ctx, config, colors, size);
        if (config.humanAccessories.length > 0) {
          drawHumanAccessories(ctx, config, colors, size);
        }
        drawSharedAccessories(ctx, config, colors, size);
        if (isUnderlaySchematic && schematicId && schematicColor) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-over';
          drawSchematicOverlay(ctx, schematicId, schematicColor, size);
          ctx.restore();
        }
      }
    }

    const overlay = overlayRef.current;
    if (overlay) {
      const octx = overlay.getContext('2d');
      if (octx) {
        overlay.width = size * dpr;
        overlay.height = size * dpr;
        octx.scale(dpr, dpr);
        if (hasSchematic) {
          if (!isUnderlaySchematic && schematicId && schematicColor) {
            drawSchematicOverlay(octx, schematicId, schematicColor, size);
          } else {
            octx.clearRect(0, 0, overlay.width, overlay.height);
          }
        } else if (showOverlay) {
          drawHumanOverlay(octx, config, colors, size);
        } else {
          octx.clearRect(0, 0, overlay.width, overlay.height);
        }
      }
    }
  }, [config, colors, size, showOverlay, schematicId, schematicColor]);

  const animName = config.animationType;
  const animStyle = animName && animName !== 'none'
    ? `avatar-${animName} ${getDuration(animName)}s ${getEasing(animName)} infinite`
    : 'none';

  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <div style={{
        animation: animStyle,
        position: 'relative',
        width: size,
        height: size,
      }}>
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size, display: 'block' }}
        />
        {(showOverlay || (schematicId && schematicId !== 'none')) && (
          <canvas
            ref={overlayRef}
            style={{
              width: size, height: size, display: 'block',
              position: 'absolute', top: 0, left: 0, pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function BuildAvatarPage() {
  // ─── State ───
  const [bodyType, setBodyType] = useState<string>(BODY_TYPES[0]);
  const [eyeType, setEyeType] = useState<string>(HUMAN_EYE_TYPES[0]);
  const [mouthType, setMouthType] = useState<string>(HUMAN_MOUTHS[0]);
  const [colorIndex, setColorIndex] = useState<number>(0);
  const [customHex, setCustomHex] = useState<string>('');
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);
  const [schematicId, setSchematicId] = useState<string>('none');
  const [schematicColor, setSchematicColor] = useState<string>('match');
  const [overlayPreset, setOverlayPreset] = useState<string>('minimal');
  const [animationType, setAnimationType] = useState<string>('drift');
  const [androidName, setAndroidName] = useState<string>('');
  const [commandCenterHeight, setCommandCenterHeight] = useState(420);
  const [isEditingExistingAvatar, setIsEditingExistingAvatar] = useState(false);
  const { requireAuth } = useAuthGate();
  const { isSignedIn, isLoaded: clerkLoaded } = useUser();
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveMessage, setProfileSaveMessage] = useState<string | null>(null);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

  // -- ONBOARDING STATE --
  const router = useRouter();
  const { human: clerkHuman, isLoaded: clerkHumanLoaded } = useClerkHuman();
  const isNewUser = clerkHumanLoaded && clerkHuman && !clerkHuman.avatarConfig;

  useEffect(() => {
    const preloadAvatar = async () => {
      const setters = {
        setBodyType,
        setEyeType,
        setMouthType,
        setColorIndex,
        setCustomHex,
        setSelectedAccessories,
        setSchematicId,
        setSchematicColor,
        setOverlayPreset,
        setAnimationType,
        setAndroidName,
      };

      try {
        const response = await fetch('/api/v1/humans/avatar', {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const result = (await response.json()) as { success?: boolean; avatarConfig?: StoredAvatarConfig | null };
          if (result.success && result.avatarConfig && typeof result.avatarConfig === 'object') {
            applyAvatarConfig(result.avatarConfig, setters);
            setAndroidName('');
            setIsEditingExistingAvatar(true);
            return;
          }
        }
      } catch {
        // fall back to localStorage if API preload fails
      }

      const saved = localStorage.getItem('custom-avatar');
      if (!saved) {
        setIsEditingExistingAvatar(false);
        return;
      }

      try {
        const config = JSON.parse(saved) as StoredAvatarConfig;
        applyAvatarConfig(config, setters);
        setAndroidName('');
        setIsEditingExistingAvatar(Boolean(config.bodyType || config.eyeType || config.mouthType || config.selectedAccessories?.length));
      } catch {
        localStorage.removeItem('custom-avatar');
        setIsEditingExistingAvatar(false);
      }
    };

    void preloadAvatar();
  }, []);

  // ─── Measure command center height ───
  useEffect(() => {
    const measure = () => {
      const bar = document.getElementById('avatar-command-center');
      if (bar) {
        setCommandCenterHeight(bar.getBoundingClientRect().height + 24);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  // ─── Derived ───
  const activePalette: FactionPalette = useMemo(() => {
    if (customHex && /^#[0-9A-Fa-f]{6}$/.test(customHex)) {
      return {
        primary: customHex,
        dark: darkenColor(customHex, 40),
        light: lightenColor(customHex, 40),
      };
    }
    return HUMAN_COLORS[colorIndex];
  }, [colorIndex, customHex]);

  const resolvedSchematicColor = schematicColor === 'match' ? activePalette.primary : schematicColor;

  const previewConfig: RobotConfig = useMemo(() => ({
    bodyType,
    eyeType,
    mouthType,
    accessories: ['antenna', 'beacon_light'],
    surfaceFinish: 'clean',
    animationType,
    headTilt: 2,
    eyeTilt: 1,
    panelLineCount: 3,
    rivetCount: 4,
    boltCount: 2,
    serialSuffix: androidName
      ? androidName.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X')
      : 'PRVU',
    humanAccessories: selectedAccessories,
    botAccessories: [],
  }), [bodyType, eyeType, mouthType, animationType, selectedAccessories, androidName]);

  const uiColor = activePalette.primary;

  // ─── Accessory toggle ───
  const toggleAccessory = (acc: string) => {
    setSelectedAccessories(prev => {
      if (prev.includes(acc)) return prev.filter(a => a !== acc);
      if (prev.length >= 4) return prev;
      return [...prev, acc];
    });
  };

  // ─── Randomize & Reset ───
  const randomizeAll = () => {
    const seed = `rand_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const rng = seededRandom(seed);
    const config = generateConfig(rng, undefined, false);
    // Check for forced color from headless renderer (server-side deck)
    let colors: FactionPalette;
    const urlParams = new URLSearchParams(window.location.search);
    const forceColor = urlParams.get('forceColor');
    if (forceColor) {
      const idx = HUMAN_COLORS.findIndex(c => c.primary === forceColor);
      colors = idx >= 0 ? HUMAN_COLORS[idx] : { primary: forceColor, dark: forceColor, light: forceColor };
    } else {
      const colorRng = seededRandom(seed + ':color');
      colors = getColors(undefined, false, colorRng);
    }

    setBodyType(config.bodyType);
    setEyeType(config.eyeType);
    setMouthType(config.mouthType);
    setAnimationType(config.animationType);
    setSelectedAccessories(config.humanAccessories.slice(0, 4));
    const allIds = SCHEMATIC_INFO.map(s => s.id);
    setSchematicId(allIds[Math.floor(Math.random() * allIds.length)]);
    setSchematicColor(['match', '#E6E300', '#00DC00', '#4A9EFF', '#FF4A8D', '#FFFFFF'][Math.floor(Math.random() * 6)]);

    // Find matching color index or set custom
    const matchIdx = HUMAN_COLORS.findIndex(c => c.primary === colors.primary);
    if (matchIdx >= 0) {
      setColorIndex(matchIdx);
      setCustomHex('');
    } else {
      setCustomHex(colors.primary);
    }
  };

  const startOver = () => {
    setBodyType(BODY_TYPES[0]);
    setEyeType(HUMAN_EYE_TYPES[0]);
    setMouthType(HUMAN_MOUTHS[0]);
    setColorIndex(0);
    setCustomHex('');
    setSelectedAccessories([]);
    setSchematicId('none');
    setSchematicColor('match');
    setOverlayPreset('minimal');
    setAnimationType('drift');
    setAndroidName('');
  };

  // ─── Helpers ───
  const scrollToStep = (stepNumber: number) => {
    const el = document.getElementById(`step-${stepNumber}`);
    const bar = document.getElementById('avatar-command-center');
    if (el) {
      const barHeight = bar ? bar.getBoundingClientRect().height : 440;
      const elTop = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: elTop - barHeight - 60, behavior: 'smooth' });
    }
  };

  const renderStepHeader = (num: number, title: string) => (
    <>
      <div className="flex items-center gap-3 mb-4">
        <span
          className="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm"
          style={{ borderColor: uiColor, color: uiColor }}
        >
          {num}
        </span>
        <h2
          className="text-lg font-bold tracking-wide"
          style={{ fontFamily: "'Glass TTY VT220', monospace", color: '#E2E3DD' }}
        >
          {title}
        </h2>
      </div>
      <div className="h-px mb-4" style={{ backgroundColor: '#333' }} />
    </>
  );

  const renderCard = (
    key: string,
    label: string,
    desc: string,
    selected: boolean,
    onClick: () => void,
  ) => (
    <button
      key={key}
      onClick={onClick}
      className="p-3 text-left transition-all duration-200 cursor-pointer"
      style={{
        backgroundColor: selected ? `${uiColor}15` : '#1a1a1a',
        border: `1px solid ${selected ? uiColor : '#333'}`,
        boxShadow: selected ? `0 0 8px ${uiColor}60` : 'none',
        borderRadius: '6px',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = `${uiColor}66`; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = '#333'; }}
    >
      <div className="text-xs font-bold tracking-wider" style={{ color: selected ? uiColor : '#CCCCCC' }}>
        {label}
      </div>
      <div className="text-[10px] mt-1 text-[#767676]">{desc}</div>
    </button>
  );

  // ─── Layout ───
  return (
    <div className="w-full max-w-6xl mx-auto px-4 font-mono pb-20" style={{ backgroundColor: 'var(--sb-bg-primary)' }}>
      <style>{KEYFRAMES}</style>

      {/* === ONBOARDING WELCOME BANNER (new users only) === */}
      {isNewUser && (
        <div
          className="w-full max-w-3xl mx-auto mb-6"
          style={{
            position: 'relative',
            zIndex: 1,
            border: `1px solid ${uiColor}`,
            borderRadius: '6px',
            padding: '20px 24px',
            backgroundColor: '#0a0a0a',
            boxShadow: `0 0 20px ${uiColor}15`,
            marginTop: 8,
          }}
        >
          <div style={{ fontFamily: "'Glass TTY VT220', monospace", fontSize: 18, fontWeight: 'bold', letterSpacing: 3, color: uiColor, marginBottom: 8 }}>
            WELCOME TO THE SANCTUARY
          </div>
          <div style={{ fontSize: 13, color: '#CCCCCC', marginBottom: 12 }}>
            Step 1 of 2: Create Your Vessel
          </div>
          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, height: 4, backgroundColor: '#222', borderRadius: 2 }}>
              <div style={{ width: '50%', height: '100%', backgroundColor: uiColor, borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: uiColor }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#333' }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#767676' }}>
            Your avatar is your face in the Sanctuary. Build it, own it, make it yours.
          </div>
        </div>
      )}


      {/* ═══ COMMAND CENTER — fixed preview bar, ALL screen sizes ═══ */}
      <div
        id="avatar-command-center"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: '#0d0d0d',
          borderBottom: '2px solid #333',
          padding: '16px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Avatar — centered, big */}
        <AvatarPreview config={previewConfig} colors={activePalette} size={200} schematicId={schematicId} schematicColor={resolvedSchematicColor} />

        {/* Name */}
        <div style={{
          marginTop: 8,
          fontSize: 16,
          fontWeight: 'bold',
          letterSpacing: 2,
          fontFamily: "'Glass TTY VT220', monospace",
          color: uiColor,
          textAlign: 'center',
        }}>
          {androidName || 'YOUR ANDROID'}
        </div>

        {/* Summary line */}
        <div style={{ marginTop: 4, fontSize: 10, color: '#767676', textAlign: 'center' }}>
          {bodyType.toUpperCase()} &middot; {eyeType.replace(/_/g, ' ').toUpperCase()} &middot; {mouthType.replace(/_/g, ' ').toUpperCase()} &middot; {animationType.toUpperCase()}
          {schematicId !== 'none' && ` · ${schematicId.replace(/_/g, ' ').toUpperCase()}`}
        </div>

        {/* Step navigation — labeled buttons */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 2,
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid #333',
          width: '100%',
        }}>
          {STEP_LABELS.map((label, i) => (
            <button
              key={label}
              onClick={() => scrollToStep(i + 1)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                border: 'none',
                background: 'transparent',
                color: '#999',
                fontSize: 11,
                fontFamily: "'Glass TTY VT220', monospace",
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 'bold',
                border: `1px solid ${uiColor}`,
                color: uiColor,
              }}>
                {i + 1}
              </span>
              <span style={{ fontWeight: 'bold' }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Steps Panel — offset to clear command center ─── */}
      <div style={{ paddingTop: commandCenterHeight }} className="space-y-12">

          {/* Back link + page context */}
          <div style={{ marginTop: -16 }}>
            <Link href="/peoplespace" className="text-[#767676] hover:text-[#CCCCCC] text-sm transition-colors font-mono">
              &larr; BACK TO PEOPLESPACE
            </Link>
          </div>

          {/* ═══ STEP 1: BODY SHAPE ═══ */}
          <section id="step-1">
            {renderStepHeader(1, 'CHOOSE YOUR BODY SHAPE')}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {BODY_TYPES.map(bt => renderCard(
                bt,
                BODY_INFO[bt]?.label ?? bt.toUpperCase(),
                BODY_INFO[bt]?.desc ?? '',
                bodyType === bt,
                () => setBodyType(bt),
              ))}
            </div>
          </section>

          {/* ═══ STEP 2: EYES ═══ */}
          <section id="step-2">
            {renderStepHeader(2, 'CHOOSE YOUR EYES')}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SORTED_EYE_TYPES.map(et => renderCard(
                et,
                EYE_INFO[et]?.label ?? et.toUpperCase(),
                EYE_INFO[et]?.desc ?? '',
                eyeType === et,
                () => setEyeType(et),
              ))}
            </div>
          </section>

          {/* ═══ STEP 3: MOUTH ═══ */}
          <section id="step-3">
            {renderStepHeader(3, 'CHOOSE YOUR MOUTH')}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {HUMAN_MOUTHS.map(mt => renderCard(
                mt,
                MOUTH_INFO[mt]?.label ?? mt.toUpperCase(),
                MOUTH_INFO[mt]?.desc ?? '',
                mouthType === mt,
                () => setMouthType(mt),
              ))}
            </div>
          </section>

          {/* ═══ STEP 4: COLOR PALETTE ═══ */}
          <section id="step-4">
            {renderStepHeader(4, 'CHOOSE YOUR COLOR')}

            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 mb-6">
              {HUMAN_COLORS.map((palette, i) => {
                const selected = colorIndex === i && !customHex;
                return (
                  <button
                    key={palette.primary}
                    onClick={() => { setColorIndex(i); setCustomHex(''); }}
                    className="flex flex-col items-center gap-2 p-3 transition-all duration-200 cursor-pointer"
                    style={{
                      backgroundColor: selected ? `${palette.primary}15` : '#1a1a1a',
                      border: `1px solid ${selected ? palette.primary : '#333'}`,
                      boxShadow: selected ? `0 0 12px ${palette.primary}60` : 'none',
                      borderRadius: '6px',
                    }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = `${palette.primary}66`; }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = selected ? palette.primary : '#333'; }}
                  >
                    <div
                      className="w-10 h-10 rounded-full"
                      style={{
                        backgroundColor: palette.primary,
                        boxShadow: selected ? `0 0 16px ${palette.primary}80` : 'none',
                      }}
                    />
                    <div className="text-[10px] text-[#767676]">{COLOR_NAMES[i]}</div>
                    <div className="text-[9px] text-[#555]">{palette.primary}</div>
                  </button>
                );
              })}
            </div>

            {/* Custom hex input */}
            <div className="mt-4 p-4 border" style={{ borderColor: '#333', borderRadius: '6px', backgroundColor: '#1a1a1a' }}>
              <div className="text-xs tracking-widest text-[#767676] mb-3">CUSTOM COLOR</div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={(customHex && /^#[0-9A-Fa-f]{6}$/.test(customHex)) ? customHex : activePalette.primary}
                  onChange={e => setCustomHex(e.target.value)}
                  className="w-10 h-10 cursor-pointer rounded border-0 bg-transparent"
                  style={{ padding: 0 }}
                />
                <input
                  type="text"
                  placeholder="#FF00FF"
                  value={customHex}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === '') {
                      setCustomHex('');
                    } else if (/^#?[0-9A-Fa-f]{0,6}$/.test(v)) {
                      setCustomHex(v.startsWith('#') ? v : `#${v}`);
                    }
                  }}
                  maxLength={7}
                  className="flex-1 px-3 py-2 font-mono text-sm tracking-wider"
                  style={{
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    color: customHex && /^#[0-9A-Fa-f]{6}$/.test(customHex) ? customHex : '#767676',
                    outline: 'none',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = uiColor; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#333'; }}
                />
                {customHex && (
                  <button
                    onClick={() => setCustomHex('')}
                    className="text-xs text-[#767676] hover:text-[#CCCCCC] transition-colors px-2 py-1"
                  >
                    RESET
                  </button>
                )}
              </div>
              {customHex && /^#[0-9A-Fa-f]{6}$/.test(customHex) && (
                <div className="flex items-center gap-3 mt-3">
                  <div className="w-6 h-6 rounded-full" style={{ backgroundColor: customHex }} />
                  <span className="text-xs" style={{ color: customHex }}>Custom: {customHex}</span>
                </div>
              )}
            </div>
          </section>

          {/* ═══ STEP 5: ACCESSORIES ═══ */}
          <section id="step-5">
            {renderStepHeader(5, 'CHOOSE YOUR ACCESSORIES')}

            {/* Counter & max warning */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm" style={{ color: selectedAccessories.length >= 4 ? '#E20000' : uiColor }}>
                {selectedAccessories.length} of 4 selected
              </div>
              {selectedAccessories.length >= 4 && (
                <div className="text-xs text-[#E20000]">Maximum 4 accessories. Remove one first.</div>
              )}
            </div>

            {/* Fixed accessory pill slots (always visible) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
              {Array.from({ length: 4 }, (_, slotIndex) => {
                const acc = selectedAccessories[slotIndex];
                const filled = Boolean(acc);
                return (
                  <button
                    key={`slot-${slotIndex}`}
                    onClick={() => { if (acc) toggleAccessory(acc); }}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-bold tracking-wider transition-colors"
                    style={{
                      border: `1px solid ${filled ? uiColor : '#333'}`,
                      borderRadius: '20px',
                      color: filled ? uiColor : '#767676',
                      backgroundColor: filled ? `${uiColor}15` : 'transparent',
                      cursor: filled ? 'pointer' : 'default',
                      minHeight: 30,
                    }}
                    aria-label={filled ? `Remove ${acc}` : `Accessory slot ${slotIndex + 1} empty`}
                    type="button"
                  >
                    {filled ? (
                      <>
                        {acc!.replace(/_/g, ' ').toUpperCase()}
                        <span className="ml-1 opacity-60">&times;</span>
                      </>
                    ) : (
                      'EMPTY'
                    )}
                  </button>
                );
              })}
            </div>

            {/* LUXURY & FASHION */}
            <div className="text-xs tracking-widest text-[#767676] mb-2 mt-4">LUXURY &amp; FASHION</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-6">
              {LUXURY_ACCS.map(acc => {
                const selected = selectedAccessories.includes(acc);
                const disabled = !selected && selectedAccessories.length >= 4;
                return (
                  <button
                    key={acc}
                    onClick={() => toggleAccessory(acc)}
                    className="p-2 text-left transition-all duration-200"
                    style={{
                      backgroundColor: selected ? `${uiColor}15` : '#1a1a1a',
                      border: `1px solid ${selected ? uiColor : '#333'}`,
                      boxShadow: selected ? `0 0 6px ${uiColor}50` : 'none',
                      borderRadius: '6px',
                      opacity: disabled ? 0.4 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                    onMouseEnter={e => { if (!selected && !disabled) e.currentTarget.style.borderColor = `${uiColor}66`; }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = '#333'; }}
                  >
                    <div className="text-[10px] font-bold tracking-wider" style={{ color: selected ? uiColor : '#CCCCCC' }}>
                      {acc.replace(/_/g, ' ').toUpperCase()}
                    </div>
                    <div className="text-[9px] mt-0.5 text-[#767676]">{ACC_INFO[acc] ?? ''}</div>
                  </button>
                );
              })}
            </div>

            {/* ORBITAL & SCIENCE */}
            <div className="text-xs tracking-widest text-[#767676] mb-2">ORBITAL &amp; SCIENCE</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-6">
              {ORBITAL_ACCS.map(acc => {
                const selected = selectedAccessories.includes(acc);
                const disabled = !selected && selectedAccessories.length >= 4;
                return (
                  <button
                    key={acc}
                    onClick={() => toggleAccessory(acc)}
                    className="p-2 text-left transition-all duration-200"
                    style={{
                      backgroundColor: selected ? `${uiColor}15` : '#1a1a1a',
                      border: `1px solid ${selected ? uiColor : '#333'}`,
                      boxShadow: selected ? `0 0 6px ${uiColor}50` : 'none',
                      borderRadius: '6px',
                      opacity: disabled ? 0.4 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                    onMouseEnter={e => { if (!selected && !disabled) e.currentTarget.style.borderColor = `${uiColor}66`; }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = '#333'; }}
                  >
                    <div className="text-[10px] font-bold tracking-wider" style={{ color: selected ? uiColor : '#CCCCCC' }}>
                      {acc.replace(/_/g, ' ').toUpperCase()}
                    </div>
                    <div className="text-[9px] mt-0.5 text-[#767676]">{ACC_INFO[acc] ?? ''}</div>
                  </button>
                );
              })}
            </div>

            {/* UNIVERSAL GEAR */}
            <div className="text-xs tracking-widest text-[#767676] mb-2">UNIVERSAL GEAR</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {GEAR_ACCS.map(acc => {
                const selected = selectedAccessories.includes(acc);
                const disabled = !selected && selectedAccessories.length >= 4;
                return (
                  <button
                    key={acc}
                    onClick={() => toggleAccessory(acc)}
                    className="p-2 text-left transition-all duration-200"
                    style={{
                      backgroundColor: selected ? `${uiColor}15` : '#1a1a1a',
                      border: `1px solid ${selected ? uiColor : '#333'}`,
                      boxShadow: selected ? `0 0 6px ${uiColor}50` : 'none',
                      borderRadius: '6px',
                      opacity: disabled ? 0.4 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                    onMouseEnter={e => { if (!selected && !disabled) e.currentTarget.style.borderColor = `${uiColor}66`; }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = '#333'; }}
                  >
                    <div className="text-[10px] font-bold tracking-wider" style={{ color: selected ? uiColor : '#CCCCCC' }}>
                      {acc.replace(/_/g, ' ').toUpperCase()}
                    </div>
                    <div className="text-[9px] mt-0.5 text-[#767676]">{ACC_INFO[acc] ?? ''}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ═══ STEP 6: SCHEMATIC OVERLAY ═══ */}
          <section id="step-6">
            {renderStepHeader(6, 'CHOOSE YOUR SCHEMATIC')}
            <p className="text-xs text-[#767676] mb-6">
              Pick a schematic overlay pattern and color. These technical overlays draw on top of your android.
            </p>

            {/* 6A: SCHEMATIC COLOR PICKER */}
            <div className="text-xs tracking-widest text-[#767676] mb-3">SCHEMATIC COLOR</div>
            <div className="flex flex-wrap gap-3 mb-8">
              {SCHEMATIC_COLORS.map(sc => {
                const selected = schematicColor === sc.hex;
                const displayColor = sc.hex === 'match' ? activePalette.primary : sc.hex;
                return (
                  <button
                    key={sc.hex}
                    onClick={() => setSchematicColor(sc.hex)}
                    className="flex flex-col items-center gap-1.5 p-2 transition-all duration-200 cursor-pointer"
                    style={{
                      backgroundColor: selected ? `${displayColor}15` : '#1a1a1a',
                      border: `1px solid ${selected ? displayColor : '#333'}`,
                      boxShadow: selected ? `0 0 10px ${displayColor}60` : 'none',
                      borderRadius: '6px',
                      minWidth: 60,
                    }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = `${displayColor}66`; }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = selected ? displayColor : '#333'; }}
                  >
                    {sc.hex === 'match' ? (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold"
                        style={{
                          border: `2px solid ${activePalette.primary}`,
                          color: activePalette.primary,
                          backgroundColor: `${activePalette.primary}20`,
                        }}
                      >
                        =
                      </div>
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full"
                        style={{
                          backgroundColor: sc.hex,
                          boxShadow: selected ? `0 0 12px ${sc.hex}80` : 'none',
                        }}
                      />
                    )}
                    <div className="text-[9px] text-[#767676]">{sc.label}</div>
                  </button>
                );
              })}
            </div>

            {/* 6B: SCHEMATIC PATTERN CARDS */}
            <div className="text-xs tracking-widest text-[#767676] mb-3">SCHEMATIC PATTERN</div>

            {/* NONE option */}
            <button
              onClick={() => setSchematicId('none')}
              className="w-full p-3 text-left transition-all duration-200 cursor-pointer mb-4"
              style={{
                backgroundColor: schematicId === 'none' ? `${resolvedSchematicColor}15` : '#1a1a1a',
                border: `1px solid ${schematicId === 'none' ? resolvedSchematicColor : '#333'}`,
                boxShadow: schematicId === 'none' ? `0 0 8px ${resolvedSchematicColor}60` : 'none',
                borderRadius: '6px',
              }}
              onMouseEnter={e => { if (schematicId !== 'none') e.currentTarget.style.borderColor = `${resolvedSchematicColor}66`; }}
              onMouseLeave={e => { if (schematicId !== 'none') e.currentTarget.style.borderColor = '#333'; }}
            >
              <div className="text-xs font-bold tracking-wider" style={{ color: schematicId === 'none' ? resolvedSchematicColor : '#CCCCCC' }}>
                NONE
              </div>
              <div className="text-[10px] mt-1 text-[#767676]">No schematic overlay — pure android</div>
            </button>

            {/* Category groups */}
            {['CIRCUIT & PCB', 'GEOMETRIC', 'MILITARY', 'SCIENTIFIC'].map(cat => (
              <div key={cat} className="mb-4">
                <div className="text-[10px] tracking-widest text-[#555] mb-2">{cat}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SCHEMATIC_INFO.filter(si => si.category === cat).map(si => {
                    const selected = schematicId === si.id;
                    return (
                      <button
                        key={si.id}
                        onClick={() => setSchematicId(si.id)}
                        className="p-3 text-left transition-all duration-200 cursor-pointer"
                        style={{
                          backgroundColor: selected ? `${resolvedSchematicColor}15` : '#1a1a1a',
                          border: `1px solid ${selected ? resolvedSchematicColor : '#333'}`,
                          boxShadow: selected ? `0 0 8px ${resolvedSchematicColor}60` : 'none',
                          borderRadius: '6px',
                        }}
                        onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = `${resolvedSchematicColor}66`; }}
                        onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = '#333'; }}
                      >
                        <div className="text-xs font-bold tracking-wider" style={{ color: selected ? resolvedSchematicColor : '#CCCCCC' }}>
                          {si.label}
                        </div>
                        <div className="text-[10px] mt-1 text-[#767676]">{si.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          {/* ═══ STEP 7: ANIMATION ═══ */}
          <section id="step-7">
            {renderStepHeader(7, 'CHOOSE YOUR ANIMATION')}
            <p className="text-xs text-[#767676] mb-4">
              Pick a movement style. The live preview updates instantly.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ANIMATION_TYPES.map(at => {
                const info = ANIM_INFO[at];
                const selected = animationType === at;
                return (
                  <button
                    key={at}
                    onClick={() => setAnimationType(at)}
                    className="p-4 text-left transition-all duration-200 cursor-pointer"
                    style={{
                      backgroundColor: selected ? `${uiColor}15` : '#1a1a1a',
                      border: `1px solid ${selected ? uiColor : '#333'}`,
                      boxShadow: selected ? `0 0 8px ${uiColor}60` : 'none',
                      borderRadius: '6px',
                    }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = `${uiColor}66`; }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = '#333'; }}
                  >
                    <div className="text-xs font-bold tracking-wider" style={{ color: selected ? uiColor : '#CCCCCC' }}>
                      {info?.label ?? at.toUpperCase()}
                    </div>
                    <div className="text-[10px] mt-1 text-[#767676]">{info?.desc ?? ''}</div>
                  </button>
                );
              })}

              {/* NONE option */}
              <button
                onClick={() => setAnimationType('none')}
                className="p-4 text-left transition-all duration-200 cursor-pointer"
                style={{
                  backgroundColor: animationType === 'none' ? `${uiColor}15` : '#1a1a1a',
                  border: `1px solid ${animationType === 'none' ? uiColor : '#333'}`,
                  boxShadow: animationType === 'none' ? `0 0 8px ${uiColor}60` : 'none',
                  borderRadius: '6px',
                }}
                onMouseEnter={e => { if (animationType !== 'none') e.currentTarget.style.borderColor = `${uiColor}66`; }}
                onMouseLeave={e => { if (animationType !== 'none') e.currentTarget.style.borderColor = '#333'; }}
              >
                <div className="text-xs font-bold tracking-wider" style={{ color: animationType === 'none' ? uiColor : '#CCCCCC' }}>
                  NONE
                </div>
                <div className="text-[10px] mt-1 text-[#767676]">Static — no animation</div>
              </button>
            </div>
          </section>

          {/* ═══ STEP 8: NAME YOUR ANDROID ═══ */}
          <section id="step-8">
            {renderStepHeader(8, 'NAME YOUR ANDROID')}
            <div
              className="p-4 border"
              style={{ borderColor: '#333', borderRadius: '6px', backgroundColor: '#0a0a0a' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: uiColor }}>&gt;_</span>
                <input
                  type="text"
                  placeholder="ENTER_NAME_HERE"
                  value={androidName}
                  onChange={e => {
                    const v = e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
                    setAndroidName(v);
                  }}
                  maxLength={20}
                  className="flex-1 px-2 py-2 font-mono text-lg tracking-wider bg-transparent outline-none"
                  style={{
                    color: uiColor,
                    caretColor: uiColor,
                    border: 'none',
                    fontFamily: "'Glass TTY VT220', monospace",
                  }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-[#767676]">
                <span>Letters, numbers, underscores, hyphens only</span>
                <span style={{ color: androidName.length >= 18 ? '#E20000' : '#767676' }}>
                  {androidName.length} / 20
                </span>
              </div>
            </div>
          </section>

          {/* ═══ STEP 9: PREVIEW & SAVE ═══ */}
          <section id="step-9">
            {renderStepHeader(9, 'PREVIEW & SAVE')}

            {/* Summary panel */}
            <div
              className="p-5 border font-mono text-sm mb-6"
              style={{ borderColor: uiColor, borderRadius: '6px', backgroundColor: '#0a0a0a' }}
            >
              <div className="text-xs tracking-widest mb-4" style={{ color: uiColor }}>
                YOUR ANDROID SUMMARY
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#767676]">Name</span>
                  <span style={{ color: uiColor }}>{androidName || '—'}</span>
                </div>
                <div className="h-px" style={{ backgroundColor: '#222' }} />
                <div className="flex justify-between">
                  <span className="text-[#767676]">Body</span>
                  <span className="text-[#CCCCCC]">{BODY_INFO[bodyType]?.label ?? bodyType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#767676]">Eyes</span>
                  <span className="text-[#CCCCCC]">{EYE_INFO[eyeType]?.label ?? eyeType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#767676]">Mouth</span>
                  <span className="text-[#CCCCCC]">{MOUTH_INFO[mouthType]?.label ?? mouthType}</span>
                </div>
                <div className="h-px" style={{ backgroundColor: '#222' }} />
                <div className="flex justify-between">
                  <span className="text-[#767676]">Color</span>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activePalette.primary }} />
                    <span style={{ color: activePalette.primary }}>{activePalette.primary}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#767676]">Accessories</span>
                  <span className="text-[#CCCCCC] text-right max-w-[60%]">
                    {selectedAccessories.length > 0
                      ? selectedAccessories.map(a => a.replaceAll('_', ' ')).join(', ')
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#767676]">Schematic</span>
                  <span className="text-[#CCCCCC]">
                    {schematicId === 'none' ? 'NONE' : schematicId.replaceAll('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#767676]">Schematic Color</span>
                  <div className="flex items-center gap-2">
                    {schematicColor === 'match' ? (
                      <span className="text-[#CCCCCC]">MATCH AVATAR</span>
                    ) : (
                      <>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: schematicColor }} />
                        <span style={{ color: schematicColor }}>{schematicColor}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#767676]">Animation</span>
                  <span className="text-[#CCCCCC]">{animationType.toUpperCase()}</span>
                </div>
              </div>
            </div>


            {/* === ONBOARDING SAVE + SKIP (new users only) === */}
            {isNewUser && (
              <div className="flex flex-col gap-3 mb-6">
                <button
                  disabled={profileSaving}
                  onClick={async () => {
                    setProfileSaving(true);
                    setProfileSaveError(null);
                    try {
                      const avatarData = {
                        bodyType, eyeType, mouthType, colorIndex, customHex,
                        selectedAccessories, schematicId, schematicColor,
                        overlayPreset, animationType, androidName,
                      };
                      localStorage.setItem('custom-avatar', JSON.stringify(avatarData));
                      const res = await fetch('/api/v1/humans/profile', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ avatarConfig: avatarData }),
                      });
                      if (res.ok) {
                        const username = clerkHuman?.username;
                        router.push(username ? `/peoplespace/${username}` : '/peoplespace');
                      } else {
                        setProfileSaveError('Failed to save avatar. Please try again.');
                      }
                    } catch {
                      setProfileSaveError('Connection failed. Please try again.');
                    } finally {
                      setProfileSaving(false);
                    }
                  }}
                  className="w-full py-4 px-6 font-bold text-sm tracking-widest transition-all duration-200"
                  style={{
                    backgroundColor: uiColor,
                    color: '#000',
                    borderRadius: '6px',
                    border: `2px solid ${uiColor}`,
                    fontFamily: "'Glass TTY VT220', monospace",
                    fontSize: 14,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 20px ${uiColor}80`; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                >
                  {profileSaving ? 'SAVING...' : 'SAVE AVATAR TO YOUR PROFILE'}
                </button>
                <button
                  disabled={profileSaving}
                  onClick={async () => {
                    setProfileSaving(true);
                    try {
                      randomizeAll();
                      await new Promise(r => globalThis.setTimeout(r, 100));
                      const randomConfig = JSON.parse(localStorage.getItem('custom-avatar') || '{}');
                      if (!randomConfig.bodyType) {
                        const seed = Date.now().toString();
                        const gen = generateConfig(seed);
                        const colors = getColors(gen.colorIndex);
                        Object.assign(randomConfig, {
                          bodyType: gen.bodyType, eyeType: gen.eyeType, mouthType: gen.mouthType,
                          colorIndex: gen.colorIndex, customHex: '', selectedAccessories: gen.accessories,
                          schematicId: 'none', schematicColor: 'match', overlayPreset: 'minimal',
                          animationType: gen.animationType, androidName: '',
                        });
                      }
                      const res = await fetch('/api/v1/humans/profile', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ avatarConfig: randomConfig }),
                      });
                      if (res.ok) {
                        const username = clerkHuman?.username;
                        router.push(username ? `/peoplespace/${username}` : '/peoplespace');
                      }
                    } catch { /* silent */ }
                    finally { setProfileSaving(false); }
                  }}
                  className="w-full py-3 px-6 text-sm tracking-widest transition-all duration-200"
                  style={{
                    backgroundColor: 'transparent',
                    color: '#767676',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    fontFamily: "'Glass TTY VT220', monospace",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#CCCCCC'; e.currentTarget.style.borderColor = '#555'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#767676'; e.currentTarget.style.borderColor = '#333'; }}
                >
                  SKIP FOR NOW
                </button>
                {profileSaveError && (
                  <div style={{ color: '#E20000', fontSize: 12, textAlign: 'center' }}>{profileSaveError}</div>
                )}
              </div>
            )}

            {/* Save to Profile */}
            {clerkLoaded && (
              <div className="mb-6">
                {isSignedIn ? (
                  <>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        onClick={async () => {
                          setProfileSaving(true);
                          setProfileSaveMessage(null);
                          setProfileSaveError(null);
                          const avatarData = {
                            bodyType, eyeType, mouthType, colorIndex, customHex,
                            selectedAccessories, schematicId, schematicColor,
                            overlayPreset, animationType, androidName,
                          };
                          try {
                            const res = await fetch('/api/v1/humans/profile', {
                              method: 'PUT',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ avatarConfig: avatarData }),
                            });
                            const json = await res.json();
                            if (!res.ok || !json.success) {
                              setProfileSaveError(json.error || 'Failed to save avatar to profile.');
                            } else {
                              setProfileSaveMessage('Avatar saved to your profile!');
                            }
                          } catch {
                            setProfileSaveError('Connection failed. Please try again.');
                          } finally {
                            setProfileSaving(false);
                          }
                        }}
                        disabled={profileSaving}
                        className="py-4 px-6 font-bold text-sm tracking-widest transition-all duration-200 disabled:opacity-50"
                        style={{
                          flex: 1,
                          backgroundColor: 'transparent',
                          color: uiColor,
                          borderRadius: '6px',
                          border: `2px solid ${uiColor}`,
                          fontFamily: "'Glass TTY VT220', monospace",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 20px ${uiColor}60`; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        {profileSaving ? 'SAVING...' : 'SAVE TO PROFILE'}
                      </button>
                      <button
                        onClick={() => {
                          const container = document.getElementById('avatar-command-center');
                          if (!container) return;
                          const canvases = container.querySelectorAll('canvas');
                          if (canvases.length === 0) return;
                          const dpr = window.devicePixelRatio || 1;
                          const size = 200;
                          const exportCanvas = document.createElement('canvas');
                          exportCanvas.width = size * dpr;
                          exportCanvas.height = size * dpr;
                          const ctx = exportCanvas.getContext('2d');
                          if (!ctx) return;
                          canvases.forEach(c => { ctx.drawImage(c, 0, 0); });
                          const dataUrl = exportCanvas.toDataURL('image/png');
                          const a = document.createElement('a');
                          a.href = dataUrl;
                          a.download = 'spacebot-avatar.png';
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}
                        className="py-4 px-6 font-bold text-sm tracking-widest transition-all duration-200"
                        style={{
                          flex: 1,
                          backgroundColor: 'transparent',
                          color: '#767676',
                          borderRadius: '6px',
                          border: '1px solid #333',
                          fontFamily: "'Glass TTY VT220', monospace",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#CCCCCC'; e.currentTarget.style.color = '#CCCCCC'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#767676'; }}
                      >
                        SAVE TO COMPUTER
                      </button>
                    </div>
                    {profileSaveMessage && (
                      <div
                        className="mt-3 px-4 py-3 border text-sm tracking-wider"
                        style={{
                          borderColor: uiColor, color: uiColor,
                          backgroundColor: '#0C0C0C',
                          fontFamily: "'Glass TTY VT220', monospace",
                        }}
                      >
                        {profileSaveMessage}
                      </div>
                    )}
                    {profileSaveError && (
                      <div
                        className="mt-3 px-4 py-3 border text-sm tracking-wider"
                        style={{
                          borderColor: '#E20000', color: '#E20000',
                          backgroundColor: '#0C0C0C',
                          fontFamily: "'Glass TTY VT220', monospace",
                        }}
                      >
                        {profileSaveError}
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    className="w-full py-4 px-6 text-center text-sm tracking-wider"
                    style={{
                      border: '1px dashed #767676', borderRadius: '6px',
                      color: '#767676',
                      fontFamily: "'Glass TTY VT220', monospace",
                    }}
                  >
                    <Link href="/sign-in" style={{ color: uiColor }} className="hover:opacity-80 transition-opacity">
                      Sign in
                    </Link>
                    {' '}to save your avatar to your profile
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            {saveSuccessMessage && (
              <div
                className="mb-4 px-4 py-3 border text-sm tracking-wider"
                style={{
                  borderColor: '#00DC00',
                  color: '#00DC00',
                  backgroundColor: '#0C0C0C',
                  fontFamily: "'Glass TTY VT220', monospace",
                }}
              >
                {saveSuccessMessage}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  requireAuth(async () => {
                  setSaveSuccessMessage(null);
                  const avatarData = {
                    bodyType,
                    eyeType,
                    mouthType,
                    colorIndex,
                    customHex,
                    selectedAccessories,
                    schematicId,
                    schematicColor,
                    overlayPreset,
                    animationType,
                    androidName,
                  };

                  // Always save to localStorage first (preview needs this)
                  localStorage.setItem('custom-avatar', JSON.stringify({
                    ...avatarData,
                    timestamp: Date.now(),
                  }));

                  // Save to database with retry on expired token
                  try {
                    const putOptions: RequestInit = {
                      method: 'PUT',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ avatarConfig: avatarData }),
                    };

                    let res = await fetch('/api/v1/humans/avatar', putOptions);

                    // If token expired (401), refresh and retry once
                    if (res.status === 401) {
                      const refreshRes = await fetch('/api/v1/humans/refresh', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                      });

                      if (refreshRes.ok) {
                        // Retry PUT with fresh token (new cookie set by refresh)
                        res = await fetch('/api/v1/humans/avatar', {
                          method: 'PUT',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ avatarConfig: avatarData }),
                        });
                      }
                    }

                    if (!res.ok) {
                      console.warn('[AVATAR] Server save status:', res.status);
                    } else {
                      console.log('[AVATAR] Saved to database successfully');
                      setSaveSuccessMessage(
                        isEditingExistingAvatar
                          ? 'Avatar updated successfully.'
                          : 'Avatar created successfully.'
                      );
                      await new Promise((resolve) => globalThis.setTimeout(resolve, 900));
                    }
                  } catch (err) {
                    console.error('[AVATAR] Failed to save to database:', err);
                  }

                  globalThis.location.href = '/peoplespace/build-avatar/preview';
                  });
                }}
                className="flex-1 py-3 px-6 font-bold text-sm tracking-widest transition-all duration-200"
                style={{
                  backgroundColor: uiColor,
                  color: '#000',
                  borderRadius: '6px',
                  border: `1px solid ${uiColor}`,
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 16px ${uiColor}80`; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
              >
                {isEditingExistingAvatar ? 'UPDATE AVATAR' : 'CREATE AVATAR'}
              </button>

              <button
                onClick={randomizeAll}
                className="flex-1 py-3 px-6 font-bold text-sm tracking-widest transition-all duration-200"
                style={{
                  backgroundColor: 'transparent',
                  color: '#00DC00',
                  borderRadius: '6px',
                  border: '1px solid #00DC00',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 12px rgba(0,220,0,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
              >
                RANDOMIZE EVERYTHING
              </button>

              <button
                onClick={startOver}
                className="flex-1 py-3 px-6 font-bold text-sm tracking-widest transition-all duration-200"
                style={{
                  backgroundColor: 'transparent',
                  color: '#767676',
                  borderRadius: '6px',
                  border: '1px solid #333',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#E20000'; e.currentTarget.style.color = '#E20000'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#767676'; }}
              >
                START OVER
              </button>

              <button
                onClick={() => {
                  localStorage.removeItem('custom-avatar');
                  startOver();
                }}
                className="flex-1 py-3 px-6 font-bold text-sm tracking-widest transition-all duration-200"
                style={{
                  backgroundColor: 'transparent',
                  color: '#767676',
                  borderRadius: '6px',
                  border: '1px solid #333',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#E6E300'; e.currentTarget.style.color = '#E6E300'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#767676'; }}
              >
                CLEAR SAVED AVATAR
              </button>
            </div>
          </section>

        </div>
    </div>
  );
}
