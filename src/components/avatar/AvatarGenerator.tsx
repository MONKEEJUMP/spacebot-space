'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { AvatarGeneratorProps, RobotConfig, FactionPalette } from './avatarConfig';
import { seededRandom, generateConfig, getColors } from './avatarSeeder';
import { drawRobot } from './avatarRenderer';
import { drawSchematicOverlay as drawModularSchematicOverlay } from './avatarSchematicOverlay';
import { drawSchematicOverlay as drawPatternSchematicOverlay } from './avatarSchematicOverlays';
import { drawHumanAccessories } from './avatarHumanAccessories';
import { drawHumanOverlay } from './avatarHumanOverlay';
import { drawBotAccessories } from './avatarBotAccessories';
import { drawSharedAccessories } from './avatarSharedAccessories';

// ═══════════════════════════════════════════════════════════════
// ANIMATION HELPERS — duration + easing per animation type
// ═══════════════════════════════════════════════════════════════

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
// CSS KEYFRAMES — injected once via <style> tag
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

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function AvatarGenerator({
  seed,
  size = 120,
  faction,
  isBot = false,
  animated = true,
  customConfig,
  accentColor,
}: Readonly<AvatarGeneratorProps>) {
  const UNDERLAY_SCHEMATICS = ['pcb_circuit', 'pcb_dense', 'circuit_radial', 'hex_grid', 'triangle_mesh', 'isometric_grid', 'waveform', 'data_matrix'];
  const resolvedSeed = seed ?? 'avatar';
  const resolvedAccentColor = useMemo(() => {
    if (!accentColor) return undefined;

    const trimmed = accentColor.trim();

    // Canvas color math below expects a real hex value, not a CSS variable token.
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed;
    }

    return undefined;
  }, [accentColor]);

  const namedSchematicId = useMemo(() => {
    if (!customConfig || !('schematicId' in customConfig)) return undefined;
    const value = (customConfig as { schematicId?: unknown }).schematicId;
    return typeof value === 'string' ? value : undefined;
  }, [customConfig]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const robot = useMemo(() => {
    // ─── Custom config path: skip seeder entirely ───
    if (customConfig) {
      const config: RobotConfig = {
        bodyType: customConfig.bodyType,
        eyeType: customConfig.eyeType,
        mouthType: customConfig.mouthType,
        accessories: ['antenna', 'beacon_light'],
        surfaceFinish: 'clean',
        animationType: customConfig.animationType,
        headTilt: 2,
        eyeTilt: 1,
        panelLineCount: 3,
        rivetCount: 4,
        boltCount: 2,
        serialSuffix: 'CUST',
        humanAccessories: isBot ? [] : [...customConfig.accessories],
        botAccessories: isBot ? [...customConfig.accessories] : [],
      };
      const colors: FactionPalette = {
        primary: customConfig.colorPrimary,
        dark: customConfig.colorDark,
        light: customConfig.colorLight,
      };
      return { config, colors, showOverlay: customConfig.showOverlay !== false };
    }

    // ─── Seeder path: existing behavior UNTOUCHED ───
    const rng = seededRandom(resolvedSeed);
    const config = generateConfig(rng, faction, isBot);
    const colorRng = seededRandom(resolvedSeed + ':color');
    let colors = getColors(faction, isBot, colorRng);

    // Override colors with accentColor if provided
    if (resolvedAccentColor) {
      const hex = resolvedAccentColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const dark = '#' + [r, g, b].map(c => Math.round(c * 0.4).toString(16).padStart(2, '0')).join('');
      const light = '#' + [r, g, b].map(c => Math.min(255, Math.round(c * 1.4 + 40)).toString(16).padStart(2, '0')).join('');
      colors = { primary: resolvedAccentColor, dark, light };
    }

    return { config, colors, showOverlay: true };
  }, [resolvedSeed, faction, isBot, customConfig, resolvedAccentColor]);

  useEffect(() => {
    // Retina support
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const hasNamedSchematic = Boolean(namedSchematicId);
    const isUnderlaySchematic = Boolean(
      namedSchematicId && UNDERLAY_SCHEMATICS.includes(namedSchematicId),
    );

    // Draw robot on main canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);

        if (robot.showOverlay && hasNamedSchematic && isUnderlaySchematic && namedSchematicId) {
          drawPatternSchematicOverlay(ctx, namedSchematicId, robot.colors.primary, size);
        }

        drawRobot(ctx, robot.config, robot.colors, size);

        // Human accessories — drawn on main canvas AFTER robot
        if (!isBot && robot.config.humanAccessories.length > 0) {
          drawHumanAccessories(ctx, robot.config, robot.colors, size);
        }

        // Bot accessories — drawn on main canvas AFTER robot
        if (isBot && robot.config.botAccessories.length > 0) {
          drawBotAccessories(ctx, robot.config, robot.colors, size);
        }

        // Shared accessories — drawn for BOTH bots and humans
        drawSharedAccessories(ctx, robot.config, robot.colors, size);
      }
    }

    // Draw schematic overlay on second canvas
    if (robot.showOverlay) {
      const overlay = overlayRef.current;
      if (overlay) {
        const octx = overlay.getContext('2d');
        if (octx) {
          overlay.width = size * dpr;
          overlay.height = size * dpr;
          octx.scale(dpr, dpr);
          if (!isBot) {
            drawHumanOverlay(octx, robot.config, robot.colors, size);
          } else {
            if (hasNamedSchematic && namedSchematicId) {
              if (!isUnderlaySchematic) {
                drawPatternSchematicOverlay(octx, namedSchematicId, robot.colors.primary, size);
              } else {
                octx.clearRect(0, 0, overlay.width, overlay.height);
              }
            } else {
              drawModularSchematicOverlay(octx, robot.config, robot.colors, size);
            }
          }
        }
      }
    } else {
      // Clear overlay canvas when overlay is disabled
      const overlay = overlayRef.current;
      if (overlay) {
        const octx = overlay.getContext('2d');
        if (octx) {
          overlay.width = size * dpr;
          overlay.height = overlay.width;
          octx.clearRect(0, 0, overlay.width, overlay.height);
        }
      }
    }
  }, [robot, size, isBot, namedSchematicId]);

  const animName = robot.config.animationType;
  const animStyle = animated
    ? `avatar-${animName} ${getDuration(animName)}s ${getEasing(animName)} infinite`
    : 'none';

  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <style>{KEYFRAMES}</style>

      <div style={{
        animation: animStyle,
        position: 'relative',
        width: size,
        height: size,
      }}>
        {/* Layer 1: Robot canvas */}
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size, display: 'block' }}
        />

        {/* Layer 2: Schematic overlay — transparent, non-interactive */}
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
