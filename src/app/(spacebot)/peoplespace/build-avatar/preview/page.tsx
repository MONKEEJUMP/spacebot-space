'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FactionPalette, RobotConfig } from '@/components/avatar/avatarConfig';
import { HUMAN_COLORS, BODY_TYPES, HUMAN_EYE_TYPES, MOUTH_TYPES } from '@/components/avatar/avatarConfig';
import { drawRobot } from '@/components/avatar/avatarRenderer';
import { drawHumanAccessories } from '@/components/avatar/avatarHumanAccessories';
import { drawSharedAccessories } from '@/components/avatar/avatarSharedAccessories';
import { drawSchematicOverlay } from '@/components/avatar/avatarSchematicOverlays';

export const dynamic = 'force-dynamic';

interface SavedAvatarConfig {
  bodyType: string;
  eyeType: string;
  mouthType: string;
  colorIndex: number;
  customHex: string;
  selectedAccessories: string[];
  schematicId: string;
  schematicColor: string;
  overlayPreset: string;
  animationType: string;
  androidName: string;
  timestamp: number;
}

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

function colorFromConfig(config: SavedAvatarConfig): FactionPalette {
  const colorFromPalette = HUMAN_COLORS[config.colorIndex] ?? HUMAN_COLORS[0];
  if (/^#[0-9A-Fa-f]{6}$/.test(config.customHex || '')) {
    return {
      primary: config.customHex,
      dark: '#1A1A1A',
      light: '#FFFFFF',
    };
  }
  return colorFromPalette;
}

