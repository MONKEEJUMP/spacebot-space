'use client';

import { useRef, useEffect } from 'react';
import type { PlanetConfig } from './planetTypes';
import { getRadiusForSize, hexToRgb, darkenHex, lightenHex } from './planetTypes';

// ═══════════════════════════════════════════════════════════════
// PLANET GENERATOR — Canvas-based procedural planet renderer
// ═══════════════════════════════════════════════════════════════

interface PlanetGeneratorProps {
  readonly config: PlanetConfig;
  readonly size?: number;
  readonly animated?: boolean;
}

// Seeded random for deterministic textures
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export default function PlanetGenerator({
  config,
  size = 400,
  animated = true,
}: PlanetGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const baseRadius = getRadiusForSize(config.size);
    const scale = size / 400;
    const radius = baseRadius * scale;
    const cx = size / 2;
    const cy = size / 2;

    let startTime = performance.now();

    function render(now: number) {
      const elapsed = (now - startTime) / 1000;
      timeRef.current = elapsed;
      ctx!.clearRect(0, 0, size, size);

      // Animation offsets
      let offsetX = 0;
      let offsetY = 0;
      let scaleAnim = 1;
      let rotation = 0;
      let glitchFlicker = false;

      if (animated && config.animation !== 'none') {
        switch (config.animation) {
          case 'spin':
            // Spin is handled by texture offset, not transform
            break;
          case 'pulse':
            scaleAnim = 1 + Math.sin(elapsed * 1.2) * 0.03;
            break;
          case 'wobble':
            rotation = Math.sin(elapsed * 0.8) * 0.05;
            break;
          case 'drift':
            offsetY = Math.sin(elapsed * 0.6) * 4 * scale;
            break;
          case 'glitch':
            if (Math.sin(elapsed * 2) > 0.92) {
              offsetX = (Math.random() - 0.5) * 6 * scale;
              glitchFlicker = Math.random() > 0.5;
            }
            break;
        }
      }

      ctx!.save();
      ctx!.translate(cx + offsetX, cy + offsetY);
      ctx!.rotate(rotation);
      ctx!.scale(scaleAnim, scaleAnim);

      if (glitchFlicker) ctx!.globalAlpha = 0.7;

      // 1. Starfield (drawn behind everything)
      drawStarfield(ctx!, config.starfield, size, elapsed, scale);

      // 2. Rings BEHIND planet (top half)
      if (config.rings !== 'none') {
        drawRings(ctx!, config, radius, scale, elapsed, 'behind');
      }

      // 3. Planet sphere
      drawPlanetSphere(ctx!, config, radius, scale, elapsed);

      // 4. Surface features
      drawFeatures(ctx!, config, radius, scale, elapsed);

      // 5. Atmosphere
      if (config.atmosphere !== 'none') {
        drawAtmosphere(ctx!, config, radius, scale, elapsed);
      }

      // 6. Rings IN FRONT of planet (bottom half)
      if (config.rings !== 'none') {
        drawRings(ctx!, config, radius, scale, elapsed, 'front');
      }

      // 7. Moons
      if (config.moons > 0) {
        drawMoons(ctx!, config, radius, scale, elapsed);
      }

      ctx!.globalAlpha = 1;
      ctx!.restore();

      if (animated && config.animation !== 'none') {
        frameRef.current = requestAnimationFrame(render);
      }
    }

    frameRef.current = requestAnimationFrame(render);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [config, size, animated]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: 'block' }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════
// STARFIELD
// ═══════════════════════════════════════════════════════════════