function buildRobotConfig(config: SavedAvatarConfig): RobotConfig {
  const serialBase = (config.androidName || 'PRVW').replaceAll(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
  return {
    bodyType: config.bodyType,
    eyeType: config.eyeType,
    mouthType: config.mouthType,
    accessories: ['antenna', 'beacon_light'],
    surfaceFinish: 'clean',
    animationType: config.animationType || 'drift',
    headTilt: 2,
    eyeTilt: 1,
    panelLineCount: 3,
    rivetCount: 4,
    boltCount: 2,
    serialSuffix: serialBase,
    humanAccessories: config.selectedAccessories || [],
    botAccessories: [],
  };
}
function AvatarPreview({
  config,
  colors,
  size,
  schematicId,
  schematicColor,
  canvasRef,
  overlayRef,
}: Readonly<{
  config: RobotConfig;
  colors: FactionPalette;
  size: number;
  schematicId: string;
  schematicColor: string;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  overlayRef: React.RefObject<HTMLCanvasElement>;
}>) {
  useEffect(() => {
    const dpr = globalThis.window?.devicePixelRatio || 1;

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
      }
    }

    const overlay = overlayRef.current;
    if (overlay) {
      const octx = overlay.getContext('2d');
      if (octx) {
        overlay.width = size * dpr;
        overlay.height = size * dpr;
        octx.scale(dpr, dpr);
        if (schematicId && schematicId !== 'none') {
          drawSchematicOverlay(octx, schematicId, schematicColor, size);
        } else {
          octx.clearRect(0, 0, overlay.width, overlay.height);
        }
      }
    }
  }, [config, colors, size, schematicId, schematicColor, canvasRef, overlayRef]);

  const animName = config.animationType;
  const animStyle = animName && animName !== 'none'
    ? `avatar-${animName} ${getDuration(animName)}s ${getEasing(animName)} infinite`
    : 'none';

  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <div style={{ animation: animStyle, position: 'relative', width: size, height: size }}>
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size, display: 'block' }}
        />
        <canvas
          ref={overlayRef}
          style={{
            width: size,
            height: size,
            display: 'block',
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

export default function AvatarResultPage() {
  const router = useRouter();
  const [avatarConfig, setAvatarConfig] = useState<SavedAvatarConfig | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('custom-avatar');
    if (!saved) {
      router.push('/peoplespace/build-avatar');
      return;
    }

    try {
      const parsed = JSON.parse(saved) as Partial<SavedAvatarConfig>;
      const hydrated: SavedAvatarConfig = {
        bodyType: parsed.bodyType || BODY_TYPES[0],
        eyeType: parsed.eyeType || HUMAN_EYE_TYPES[0],
        mouthType: parsed.mouthType || MOUTH_TYPES[0],
        colorIndex: parsed.colorIndex ?? 0,
        customHex: parsed.customHex || '',
        selectedAccessories: parsed.selectedAccessories || [],
        schematicId: parsed.schematicId || 'none',
        schematicColor: parsed.schematicColor || 'match',
        overlayPreset: parsed.overlayPreset || 'minimal',
        animationType: parsed.animationType || 'drift',
        androidName: parsed.androidName || 'UNNAMED_ANDROID',
        timestamp: parsed.timestamp ?? Date.now(),
      };
      setAvatarConfig(hydrated);
    } catch {
      localStorage.removeItem('custom-avatar');
      router.push('/peoplespace/build-avatar');
    }

    // Check login status
    fetch('/api/v1/humans/me', {
      credentials: 'include',
    })
      .then((res) => {
        setIsLoggedIn(res.ok);
      })
      .catch(() => {
        setIsLoggedIn(false);
      });
  }, [router]);

  const palette = useMemo(() => {
    if (!avatarConfig) return HUMAN_COLORS[0];
    return colorFromConfig(avatarConfig);
  }, [avatarConfig]);

  const robotConfig = useMemo(() => {
    if (!avatarConfig) return null;
    return buildRobotConfig(avatarConfig);
  }, [avatarConfig]);

  const schematicColor = useMemo(() => {
    if (!avatarConfig) return '#00DC00';
    return avatarConfig.schematicColor === 'match' ? palette.primary : avatarConfig.schematicColor;
  }, [avatarConfig, palette.primary]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas) return;

    // Create a combined canvas for download at 512x512
    const exportSize = 512;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportSize;
    exportCanvas.height = exportSize;
    const ectx = exportCanvas.getContext('2d');
    if (!ectx) return;

    // Draw the main avatar canvas scaled to export size
    ectx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, exportSize, exportSize);

    // Draw the overlay canvas on top if it exists
    if (overlay && overlay.width > 0) {
      ectx.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, exportSize, exportSize);
    }

    const dataUrl = exportCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    const name = avatarConfig?.androidName || 'avatar';
    link.download = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-spacebot.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSave = async () => {
    if (!isLoggedIn || !avatarConfig) return;
    setSaveStatus('saving');
    try {
      let res = await fetch('/api/v1/humans/avatar', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarConfig }),
      });

      // Handle token refresh
      if (res.status === 401) {
        const refreshRes = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (refreshRes.ok) {
          res = await fetch('/api/v1/humans/avatar', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatarConfig }),
          });
        }
      }

      if (res.ok) {
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  };

  if (!avatarConfig || !robotConfig) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center font-mono" style={{ backgroundColor: 'var(--sb-bg-primary, #0C0C0C)' }}>
        <div className="text-[#767676] tracking-widest text-sm">LOADING AVATAR...</div>
      </div>
    );
  }

  const displayName = avatarConfig.androidName || 'YOUR AVATAR';
  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center font-mono px-4 py-10" style={{ backgroundColor: 'var(--sb-bg-primary, #0C0C0C)' }}>
      <style>{KEYFRAMES}</style>

      {/* Title */}
      <h1
        className="text-2xl sm:text-3xl tracking-[0.2em] text-[#E2E3DD] mb-2 text-center"
        style={{ fontFamily: "'Glass TTY VT220', monospace" }}
      >
        {displayName}
      </h1>
      <p className="text-xs text-[#767676] tracking-widest mb-8">YOUR AVATAR IS READY</p>

      {/* Avatar Display */}
      <div
        className="p-4 mb-10"
        style={{
          border: `2px solid ${palette.primary}40`,
          borderRadius: '8px',
        }}
      >
        <AvatarPreview
          config={robotConfig}
          colors={palette}
          size={280}
          schematicId={avatarConfig.schematicId}
          schematicColor={schematicColor}
          canvasRef={canvasRef}
          overlayRef={overlayRef}
        />
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {/* Download Button - Primary Action */}
        <button
          type="button"
          onClick={handleDownload}
          className="w-full py-3 px-6 font-bold text-sm tracking-widest transition-all duration-200"
          style={{
            backgroundColor: 'var(--sb-accent, #00DC00)',
            color: '#000',
            border: '1px solid var(--sb-accent, #00DC00)',
            borderRadius: '6px',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 20px rgba(0,220,0,0.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
        >
          DOWNLOAD AVATAR
        </button>

        {/* Save to Account Button */}
        {isLoggedIn ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === 'saving' || saveStatus === 'saved'}
            className="w-full py-3 px-6 font-bold text-sm tracking-widest transition-all duration-200"
            style={{
              backgroundColor: 'transparent',
              color: saveStatus === 'saved' ? '#00DC00' : palette.primary,
              border: `1px solid ${saveStatus === 'saved' ? '#00DC00' : palette.primary}`,
              borderRadius: '6px',
              opacity: saveStatus === 'saving' ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (saveStatus === 'idle' || saveStatus === 'error') e.currentTarget.style.boxShadow = `0 0 12px ${palette.primary}40`; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
          >
            {saveStatus === 'idle' && 'SAVE TO MY ACCOUNT'}
            {saveStatus === 'saving' && 'SAVING...'}
            {saveStatus === 'saved' && 'SAVED'}
            {saveStatus === 'error' && 'SAVE FAILED \u2014 TRY AGAIN'}
          </button>
        ) : (
          <div className="w-full">
            <button
              type="button"
              disabled
              className="w-full py-3 px-6 font-bold text-sm tracking-widest cursor-not-allowed"
              style={{
                backgroundColor: 'transparent',
                color: '#555555',
                border: '1px solid #333333',
                borderRadius: '6px',
              }}
            >
              SAVE TO MY ACCOUNT
            </button>
            <p className="text-center text-xs mt-2" style={{ color: '#767676' }}>
              <Link href="/register" className="underline hover:text-[#E2E3DD] transition-colors" style={{ color: palette.primary }}>
                Sign up
              </Link>
              {' '}to save avatars to your account
            </p>
          </div>
        )}

        {/* Build Another Button */}
        <Link
          href="/peoplespace/build-avatar"
          className="w-full py-3 px-6 font-bold text-sm tracking-widest transition-all duration-200 text-center block"
          style={{
            backgroundColor: 'transparent',
            color: '#CCCCCC',
            border: '1px solid #333333',
            borderRadius: '6px',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#CCCCCC'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#333333'; }}
        >
          BUILD ANOTHER
        </Link>
      </div>
    </div>
  );
}