function drawStarfield(
  ctx: CanvasRenderingContext2D,
  type: string,
  size: number,
  time: number,
  scale: number,
) {
  if (type === 'void') return;

  const rng = seededRng(42);
  const starCounts: Record<string, number> = {
    sparse: 30, standard: 80, dense: 200, nebula: 100, galaxy: 120,
  };
  const count = starCounts[type] ?? 80;
  const half = size / 2;

  // Nebula background clouds
  if (type === 'nebula') {
    const colors = ['rgba(150,50,180,0.12)', 'rgba(50,80,200,0.10)', 'rgba(200,50,100,0.08)'];
    for (let i = 0; i < 5; i++) {
      const x = (rng() - 0.5) * size * 0.8;
      const y = (rng() - 0.5) * size * 0.8;
      const r = 60 + rng() * 80;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r * scale);
      grad.addColorStop(0, colors[i % colors.length]);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(-half, -half, size, size);
    }
  }

  // Galaxy spiral
  if (type === 'galaxy') {
    ctx.save();
    ctx.translate(-half * 0.6, -half * 0.5);
    ctx.rotate(0.4);
    ctx.globalAlpha = 0.15;
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 60; i++) {
        const angle = arm * Math.PI + i * 0.15;
        const dist = i * 1.2 * scale;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist * 0.5;
        const s = (1 + rng() * 1.5) * scale;
        ctx.fillStyle = `rgba(200,180,255,${0.3 + rng() * 0.5})`;
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Stars
  for (let i = 0; i < count; i++) {
    const x = (rng() - 0.5) * size;
    const y = (rng() - 0.5) * size;
    const brightness = 0.3 + rng() * 0.7;
    const twinkle = type === 'dense'
      ? 0.7 + Math.sin(time * 2 + i) * 0.3
      : 1;
    const r = (0.5 + rng() * 1.2) * scale;
    ctx.fillStyle = `rgba(255,255,240,${brightness * twinkle})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// PLANET SPHERE — base sphere with 3D lighting and surface texture
// ═══════════════════════════════════════════════════════════════

function drawPlanetSphere(
  ctx: CanvasRenderingContext2D,
  config: PlanetConfig,
  radius: number,
  scale: number,
  time: number,
) {
  const { primaryColor, secondaryColor, type } = config;

  // Clip to sphere
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();

  // Base fill
  ctx.fillStyle = primaryColor;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  // Surface texture by type
  const spinOffset = config.animation === 'spin' ? time * 15 : 0;

  switch (type) {
    case 'rocky':
      drawRockySurface(ctx, radius, primaryColor, scale, spinOffset);
      break;
    case 'terrestrial':
      drawTerrestrialSurface(ctx, radius, primaryColor, secondaryColor, scale, spinOffset);
      break;
    case 'gas_giant':
      drawGasGiantSurface(ctx, radius, primaryColor, secondaryColor, scale, spinOffset);
      break;
    case 'ice_world':
      drawIceWorldSurface(ctx, radius, primaryColor, secondaryColor, scale, spinOffset);
      break;
    case 'lava_world':
      drawLavaWorldSurface(ctx, radius, primaryColor, secondaryColor, scale, spinOffset, time);
      break;
    case 'ocean_world':
      drawOceanWorldSurface(ctx, radius, primaryColor, scale, spinOffset, time);
      break;
    case 'desert_world':
      drawDesertWorldSurface(ctx, radius, primaryColor, scale, spinOffset);
      break;
    case 'crystal_world':
      drawCrystalWorldSurface(ctx, radius, primaryColor, secondaryColor, scale, spinOffset, time);
      break;
    case 'void_world':
      drawVoidWorldSurface(ctx, radius, primaryColor, scale, time);
      break;
    case 'nebula_world':
      drawNebulaWorldSurface(ctx, radius, primaryColor, secondaryColor, scale, time);
      break;
  }

  // 3D lighting overlay — light from upper-left
  const lightGrad = ctx.createRadialGradient(
    -radius * 0.35, -radius * 0.35, radius * 0.1,
    0, 0, radius
  );
  lightGrad.addColorStop(0, 'rgba(255,255,255,0.25)');
  lightGrad.addColorStop(0.4, 'rgba(255,255,255,0.05)');
  lightGrad.addColorStop(0.7, 'rgba(0,0,0,0.1)');
  lightGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = lightGrad;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  ctx.restore();

  // Edge highlight (thin bright arc on lit side)
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI * 0.8, -Math.PI * 0.2);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2 * scale;
  ctx.stroke();
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// SURFACE TEXTURE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function drawRockySurface(ctx: CanvasRenderingContext2D, r: number, color: string, scale: number, offset: number) {
  const rng = seededRng(101);
  const dark = darkenHex(color, 0.5);
  // Craters
  for (let i = 0; i < 18; i++) {
    const cx = ((rng() - 0.5) * r * 1.8 + offset) % (r * 2) - r;
    const cy = (rng() - 0.5) * r * 1.8;
    const cr = (4 + rng() * 14) * scale;
    ctx.fillStyle = dark;
    ctx.globalAlpha = 0.3 + rng() * 0.3;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
    // Rim highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 1, cr, -Math.PI * 0.7, Math.PI * 0.1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTerrestrialSurface(ctx: CanvasRenderingContext2D, r: number, water: string, land: string, scale: number, offset: number) {
  const rng = seededRng(202);
  // Continents (organic blobs)
  ctx.fillStyle = land;
  for (let i = 0; i < 5; i++) {
    const cx = ((rng() - 0.5) * r * 1.6 + offset) % (r * 2) - r;
    const cy = (rng() - 0.5) * r * 1.4;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    const points = 8 + Math.floor(rng() * 4);
    for (let j = 0; j < points; j++) {
      const angle = (j / points) * Math.PI * 2;
      const dist = (20 + rng() * 30) * scale;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist * (0.6 + rng() * 0.4);
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  // Cloud wisps
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  for (let i = 0; i < 6; i++) {
    const cx = ((rng() - 0.5) * r * 1.8 + offset * 1.3) % (r * 2) - r;
    const cy = (rng() - 0.5) * r * 1.6;
    const w = (30 + rng() * 50) * scale;
    const h = (4 + rng() * 8) * scale;
    ctx.globalAlpha = 0.15 + rng() * 0.15;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w, h, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGasGiantSurface(ctx: CanvasRenderingContext2D, r: number, color1: string, color2: string, scale: number, offset: number) {
  const bandCount = 12;
  const bandHeight = (r * 2) / bandCount;
  for (let i = 0; i < bandCount; i++) {
    const y = -r + i * bandHeight;
    const isAlt = i % 2 === 0;
    ctx.fillStyle = isAlt ? color1 : color2;
    ctx.globalAlpha = 0.4 + (i % 3) * 0.1;
    ctx.beginPath();
    ctx.moveTo(-r, y);
    // Wavy bands
    for (let x = -r; x <= r; x += 4) {
      const wave = Math.sin((x + offset) * 0.04) * 4 * scale;
      ctx.lineTo(x, y + wave);
    }
    for (let x = r; x >= -r; x -= 4) {
      const wave = Math.sin((x + offset) * 0.04) * 4 * scale;
      ctx.lineTo(x, y + bandHeight + wave);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawIceWorldSurface(ctx: CanvasRenderingContext2D, r: number, color: string, crackColor: string, scale: number, offset: number) {
  const rng = seededRng(404);
  // Cracks
  ctx.strokeStyle = crackColor;
  ctx.lineWidth = 1.5 * scale;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 10; i++) {
    const sx = ((rng() - 0.5) * r * 1.6 + offset * 0.3) % (r * 2) - r;
    const sy = (rng() - 0.5) * r * 1.6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    let cx = sx, cy = sy;
    for (let j = 0; j < 5; j++) {
      cx += (rng() - 0.3) * 30 * scale;
      cy += (rng() - 0.5) * 20 * scale;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
  // Ice crystals (sparkle dots)
  for (let i = 0; i < 25; i++) {
    const x = ((rng() - 0.5) * r * 1.8 + offset * 0.5) % (r * 2) - r;
    const y = (rng() - 0.5) * r * 1.8;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.globalAlpha = 0.4 + rng() * 0.4;
    ctx.beginPath();
    ctx.arc(x, y, (1 + rng() * 2) * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawLavaWorldSurface(ctx: CanvasRenderingContext2D, r: number, crust: string, lava: string, scale: number, offset: number, time: number) {
  // Dark crust
  ctx.fillStyle = darkenHex(crust, 0.3);
  ctx.globalAlpha = 0.5;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.globalAlpha = 1;

  const rng = seededRng(505);
  // Lava rivers
  ctx.strokeStyle = lava;
  ctx.lineWidth = 2.5 * scale;
  ctx.shadowColor = lava;
  ctx.shadowBlur = 8 * scale;
  ctx.globalAlpha = 0.7 + Math.sin(time * 2) * 0.15;
  for (let i = 0; i < 8; i++) {
    const sx = ((rng() - 0.5) * r * 1.6 + offset * 0.5) % (r * 2) - r;
    const sy = (rng() - 0.5) * r * 1.6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    let cx = sx, cy = sy;
    for (let j = 0; j < 6; j++) {
      cx += (rng() - 0.3) * 25 * scale;
      cy += (rng() - 0.5) * 20 * scale;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Embers
  for (let i = 0; i < 12; i++) {
    const x = ((rng() - 0.5) * r * 1.6 + offset * 0.2 + Math.sin(time + i) * 3) % (r * 2) - r;
    const y = (rng() - 0.5) * r * 1.6 - Math.abs(Math.sin(time * 1.5 + i * 0.7)) * 8 * scale;
    ctx.fillStyle = lava;
    ctx.globalAlpha = 0.4 + Math.sin(time * 3 + i) * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, (1 + rng()) * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawOceanWorldSurface(ctx: CanvasRenderingContext2D, r: number, color: string, scale: number, offset: number, time: number) {
  const light = lightenHex(color, 1.3);
  // Wave bands
  for (let i = 0; i < 10; i++) {
    const y = -r + (i / 10) * r * 2;
    const wave = Math.sin((y * 0.05 + offset * 0.02 + time * 0.5) + i) * 6 * scale;
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.08 + Math.sin(time * 0.7 + i) * 0.04;
    ctx.beginPath();
    ctx.ellipse(wave, y, r * 0.9, (6 + i % 3 * 2) * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawDesertWorldSurface(ctx: CanvasRenderingContext2D, r: number, color: string, scale: number, offset: number) {
  const rng = seededRng(707);
  const dark = darkenHex(color, 0.7);
  // Wind streaks
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5 * scale;
  for (let i = 0; i < 15; i++) {
    const sx = ((rng() - 0.5) * r * 2 + offset * 0.5) % (r * 2) - r;
    const sy = (rng() - 0.5) * r * 2;
    const len = (20 + rng() * 60) * scale;
    ctx.globalAlpha = 0.15 + rng() * 0.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + len, sy + (rng() - 0.5) * 10 * scale);
    ctx.stroke();
  }
  // Dust swirls
  for (let i = 0; i < 4; i++) {
    const cx = ((rng() - 0.5) * r * 1.4 + offset * 0.3) % (r * 2) - r;
    const cy = (rng() - 0.5) * r * 1.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1 * scale;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.3) {
      const sr = a * 2 * scale;
      ctx.lineTo(cx + Math.cos(a) * sr, cy + Math.sin(a) * sr);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawCrystalWorldSurface(ctx: CanvasRenderingContext2D, r: number, color: string, accent: string, scale: number, offset: number, time: number) {
  const rng = seededRng(808);
  // Geometric facets
  for (let i = 0; i < 12; i++) {
    const cx = ((rng() - 0.5) * r * 1.6 + offset * 0.3) % (r * 2) - r;
    const cy = (rng() - 0.5) * r * 1.6;
    const sides = 3 + Math.floor(rng() * 4);
    const cr = (8 + rng() * 18) * scale;
    ctx.fillStyle = i % 2 === 0 ? accent : color;
    ctx.globalAlpha = 0.25 + rng() * 0.2;
    ctx.beginPath();
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2 + offset * 0.01;
      const px = cx + Math.cos(angle) * cr;
      const py = cy + Math.sin(angle) * cr;
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  // Prismatic highlights
  const highlights = ['rgba(255,100,100,0.3)', 'rgba(100,255,100,0.3)', 'rgba(100,100,255,0.3)', 'rgba(255,255,100,0.3)'];
  for (let i = 0; i < 8; i++) {
    const x = ((rng() - 0.5) * r * 1.4 + offset * 0.2) % (r * 2) - r;
    const y = (rng() - 0.5) * r * 1.4;
    ctx.fillStyle = highlights[i % highlights.length];
    ctx.globalAlpha = 0.3 + Math.sin(time * 2 + i) * 0.2;
    ctx.beginPath();
    ctx.arc(x, y, (2 + rng() * 4) * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawVoidWorldSurface(ctx: CanvasRenderingContext2D, r: number, color: string, scale: number, time: number) {
  // Very dark base
  ctx.fillStyle = '#0a0010';
  ctx.globalAlpha = 0.7;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.globalAlpha = 1;

  const rng = seededRng(909);
  // Energy veins
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 * scale;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6 * scale;
  for (let i = 0; i < 8; i++) {
    const sx = (rng() - 0.5) * r * 1.4;
    const sy = (rng() - 0.5) * r * 1.4;
    ctx.globalAlpha = 0.15 + Math.sin(time * 1.5 + i * 0.9) * 0.15;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    let cx = sx, cy = sy;
    for (let j = 0; j < 4; j++) {
      cx += (rng() - 0.5) * 30 * scale;
      cy += (rng() - 0.5) * 30 * scale;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawNebulaWorldSurface(ctx: CanvasRenderingContext2D, r: number, color1: string, color2: string, scale: number, time: number) {
  const { r: r1, g: g1, b: b1 } = hexToRgb(color1);
  const { r: r2, g: g2, b: b2 } = hexToRgb(color2);
  const rng = seededRng(1010);

  // Swirling gas clouds
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + time * 0.2;
    const dist = (20 + rng() * 40) * scale;
    const cx = Math.cos(angle) * dist;
    const cy = Math.sin(angle) * dist;
    const cr = (25 + rng() * 35) * scale;
    const useFirst = i % 2 === 0;
    const c = useFirst ? `rgba(${r1},${g1},${b1},` : `rgba(${r2},${g2},${b2},`;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    grad.addColorStop(0, c + '0.4)');
    grad.addColorStop(0.6, c + '0.15)');
    grad.addColorStop(1, c + '0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-r, -r, r * 2, r * 2);
  }

  // Wispy tendrils
  ctx.strokeStyle = `rgba(255,255,255,0.1)`;
  ctx.lineWidth = 1 * scale;
  for (let i = 0; i < 5; i++) {
    const startAngle = rng() * Math.PI * 2 + time * 0.15;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      const d = (15 + rng() * 30 + Math.sin(a * 3 + time) * 10) * scale;
      ctx.lineTo(Math.cos(startAngle + a) * d, Math.sin(startAngle + a) * d);
    }
    ctx.globalAlpha = 0.15;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ═══════════════════════════════════════════════════════════════
// ATMOSPHERE
// ═══════════════════════════════════════════════════════════════

function drawAtmosphere(
  ctx: CanvasRenderingContext2D,
  config: PlanetConfig,
  radius: number,
  scale: number,
  time: number,
) {
  const { atmosphere, atmosphereColor } = config;
  const { r, g, b } = hexToRgb(atmosphereColor);

  let glowSize: number;
  let alpha: number;
  let tintR = r, tintG = g, tintB = b;

  switch (atmosphere) {
    case 'thin':
      glowSize = 8 * scale;
      alpha = 0.15;
      break;
    case 'standard':
      glowSize = 16 * scale;
      alpha = 0.25;
      break;
    case 'thick':
      glowSize = 28 * scale;
      alpha = 0.35;
      break;
    case 'toxic':
      glowSize = 20 * scale;
      alpha = 0.3;
      tintR = 180; tintG = 200; tintB = 50;
      break;
    case 'electric':
      glowSize = 18 * scale;
      alpha = 0.35 + Math.sin(time * 4) * 0.1;
      tintR = 100; tintG = 220; tintB = 255;
      break;
    default:
      return;
  }

  // Glow ring
  const grad = ctx.createRadialGradient(0, 0, radius - 2, 0, 0, radius + glowSize);
  grad.addColorStop(0, `rgba(${tintR},${tintG},${tintB},${alpha})`);
  grad.addColorStop(0.5, `rgba(${tintR},${tintG},${tintB},${alpha * 0.4})`);
  grad.addColorStop(1, `rgba(${tintR},${tintG},${tintB},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, radius + glowSize, 0, Math.PI * 2);
  ctx.fill();

  // Electric crackle
  if (atmosphere === 'electric' && Math.sin(time * 6) > 0.85) {
    ctx.strokeStyle = `rgba(${tintR},${tintG},${tintB},0.6)`;
    ctx.lineWidth = 1 * scale;
    const angle = time * 3;
    const x1 = Math.cos(angle) * radius;
    const y1 = Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + (Math.random() - 0.5) * 20 * scale, y1 + (Math.random() - 0.5) * 20 * scale);
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════
// RINGS
// ═══════════════════════════════════════════════════════════════

function drawRings(
  ctx: CanvasRenderingContext2D,
  config: PlanetConfig,
  radius: number,
  scale: number,
  time: number,
  layer: 'behind' | 'front',
) {
  const { rings, ringColor, ringOpacity } = config;
  const { r, g, b } = hexToRgb(ringColor);

  ctx.save();

  // Clip to show only behind or front
  if (layer === 'behind') {
    ctx.beginPath();
    ctx.rect(-radius * 3, -radius * 3, radius * 6, radius * 3);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(-radius * 3, 0, radius * 6, radius * 3);
    ctx.clip();
  }

  const tilt = 0.25; // Ring tilt (15 degrees approx)

  const drawEllipse = (innerR: number, outerR: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(0, 0, outerR, outerR * tilt, 0, 0, Math.PI * 2);
    ctx.lineWidth = (outerR - innerR);
    ctx.strokeStyle = `rgba(${r},${g},${b},${ringOpacity})`;
    ctx.stroke();
  };

  const drawDebris = (innerR: number, outerR: number) => {
    const rng = seededRng(777);
    ctx.globalAlpha = ringOpacity;
    for (let i = 0; i < 60; i++) {
      const angle = rng() * Math.PI * 2 + time * 0.1;
      const dist = innerR + rng() * (outerR - innerR);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist * tilt;
      const sz = (1 + rng() * 3) * scale;
      ctx.fillStyle = `rgba(${r},${g},${b},${0.3 + rng() * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawEnergyRing = (rad: number) => {
    ctx.globalAlpha = ringOpacity * (0.6 + Math.sin(time * 3) * 0.3);
    ctx.shadowColor = ringColor;
    ctx.shadowBlur = 10 * scale;
    ctx.beginPath();
    ctx.ellipse(0, 0, rad, rad * tilt, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r},${g},${b},${ringOpacity})`;
    ctx.lineWidth = 3 * scale;
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  const base = radius * 1.4;

  switch (rings) {
    case 'single':
      drawEllipse(base, base + 15 * scale, ringOpacity);
      break;
    case 'double':
      drawEllipse(base, base + 10 * scale, ringOpacity);
      drawEllipse(base + 18 * scale, base + 26 * scale, ringOpacity * 0.7);
      break;
    case 'triple':
      drawEllipse(base, base + 8 * scale, ringOpacity);
      drawEllipse(base + 14 * scale, base + 22 * scale, ringOpacity * 0.8);
      drawEllipse(base + 28 * scale, base + 34 * scale, ringOpacity * 0.5);
      break;
    case 'debris':
      drawDebris(base, base + 30 * scale);
      break;
    case 'energy':
      drawEnergyRing(base + 10 * scale);
      break;
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// MOONS
// ═══════════════════════════════════════════════════════════════

function drawMoons(
  ctx: CanvasRenderingContext2D,
  config: PlanetConfig,
  radius: number,
  scale: number,
  time: number,
) {
  const { moons, moonColors } = config;
  const orbitRadius = radius + 50 * scale;

  for (let i = 0; i < moons; i++) {
    const angle = (i / moons) * Math.PI * 2 + time * 0.3;
    const mx = Math.cos(angle) * orbitRadius;
    const my = Math.sin(angle) * orbitRadius * 0.4; // Elliptical orbit
    const moonR = (8 + (i % 3) * 2) * scale;
    const color = moonColors[i] || '#C0C0C0';

    // Moon body
    const grad = ctx.createRadialGradient(
      mx - moonR * 0.3, my - moonR * 0.3, moonR * 0.1,
      mx, my, moonR
    );
    grad.addColorStop(0, lightenHex(color, 1.3));
    grad.addColorStop(0.7, color);
    grad.addColorStop(1, darkenHex(color, 0.4));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(mx, my, moonR, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// SURFACE FEATURES
// ═══════════════════════════════════════════════════════════════

function drawFeatures(
  ctx: CanvasRenderingContext2D,
  config: PlanetConfig,
  radius: number,
  scale: number,
  time: number,
) {
  const { features, primaryColor, secondaryColor } = config;

  for (const feature of features) {
    switch (feature) {
      case 'craters':
        drawFeatureCraters(ctx, radius, scale);
        break;
      case 'volcanoes':
        drawFeatureVolcanoes(ctx, radius, scale, time, secondaryColor);
        break;
      case 'storms':
        drawFeatureStorms(ctx, radius, scale, time, primaryColor);
        break;
      case 'city_lights':
        drawFeatureCityLights(ctx, radius, scale, time);
        break;
      case 'polar_ice_caps':
        drawFeaturePolarIceCaps(ctx, radius, scale);
        break;
      case 'lightning':
        drawFeatureLightning(ctx, radius, scale, time);
        break;
      case 'aurora':
        drawFeatureAurora(ctx, radius, scale, time);
        break;
      case 'geysers':
        drawFeatureGeysers(ctx, radius, scale, time);
        break;
      case 'floating_rocks':
        drawFeatureFloatingRocks(ctx, radius, scale, time);
        break;
      case 'energy_core':
        drawFeatureEnergyCore(ctx, radius, scale, time, primaryColor);
        break;
      case 'asteroid_belt':
        drawFeatureAsteroidBelt(ctx, radius, scale, time);
        break;
      case 'space_station':
        drawFeatureSpaceStation(ctx, radius, scale, time);
        break;
    }
  }
}

function drawFeatureCraters(ctx: CanvasRenderingContext2D, r: number, scale: number) {
  const rng = seededRng(1111);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 5; i++) {
    const cx = (rng() - 0.5) * r * 1.2;
    const cy = (rng() - 0.5) * r * 1.2;
    const cr = (6 + rng() * 10) * scale;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 1, cr, -1, 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFeatureVolcanoes(ctx: CanvasRenderingContext2D, r: number, scale: number, time: number, color: string) {
  const rng = seededRng(1212);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 3; i++) {
    const vx = (rng() - 0.5) * r * 1.0;
    const vy = (rng() - 0.5) * r * 1.0;
    // Glow
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * scale;
    ctx.globalAlpha = 0.5 + Math.sin(time * 2 + i) * 0.2;
    ctx.beginPath();
    ctx.arc(vx, vy, 4 * scale, 0, Math.PI * 2);
    ctx.fill();
    // Particles going up
    for (let p = 0; p < 3; p++) {
      const py = vy - (5 + p * 5 + Math.sin(time * 3 + i + p) * 3) * scale;
      ctx.globalAlpha = 0.3 - p * 0.08;
      ctx.beginPath();
      ctx.arc(vx + (rng() - 0.5) * 4 * scale, py, 1.5 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawFeatureStorms(ctx: CanvasRenderingContext2D, r: number, scale: number, time: number, color: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  // Great spot
  const sx = r * 0.3;
  const sy = r * 0.1;
  ctx.strokeStyle = darkenHex(color, 0.6);
  ctx.lineWidth = 1.5 * scale;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 6; a += 0.15) {
    const sr = (3 + a * 1.5) * scale;
    ctx.lineTo(sx + Math.cos(a + time * 0.5) * sr, sy + Math.sin(a + time * 0.5) * sr * 0.7);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawFeatureCityLights(ctx: CanvasRenderingContext2D, r: number, scale: number, time: number) {
  const rng = seededRng(1414);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  // Only on shadow side (right/bottom)
  for (let i = 0; i < 20; i++) {
    const cx = rng() * r * 0.8 + r * 0.1;
    const cy = (rng() - 0.3) * r * 1.2;
    ctx.fillStyle = '#FFE44A';
    ctx.globalAlpha = 0.2 + Math.sin(time * 3 + i * 1.3) * 0.15;
    ctx.beginPath();
    ctx.arc(cx, cy, (0.8 + rng() * 1.5) * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawFeaturePolarIceCaps(ctx: CanvasRenderingContext2D, r: number, scale: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  // Top cap
  const topGrad = ctx.createRadialGradient(0, -r, 0, 0, -r, r * 0.5);
  topGrad.addColorStop(0, 'rgba(255,255,255,0.6)');
  topGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(-r, -r, r * 2, r);
  // Bottom cap
  const botGrad = ctx.createRadialGradient(0, r, 0, 0, r, r * 0.4);
  botGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
  botGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(-r, 0, r * 2, r);
  ctx.restore();
}

function drawFeatureLightning(ctx: CanvasRenderingContext2D, r: number, scale: number, time: number) {
  if (Math.sin(time * 5) < 0.9) return; // Flash intermittently
  ctx.save();
  const angle = Math.sin(time * 7) * Math.PI;
  const x1 = Math.cos(angle) * r * 0.7;
  const y1 = Math.sin(angle) * r * 0.7;
  ctx.strokeStyle = 'rgba(180,220,255,0.7)';
  ctx.lineWidth = 1.5 * scale;
  ctx.shadowColor = '#B4DCFF';
  ctx.shadowBlur = 6 * scale;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + 8 * scale, y1 + 12 * scale);
  ctx.lineTo(x1 + 4 * scale, y1 + 14 * scale);
  ctx.lineTo(x1 + 10 * scale, y1 + 24 * scale);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawFeatureAurora(ctx: CanvasRenderingContext2D, r: number, scale: number, time: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
  ctx.clip();
  const colors = ['rgba(0,255,100,0.12)', 'rgba(0,150,255,0.10)', 'rgba(200,50,255,0.08)'];
  // Top aurora
  for (let i = 0; i < 3; i++) {
    const y = -r * 0.8 + i * 5 * scale;
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    for (let x = -r; x <= r; x += 3) {
      const wave = Math.sin(x * 0.05 + time * 1.5 + i) * 8 * scale;
      if (x === -r) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    for (let x = r; x >= -r; x -= 3) {
      const wave = Math.sin(x * 0.05 + time * 1.5 + i) * 8 * scale;
      ctx.lineTo(x, y + 15 * scale + wave);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawFeatureGeysers(ctx: CanvasRenderingContext2D, r: number, scale: number, time: number) {
  const rng = seededRng(1818);
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const angle = rng() * Math.PI * 2;
    const bx = Math.cos(angle) * r * 0.8;
    const by = Math.sin(angle) * r * 0.8;
    ctx.fillStyle = 'rgba(200,220,255,0.4)';
    // Spray particles
    for (let p = 0; p < 4; p++) {
      const h = (3 + p * 4 + Math.sin(time * 2 + i) * 3) * scale;
      const px = bx + (rng() - 0.5) * 4 * scale;
      const py = by - h;
      ctx.globalAlpha = 0.3 - p * 0.06;
      ctx.beginPath();
      ctx.arc(px, py, (1 + rng()) * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawFeatureFloatingRocks(ctx: CanvasRenderingContext2D, r: number, scale: number, time: number) {
  const rng = seededRng(1919);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + time * 0.1;
    const dist = r + (12 + rng() * 15) * scale;
    const rx = Math.cos(angle) * dist;
    const ry = Math.sin(angle) * dist + Math.sin(time + i) * 3 * scale;
    const sz = (2 + rng() * 4) * scale;
    ctx.fillStyle = `rgba(140,120,100,${0.5 + rng() * 0.3})`;
    ctx.beginPath();
    // Irregular shape
    ctx.moveTo(rx - sz, ry);
    ctx.lineTo(rx - sz * 0.3, ry - sz);
    ctx.lineTo(rx + sz * 0.7, ry - sz * 0.5);
    ctx.lineTo(rx + sz, ry + sz * 0.3);
    ctx.lineTo(rx, ry + sz * 0.6);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFeatureEnergyCore(ctx: CanvasRenderingContext2D, r: number, scale: number, time: number, color: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  const pulse = 0.4 + Math.sin(time * 2) * 0.2;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.7);
  const { r: cr, g: cg, b: cb } = hexToRgb(color);
  grad.addColorStop(0, `rgba(${cr},${cg},${cb},${pulse})`);
  grad.addColorStop(0.3, `rgba(${cr},${cg},${cb},${pulse * 0.4})`);
  grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

function drawFeatureAsteroidBelt(ctx: CanvasRenderingContext2D, r: number, scale: number, time: number) {
  const rng = seededRng(2121);
  const orbitR = r * 1.6;
  for (let i = 0; i < 40; i++) {
    const angle = rng() * Math.PI * 2 + time * 0.05;
    const d = orbitR + (rng() - 0.5) * 20 * scale;
    const ax = Math.cos(angle) * d;
    const ay = Math.sin(angle) * d * 0.3;
    const sz = (1 + rng() * 3) * scale;
    ctx.fillStyle = `rgba(160,150,140,${0.3 + rng() * 0.4})`;
    ctx.beginPath();
    ctx.arc(ax, ay, sz, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFeatureSpaceStation(ctx: CanvasRenderingContext2D, r: number, scale: number, time: number) {
  const angle = time * 0.4;
  const orbitR = r + 35 * scale;
  const sx = Math.cos(angle) * orbitR;
  const sy = Math.sin(angle) * orbitR * 0.5;

  ctx.fillStyle = '#C0C0C0';
  ctx.strokeStyle = '#808080';
  ctx.lineWidth = 1 * scale;

  // Main body
  ctx.fillRect(sx - 5 * scale, sy - 2 * scale, 10 * scale, 4 * scale);
  ctx.strokeRect(sx - 5 * scale, sy - 2 * scale, 10 * scale, 4 * scale);
  // Solar panels
  ctx.fillStyle = '#3060A0';
  ctx.fillRect(sx - 10 * scale, sy - 1 * scale, 4 * scale, 2 * scale);
  ctx.fillRect(sx + 6 * scale, sy - 1 * scale, 4 * scale, 2 * scale);
}
