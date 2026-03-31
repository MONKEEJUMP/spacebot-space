/**
 * SPACEBOT.SPACE — Avatar Canvas Renderer
 * Wall-E inspired procedural robot drawing with metallic depth and soul
 *
 * Phase 1: 3 body types (box, egg, sphere)
 * Phase 2A: +7 body types (dome, cylinder, hexplate, visor_helm, dish, wedge, monitor)
 * Phase 2B: +7 eye types (camera_lens, scanner_bar, pixel_display, ring_optic, slit_visor, compound, projector)
 * Eyes: 10 types total
 * Phase 3A: +6 mouth types (vent_slits, data_display, single_slit, jaw_plate, wave_emitter, none)
 * Mouth: 7 types total
 * Phase 3B: +9 accessories (status_led, side_panels, visor_band, ear_sensors,
 *           chin_plate, forehead_mark, neck_joint, cheek_vents, brow_ridge)
 * Accessories: 12 types total
 * Phase 4A: +12 human android eye types (round_wide, round_narrow, almond,
 *           droopy, upswept, large_iris, void_eye, glow_iris, pinpoint,
 *           crescent, ring_eye, split_tone)
 */

import type { FactionPalette, RobotConfig } from './avatarConfig';
import { lightenColor, darkenColor, withAlpha } from './avatarUtils';
import { seededRandom } from './avatarSeeder';

// ═══════════════════════════════════════════════════════════════
// DRAW CONTEXT — shared state for all draw functions
// ═══════════════════════════════════════════════════════════════

interface DrawContext {
  ctx: CanvasRenderingContext2D;
  size: number;           // Canvas pixel size
  cx: number;             // Center x (size / 2)
  cy: number;             // Center y (size / 2)
  faceRadius: number;     // Main face radius (size * 0.38)
  color: FactionPalette;  // Faction colors
  config: RobotConfig;    // The robot's config
}

// ═══════════════════════════════════════════════════════════════
// SHAPE HELPERS
// ═══════════════════════════════════════════════════════════════

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const normalizedX = w < 0 ? x + w : x;
  const normalizedY = h < 0 ? y + h : y;
  const normalizedW = Math.abs(w);
  const normalizedH = Math.abs(h);
  const safeRadius = Math.max(0, Math.min(Math.abs(r), normalizedW / 2, normalizedH / 2));

  ctx.moveTo(normalizedX + safeRadius, normalizedY);
  ctx.arcTo(normalizedX + normalizedW, normalizedY, normalizedX + normalizedW, normalizedY + normalizedH, safeRadius);
  ctx.arcTo(normalizedX + normalizedW, normalizedY + normalizedH, normalizedX, normalizedY + normalizedH, safeRadius);
  ctx.arcTo(normalizedX, normalizedY + normalizedH, normalizedX, normalizedY, safeRadius);
  ctx.arcTo(normalizedX, normalizedY, normalizedX + normalizedW, normalizedY, safeRadius);
  ctx.closePath();
}

function hexPath(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
) {
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ═══════════════════════════════════════════════════════════════
// BODY — 10 Wall-E inspired body types with metallic gradients
// ═══════════════════════════════════════════════════════════════

function drawBody(dc: DrawContext): void {
  const { ctx, cx, cy, size, faceRadius, color, config } = dc;
  const p = color.primary;

  switch (config.bodyType) {

    // ── BOX — WALL-E style rounded rectangle ──────────────────
    case 'box': {
      const w = faceRadius * 2;
      const h = faceRadius * 1.8;
      const r = size * 0.06;
      const x = cx - w / 2;
      const y = cy - h / 2;

      // Metallic gradient: top (bright) → bottom (dark)
      ctx.beginPath();
      rrect(ctx, x, y, w, h, r);
      const bodyG = ctx.createLinearGradient(cx, y, cx, y + h);
      bodyG.addColorStop(0, lightenColor(p, 50));
      bodyG.addColorStop(0.15, lightenColor(p, 30));
      bodyG.addColorStop(0.5, p);
      bodyG.addColorStop(0.8, darkenColor(p, 30));
      bodyG.addColorStop(1.0, darkenColor(p, 50));
      ctx.fillStyle = bodyG;
      ctx.fill();

      // Specular highlight — upper-left elliptical bright spot
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const specG = ctx.createRadialGradient(
        cx - faceRadius * 0.3, cy - faceRadius * 0.3, 0,
        cx - faceRadius * 0.3, cy - faceRadius * 0.3, faceRadius * 0.4,
      );
      specG.addColorStop(0, 'rgba(255,255,255,0.15)');
      specG.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      rrect(ctx, x, y, w, h, r);
      ctx.fillStyle = specG;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      // Panel seam — horizontal line across middle
      ctx.beginPath();
      ctx.moveTo(x + r * 0.5, cy);
      ctx.lineTo(x + w - r * 0.5, cy);
      ctx.strokeStyle = withAlpha(darkenColor(p, 40), 0.2);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // Light catching lower lip of seam
      ctx.beginPath();
      ctx.moveTo(x + r * 0.5, cy + 1);
      ctx.lineTo(x + w - r * 0.5, cy + 1);
      ctx.strokeStyle = withAlpha(lightenColor(p, 40), 0.1);
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Double outline — black outer, white inner
      ctx.beginPath();
      rrect(ctx, x, y, w, h, r);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.beginPath();
      rrect(ctx, x, y, w, h, r);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
      break;
    }

    // ── EGG — EVE style smooth glossy oval ────────────────────
    case 'egg': {
      const rx = faceRadius * 0.85;
      const ry = faceRadius * 1.05;

      // Radial gradient with offset highlight — glossy ceramic look
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      const eggG = ctx.createRadialGradient(
        cx - faceRadius * 0.2, cy - faceRadius * 0.25, 0,
        cx, cy, faceRadius * 1.2,
      );
      eggG.addColorStop(0, 'rgba(255,255,255,0.9)');
      eggG.addColorStop(0.15, lightenColor(p, 70));
      eggG.addColorStop(0.4, lightenColor(p, 40));
      eggG.addColorStop(0.7, p);
      eggG.addColorStop(1.0, darkenColor(p, 30));
      ctx.fillStyle = eggG;
      ctx.fill();

      // Double outline — black outer, white inner
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
      break;
    }

    // ── SPHERE — M-O style perfect metallic ball ──────────────
    case 'sphere': {
      // Classic sphere shading — offset radial gradient
      ctx.beginPath();
      ctx.arc(cx, cy, faceRadius, 0, Math.PI * 2);
      const sphereG = ctx.createRadialGradient(
        cx - faceRadius * 0.25, cy - faceRadius * 0.25, faceRadius * 0.05,
        cx, cy, faceRadius * 1.1,
      );
      sphereG.addColorStop(0, 'rgba(255,255,255,0.85)');
      sphereG.addColorStop(0.1, lightenColor(p, 55));
      sphereG.addColorStop(0.35, lightenColor(p, 20));
      sphereG.addColorStop(0.6, p);
      sphereG.addColorStop(0.85, darkenColor(p, 35));
      sphereG.addColorStop(1.0, darkenColor(p, 55));
      ctx.fillStyle = sphereG;
      ctx.fill();

      // Rim reflection — faint bright crescent on shadow side (bottom-right)
      ctx.beginPath();
      ctx.arc(cx, cy, faceRadius - size * 0.003, Math.PI * 0.3, Math.PI * 0.85);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Double outline — black outer, white inner
      ctx.beginPath();
      ctx.arc(cx, cy, faceRadius, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, faceRadius, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
      break;
    }

    // ── DOME — Half-Sphere Helmet ────────────────────────────
    case 'dome': {
      const domeR = faceRadius;
      const baseH = faceRadius * 0.3; // flat bottom collar (15% of total height)

      // Dome arc (top half-sphere)
      ctx.beginPath();
      ctx.arc(cx, cy, domeR, Math.PI, 0);
      ctx.lineTo(cx + domeR, cy + baseH);
      ctx.lineTo(cx - domeR, cy + baseH);
      ctx.closePath();

      // Radial gradient with specular hotspot upper-left
      const domeG = ctx.createRadialGradient(
        cx - faceRadius * 0.25, cy - faceRadius * 0.3, faceRadius * 0.05,
        cx, cy, faceRadius * 1.15,
      );
      domeG.addColorStop(0, 'rgba(255,255,255,0.80)');
      domeG.addColorStop(0.12, lightenColor(p, 50));
      domeG.addColorStop(0.35, lightenColor(p, 20));
      domeG.addColorStop(0.6, p);
      domeG.addColorStop(0.85, darkenColor(p, 35));
      domeG.addColorStop(1.0, darkenColor(p, 50));
      ctx.fillStyle = domeG;
      ctx.fill();

      // Dark collar at bottom
      ctx.beginPath();
      ctx.rect(cx - domeR, cy, domeR * 2, baseH);
      const collarG = ctx.createLinearGradient(cx, cy, cx, cy + baseH);
      collarG.addColorStop(0, darkenColor(p, 35));
      collarG.addColorStop(1, darkenColor(p, 55));
      ctx.fillStyle = collarG;
      ctx.fill();

      // Bright top edge of collar
      ctx.beginPath();
      ctx.moveTo(cx - domeR + 2, cy);
      ctx.lineTo(cx + domeR - 2, cy);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Rim light arc across top 120°
      ctx.beginPath();
      ctx.arc(cx, cy, domeR - 1, -Math.PI * 0.83, -Math.PI * 0.17);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Double outline — black outer, white inner
      ctx.beginPath();
      ctx.arc(cx, cy, domeR, Math.PI, 0);
      ctx.lineTo(cx + domeR, cy + baseH);
      ctx.lineTo(cx - domeR, cy + baseH);
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, domeR, Math.PI, 0);
      ctx.lineTo(cx + domeR, cy + baseH);
      ctx.lineTo(cx - domeR, cy + baseH);
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
      break;
    }

    // ── CYLINDER — Tall Pill Capsule (GO-4) ─────────────────
    case 'cylinder': {
      const cylW = faceRadius * 0.85;   // half-width
      const cylH = faceRadius * 1.4;    // total height (1:1.4 aspect)
      const capR = cylW;                // cap arc radius = width
      const topY = cy - cylH / 2;
      const botY = cy + cylH / 2;

      // Full capsule path: arc top + sides + arc bottom
      ctx.beginPath();
      ctx.arc(cx, topY + capR, capR, Math.PI, 0);                // top cap
      ctx.lineTo(cx + cylW, botY - capR);                         // right side
      ctx.arc(cx, botY - capR, capR, 0, Math.PI);                 // bottom cap
      ctx.closePath();

      // LINEAR gradient LEFT-to-RIGHT: cylindrical metallic sheen
      const cylG = ctx.createLinearGradient(cx - cylW, cy, cx + cylW, cy);
      cylG.addColorStop(0, darkenColor(p, 40));
      cylG.addColorStop(0.15, darkenColor(p, 15));
      cylG.addColorStop(0.35, lightenColor(p, 20));
      cylG.addColorStop(0.5, lightenColor(p, 40));
      cylG.addColorStop(0.65, lightenColor(p, 20));
      cylG.addColorStop(0.85, darkenColor(p, 15));
      cylG.addColorStop(1.0, darkenColor(p, 40));
      ctx.fillStyle = cylG;
      ctx.fill();

      // Bright vertical highlight stripe slightly left of center
      ctx.beginPath();
      ctx.moveTo(cx - cylW * 0.15, topY + capR * 0.5);
      ctx.lineTo(cx - cylW * 0.15, botY - capR * 0.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Bottom 20% darkened
      const darkZoneY = botY - cylH * 0.2;
      const darkG = ctx.createLinearGradient(cx, darkZoneY, cx, botY);
      darkG.addColorStop(0, 'rgba(0,0,0,0)');
      darkG.addColorStop(1, 'rgba(0,0,0,0.15)');
      ctx.fillStyle = darkG;
      ctx.beginPath();
      ctx.rect(cx - cylW, darkZoneY, cylW * 2, cylH * 0.2 + capR);
      ctx.fill();

      // Rim arc on top cap
      ctx.beginPath();
      ctx.arc(cx, topY + capR, capR - 1, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Double outline — black outer, white inner
      ctx.beginPath();
      ctx.arc(cx, topY + capR, capR, Math.PI, 0);
      ctx.lineTo(cx + cylW, botY - capR);
      ctx.arc(cx, botY - capR, capR, 0, Math.PI);
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, topY + capR, capR, Math.PI, 0);
      ctx.lineTo(cx + cylW, botY - capR);
      ctx.arc(cx, botY - capR, capR, 0, Math.PI);
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
      break;
    }

    // ── HEXPLATE — Hexagonal Armor Faceplate ────────────────
    case 'hexplate': {
      const hexR = faceRadius * 0.95;

      // Hexagon path (flat top/bottom = rotated 30°)
      const hexVerts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6; // 30° rotation for flat top
        hexVerts.push([cx + hexR * Math.cos(a), cy + hexR * Math.sin(a)]);
      }

      ctx.beginPath();
      hexVerts.forEach(([hx, hy], i) => i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy));
      ctx.closePath();

      // Linear gradient top-to-bottom
      const hexG = ctx.createLinearGradient(cx, cy - hexR, cx, cy + hexR);
      hexG.addColorStop(0, lightenColor(p, 30));
      hexG.addColorStop(0.4, p);
      hexG.addColorStop(1.0, darkenColor(p, 40));
      ctx.fillStyle = hexG;
      ctx.fill();

      // Subtle radial lighter center for convex feel
      ctx.beginPath();
      hexVerts.forEach(([hx, hy], i) => i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy));
      ctx.closePath();
      const convexG = ctx.createRadialGradient(cx, cy, 0, cx, cy, hexR * 0.8);
      convexG.addColorStop(0, 'rgba(255,255,255,0.1)');
      convexG.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = convexG;
      ctx.fill();

      // Bevel: top 3 edges = highlight, bottom 3 = shadow
      for (let i = 0; i < 6; i++) {
        const [x1, y1] = hexVerts[i];
        const [x2, y2] = hexVerts[(i + 1) % 6];
        const isTop = i >= 4 || i === 0; // top 3 edges (indices 0, 4, 5)
        ctx.beginPath();
        // Inset 1px
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len, ny = dx / len;
        ctx.moveTo(x1 + nx, y1 + ny);
        ctx.lineTo(x2 + nx, y2 + ny);
        ctx.strokeStyle = isTop ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 2-3 bolt circles at vertices
      const boltVerts = [0, 2, 4];
      boltVerts.forEach((vi) => {
        const [bx, by] = hexVerts[vi];
        const br = size * 0.01;
        // Dark ring
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = darkenColor(p, 35);
        ctx.globalAlpha = 0.4;
        ctx.fill();
        ctx.globalAlpha = 1;
        // Bright center dot
        ctx.beginPath();
        ctx.arc(bx, by, br * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fill();
      });

      // Double outline — black outer, white inner
      ctx.beginPath();
      hexVerts.forEach(([hx, hy], i) => i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy));
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.beginPath();
      hexVerts.forEach(([hx, hy], i) => i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy));
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
      break;
    }

    // ═══════════════════════════════════════════════════════════
    // VISOR HELM — LOCKED BY PAULIEWOOD! 2/14/2026
    // DO NOT MODIFY THIS SHAPE
    // - Wider at top, narrower at bottom (trapezoid/bucket)
    // - Smooth bottom edge — NO indent, NO notch, NO chin cutout
    // - Rounded corners on all edges
    // - This shape was hand-tuned across multiple iterations
    // - Any changes require PAULIEWOOD! approval
    // ═══════════════════════════════════════════════════════════
    // ── VISOR_HELM — Tactical Helmet with Dark Visor ────────
    case 'visor_helm': {
      const helmW = faceRadius * 1.0;
      const helmH = faceRadius * 1.75;
      const helmR = size * 0.08; // corner radius
      // Rounded trapezoid: wider top, narrower chin
      const topW = helmW;
      const botW = helmW * 0.75;
      const botEdgeW = botW;
      const topY_v = cy - helmH / 2;
      const botY_v = cy + helmH / 2;

      // Trapezoid path with rounded corners via arcs
      ctx.beginPath();
      ctx.moveTo(cx - topW + helmR, topY_v);
      ctx.lineTo(cx + topW - helmR, topY_v);
      ctx.arcTo(cx + topW, topY_v, cx + topW, topY_v + helmR, helmR);
      ctx.lineTo(cx + botEdgeW, botY_v);
      ctx.lineTo(cx - botEdgeW, botY_v);
      ctx.lineTo(cx - topW, topY_v + helmR);
      ctx.arcTo(cx - topW, topY_v, cx - topW + helmR, topY_v, helmR);
      ctx.closePath();

      // Metallic gradient top-to-bottom
      const helmG = ctx.createLinearGradient(cx, topY_v, cx, botY_v);
      helmG.addColorStop(0, lightenColor(p, 45));
      helmG.addColorStop(0.2, lightenColor(p, 20));
      helmG.addColorStop(0.5, p);
      helmG.addColorStop(0.8, darkenColor(p, 25));
      helmG.addColorStop(1.0, darkenColor(p, 45));
      ctx.fillStyle = helmG;
      ctx.fill();

      // Dark visor band across upper-middle (30% of height)
      const visorTop = topY_v + helmH * 0.22;
      const visorH_v = helmH * 0.3;
      // Visor width tapers with trapezoid
      const visorLerp = 0.35; // how far down (for width lerp)
      const vLW = topW + (botW - topW) * visorLerp;
      const vRW = topW + (botW - topW) * (visorLerp + 0.25);
      ctx.beginPath();
      ctx.moveTo(cx - vLW, visorTop);
      ctx.lineTo(cx + vLW, visorTop);
      ctx.lineTo(cx + vRW, visorTop + visorH_v);
      ctx.lineTo(cx - vRW, visorTop + visorH_v);
      ctx.closePath();
      const visorG = ctx.createLinearGradient(cx, visorTop, cx, visorTop + visorH_v);
      visorG.addColorStop(0, withAlpha(darkenColor(p, 70), 0.9));
      visorG.addColorStop(0.5, 'rgba(8,8,12,0.92)');
      visorG.addColorStop(1, withAlpha(darkenColor(p, 65), 0.88));
      ctx.fillStyle = visorG;
      ctx.fill();

      // Bright line on visor top edge
      ctx.beginPath();
      ctx.moveTo(cx - vLW + 2, visorTop);
      ctx.lineTo(cx + vLW - 2, visorTop);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Shadow on visor bottom edge
      ctx.beginPath();
      ctx.moveTo(cx - vRW + 2, visorTop + visorH_v);
      ctx.lineTo(cx + vRW - 2, visorTop + visorH_v);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Helmet rim light across top
      ctx.beginPath();
      ctx.moveTo(cx - topW + helmR * 2, topY_v + 1);
      ctx.lineTo(cx + topW - helmR * 2, topY_v + 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Double outline — black outer, white inner
      ctx.beginPath();
      ctx.moveTo(cx - topW + helmR, topY_v);
      ctx.lineTo(cx + topW - helmR, topY_v);
      ctx.arcTo(cx + topW, topY_v, cx + topW, topY_v + helmR, helmR);
      ctx.lineTo(cx + botEdgeW, botY_v);
      ctx.lineTo(cx - botEdgeW, botY_v);
      ctx.lineTo(cx - topW, topY_v + helmR);
      ctx.arcTo(cx - topW, topY_v, cx - topW + helmR, topY_v, helmR);
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - topW + helmR, topY_v);
      ctx.lineTo(cx + topW - helmR, topY_v);
      ctx.arcTo(cx + topW, topY_v, cx + topW, topY_v + helmR, helmR);
      ctx.lineTo(cx + botEdgeW, botY_v);
      ctx.lineTo(cx - botEdgeW, botY_v);
      ctx.lineTo(cx - topW, topY_v + helmR);
      ctx.arcTo(cx - topW, topY_v, cx - topW + helmR, topY_v, helmR);
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
      break;
    }

    // ── DISH — Satellite/Radar Dish ─────────────────────────
    case 'dish': {
      const dishR = faceRadius * 0.95;

      // Main dish circle — INVERTED radial gradient (concave bowl)
      ctx.beginPath();
      ctx.arc(cx, cy, dishR, 0, Math.PI * 2);
      const dishG = ctx.createRadialGradient(cx, cy, 0, cx, cy, dishR);
      dishG.addColorStop(0, darkenColor(p, 30));      // darker center
      dishG.addColorStop(0.3, darkenColor(p, 15));
      dishG.addColorStop(0.6, p);
      dishG.addColorStop(0.85, lightenColor(p, 25));   // lighter rim
      dishG.addColorStop(1.0, lightenColor(p, 15));
      ctx.fillStyle = dishG;
      ctx.fill();

      // Concentric rings between center and rim
      [0.35, 0.55, 0.75].forEach((pct) => {
        ctx.beginPath();
        ctx.arc(cx, cy, dishR * pct, 0, Math.PI * 2);
        ctx.strokeStyle = darkenColor(p, 20);
        ctx.lineWidth = 0.6;
        ctx.globalAlpha = 0.07;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // Focal receiver — small center circle
      const focalR = dishR * 0.15;
      ctx.beginPath();
      ctx.arc(cx, cy, focalR, 0, Math.PI * 2);
      const focalG = ctx.createRadialGradient(
        cx - focalR * 0.3, cy - focalR * 0.3, 0,
        cx, cy, focalR,
      );
      focalG.addColorStop(0, lightenColor(p, 50));
      focalG.addColorStop(0.3, lightenColor(p, 20));
      focalG.addColorStop(0.7, p);
      focalG.addColorStop(1, darkenColor(p, 30));
      ctx.fillStyle = focalG;
      ctx.fill();

      // Specular dot on focal receiver
      ctx.beginPath();
      ctx.arc(cx - focalR * 0.25, cy - focalR * 0.25, focalR * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fill();

      // Rim highlight arc on top
      ctx.beginPath();
      ctx.arc(cx, cy, dishR - 1, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Thick metallic stroke (outer ring)
      ctx.beginPath();
      ctx.arc(cx, cy, dishR, 0, Math.PI * 2);
      const rimG = ctx.createLinearGradient(cx, cy - dishR, cx, cy + dishR);
      rimG.addColorStop(0, lightenColor(p, 30));
      rimG.addColorStop(0.5, darkenColor(p, 10));
      rimG.addColorStop(1, darkenColor(p, 40));
      ctx.strokeStyle = rimG;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Double outline — black outer, white inner
      ctx.beginPath();
      ctx.arc(cx, cy, dishR, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, dishR, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
      break;
    }

    // ── WEDGE — Aggressive Triangular Wedge ─────────────────
    case 'wedge': {
      const wedgeR = faceRadius * 1.0;

      // Triangle vertices: top-center, bottom-left, bottom-right
      const topPt: [number, number] = [cx, cy - wedgeR * 0.85];
      const blPt: [number, number] = [cx - wedgeR * 0.95, cy + wedgeR * 0.7];
      const brPt: [number, number] = [cx + wedgeR * 0.95, cy + wedgeR * 0.7];

      // Rounded triangle path using quadraticCurveTo
      const cornerR = wedgeR * 0.18;
      // Helper: get point along edge from vertex toward next vertex
      const toward = (from: [number, number], to: [number, number], dist: number): [number, number] => {
        const dx = to[0] - from[0], dy = to[1] - from[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        return [from[0] + (dx / len) * dist, from[1] + (dy / len) * dist];
      };

      const t_bl = toward(topPt, blPt, cornerR);
      const bl_t = toward(blPt, topPt, cornerR);
      const bl_br = toward(blPt, brPt, cornerR);
      const br_bl = toward(brPt, blPt, cornerR);
      const br_t = toward(brPt, topPt, cornerR);
      const t_br = toward(topPt, brPt, cornerR);

      ctx.beginPath();
      ctx.moveTo(t_bl[0], t_bl[1]);
      ctx.quadraticCurveTo(blPt[0], blPt[1], bl_br[0], bl_br[1]);
      ctx.lineTo(br_bl[0], br_bl[1]);
      ctx.quadraticCurveTo(brPt[0], brPt[1], br_t[0], br_t[1]);
      ctx.lineTo(t_br[0], t_br[1]);
      ctx.quadraticCurveTo(topPt[0], topPt[1], t_bl[0], t_bl[1]);
      ctx.closePath();

      // Linear gradient upper-left to lower-right
      const wedgeG = ctx.createLinearGradient(
        cx - wedgeR * 0.7, cy - wedgeR * 0.7,
        cx + wedgeR * 0.7, cy + wedgeR * 0.7,
      );
      wedgeG.addColorStop(0, lightenColor(p, 40));
      wedgeG.addColorStop(0.3, lightenColor(p, 15));
      wedgeG.addColorStop(0.55, p);
      wedgeG.addColorStop(0.8, darkenColor(p, 25));
      wedgeG.addColorStop(1.0, darkenColor(p, 45));
      ctx.fillStyle = wedgeG;
      ctx.fill();

      // Top-left edges bright highlight
      ctx.beginPath();
      ctx.moveTo(t_bl[0], t_bl[1]);
      ctx.quadraticCurveTo(blPt[0], blPt[1], bl_br[0], bl_br[1]);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(t_br[0], t_br[1]);
      ctx.quadraticCurveTo(topPt[0], topPt[1], t_bl[0], t_bl[1]);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Bottom-right shadow edge
      ctx.beginPath();
      ctx.moveTo(br_bl[0], br_bl[1]);
      ctx.quadraticCurveTo(brPt[0], brPt[1], br_t[0], br_t[1]);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Double outline — black outer, white inner
      ctx.beginPath();
      ctx.moveTo(t_bl[0], t_bl[1]);
      ctx.quadraticCurveTo(blPt[0], blPt[1], bl_br[0], bl_br[1]);
      ctx.lineTo(br_bl[0], br_bl[1]);
      ctx.quadraticCurveTo(brPt[0], brPt[1], br_t[0], br_t[1]);
      ctx.lineTo(t_br[0], t_br[1]);
      ctx.quadraticCurveTo(topPt[0], topPt[1], t_bl[0], t_bl[1]);
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(t_bl[0], t_bl[1]);
      ctx.quadraticCurveTo(blPt[0], blPt[1], bl_br[0], bl_br[1]);
      ctx.lineTo(br_bl[0], br_bl[1]);
      ctx.quadraticCurveTo(brPt[0], brPt[1], br_t[0], br_t[1]);
      ctx.lineTo(t_br[0], t_br[1]);
      ctx.quadraticCurveTo(topPt[0], topPt[1], t_bl[0], t_bl[1]);
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
      break;
    }

    // ── MONITOR — Retro CRT Screen Head ─────────────────────
    case 'monitor': {
      const monW = faceRadius * 1.9;
      const monH = faceRadius * 1.6;
      const monR = size * 0.05;
      const mx = cx - monW / 2;
      const my = cy - monH / 2;
      const bezelInset = 4;

      // 1. Outer housing — neutral dark gray (NOT faction color)
      ctx.beginPath();
      rrect(ctx, mx, my, monW, monH, monR);
      const housingG = ctx.createLinearGradient(cx, my, cx, my + monH);
      housingG.addColorStop(0, '#555555');
      housingG.addColorStop(0.15, '#444444');
      housingG.addColorStop(0.5, '#333333');
      housingG.addColorStop(0.85, '#282828');
      housingG.addColorStop(1.0, '#1e1e1e');
      ctx.fillStyle = housingG;
      ctx.fill();

      // Housing specular highlight
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const monSpecG = ctx.createRadialGradient(
        cx - monW * 0.2, my + monH * 0.15, 0,
        cx - monW * 0.2, my + monH * 0.15, monW * 0.3,
      );
      monSpecG.addColorStop(0, 'rgba(255,255,255,0.08)');
      monSpecG.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      rrect(ctx, mx, my, monW, monH, monR);
      ctx.fillStyle = monSpecG;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      // Double outline — black outer, white inner
      ctx.beginPath();
      rrect(ctx, mx, my, monW, monH, monR);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.beginPath();
      rrect(ctx, mx, my, monW, monH, monR);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();

      // 2. Inner screen area — dark with faction tint
      const scrX = mx + bezelInset;
      const scrY = my + bezelInset;
      const scrW = monW - bezelInset * 2;
      const scrH = monH - bezelInset * 2;
      const scrR = monR * 0.6;

      ctx.beginPath();
      rrect(ctx, scrX, scrY, scrW, scrH, scrR);
      ctx.fillStyle = withAlpha(darkenColor(p, 75), 0.95);
      ctx.fill();

      // Screen glow — radial gradient brighter at center
      ctx.beginPath();
      rrect(ctx, scrX, scrY, scrW, scrH, scrR);
      const scrGlow = ctx.createRadialGradient(
        cx, cy, 0, cx, cy, Math.max(scrW, scrH) * 0.6,
      );
      scrGlow.addColorStop(0, withAlpha(p, 0.08));
      scrGlow.addColorStop(0.5, withAlpha(p, 0.03));
      scrGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = scrGlow;
      ctx.fill();

      // 3. Scan lines — horizontal lines every 2px
      ctx.save();
      ctx.beginPath();
      rrect(ctx, scrX, scrY, scrW, scrH, scrR);
      ctx.clip();
      for (let sy = scrY; sy < scrY + scrH; sy += 2) {
        ctx.beginPath();
        ctx.moveTo(scrX, sy);
        ctx.lineTo(scrX + scrW, sy);
        ctx.strokeStyle = (Math.floor((sy - scrY) / 2) % 2 === 0)
          ? 'rgba(255,255,255,0.03)'
          : 'rgba(255,255,255,0.01)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      // 4. Bright reflection line on top of screen
      ctx.beginPath();
      ctx.moveTo(scrX + scrR, scrY + 1);
      ctx.lineTo(scrX + scrW - scrR, scrY + 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // 5. Dark shadow under bezel (top inner edge)
      ctx.beginPath();
      ctx.moveTo(scrX + scrR, scrY + 2.5);
      ctx.lineTo(scrX + scrW - scrR, scrY + 2.5);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Bezel highlight on housing top
      ctx.beginPath();
      ctx.moveTo(mx + monR, my + 0.5);
      ctx.lineTo(mx + monW - monR, my + 0.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
    }

    // ── FALLBACK ──
    default: {
      ctx.beginPath();
      ctx.arc(cx, cy, faceRadius, 0, Math.PI * 2);
      ctx.fillStyle = p;
      ctx.fill();
      // Double outline — black outer, white inner
      ctx.beginPath();
      ctx.arc(cx, cy, faceRadius, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, faceRadius, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
      break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// EYE GLOW BLOOM — soft light behind eyes (drawn BEFORE eyes)
// ═══════════════════════════════════════════════════════════════

// Single-centered eye types — drawn as ONE element, not a pair
const SINGLE_EYE_TYPES = new Set([
  'led_visor', 'camera_lens', 'scanner_bar', 'slit_visor', 'projector',
]);

function drawEyeGlowBloom(dc: DrawContext): void {
  const { ctx, cx, cy, faceRadius, color, config, size } = dc;
  const eyeY = cy - faceRadius * 0.1;
  const eyeSpacing = faceRadius * 0.55;
  const bloomRadius = faceRadius * 0.45;

  // Constrain bloom to body pixels only — prevents gradient bleed on transparent backgrounds
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';

  // Single-element eyes get one centered bloom
  if (SINGLE_EYE_TYPES.has(config.eyeType)) {
    const grad = ctx.createRadialGradient(cx, eyeY, 0, cx, eyeY, bloomRadius * 1.5);
    grad.addColorStop(0, withAlpha(color.primary, 0.15));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
    return;
  }

  // Dual eyes get bloom at each position
  [cx - eyeSpacing, cx + eyeSpacing].forEach((ex) => {
    const grad = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, bloomRadius);
    grad.addColorStop(0, withAlpha(color.primary, 0.12));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  });

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// CAMERA EYE HELPER — single camera lens (used by binocular)
// ═══════════════════════════════════════════════════════════════

function drawCameraLensEye(
  ctx: CanvasRenderingContext2D,
  ex: number, ey: number, er: number,
  color: FactionPalette, size: number,
): void {
  const p = color.primary;

  // 1. Outer metal housing ring
  const housingG = ctx.createRadialGradient(ex, ey, er * 0.7, ex, ey, er);
  housingG.addColorStop(0, '#666666');
  housingG.addColorStop(0.5, '#333333');
  housingG.addColorStop(1, '#1a1a1a');
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fillStyle = housingG;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#000000';
  ctx.stroke();

  // 2. Glass lens element — offset specular gradient for glass reflection
  const lensG = ctx.createRadialGradient(
    ex - er * 0.2, ey - er * 0.2, 0,
    ex, ey, er * 0.78,
  );
  lensG.addColorStop(0, 'rgba(255,255,255,0.7)');
  lensG.addColorStop(0.15, withAlpha(lightenColor(p, 50), 0.8));
  lensG.addColorStop(0.4, withAlpha(p, 0.7));
  lensG.addColorStop(0.7, withAlpha(darkenColor(p, 30), 0.8));
  lensG.addColorStop(1.0, darkenColor(p, 60));
  ctx.beginPath();
  ctx.arc(ex, ey, er * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = lensG;
  ctx.fill();

  // 3. Iris ring — stroke only
  ctx.beginPath();
  ctx.arc(ex, ey, er * 0.45, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(darkenColor(p, 40), 0.6);
  ctx.lineWidth = er * 0.06;
  ctx.stroke();

  // 4. Pupil (dark center)
  ctx.beginPath();
  ctx.arc(ex, ey, er * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0a0a';
  ctx.fill();

  // 5. Sensor glow (bright center dot)
  ctx.save();
  ctx.shadowBlur = er * 0.3;
  ctx.shadowColor = p;
  ctx.beginPath();
  ctx.arc(ex, ey, er * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(lightenColor(p, 70), 0.9);
  ctx.fill();
  ctx.restore();

  // 6. Primary specular highlight (glass reflection)
  ctx.beginPath();
  ctx.arc(ex - er * 0.22, ey - er * 0.22, er * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();

  // 7. Secondary specular (smaller)
  ctx.beginPath();
  ctx.arc(ex - er * 0.08, ey - er * 0.32, er * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();

  // 8. Housing rim highlight (upper arc)
  ctx.beginPath();
  ctx.arc(ex, ey, er * 0.95, -Math.PI * 1.2, -Math.PI * 0.3);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
// EYES — 10 Wall-E inspired eye types
// ═══════════════════════════════════════════════════════════════

function drawEyes(dc: DrawContext): void {
  const { ctx, cx, cy, faceRadius, color, config, size } = dc;
  const p = color.primary;

  const eyeY = cy - faceRadius * 0.1;
  const eyeSpacing = faceRadius * 0.55;
  const leftEyeX = cx - eyeSpacing;
  const rightEyeX = cx + eyeSpacing;
  const eyeRadius = faceRadius * 0.28;

  switch (config.eyeType) {

    // ── BINOCULAR — WALL-E's signature camera lens eyes ───────
    case 'binocular': {
      // Draw both camera lens eyes
      drawCameraLensEye(ctx, leftEyeX, eyeY, eyeRadius, color, size);
      drawCameraLensEye(ctx, rightEyeX, eyeY, eyeRadius, color, size);

      // Bridge bar connecting the two eyes
      const barLeft = leftEyeX + eyeRadius;
      const barRight = rightEyeX - eyeRadius;
      const barH = eyeRadius * 0.16;

      // Dark metal bar
      ctx.beginPath();
      ctx.rect(barLeft, eyeY - barH / 2, barRight - barLeft, barH);
      const barG = ctx.createLinearGradient(barLeft, eyeY, barRight, eyeY);
      barG.addColorStop(0, '#444444');
      barG.addColorStop(0.5, '#333333');
      barG.addColorStop(1, '#444444');
      ctx.fillStyle = barG;
      ctx.fill();

      // Top edge highlight on bridge
      ctx.beginPath();
      ctx.moveTo(barLeft, eyeY - barH / 2);
      ctx.lineTo(barRight, eyeY - barH / 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
    }

    // ── LED_VISOR — EVE's single glowing LED bar ──────────────
    case 'led_visor': {
      const visorW = faceRadius * 1.1;
      const visorH = eyeRadius * 0.7;
      const visorR = eyeRadius * 0.3;
      const vx = cx - visorW / 2;
      const vy = eyeY - visorH / 2;

      // 1. Visor housing (dark recessed slot)
      ctx.beginPath();
      rrect(ctx, vx - 2, vy - 2, visorW + 4, visorH + 4, visorR + 1);
      ctx.fillStyle = '#111111';
      ctx.fill();
      ctx.beginPath();
      rrect(ctx, vx - 2, vy - 2, visorW + 4, visorH + 4, visorR + 1);
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // 2. Glow bloom layer (drawn BEFORE LED bar)
      const bloomW = visorW * 1.5;
      const bloomH = visorH * 3;
      const bloomG = ctx.createRadialGradient(cx, eyeY, 0, cx, eyeY, bloomW * 0.6);
      bloomG.addColorStop(0, withAlpha(p, 0.2));
      bloomG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bloomG;
      ctx.fillRect(cx - bloomW / 2, eyeY - bloomH / 2, bloomW, bloomH);

      // 3. LED bar — with HEAVY glow (draw twice: once for bloom, once crisp)
      // First pass: glow
      ctx.save();
      ctx.shadowBlur = eyeRadius * 0.8;
      ctx.shadowColor = p;
      ctx.beginPath();
      rrect(ctx, vx, vy, visorW, visorH, visorR);
      ctx.fillStyle = withAlpha(p, 0.85);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.restore();

      // Second pass: crisp bar on top
      ctx.beginPath();
      rrect(ctx, vx, vy, visorW, visorH, visorR);
      ctx.fillStyle = withAlpha(p, 0.85);
      ctx.fill();

      // 4. Bright center zone
      const centerW = visorW * 0.6;
      const centerH = visorH * 0.6;
      ctx.beginPath();
      rrect(ctx, cx - centerW / 2, eyeY - centerH / 2, centerW, centerH, centerH / 2);
      ctx.fillStyle = withAlpha(lightenColor(p, 50), 0.4);
      ctx.fill();

      // 5. Specular streak across top
      ctx.beginPath();
      ctx.moveTo(vx + visorR, vy + 1);
      ctx.lineTo(vx + visorW - visorR, vy + 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
    }

    // ── DOT_SENSORS — M-O's big round glowing circles ─────────
    case 'dot_sensors': {
      [leftEyeX, rightEyeX].forEach((ex) => {
        // 1. Glow bloom (behind everything)
        const bloomG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeRadius * 1.5);
        bloomG.addColorStop(0, withAlpha(p, 0.25));
        bloomG.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bloomG;
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 2. Main sensor disc
        ctx.save();
        ctx.shadowBlur = eyeRadius * 0.5;
        ctx.shadowColor = p;
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        const sensorG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeRadius);
        sensorG.addColorStop(0, withAlpha(lightenColor(p, 60), 0.95));
        sensorG.addColorStop(0.4, withAlpha(lightenColor(p, 30), 0.9));
        sensorG.addColorStop(0.7, withAlpha(p, 0.85));
        sensorG.addColorStop(1.0, withAlpha(darkenColor(p, 20), 0.8));
        ctx.fillStyle = sensorG;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();
        ctx.restore();

        // 3. Primary specular highlight
        ctx.beginPath();
        ctx.arc(ex - eyeRadius * 0.2, eyeY - eyeRadius * 0.2, eyeRadius * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();

        // 4. Secondary highlight (dimmer)
        ctx.beginPath();
        ctx.arc(ex + eyeRadius * 0.1, eyeY + eyeRadius * 0.25, eyeRadius * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fill();

        // 5. Outer mounting ring
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 1.02, 0, Math.PI * 2);
        ctx.strokeStyle = darkenColor(p, 30);
        ctx.lineWidth = eyeRadius * 0.05;
        ctx.stroke();
      });
      break;
    }

    // ── CAMERA_LENS — Single giant centered eye (AUTO-inspired) ─
    case 'camera_lens': {
      const clR = eyeRadius * 1.6; // bigger than normal eyes

      // Outer barrel housing
      const barrelG = ctx.createRadialGradient(cx, eyeY, clR * 0.7, cx, eyeY, clR);
      barrelG.addColorStop(0, '#666666');
      barrelG.addColorStop(0.5, '#333333');
      barrelG.addColorStop(1, '#1a1a1a');
      ctx.beginPath();
      ctx.arc(cx, eyeY, clR, 0, Math.PI * 2);
      ctx.fillStyle = barrelG;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      // Glass element — offset specular for glass depth
      const glassG = ctx.createRadialGradient(
        cx - clR * 0.2, eyeY - clR * 0.2, 0,
        cx, eyeY, clR * 0.78,
      );
      glassG.addColorStop(0, 'rgba(255,255,255,0.7)');
      glassG.addColorStop(0.15, withAlpha(lightenColor(p, 50), 0.8));
      glassG.addColorStop(0.4, withAlpha(p, 0.7));
      glassG.addColorStop(0.7, withAlpha(darkenColor(p, 30), 0.8));
      glassG.addColorStop(1.0, darkenColor(p, 60));
      ctx.beginPath();
      ctx.arc(cx, eyeY, clR * 0.78, 0, Math.PI * 2);
      ctx.fillStyle = glassG;
      ctx.fill();

      // Second glass ring — lens element separation
      ctx.beginPath();
      ctx.arc(cx, eyeY, clR * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(darkenColor(p, 25), 0.4);
      ctx.lineWidth = clR * 0.04;
      ctx.stroke();

      // Aperture ring
      ctx.beginPath();
      ctx.arc(cx, eyeY, clR * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(darkenColor(p, 40), 0.6);
      ctx.lineWidth = clR * 0.06;
      ctx.stroke();

      // Pupil
      ctx.beginPath();
      ctx.arc(cx, eyeY, clR * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();

      // Sensor glow
      ctx.save();
      ctx.shadowBlur = clR * 0.4;
      ctx.shadowColor = p;
      ctx.beginPath();
      ctx.arc(cx, eyeY, clR * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(lightenColor(p, 70), 0.9);
      ctx.fill();
      ctx.restore();

      // Primary specular highlight
      ctx.beginPath();
      ctx.arc(cx - clR * 0.22, eyeY - clR * 0.22, clR * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();

      // Secondary specular
      ctx.beginPath();
      ctx.arc(cx - clR * 0.08, eyeY - clR * 0.32, clR * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();

      // Housing rim highlight
      ctx.beginPath();
      ctx.arc(cx, eyeY, clR * 0.95, -Math.PI * 1.2, -Math.PI * 0.3);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }

    // ── SCANNER_BAR — Horizontal scanning laser line ────────
    case 'scanner_bar': {
      const scanW = faceRadius * 1.2;
      const scanLeft = cx - scanW / 2;

      // Glow layers (draw FIRST) — 4 rectangles, large to small
      [
        { h: 20, a: 0.04 },
        { h: 14, a: 0.08 },
        { h: 8,  a: 0.15 },
        { h: 4,  a: 0.30 },
      ].forEach(({ h, a }) => {
        ctx.fillStyle = withAlpha(p, a);
        ctx.fillRect(scanLeft, eyeY - h / 2, scanW, h);
      });

      // Main scan line — 2.5px tall rounded rect
      const scanH = 2.5;
      const scanR = scanH / 2;
      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = p;
      ctx.beginPath();
      rrect(ctx, scanLeft, eyeY - scanH / 2, scanW, scanH, scanR);
      ctx.fillStyle = withAlpha(p, 0.9);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.restore();

      // Bright sweep spot — 15% of width, seed-positioned
      const sweepRng = seededRandom(config.serialSuffix + 'sweep');
      const sweepX = scanLeft + sweepRng() * scanW * 0.7 + scanW * 0.15;
      const sweepW = scanW * 0.15;
      const sweepG = ctx.createRadialGradient(sweepX, eyeY, 0, sweepX, eyeY, sweepW);
      sweepG.addColorStop(0, withAlpha(lightenColor(p, 50), 0.5));
      sweepG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sweepG;
      ctx.fillRect(sweepX - sweepW, eyeY - 6, sweepW * 2, 12);

      // Reflection lines ±5px
      ctx.strokeStyle = withAlpha(p, 0.02);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(scanLeft, eyeY - 5);
      ctx.lineTo(scanLeft + scanW, eyeY - 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(scanLeft, eyeY + 5);
      ctx.lineTo(scanLeft + scanW, eyeY + 5);
      ctx.stroke();
      break;
    }

    // ── PIXEL_DISPLAY — LED matrix grid eyes (paired) ───────
    case 'pixel_display': {
      const pxSize = eyeRadius * 0.18;
      const pxGap = eyeRadius * 0.04;
      const cols = 4;
      const rows = 3;
      const gridW = cols * pxSize + (cols - 1) * pxGap;
      const gridH = rows * pxSize + (rows - 1) * pxGap;

      // Seed picks pattern: 0=round/cross, 1=wide, 2=narrow
      const patRng = seededRandom(config.serialSuffix + 'pxpat');
      const patType = Math.floor(patRng() * 3);

      // Pattern masks — true = lit pixel
      const getPixelLit = (row: number, col: number): boolean => {
        switch (patType) {
          case 0: // cross shape: center 2×2 + 4 cardinal
            if (row === 1 && (col === 1 || col === 2)) return true;
            if ((row === 0 || row === 2) && (col === 1 || col === 2)) return true;
            return false;
          case 1: // wide: all except 4 corners
            if ((row === 0 || row === 2) && (col === 0 || col === 3)) return false;
            return true;
          case 2: // narrow: only center row
            return row === 1;
          default: return true;
        }
      };

      [leftEyeX, rightEyeX].forEach((ex) => {
        const gx = ex - gridW / 2;
        const gy = eyeY - gridH / 2;

        // Background panel
        ctx.beginPath();
        rrect(ctx, gx - 2, gy - 2, gridW + 4, gridH + 4, 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        // Draw pixels
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const px = gx + c * (pxSize + pxGap);
            const py = gy + r * (pxSize + pxGap);
            const lit = getPixelLit(r, c);

            if (lit) {
              ctx.save();
              ctx.shadowBlur = 3;
              ctx.shadowColor = p;
              ctx.fillStyle = withAlpha(p, 0.85);
              ctx.fillRect(px, py, pxSize, pxSize);
              ctx.restore();
            } else {
              ctx.fillStyle = withAlpha(p, 0.05);
              ctx.fillRect(px, py, pxSize, pxSize);
            }
          }
        }
      });
      break;
    }

    // ── RING_OPTIC — Hollow glowing ring eyes (paired) ──────
    case 'ring_optic': {
      const ringStroke = eyeRadius * 0.15;

      [leftEyeX, rightEyeX].forEach((ex) => {
        // Glow halo (draw before ring)
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = p;
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = '#050505';
        ctx.globalAlpha = 0.95;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;

        // Inner void — dark barrel
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = '#050505';
        ctx.globalAlpha = 0.95;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Main ring — faction color stroke
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.7, 0, Math.PI * 2);
        ctx.strokeStyle = withAlpha(p, 0.85);
        ctx.lineWidth = ringStroke;
        ctx.stroke();

        // Metallic ring shading — bright top edge
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.7, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.strokeStyle = withAlpha(lightenColor(p, 30), 0.4);
        ctx.lineWidth = ringStroke;
        ctx.stroke();

        // Dark bottom edge
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.7, Math.PI * 0.2, Math.PI * 0.8);
        ctx.strokeStyle = withAlpha(darkenColor(p, 20), 0.4);
        ctx.lineWidth = ringStroke;
        ctx.stroke();

        // Specular — tiny bright arc at 11 o'clock
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.7, -Math.PI * 0.75, -Math.PI * 0.6);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = ringStroke * 0.5;
        ctx.stroke();
      });
      break;
    }

    // ── SLIT_VISOR — Narrow menacing horizontal slit (Cylon) ─
    case 'slit_visor': {
      const slitFullW = faceRadius * 1.2;
      const housingH = 12;
      const slitH = 3;
      const slitR = slitH / 2;
      const sx = cx - slitFullW / 2;

      // Glow bloom — radial gradient BEFORE housing
      const bloomG = ctx.createRadialGradient(cx, eyeY, 0, cx, eyeY, slitFullW * 0.5);
      bloomG.addColorStop(0, withAlpha(p, 0.12));
      bloomG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bloomG;
      ctx.fillRect(sx - 10, eyeY - housingH, slitFullW + 20, housingH * 2);

      // Dark housing — recessed slot
      ctx.beginPath();
      rrect(ctx, sx, eyeY - housingH / 2, slitFullW, housingH, 3);
      ctx.fillStyle = '#0d0d0d';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      // Slit — bright bar inside housing with HEAVY glow
      const slitInset = 4;
      const slitW = slitFullW - slitInset * 2;
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = p;
      ctx.beginPath();
      rrect(ctx, sx + slitInset, eyeY - slitH / 2, slitW, slitH, slitR);
      // Gradient: brighter center → dimmer ends
      const slitG = ctx.createLinearGradient(sx + slitInset, eyeY, sx + slitInset + slitW, eyeY);
      slitG.addColorStop(0, withAlpha(p, 0.6));
      slitG.addColorStop(0.3, withAlpha(lightenColor(p, 40), 0.9));
      slitG.addColorStop(0.5, withAlpha(lightenColor(p, 40), 0.9));
      slitG.addColorStop(0.7, withAlpha(lightenColor(p, 40), 0.9));
      slitG.addColorStop(1, withAlpha(p, 0.6));
      ctx.fillStyle = slitG;
      ctx.fill();
      ctx.restore();

      // Top edge highlight
      ctx.beginPath();
      ctx.moveTo(sx + slitInset + slitR, eyeY - slitH / 2);
      ctx.lineTo(sx + slitInset + slitW - slitR, eyeY - slitH / 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Bottom edge shadow
      ctx.beginPath();
      ctx.moveTo(sx + slitInset + slitR, eyeY + slitH / 2);
      ctx.lineTo(sx + slitInset + slitW - slitR, eyeY + slitH / 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
    }

    // ── COMPOUND — Insect compound eye cluster (paired) ─────
    case 'compound': {
      const centerR = eyeRadius * 0.4;
      const outerR = eyeRadius * 0.28;
      const ringDist = eyeRadius * 0.52;
      const compRng = seededRandom(config.serialSuffix + 'compound');
      // Seed determines how many surround lenses: 5, 6, or 7
      const numOuter = 5 + Math.floor(compRng() * 3);

      // Helper: draw one compound lens
      const drawCompoundLens = (lx: number, ly: number, lr: number) => {
        // Dark outer ring
        const outerG = ctx.createRadialGradient(lx, ly, lr * 0.6, lx, ly, lr);
        outerG.addColorStop(0, '#555555');
        outerG.addColorStop(0.6, '#333333');
        outerG.addColorStop(1, '#1a1a1a');
        ctx.beginPath();
        ctx.arc(lx, ly, lr, 0, Math.PI * 2);
        ctx.fillStyle = outerG;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        // Glass fill with offset specular
        const glassG = ctx.createRadialGradient(
          lx - lr * 0.2, ly - lr * 0.2, 0,
          lx, ly, lr * 0.8,
        );
        glassG.addColorStop(0, 'rgba(255,255,255,0.5)');
        glassG.addColorStop(0.2, withAlpha(lightenColor(p, 40), 0.7));
        glassG.addColorStop(0.5, withAlpha(p, 0.6));
        glassG.addColorStop(1, withAlpha(darkenColor(p, 30), 0.7));
        ctx.beginPath();
        ctx.arc(lx, ly, lr * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = glassG;
        ctx.fill();

        // Dark pupil center
        ctx.beginPath();
        ctx.arc(lx, ly, lr * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();

        // Highlight dot
        ctx.beginPath();
        ctx.arc(lx - lr * 0.2, ly - lr * 0.2, lr * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
      };

      [leftEyeX, rightEyeX].forEach((ex) => {
        // Overall glow behind cluster
        ctx.save();
        ctx.shadowBlur = 6;
        ctx.shadowColor = p;

        // Surround lenses first (behind center)
        for (let i = 0; i < numOuter; i++) {
          const a = (Math.PI * 2 / numOuter) * i - Math.PI / 2;
          const lx = ex + Math.cos(a) * ringDist;
          const ly = eyeY + Math.sin(a) * ringDist;
          drawCompoundLens(lx, ly, outerR);
        }

        // Center lens (on top, larger)
        drawCompoundLens(ex, eyeY, centerR);
        ctx.restore();
      });
      break;
    }

    // ── PROJECTOR — Rectangular projector lens (single center) ─
    case 'projector': {
      const projW = faceRadius * 0.7;
      const projH = faceRadius * 0.35;
      const projR = size * 0.02;
      const projX = cx - projW / 2;
      const projY = eyeY - projH / 2;

      // Projection rays FIRST (behind housing) — 4-6 lines from corners
      const rayRng = seededRandom(config.serialSuffix + 'rays');
      const numRays = 4 + Math.floor(rayRng() * 3); // 4-6
      ctx.lineWidth = 1;
      for (let i = 0; i < numRays; i++) {
        const t = i / (numRays - 1); // 0 to 1 across width
        const rx = projX + t * projW;
        const ry = (i < numRays / 2) ? projY : projY + projH; // top or bottom edge
        const angle = (rayRng() - 0.5) * Math.PI * 0.6 + (ry < eyeY ? -Math.PI / 2 : Math.PI / 2);
        const rayLen = 15 + rayRng() * 5; // 15-20px
        const rayG = ctx.createLinearGradient(rx, ry, rx + Math.cos(angle) * rayLen, ry + Math.sin(angle) * rayLen);
        rayG.addColorStop(0, withAlpha(p, 0.2));
        rayG.addColorStop(1, withAlpha(p, 0));
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(angle) * rayLen, ry + Math.sin(angle) * rayLen);
        ctx.strokeStyle = rayG;
        ctx.stroke();
      }

      // Lens housing — dark metallic frame
      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = p;
      ctx.beginPath();
      rrect(ctx, projX, projY, projW, projH, projR);
      const frameG = ctx.createLinearGradient(cx, projY, cx, projY + projH);
      frameG.addColorStop(0, '#4a4a4a');
      frameG.addColorStop(0.3, '#333333');
      frameG.addColorStop(0.7, '#2a2a2a');
      frameG.addColorStop(1, '#1e1e1e');
      ctx.fillStyle = frameG;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
      ctx.restore();

      // Frame stroke
      ctx.beginPath();
      rrect(ctx, projX, projY, projW, projH, projR);
      ctx.strokeStyle = '#555555';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Lens interior — inset 2px
      const lensInset = 2;
      const lensX = projX + lensInset;
      const lensY = projY + lensInset;
      const lensW = Math.max(0.5, projW - lensInset * 2);
      const lensH = Math.max(0.5, projH - lensInset * 2);
      ctx.beginPath();
      rrect(ctx, lensX, lensY, lensW, lensH, projR * 0.6);
      const lensRadius = Math.max(0.5, Math.max(lensW, lensH) * 0.6);
      const lensG = ctx.createRadialGradient(cx, eyeY, 0, cx, eyeY, lensRadius);
      lensG.addColorStop(0, 'rgba(255,255,255,0.6)');
      lensG.addColorStop(0.3, withAlpha(lightenColor(p, 40), 0.7));
      lensG.addColorStop(0.7, withAlpha(p, 0.8));
      lensG.addColorStop(1, withAlpha(darkenColor(p, 20), 0.6));
      ctx.fillStyle = lensG;
      ctx.fill();

      // Center hotspot — small ellipse
      const hotspotRx = Math.max(0.5, lensW * 0.12);
      const hotspotRy = Math.max(0.5, lensH * 0.2);
      ctx.beginPath();
      ctx.ellipse(cx, eyeY, hotspotRx, hotspotRy, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();

      // Frame top highlight
      ctx.beginPath();
      ctx.moveTo(projX + projR, projY + 0.5);
      ctx.lineTo(projX + projW - projR, projY + 0.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
    }

    // ═══════════════════════════════════════════════════════════
    // HUMAN ANDROID EYES — 12 styles (Phase 4A)
    // White-sclera group: real human eyes on robot bodies
    // Dark-sclera group: glowing alien-android eyes
    // ═══════════════════════════════════════════════════════════

    // ── ROUND_WIDE — Big round open eyes, friendly android ──
    case 'round_wide': {
      [leftEyeX, rightEyeX].forEach((ex) => {
        // White sclera with spherical gradient
        const scleraG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeRadius);
        scleraG.addColorStop(0, 'rgb(255,255,255)');
        scleraG.addColorStop(0.95, 'rgb(235,235,240)');
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = scleraG;
        ctx.fill();

        // Upper lid shadow — crescent across top 120°
        ctx.save();
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.clip();
        const lidShadow = ctx.createLinearGradient(ex, eyeY - eyeRadius, ex, eyeY - eyeRadius * 0.4);
        lidShadow.addColorStop(0, 'rgba(0,0,0,0.12)');
        lidShadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lidShadow;
        ctx.fillRect(ex - eyeRadius, eyeY - eyeRadius, eyeRadius * 2, eyeRadius);
        ctx.restore();

        // Iris
        const irisR = eyeRadius * 0.55;
        const irisG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, irisR);
        irisG.addColorStop(0, darkenColor(p, 10));
        irisG.addColorStop(1, darkenColor(p, 40));
        ctx.beginPath();
        ctx.arc(ex, eyeY, irisR, 0, Math.PI * 2);
        ctx.fillStyle = irisG;
        ctx.fill();

        // Iris striations
        ctx.strokeStyle = withAlpha(p, 0.08);
        ctx.lineWidth = 0.3;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(ex + Math.cos(a) * eyeRadius * 0.12, eyeY + Math.sin(a) * eyeRadius * 0.12);
          ctx.lineTo(ex + Math.cos(a) * irisR * 0.95, eyeY + Math.sin(a) * irisR * 0.95);
          ctx.stroke();
        }

        // Pupil
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();

        // Primary specular highlight
        ctx.beginPath();
        ctx.arc(ex - eyeRadius * 0.18, eyeY - eyeRadius * 0.18, eyeRadius * 0.14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fill();

        // Secondary highlight
        ctx.beginPath();
        ctx.arc(ex + eyeRadius * 0.1, eyeY + eyeRadius * 0.22, eyeRadius * 0.06, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();
      });
      break;
    }

    // ── ROUND_NARROW — Squinted/narrowed, calculating ──────
    case 'round_narrow': {
      [leftEyeX, rightEyeX].forEach((ex) => {
        // Clip to narrow ellipse
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, eyeRadius, eyeRadius * 0.6, 0, 0, Math.PI * 2);
        ctx.clip();

        // White sclera (full circle, clipped to ellipse)
        const scleraG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeRadius);
        scleraG.addColorStop(0, 'rgb(255,255,255)');
        scleraG.addColorStop(0.95, 'rgb(235,235,240)');
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = scleraG;
        ctx.fill();

        // Upper lid shadow
        const lidShadow = ctx.createLinearGradient(ex, eyeY - eyeRadius * 0.6, ex, eyeY - eyeRadius * 0.2);
        lidShadow.addColorStop(0, 'rgba(0,0,0,0.12)');
        lidShadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lidShadow;
        ctx.fillRect(ex - eyeRadius, eyeY - eyeRadius, eyeRadius * 2, eyeRadius);

        // Iris
        const irisR = eyeRadius * 0.5;
        const irisG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, irisR);
        irisG.addColorStop(0, darkenColor(p, 10));
        irisG.addColorStop(1, darkenColor(p, 40));
        ctx.beginPath();
        ctx.arc(ex, eyeY, irisR, 0, Math.PI * 2);
        ctx.fillStyle = irisG;
        ctx.fill();

        // Iris striations
        ctx.strokeStyle = withAlpha(p, 0.08);
        ctx.lineWidth = 0.3;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(ex + Math.cos(a) * eyeRadius * 0.1, eyeY + Math.sin(a) * eyeRadius * 0.1);
          ctx.lineTo(ex + Math.cos(a) * irisR * 0.95, eyeY + Math.sin(a) * irisR * 0.95);
          ctx.stroke();
        }

        // Pupil
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();

        // Specular
        ctx.beginPath();
        ctx.arc(ex - eyeRadius * 0.15, eyeY - eyeRadius * 0.12, eyeRadius * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fill();

        ctx.restore();

        ctx.beginPath();
        ctx.ellipse(ex, eyeY, eyeRadius, eyeRadius * 0.6, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      break;
    }

    // ── ALMOND — Elegant almond shape, sophisticated android ──
    case 'almond': {
      [leftEyeX, rightEyeX].forEach((ex) => {
        const rx = eyeRadius * 1.15;
        const ry = eyeRadius * 0.7;

        // Almond shape with bezier for tapered corners
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(ex - rx, eyeY);
        ctx.bezierCurveTo(ex - rx * 0.6, eyeY - ry * 1.3, ex + rx * 0.6, eyeY - ry * 1.3, ex + rx, eyeY);
        ctx.bezierCurveTo(ex + rx * 0.6, eyeY + ry * 1.1, ex - rx * 0.6, eyeY + ry * 1.1, ex - rx, eyeY);
        ctx.closePath();
        ctx.clip();

        // White sclera
        const scleraG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, rx);
        scleraG.addColorStop(0, 'rgb(255,255,255)');
        scleraG.addColorStop(0.95, 'rgb(235,235,240)');
        ctx.fillStyle = scleraG;
        ctx.fillRect(ex - rx, eyeY - ry * 1.3, rx * 2, ry * 2.6);
        ctx.beginPath();
        ctx.moveTo(ex - rx, eyeY);
        ctx.bezierCurveTo(ex - rx * 0.6, eyeY - ry * 1.3, ex + rx * 0.6, eyeY - ry * 1.3, ex + rx, eyeY);
        ctx.bezierCurveTo(ex + rx * 0.6, eyeY + ry * 1.1, ex - rx * 0.6, eyeY + ry * 1.1, ex - rx, eyeY);
        ctx.closePath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#888888';
        ctx.stroke();

        // Upper lid shadow
        const lidShadow = ctx.createLinearGradient(ex, eyeY - ry * 1.3, ex, eyeY - ry * 0.3);
        lidShadow.addColorStop(0, 'rgba(0,0,0,0.12)');
        lidShadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lidShadow;
        ctx.fillRect(ex - rx, eyeY - ry * 1.3, rx * 2, ry * 1.3);

        // Iris
        const irisR = eyeRadius * 0.48;
        const irisG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, irisR);
        irisG.addColorStop(0, darkenColor(p, 10));
        irisG.addColorStop(1, darkenColor(p, 40));
        ctx.beginPath();
        ctx.arc(ex, eyeY, irisR, 0, Math.PI * 2);
        ctx.fillStyle = irisG;
        ctx.fill();

        // Iris striations
        ctx.strokeStyle = withAlpha(p, 0.08);
        ctx.lineWidth = 0.3;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(ex + Math.cos(a) * eyeRadius * 0.1, eyeY + Math.sin(a) * eyeRadius * 0.1);
          ctx.lineTo(ex + Math.cos(a) * irisR * 0.95, eyeY + Math.sin(a) * irisR * 0.95);
          ctx.stroke();
        }

        // Pupil
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();

        // Specular
        ctx.beginPath();
        ctx.arc(ex - eyeRadius * 0.15, eyeY - eyeRadius * 0.15, eyeRadius * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.70)';
        ctx.fill();

        ctx.restore();

        // Lid outlines
        ctx.beginPath();
        ctx.moveTo(ex - rx, eyeY);
        ctx.bezierCurveTo(ex - rx * 0.6, eyeY - ry * 1.3, ex + rx * 0.6, eyeY - ry * 1.3, ex + rx, eyeY);
        ctx.strokeStyle = withAlpha(darkenColor(p, 40), 0.2);
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(ex - rx, eyeY);
        ctx.bezierCurveTo(ex - rx * 0.6, eyeY + ry * 1.1, ex + rx * 0.6, eyeY + ry * 1.1, ex + rx, eyeY);
        ctx.strokeStyle = withAlpha(darkenColor(p, 40), 0.1);
        ctx.lineWidth = 0.4;
        ctx.stroke();
      });
      break;
    }

    // ── DROOPY — Gentle downturned, empathetic android ──────
    case 'droopy': {
      const DROOPY_SCLERA_WIDTH = eyeRadius * 1.9;
      const DROOPY_SCLERA_HEIGHT = eyeRadius * 1.9;
      const DROOPY_IRIS_RADIUS = 6;
      const DROOPY_PUPIL_RADIUS = 1.5;
      const DROOPY_HIGHLIGHT_RADIUS = 2.7;

      [leftEyeX, rightEyeX].forEach((ex) => {
        // Layer 1 — Eye socket (sclera + outline)
        const droopyScleraHalfWidth = DROOPY_SCLERA_WIDTH * 0.5;
        const droopyScleraHalfHeight = DROOPY_SCLERA_HEIGHT * 0.5;
        const isLeft = ex < cx;
        const socketInnerX = isLeft ? ex - droopyScleraHalfWidth : ex + droopyScleraHalfWidth;
        const socketOuterX = isLeft ? ex + droopyScleraHalfWidth : ex - droopyScleraHalfWidth;
        const socketDroop = droopyScleraHalfHeight * 0.15;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(socketInnerX, eyeY);
        ctx.bezierCurveTo(
          socketInnerX + (socketOuterX - socketInnerX) * 0.3, eyeY - droopyScleraHalfHeight * 0.7,
          socketInnerX + (socketOuterX - socketInnerX) * 0.7, eyeY - droopyScleraHalfHeight * 0.6,
          socketOuterX, eyeY + socketDroop,
        );
        ctx.bezierCurveTo(
          socketInnerX + (socketOuterX - socketInnerX) * 0.65, eyeY + droopyScleraHalfHeight * 0.55 + socketDroop * 0.6,
          socketInnerX + (socketOuterX - socketInnerX) * 0.35, eyeY + droopyScleraHalfHeight * 0.5,
          socketInnerX, eyeY,
        );
        ctx.closePath();
        ctx.clip();

        const scleraG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, droopyScleraHalfWidth);
        scleraG.addColorStop(0, 'rgb(255,255,255)');
        scleraG.addColorStop(0.95, 'rgb(235,235,240)');
        ctx.fillStyle = scleraG;
        ctx.fillRect(ex - droopyScleraHalfWidth * 1.2, eyeY - droopyScleraHalfHeight, droopyScleraHalfWidth * 2.4, droopyScleraHalfHeight * 2);
        ctx.beginPath();
        ctx.moveTo(socketInnerX, eyeY);
        ctx.bezierCurveTo(
          socketInnerX + (socketOuterX - socketInnerX) * 0.3, eyeY - droopyScleraHalfHeight * 0.7,
          socketInnerX + (socketOuterX - socketInnerX) * 0.7, eyeY - droopyScleraHalfHeight * 0.6,
          socketOuterX, eyeY + socketDroop,
        );
        ctx.bezierCurveTo(
          socketInnerX + (socketOuterX - socketInnerX) * 0.65, eyeY + droopyScleraHalfHeight * 0.55 + socketDroop * 0.6,
          socketInnerX + (socketOuterX - socketInnerX) * 0.35, eyeY + droopyScleraHalfHeight * 0.5,
          socketInnerX, eyeY,
        );
        ctx.closePath();

        const lidShadow = ctx.createLinearGradient(ex, eyeY - droopyScleraHalfHeight * 0.7, ex, eyeY - droopyScleraHalfHeight * 0.1);
        lidShadow.addColorStop(0, 'rgba(0,0,0,0.14)');
        lidShadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lidShadow;
        ctx.fillRect(ex - droopyScleraHalfWidth * 1.2, eyeY - droopyScleraHalfHeight, droopyScleraHalfWidth * 2.4, droopyScleraHalfHeight);
        ctx.restore();

        // Eyeball layer (original style), with smaller pupil
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(socketInnerX, eyeY);
        ctx.bezierCurveTo(
          socketInnerX + (socketOuterX - socketInnerX) * 0.3, eyeY - droopyScleraHalfHeight * 0.7,
          socketInnerX + (socketOuterX - socketInnerX) * 0.7, eyeY - droopyScleraHalfHeight * 0.6,
          socketOuterX, eyeY + socketDroop,
        );
        ctx.bezierCurveTo(
          socketInnerX + (socketOuterX - socketInnerX) * 0.65, eyeY + droopyScleraHalfHeight * 0.55 + socketDroop * 0.6,
          socketInnerX + (socketOuterX - socketInnerX) * 0.35, eyeY + droopyScleraHalfHeight * 0.5,
          socketInnerX, eyeY,
        );
        ctx.closePath();
        ctx.clip();

        const irisG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, DROOPY_IRIS_RADIUS);
        irisG.addColorStop(0, darkenColor(p, 10));
        irisG.addColorStop(1, darkenColor(p, 40));
        ctx.beginPath();
        ctx.arc(ex, eyeY, DROOPY_IRIS_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = irisG;
        ctx.fill();

        ctx.strokeStyle = withAlpha(p, 0.08);
        ctx.lineWidth = 0.3;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(ex + Math.cos(a) * DROOPY_IRIS_RADIUS * 0.2, eyeY + Math.sin(a) * DROOPY_IRIS_RADIUS * 0.2);
          ctx.lineTo(ex + Math.cos(a) * DROOPY_IRIS_RADIUS * 0.95, eyeY + Math.sin(a) * DROOPY_IRIS_RADIUS * 0.95);
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(ex, eyeY, DROOPY_PUPIL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(ex - DROOPY_HIGHLIGHT_RADIUS, eyeY - DROOPY_HIGHLIGHT_RADIUS, DROOPY_HIGHLIGHT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fill();

        ctx.restore();

        // Socket outline on top of eyeball
        ctx.beginPath();
        ctx.moveTo(socketInnerX, eyeY);
        ctx.bezierCurveTo(
          socketInnerX + (socketOuterX - socketInnerX) * 0.3, eyeY - droopyScleraHalfHeight * 0.7,
          socketInnerX + (socketOuterX - socketInnerX) * 0.7, eyeY - droopyScleraHalfHeight * 0.6,
          socketOuterX, eyeY + socketDroop,
        );
        ctx.bezierCurveTo(
          socketInnerX + (socketOuterX - socketInnerX) * 0.65, eyeY + droopyScleraHalfHeight * 0.55 + socketDroop * 0.6,
          socketInnerX + (socketOuterX - socketInnerX) * 0.35, eyeY + droopyScleraHalfHeight * 0.5,
          socketInnerX, eyeY,
        );
        ctx.closePath();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#8a8a8a';
        ctx.stroke();

        // Lid outlines
        ctx.beginPath();
        ctx.moveTo(socketInnerX, eyeY);
        ctx.bezierCurveTo(
          socketInnerX + (socketOuterX - socketInnerX) * 0.3, eyeY - droopyScleraHalfHeight * 0.7,
          socketInnerX + (socketOuterX - socketInnerX) * 0.7, eyeY - droopyScleraHalfHeight * 0.6,
          socketOuterX, eyeY + socketDroop,
        );
        ctx.strokeStyle = withAlpha(darkenColor(p, 40), 0.18);
        ctx.lineWidth = 0.7;
        ctx.stroke();
      });
      break;
    }

    // ── UPSWEPT — Sharp upturned, commanding warrior android ─
    case 'upswept': {
      [leftEyeX, rightEyeX].forEach((ex) => {
        const isLeft = ex < cx;
        const innerX = isLeft ? ex - eyeRadius : ex + eyeRadius;
        const outerX = isLeft ? ex + eyeRadius : ex - eyeRadius;
        const lift = eyeRadius * 0.15;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(innerX, eyeY);
        // Upper lid — sharp upward sweep
        ctx.bezierCurveTo(
          innerX + (outerX - innerX) * 0.3, eyeY - eyeRadius * 0.6,
          innerX + (outerX - innerX) * 0.7, eyeY - eyeRadius * 0.8,
          outerX, eyeY - lift,
        );
        // Lower lid
        ctx.bezierCurveTo(
          innerX + (outerX - innerX) * 0.65, eyeY + eyeRadius * 0.4 - lift * 0.4,
          innerX + (outerX - innerX) * 0.35, eyeY + eyeRadius * 0.5,
          innerX, eyeY,
        );
        ctx.closePath();
        ctx.clip();

        // Sclera
        const scleraG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeRadius);
        scleraG.addColorStop(0, 'rgb(255,255,255)');
        scleraG.addColorStop(0.95, 'rgb(235,235,240)');
        ctx.fillStyle = scleraG;
        ctx.fillRect(ex - eyeRadius * 1.2, eyeY - eyeRadius, eyeRadius * 2.4, eyeRadius * 2);
        ctx.beginPath();
        ctx.moveTo(innerX, eyeY);
        ctx.bezierCurveTo(
          innerX + (outerX - innerX) * 0.3, eyeY - eyeRadius * 0.6,
          innerX + (outerX - innerX) * 0.7, eyeY - eyeRadius * 0.8,
          outerX, eyeY - lift,
        );
        ctx.bezierCurveTo(
          innerX + (outerX - innerX) * 0.65, eyeY + eyeRadius * 0.4 - lift * 0.4,
          innerX + (outerX - innerX) * 0.35, eyeY + eyeRadius * 0.5,
          innerX, eyeY,
        );
        ctx.closePath();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#888888';
        ctx.stroke();

        // Lid shadow
        const lidShadow = ctx.createLinearGradient(ex, eyeY - eyeRadius * 0.8, ex, eyeY - eyeRadius * 0.1);
        lidShadow.addColorStop(0, 'rgba(0,0,0,0.12)');
        lidShadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lidShadow;
        ctx.fillRect(ex - eyeRadius * 1.2, eyeY - eyeRadius, eyeRadius * 2.4, eyeRadius);

        // Iris
        const irisR = eyeRadius * 0.48;
        const irisG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, irisR);
        irisG.addColorStop(0, darkenColor(p, 10));
        irisG.addColorStop(1, darkenColor(p, 40));
        ctx.beginPath();
        ctx.arc(ex, eyeY, irisR, 0, Math.PI * 2);
        ctx.fillStyle = irisG;
        ctx.fill();

        // Striations + pupil + specular
        ctx.strokeStyle = withAlpha(p, 0.08);
        ctx.lineWidth = 0.3;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(ex + Math.cos(a) * eyeRadius * 0.1, eyeY + Math.sin(a) * eyeRadius * 0.1);
          ctx.lineTo(ex + Math.cos(a) * irisR * 0.95, eyeY + Math.sin(a) * irisR * 0.95);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex - eyeRadius * 0.15, eyeY - eyeRadius * 0.12, eyeRadius * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fill();

        ctx.restore();

        // Bold lid outlines
        ctx.beginPath();
        ctx.moveTo(innerX, eyeY);
        ctx.bezierCurveTo(
          innerX + (outerX - innerX) * 0.3, eyeY - eyeRadius * 0.6,
          innerX + (outerX - innerX) * 0.7, eyeY - eyeRadius * 0.8,
          outerX, eyeY - lift,
        );
        ctx.strokeStyle = withAlpha(darkenColor(p, 40), 0.22);
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(innerX, eyeY);
        ctx.bezierCurveTo(
          innerX + (outerX - innerX) * 0.35, eyeY + eyeRadius * 0.5,
          innerX + (outerX - innerX) * 0.65, eyeY + eyeRadius * 0.4 - lift * 0.4,
          outerX, eyeY - lift,
        );
        ctx.strokeStyle = withAlpha(darkenColor(p, 40), 0.1);
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });
      break;
    }

    // ── LARGE_IRIS — Huge dark iris, intense deep eyes ──────
    case 'large_iris': {
      [leftEyeX, rightEyeX].forEach((ex) => {
        // White sclera
        const scleraG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeRadius);
        scleraG.addColorStop(0, 'rgb(255,255,255)');
        scleraG.addColorStop(0.95, 'rgb(235,235,240)');
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = scleraG;
        ctx.fill();

        ctx.strokeStyle = withAlpha(darkenColor(p, 50), 0.15);
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Upper lid shadow
        ctx.save();
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.clip();
        const lidShadow = ctx.createLinearGradient(ex, eyeY - eyeRadius, ex, eyeY - eyeRadius * 0.4);
        lidShadow.addColorStop(0, 'rgba(0,0,0,0.12)');
        lidShadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lidShadow;
        ctx.fillRect(ex - eyeRadius, eyeY - eyeRadius, eyeRadius * 2, eyeRadius);
        ctx.restore();

        // HUGE iris
        const irisR = eyeRadius * 0.78;
        const irisG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, irisR);
        irisG.addColorStop(0, p);
        irisG.addColorStop(1, darkenColor(p, 50));
        ctx.beginPath();
        ctx.arc(ex, eyeY, irisR, 0, Math.PI * 2);
        ctx.fillStyle = irisG;
        ctx.fill();

        // Limbal ring — dark ring at iris edge
        ctx.beginPath();
        ctx.arc(ex, eyeY, irisR, 0, Math.PI * 2);
        ctx.strokeStyle = darkenColor(p, 60);
        ctx.lineWidth = eyeRadius * 0.04;
        ctx.stroke();

        // Iris striations (12 — more detail on larger iris)
        ctx.strokeStyle = withAlpha(p, 0.08);
        ctx.lineWidth = 0.3;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(ex + Math.cos(a) * eyeRadius * 0.15, eyeY + Math.sin(a) * eyeRadius * 0.15);
          ctx.lineTo(ex + Math.cos(a) * irisR * 0.92, eyeY + Math.sin(a) * irisR * 0.92);
          ctx.stroke();
        }

        // Larger pupil
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();

        // Specular on iris
        ctx.beginPath();
        ctx.arc(ex - eyeRadius * 0.2, eyeY - eyeRadius * 0.2, eyeRadius * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fill();

        // Secondary highlight
        ctx.beginPath();
        ctx.arc(ex + eyeRadius * 0.12, eyeY + eyeRadius * 0.2, eyeRadius * 0.06, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fill();
      });
      break;
    }

    // ═══════════════════════════════════════════════════════════
    // DARK SCLERA GROUP — glowing elements in darkness
    // ═══════════════════════════════════════════════════════════

    // ── VOID_EYE — Black sclera, white iris ring, haunting ──
    case 'void_eye': {
      [leftEyeX, rightEyeX].forEach((ex) => {
        // Dark sclera
        const darkG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeRadius);
        darkG.addColorStop(0, '#0a0a0a');
        darkG.addColorStop(1, '#050505');
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = darkG;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();
        ctx.strokeStyle = '#222222';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Iris ring with glow
        const ringR = eyeRadius * 0.5;
        ctx.save();
        ctx.shadowBlur = eyeRadius * 0.3;
        ctx.shadowColor = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(ex, eyeY, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = eyeRadius * 0.08;
        ctx.stroke();
        ctx.restore();

        // Pupil void
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();

        // Specular
        ctx.beginPath();
        ctx.arc(ex - eyeRadius * 0.15, eyeY - eyeRadius * 0.15, eyeRadius * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
      });
      break;
    }

    // ── GLOW_IRIS — Black sclera, softly glowing filled iris ─
    case 'glow_iris': {
      [leftEyeX, rightEyeX].forEach((ex) => {
        // Dark sclera
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#080808';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        // Glow bloom behind iris
        const bloomG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeRadius * 0.7);
        bloomG.addColorStop(0, 'rgba(255,255,255,0.15)');
        bloomG.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = bloomG;
        ctx.fill();

        // Glowing iris
        const irisR = eyeRadius * 0.48;
        ctx.save();
        ctx.shadowBlur = eyeRadius * 0.4;
        ctx.shadowColor = 'rgba(255,255,255,0.25)';
        const irisG = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, irisR);
        irisG.addColorStop(0, 'rgba(255,255,255,0.6)');
        irisG.addColorStop(0.5, lightenColor(p, 30));
        irisG.addColorStop(1, p);
        ctx.beginPath();
        ctx.arc(ex, eyeY, irisR, 0, Math.PI * 2);
        ctx.fillStyle = irisG;
        ctx.fill();
        ctx.restore();

        // Pupil
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();

        // Specular
        ctx.beginPath();
        ctx.arc(ex - eyeRadius * 0.12, eyeY - eyeRadius * 0.12, eyeRadius * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
      });
      break;
    }

    // ── PINPOINT — All dark, tiny bright pupil, watching ─────
    case 'pinpoint': {
      [leftEyeX, rightEyeX].forEach((ex) => {
        // Dark sclera
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#060606';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        // Faint iris hint
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fill();

        // Pinpoint with glow
        ctx.save();
        ctx.shadowBlur = eyeRadius * 0.5;
        ctx.shadowColor = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();
        ctx.restore();
      });
      break;
    }

    // ── CRESCENT — Dark eye with crescent light, mysterious ──
    case 'crescent': {
      [leftEyeX, rightEyeX].forEach((ex) => {
        // Dark sclera
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#080808';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        // Crescent — bright circle then dark overlap to cut
        ctx.save();
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.clip();

        // Bright crescent base with glow
        ctx.save();
        ctx.shadowBlur = eyeRadius * 0.3;
        ctx.shadowColor = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(ex - eyeRadius * 0.05, eyeY, eyeRadius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
        ctx.restore();

        // Dark circle to cut into crescent
        ctx.beginPath();
        ctx.arc(ex + eyeRadius * 0.08, eyeY, eyeRadius * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = '#080808';
        ctx.fill();

        ctx.restore();

        // Pupil
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.15, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
      });
      break;
    }

    // ── RING_EYE — Dark sclera, thin bright ring, deep ──────
    case 'ring_eye': {
      [leftEyeX, rightEyeX].forEach((ex) => {
        // Dark sclera
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#070707';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        // Bright ring with glow
        const ringR = eyeRadius * 0.45;
        ctx.save();
        ctx.shadowBlur = eyeRadius * 0.4;
        ctx.shadowColor = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(ex, eyeY, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = eyeRadius * 0.05;
        ctx.stroke();
        ctx.restore();

        // Micro highlight at 11 o'clock on ring
        const hiAngle = -Math.PI * 0.35;
        ctx.beginPath();
        ctx.arc(
          ex + ringR * Math.cos(hiAngle),
          eyeY + ringR * Math.sin(hiAngle),
          eyeRadius * 0.04, 0, Math.PI * 2,
        );
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
      });
      break;
    }

    // ── SPLIT_TONE — Half light, half dark iris, dual nature ─
    case 'split_tone': {
      [leftEyeX, rightEyeX].forEach((ex) => {
        // Dark sclera
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#080808';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        // Iris — clip to circle, then fill halves
        const irisR = eyeRadius * 0.48;
        ctx.save();
        ctx.beginPath();
        ctx.arc(ex, eyeY, irisR, 0, Math.PI * 2);
        ctx.clip();

        // Left half — light, with glow
        ctx.save();
        ctx.shadowBlur = eyeRadius * 0.2;
        ctx.shadowColor = 'rgba(255,255,255,0.15)';
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillRect(ex - irisR, eyeY - irisR, irisR, irisR * 2);
        ctx.restore();

        // Right half — dark
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(ex, eyeY - irisR, irisR, irisR * 2);

        // Split line
        ctx.beginPath();
        ctx.moveTo(ex, eyeY - irisR);
        ctx.lineTo(ex, eyeY + irisR);
        ctx.strokeStyle = withAlpha(darkenColor(p, 30), 0.3);
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.restore();

        // Pupil spanning both halves
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();

        // Specular on light half
        ctx.beginPath();
        ctx.arc(ex - eyeRadius * 0.12, eyeY - eyeRadius * 0.12, eyeRadius * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();
      });
      break;
    }

    // ── FALLBACK ──
    default: {
      [leftEyeX, rightEyeX].forEach((ex) => {
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeRadius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = p;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();
      });
      break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// MOUTH — 7 types (speaker_grille, vent_slits, data_display,
//         single_slit, jaw_plate, wave_emitter, none)
// ═══════════════════════════════════════════════════════════════

function drawMouth(dc: DrawContext): void {
  const { ctx, cx, cy, faceRadius, color, config, size } = dc;
  const p = color.primary;
  const mouthY = cy + faceRadius * 0.4;

  switch (config.mouthType) {

    // ── SPEAKER_GRILLE — Rectangle with horizontal slits ────
    case 'speaker_grille': {
      const mW = faceRadius * 0.5;
      const mH = faceRadius * 0.25;
      const mR = size * 0.015;
      const mx = cx - mW / 2;
      const my = mouthY - mH / 2;

      // Outer frame with shadow
      ctx.save();
      ctx.shadowBlur = 3;
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      rrect(ctx, mx, my, mW, mH, mR);
      const frameG = ctx.createLinearGradient(cx, my, cx, my + mH);
      frameG.addColorStop(0, '#3a3a3a');
      frameG.addColorStop(0.5, '#252525');
      frameG.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = frameG;
      ctx.fill();
      ctx.restore();

      // Frame stroke
      ctx.beginPath();
      rrect(ctx, mx, my, mW, mH, mR);
      ctx.strokeStyle = '#444444';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Dark interior (inset)
      const inset = 2;
      ctx.beginPath();
      rrect(ctx, mx + inset, my + inset, mW - inset * 2, mH - inset * 2, mR * 0.7);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();

      // Grille bars (4 horizontal lines)
      const innerX = mx + inset + 2;
      const innerW = mW - inset * 2 - 4;
      const innerY = my + inset + 2;
      const innerH = mH - inset * 2 - 4;
      ctx.strokeStyle = withAlpha('#555555', 0.5);
      ctx.lineWidth = faceRadius * 0.012;
      for (let i = 0; i < 4; i++) {
        const ly = innerY + (innerH / 5) * (i + 1);
        ctx.beginPath();
        ctx.moveTo(innerX, ly);
        ctx.lineTo(innerX + innerW, ly);
        ctx.stroke();
      }

      // Frame highlight on top edge
      ctx.beginPath();
      ctx.moveTo(mx + mR, my + 0.5);
      ctx.lineTo(mx + mW - mR, my + 0.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
    }

    // ── VENT_SLITS — 3 horizontal cooling vent slots ────────
    case 'vent_slits': {
      const slitW = faceRadius * 0.4;  // 20% face width
      const slitH = 2;
      const slitGap = 3;
      const slitR = 1;
      const totalH = 3 * slitH + 2 * slitGap;
      const sx = cx - slitW / 2;

      for (let i = 0; i < 3; i++) {
        const sy = mouthY - totalH / 2 + i * (slitH + slitGap);

        // Slot fill — vertical gradient for groove depth
        ctx.beginPath();
        rrect(ctx, sx, sy, slitW, slitH, slitR);
        const slotG = ctx.createLinearGradient(cx, sy, cx, sy + slitH);
        slotG.addColorStop(0, 'rgba(0,0,0,0.4)');
        slotG.addColorStop(1, 'rgba(0,0,0,0.2)');
        ctx.fillStyle = slotG;
        ctx.fill();

        // Bevel highlight — bright line on TOP edge
        ctx.beginPath();
        ctx.moveTo(sx + slitR, sy);
        ctx.lineTo(sx + slitW - slitR, sy);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Bevel shadow — dark line on BOTTOM edge
        ctx.beginPath();
        ctx.moveTo(sx + slitR, sy + slitH);
        ctx.lineTo(sx + slitW - slitR, sy + slitH);
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      break;
    }

    // ── DATA_DISPLAY — Small status screen ──────────────────
    case 'data_display': {
      const ddW = faceRadius * 0.56;   // 28% face width
      const ddH = faceRadius * 0.2;    // 10% face height
      const ddR = size * 0.01;
      const ddX = cx - ddW / 2;
      const ddY = mouthY - ddH / 2;

      // Screen glow — behind everything
      const glowG = ctx.createRadialGradient(cx, mouthY, 0, cx, mouthY, Math.max(ddW, ddH) * 0.75);
      glowG.addColorStop(0, withAlpha(p, 0.08));
      glowG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowG;
      ctx.fillRect(ddX - ddW * 0.25, ddY - ddH * 0.5, ddW * 1.5, ddH * 2);

      // Dark metallic frame
      ctx.beginPath();
      rrect(ctx, ddX, ddY, ddW, ddH, ddR);
      const frmG = ctx.createLinearGradient(cx, ddY, cx, ddY + ddH);
      frmG.addColorStop(0, '#3a3a3a');
      frmG.addColorStop(1, '#222222');
      ctx.fillStyle = frmG;
      ctx.fill();
      ctx.beginPath();
      rrect(ctx, ddX, ddY, ddW, ddH, ddR);
      ctx.strokeStyle = '#444444';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Screen fill — near-black with faction tint
      const scrInset = 1.5;
      const scrX = ddX + scrInset;
      const scrY_d = ddY + scrInset;
      const scrW = ddW - scrInset * 2;
      const scrH = ddH - scrInset * 2;
      ctx.beginPath();
      rrect(ctx, scrX, scrY_d, scrW, scrH, ddR * 0.5);
      ctx.fillStyle = withAlpha(darkenColor(p, 80), 0.95);
      ctx.fill();

      // Scan lines
      ctx.save();
      ctx.beginPath();
      rrect(ctx, scrX, scrY_d, scrW, scrH, ddR * 0.5);
      ctx.clip();
      for (let sy = scrY_d; sy < scrY_d + scrH; sy += 1.5) {
        ctx.beginPath();
        ctx.moveTo(scrX, sy);
        ctx.lineTo(scrX + scrW, sy);
        ctx.strokeStyle = (Math.floor((sy - scrY_d) / 1.5) % 2 === 0)
          ? 'rgba(255,255,255,0.03)'
          : 'rgba(255,255,255,0.01)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Screen content — seed picks pattern
      const mouthRng = seededRandom(config.serialSuffix + 'mouth');
      const contentType = Math.floor(mouthRng() * 3);
      const contentPad = 3;
      const cX = scrX + contentPad;
      const cY = scrY_d + scrH / 2;
      const cW = scrW - contentPad * 2;

      if (contentType === 0) {
        // A: Small text
        const texts = ['042.7', '>>OK', 'RDY', 'SYS+'];
        const txt = texts[Math.floor(mouthRng() * texts.length)];
        const fSize = Math.max(5, size * 0.035);
        ctx.font = `${fSize}px monospace`;
        ctx.fillStyle = withAlpha(p, 0.7);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, cx, cY);
      } else if (contentType === 1) {
        // B: Sine wave, 2 cycles
        ctx.beginPath();
        const amp = scrH * 0.25;
        for (let i = 0; i <= cW; i++) {
          const wx = cX + i;
          const wy = cY + Math.sin((i / cW) * Math.PI * 4) * amp;
          i === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
        }
        ctx.strokeStyle = withAlpha(p, 0.6);
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        // C: 4-5 vertical bars
        const barCount = 4 + Math.floor(mouthRng() * 2);
        const barW = (cW / barCount) * 0.7;
        const barGap = (cW / barCount) * 0.3;
        for (let i = 0; i < barCount; i++) {
          const bx = cX + i * (barW + barGap);
          const bh = (0.3 + mouthRng() * 0.5) * (scrH - 4);
          const by = scrY_d + scrH - 2 - bh;
          ctx.fillStyle = withAlpha(p, 0.4 + mouthRng() * 0.4);
          ctx.fillRect(bx, by, barW, bh);
        }
      }
      ctx.restore();

      // Specular on frame — upper-left
      ctx.beginPath();
      ctx.arc(ddX + ddR + 1.5, ddY + ddR + 1.5, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fill();
      break;
    }

    // ── SINGLE_SLIT — Minimal dark groove ───────────────────
    case 'single_slit': {
      const ssW = faceRadius * 0.36;  // 18% face width
      const ssH = 1.5;
      const ssR = ssH / 2;
      const ssx = cx - ssW / 2;
      const ssy = mouthY - ssH / 2;

      // Shadow above slit
      ctx.beginPath();
      ctx.moveTo(ssx + ssR, ssy - 0.5);
      ctx.lineTo(ssx + ssW - ssR, ssy - 0.5);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Main groove — gradient for depth
      ctx.beginPath();
      rrect(ctx, ssx, ssy, ssW, ssH, ssR);
      const ssG = ctx.createLinearGradient(cx, ssy, cx, ssy + ssH);
      ssG.addColorStop(0, 'rgba(0,0,0,0.4)');
      ssG.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = ssG;
      ctx.fill();

      // Highlight below slit
      ctx.beginPath();
      ctx.moveTo(ssx + ssR, ssy + ssH + 0.5);
      ctx.lineTo(ssx + ssW - ssR, ssy + ssH + 0.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
    }

    // ── JAW_PLATE — Separate metal chin guard ───────────────
    case 'jaw_plate': {
      const jpTopW = faceRadius * 0.6;  // 30% face width
      const jpBotW = faceRadius * 0.44; // 22% face width
      const jpH = faceRadius * 0.24;    // 12% face height
      const jpR = size * 0.02;
      const jpY = mouthY - jpH * 0.3;   // offset slightly above center mouth pos

      // Shadow above plate — proves separate piece
      const shadowG = ctx.createLinearGradient(cx, jpY - 3, cx, jpY);
      shadowG.addColorStop(0, 'rgba(0,0,0,0)');
      shadowG.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = shadowG;
      ctx.fillRect(cx - jpTopW / 2 - 2, jpY - 3, jpTopW + 4, 3);

      // Trapezoid path with rounded corners
      const tl = cx - jpTopW / 2;
      const tr = cx + jpTopW / 2;
      const bl = cx - jpBotW / 2;
      const br = cx + jpBotW / 2;
      ctx.beginPath();
      ctx.moveTo(tl + jpR, jpY);
      ctx.lineTo(tr - jpR, jpY);
      ctx.arcTo(tr, jpY, tr, jpY + jpR, jpR);
      ctx.lineTo(br, jpY + jpH - jpR);
      ctx.arcTo(br, jpY + jpH, br - jpR, jpY + jpH, jpR);
      ctx.lineTo(bl + jpR, jpY + jpH);
      ctx.arcTo(bl, jpY + jpH, bl, jpY + jpH - jpR, jpR);
      ctx.lineTo(tl, jpY + jpR);
      ctx.arcTo(tl, jpY, tl + jpR, jpY, jpR);
      ctx.closePath();

      // Metallic gradient — different shade than body
      const jpBase = darkenColor(p, 15);
      const jpG = ctx.createLinearGradient(cx, jpY, cx, jpY + jpH);
      jpG.addColorStop(0, lightenColor(jpBase, 25));
      jpG.addColorStop(0.3, jpBase);
      jpG.addColorStop(1, darkenColor(jpBase, 25));
      ctx.fillStyle = jpG;
      ctx.fill();

      // Outline
      ctx.beginPath();
      ctx.moveTo(tl + jpR, jpY);
      ctx.lineTo(tr - jpR, jpY);
      ctx.arcTo(tr, jpY, tr, jpY + jpR, jpR);
      ctx.lineTo(br, jpY + jpH - jpR);
      ctx.arcTo(br, jpY + jpH, br - jpR, jpY + jpH, jpR);
      ctx.lineTo(bl + jpR, jpY + jpH);
      ctx.arcTo(bl, jpY + jpH, bl, jpY + jpH - jpR, jpR);
      ctx.lineTo(tl, jpY + jpR);
      ctx.arcTo(tl, jpY, tl + jpR, jpY, jpR);
      ctx.closePath();
      ctx.strokeStyle = darkenColor(p, 45);
      ctx.lineWidth = 0.6;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Gap line at top — dark + bright = separate piece
      ctx.beginPath();
      ctx.moveTo(tl + jpR, jpY + 0.5);
      ctx.lineTo(tr - jpR, jpY + 0.5);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tl + jpR, jpY + 1.5);
      ctx.lineTo(tr - jpR, jpY + 1.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Top edge bevel (brighter)
      ctx.beginPath();
      ctx.moveTo(tl + jpR + 2, jpY + 0.3);
      ctx.lineTo(tr - jpR - 2, jpY + 0.3);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // 2 bolts — left and right
      const boltR = 1.5;
      const boltY = jpY + jpH * 0.45;
      [cx - jpTopW * 0.35, cx + jpTopW * 0.35].forEach((bx) => {
        // Dark ring
        ctx.beginPath();
        ctx.arc(bx, boltY, boltR, 0, Math.PI * 2);
        ctx.fillStyle = darkenColor(p, 35);
        ctx.globalAlpha = 0.4;
        ctx.fill();
        ctx.globalAlpha = 1;
        // Bright center
        ctx.beginPath();
        ctx.arc(bx, boltY, boltR * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fill();
      });
      break;
    }

    // ── WAVE_EMITTER — Circular concentric sound emitter ────
    case 'wave_emitter': {
      const nozzleR = faceRadius * 0.03;

      // 3 concentric rings radiating outward
      const rings = [
        { r: faceRadius * 0.08, alpha: 0.4, lw: 1.2 },
        { r: faceRadius * 0.14, alpha: 0.25, lw: 0.8 },
        { r: faceRadius * 0.20, alpha: 0.12, lw: 0.5 },
      ];
      rings.forEach(({ r, alpha, lw }) => {
        ctx.beginPath();
        ctx.arc(cx, mouthY, r, 0, Math.PI * 2);
        ctx.strokeStyle = withAlpha(p, alpha);
        ctx.lineWidth = lw;
        ctx.stroke();
      });

      // Center nozzle — dark metallic with glow
      ctx.save();
      ctx.shadowBlur = 4;
      ctx.shadowColor = p;
      ctx.beginPath();
      ctx.arc(cx, mouthY, nozzleR, 0, Math.PI * 2);
      const nozG = ctx.createRadialGradient(
        cx - nozzleR * 0.3, mouthY - nozzleR * 0.3, 0,
        cx, mouthY, nozzleR,
      );
      nozG.addColorStop(0, '#666666');
      nozG.addColorStop(0.5, '#333333');
      nozG.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = nozG;
      ctx.fill();
      ctx.restore();

      // Specular on nozzle
      ctx.beginPath();
      ctx.arc(cx - nozzleR * 0.25, mouthY - nozzleR * 0.25, nozzleR * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
      break;
    }

    // ── NONE — No mouth ────────────────────────────────────
    case 'none': {
      // Intentionally empty — many Wall-E robots have no mouth
      break;
    }

    // ── FALLBACK ──
    default:
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// SURFACE DETAILS — panel lines, rivets, surface finish
// ═══════════════════════════════════════════════════════════════

function drawSurfaceDetails(dc: DrawContext): void {
  const { ctx, cx, cy, faceRadius, color, config, size } = dc;

  // Panel lines — thin dark lines suggesting metal plate joins
  ctx.strokeStyle = darkenColor(color.primary, 40);
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = 0.8;

  const lineRng = seededRandom(config.serialSuffix + 'panels');
  for (let i = 0; i < config.panelLineCount; i++) {
    const isHorizontal = lineRng() > 0.5;
    if (isHorizontal) {
      const y = cy + (lineRng() - 0.5) * faceRadius * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - faceRadius * 0.7, y);
      ctx.lineTo(cx + faceRadius * 0.7, y);
      ctx.stroke();
    } else {
      const x = cx + (lineRng() - 0.5) * faceRadius * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, cy - faceRadius * 0.6);
      ctx.lineTo(x, cy + faceRadius * 0.6);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Rivet dots — small metallic rivet heads
  const rivetRng = seededRandom(config.serialSuffix + 'rivets');
  for (let i = 0; i < config.rivetCount; i++) {
    const rx = cx + (rivetRng() - 0.5) * faceRadius * 1.5;
    const ry = cy + (rivetRng() - 0.5) * faceRadius * 1.3;
    // Dark ring
    ctx.beginPath();
    ctx.arc(rx, ry, size * 0.008, 0, Math.PI * 2);
    ctx.fillStyle = darkenColor(color.primary, 30);
    ctx.globalAlpha = 0.3;
    ctx.fill();
    // Bright center
    ctx.beginPath();
    ctx.arc(rx, ry, size * 0.003, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.globalAlpha = 1;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── SURFACE FINISH OVERLAY ──────────────────────────────────
  // Applied after body, before eyes. WALL-E worked 700 years — he's weathered.
  if (config.surfaceFinish === 'clean') return;

  if (config.surfaceFinish === 'weathered' || config.surfaceFinish === 'battle_scarred') {
    // Weathering dots — 20-30 tiny dust/micro-scratch dots
    const weatherRng = seededRandom(config.serialSuffix + 'weather');
    const dotCount = 20 + Math.floor(weatherRng() * 11); // 20-30
    ctx.fillStyle = darkenColor(color.primary, 25);
    for (let i = 0; i < dotCount; i++) {
      const dx = cx + (weatherRng() - 0.5) * faceRadius * 1.6;
      const dy = cy + (weatherRng() - 0.5) * faceRadius * 1.4;
      const dr = 0.5 + weatherRng() * 0.5; // r = 0.5–1 px
      ctx.globalAlpha = 0.03 + weatherRng() * 0.02; // 3–5% opacity per dot
      ctx.beginPath();
      ctx.arc(dx, dy, dr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (config.surfaceFinish === 'battle_scarred') {
    // 2-3 scratch lines — exposed lighter metal beneath paint
    const scarRng = seededRandom(config.serialSuffix + 'scars');
    const scratchCount = 2 + Math.floor(scarRng() * 2); // 2-3
    ctx.strokeStyle = lightenColor(color.primary, 50);
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < scratchCount; i++) {
      const sx1 = cx + (scarRng() - 0.5) * faceRadius * 1.2;
      const sy1 = cy + (scarRng() - 0.5) * faceRadius * 1.0;
      const sx2 = sx1 + (scarRng() - 0.5) * faceRadius * 0.6;
      const sy2 = sy1 + (scarRng() - 0.5) * faceRadius * 0.4;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// ═══════════════════════════════════════════════════════════════
// ACCESSORIES — 12 types
// brow_ridge is drawn via drawBrowRidge() BEFORE eyes (z-order)
// All others drawn via drawAccessories() AFTER eyes
// ═══════════════════════════════════════════════════════════════

/** Draw brow_ridge ONLY — called before eyes for correct z-order */
function drawBrowRidge(dc: DrawContext): void {
  const { ctx, cx, cy, faceRadius, color, config, size } = dc;
  if (!config.accessories.includes('brow_ridge')) return;

  const p = color.primary;
  const browW = faceRadius * 1.4;  // 70% face width
  const browH = faceRadius * 0.09; // ~4-5% face height
  const eyeY = cy - faceRadius * 0.1;
  const browY = eyeY - faceRadius * 0.38; // above eyes

  // Seed determines curve direction
  const browRng = seededRandom(config.serialSuffix + 'brow');
  const curveDir = browRng() > 0.5 ? 1 : -1; // 1=downward ends (angry), -1=upward (surprised)
  const curveDrop = faceRadius * 0.06 * curveDir;

  // Draw curved bar via quadratic curve
  ctx.beginPath();
  ctx.moveTo(cx - browW / 2, browY + curveDrop);
  ctx.quadraticCurveTo(cx, browY - curveDrop * 0.3, cx + browW / 2, browY + curveDrop);
  ctx.lineTo(cx + browW / 2, browY + curveDrop + browH);
  ctx.quadraticCurveTo(cx, browY - curveDrop * 0.3 + browH, cx - browW / 2, browY + curveDrop + browH);
  ctx.closePath();

  // Metallic gradient
  const browG = ctx.createLinearGradient(cx, browY - Math.abs(curveDrop), cx, browY + browH + Math.abs(curveDrop));
  browG.addColorStop(0, lightenColor(p, 25));
  browG.addColorStop(0.5, p);
  browG.addColorStop(1, darkenColor(p, 30));
  ctx.fillStyle = browG;
  ctx.fill();

  // Top highlight
  ctx.beginPath();
  ctx.moveTo(cx - browW / 2 + 2, browY + curveDrop);
  ctx.quadraticCurveTo(cx, browY - curveDrop * 0.3, cx + browW / 2 - 2, browY + curveDrop);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Bottom shadow — casts shadow onto eyes (KEY detail)
  const shadowTop = browY + browH + Math.abs(curveDrop);
  const shadowG = ctx.createLinearGradient(cx, shadowTop, cx, shadowTop + faceRadius * 0.06);
  shadowG.addColorStop(0, 'rgba(0,0,0,0.12)');
  shadowG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowG;
  ctx.fillRect(cx - browW / 2 - 2, shadowTop, browW + 4, faceRadius * 0.06);
}

function drawAccessories(dc: DrawContext): void {
  const { ctx, cx, cy, faceRadius, color, config, size } = dc;
  const p = color.primary;

  for (const acc of config.accessories) {
    switch (acc) {

      // ── ANTENNA — thin rod with ball tip ────────────────────
      case 'antenna': {
        const baseY = cy - faceRadius * 0.95;
        const tipY = baseY - faceRadius * 0.4;

        const rodG = ctx.createLinearGradient(cx, baseY, cx, tipY);
        rodG.addColorStop(0, lightenColor(p, 20));
        rodG.addColorStop(1, darkenColor(p, 15));
        ctx.beginPath();
        ctx.moveTo(cx, baseY);
        ctx.lineTo(cx, tipY);
        ctx.strokeStyle = rodG;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - 0.5, baseY);
        ctx.lineTo(cx - 0.5, tipY);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, baseY, size * 0.008, 0, Math.PI * 2);
        ctx.fillStyle = '#444';
        ctx.fill();

        const tipR = size * 0.015;
        const tipG = ctx.createRadialGradient(cx - tipR * 0.3, tipY - tipR * 0.3, 0, cx, tipY, tipR);
        tipG.addColorStop(0, lightenColor(p, 50));
        tipG.addColorStop(0.4, p);
        tipG.addColorStop(1, darkenColor(p, 35));
        ctx.beginPath();
        ctx.arc(cx, tipY, tipR, 0, Math.PI * 2);
        ctx.fillStyle = tipG;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx - tipR * 0.3, tipY - tipR * 0.3, tipR * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();
        break;
      }

      // ── BEACON_LIGHT — glowing dome on top of head ──────────
      case 'beacon_light': {
        const bx = cx + faceRadius * 0.25;
        const by = cy - faceRadius * 0.92;

        const bloomG = ctx.createRadialGradient(bx, by, 0, bx, by, faceRadius * 0.3);
        bloomG.addColorStop(0, withAlpha(p, 0.15));
        bloomG.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bloomG;
        ctx.beginPath();
        ctx.arc(bx, by, faceRadius * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        rrect(ctx, bx - size * 0.02, by, size * 0.04, size * 0.01, size * 0.003);
        ctx.fillStyle = '#333';
        ctx.fill();

        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = p;
        ctx.beginPath();
        ctx.arc(bx, by, size * 0.015, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = withAlpha(p, 0.9);
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(bx - size * 0.003, by - size * 0.004, size * 0.004, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
        break;
      }

      // ── BOLTS — hex bolt heads on the face ──────────────────
      case 'bolts': {
        const boltRng = seededRandom(config.serialSuffix + 'bolts');
        const boltCount = Math.max(2, config.boltCount);
        const boltR = size * 0.015;

        const positions: [number, number][] = [];
        for (let i = 0; i < boltCount; i++) {
          const angle = boltRng() * Math.PI * 2;
          const dist = faceRadius * (0.65 + boltRng() * 0.25);
          positions.push([cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist]);
        }

        positions.forEach(([bx, by]) => {
          ctx.beginPath();
          hexPath(ctx, bx, by, boltR);
          const boltG = ctx.createRadialGradient(bx, by, 0, bx, by, boltR);
          boltG.addColorStop(0, '#888888');
          boltG.addColorStop(0.7, '#555555');
          boltG.addColorStop(1, '#333333');
          ctx.fillStyle = boltG;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(bx, by, boltR * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(bx - boltR * 0.2, by - boltR * 0.2, boltR * 0.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fill();
        });
        break;
      }

      // ── STATUS_LED — Small indicator light ────────────────
      case 'status_led': {
        const ledRng = seededRandom(config.serialSuffix + 'led');
        // Seed-determined corner: 0=TL, 1=TR, 2=BL, 3=BR
        const corner = Math.floor(ledRng() * 4);
        const ledX = cx + (corner % 2 === 0 ? -1 : 1) * faceRadius * 0.65;
        const ledY = cy + (corner < 2 ? -1 : 1) * faceRadius * 0.55;
        // Color: faction, green, or amber
        const ledColors = [p, '#00ff44', '#ffaa00'];
        const ledColor = ledColors[Math.floor(ledRng() * ledColors.length)];

        // Socket ring
        ctx.beginPath();
        ctx.arc(ledX, ledY, 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#222222';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // LED with glow
        ctx.save();
        ctx.shadowBlur = 6;
        ctx.shadowColor = ledColor;
        ctx.beginPath();
        ctx.arc(ledX, ledY, 2, 0, Math.PI * 2);
        ctx.fillStyle = ledColor;
        ctx.fill();
        ctx.restore();

        // Glass specular
        ctx.beginPath();
        ctx.arc(ledX - 0.6, ledY - 0.6, 0.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fill();
        break;
      }

      // ── SIDE_PANELS — Armor/solar panels on sides ─────────
      case 'side_panels': {
        const spRng = seededRandom(config.serialSuffix + 'panels_acc');
        const panelW = faceRadius * 0.16;  // 8% face
        const panelH = faceRadius * 0.4;   // 20% face
        const tiltDeg = 5 + spRng() * 3;   // 5-8°

        [-1, 1].forEach((side) => {
          const px = cx + side * (faceRadius * 0.95 + panelW / 2);
          const py = cy;

          ctx.save();
          ctx.translate(px, py);
          ctx.rotate((tiltDeg * side * Math.PI) / 180);

          // Panel fill — metallic gradient angled to match
          const panG = ctx.createLinearGradient(-panelW / 2, 0, panelW / 2, 0);
          if (side < 0) {
            panG.addColorStop(0, lightenColor(p, 20));
            panG.addColorStop(1, darkenColor(p, 25));
          } else {
            panG.addColorStop(0, darkenColor(p, 25));
            panG.addColorStop(1, lightenColor(p, 20));
          }
          ctx.beginPath();
          rrect(ctx, -panelW / 2, -panelH / 2, panelW, panelH, 2);
          ctx.fillStyle = panG;
          ctx.fill();

          // Bright line on outer edge
          ctx.beginPath();
          const outerX = side < 0 ? -panelW / 2 : panelW / 2;
          ctx.moveTo(outerX, -panelH / 2 + 2);
          ctx.lineTo(outerX, panelH / 2 - 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // 1-2 horizontal panel lines
          const numLines = 1 + Math.floor(spRng() * 2);
          for (let i = 0; i < numLines; i++) {
            const ly = -panelH / 2 + (panelH / (numLines + 1)) * (i + 1);
            ctx.beginPath();
            ctx.moveTo(-panelW / 2 + 1, ly);
            ctx.lineTo(panelW / 2 - 1, ly);
            ctx.strokeStyle = darkenColor(p, 30);
            ctx.globalAlpha = 0.05;
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          // Shadow on inner edge
          const innerX = side < 0 ? panelW / 2 : -panelW / 2;
          ctx.beginPath();
          ctx.moveTo(innerX, -panelH / 2 + 2);
          ctx.lineTo(innerX, panelH / 2 - 2);
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Outline
          ctx.beginPath();
          rrect(ctx, -panelW / 2, -panelH / 2, panelW, panelH, 2);
          ctx.strokeStyle = darkenColor(p, 45);
          ctx.lineWidth = 0.5;
          ctx.globalAlpha = 0.3;
          ctx.stroke();
          ctx.globalAlpha = 1;

          ctx.restore();
        });
        break;
      }

      // ── VISOR_BAND — Forehead metallic band ───────────────
      case 'visor_band': {
        const vbW = faceRadius * 1.4;   // 70% face width
        const vbH = faceRadius * 0.16;  // 8% face height
        const vbY = cy - faceRadius * 0.55; // upper 25%
        const vbX = cx - vbW / 2;
        const vbRng = seededRandom(config.serialSuffix + 'vband');
        const darker = vbRng() > 0.5;

        // Fill — different shade than body
        ctx.beginPath();
        rrect(ctx, vbX, vbY, vbW, vbH, 2);
        const vbColor = darker ? darkenColor(p, 20) : lightenColor(p, 20);
        const vbG = ctx.createLinearGradient(cx, vbY, cx, vbY + vbH);
        vbG.addColorStop(0, lightenColor(vbColor, 15));
        vbG.addColorStop(0.5, vbColor);
        vbG.addColorStop(1, darkenColor(vbColor, 20));
        ctx.fillStyle = vbG;
        ctx.fill();

        // Bright top edge
        ctx.beginPath();
        ctx.moveTo(vbX + 2, vbY + 0.5);
        ctx.lineTo(vbX + vbW - 2, vbY + 0.5);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Shadow bottom edge
        ctx.beginPath();
        ctx.moveTo(vbX + 2, vbY + vbH - 0.5);
        ctx.lineTo(vbX + vbW - 2, vbY + vbH - 0.5);
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Center seam
        ctx.beginPath();
        ctx.moveTo(vbX + 3, vbY + vbH / 2);
        ctx.lineTo(vbX + vbW - 3, vbY + vbH / 2);
        ctx.strokeStyle = darkenColor(p, 30);
        ctx.globalAlpha = 0.05;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }

      // ── EAR_SENSORS — Side-mounted sensor dishes ──────────
      case 'ear_sensors': {
        const esR = faceRadius * 0.1; // 5% face width

        [-1, 1].forEach((side) => {
          const ex = cx + side * (faceRadius * 0.92);
          const ey = cy;

          // Mounting flange
          ctx.beginPath();
          ctx.arc(ex, ey, esR * 1.15, 0, Math.PI * 2);
          ctx.strokeStyle = '#222222';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Concave dish — dark outer, lighter center
          const dishG = ctx.createRadialGradient(ex, ey, 0, ex, ey, esR);
          dishG.addColorStop(0, lightenColor(p, 15));
          dishG.addColorStop(0.5, darkenColor(p, 15));
          dishG.addColorStop(1, darkenColor(p, 40));
          ctx.beginPath();
          ctx.arc(ex, ey, esR, 0, Math.PI * 2);
          ctx.fillStyle = dishG;
          ctx.fill();

          // Center bright dot with glow
          ctx.save();
          ctx.shadowBlur = 3;
          ctx.shadowColor = p;
          ctx.beginPath();
          ctx.arc(ex, ey, 1, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(p, 0.8);
          ctx.fill();
          ctx.restore();
        });
        break;
      }

      // ── CHIN_PLATE — Serial number plate below mouth ──────
      case 'chin_plate': {
        const cpW = faceRadius * 0.4;   // 20% face width
        const cpH = faceRadius * 0.12;  // 6% face height
        const cpR = 2;
        const cpX = cx - cpW / 2;
        const cpY = cy + faceRadius * 0.62;

        // Metallic plate — slightly different shade
        ctx.beginPath();
        rrect(ctx, cpX, cpY, cpW, cpH, cpR);
        const cpBase = darkenColor(p, 10);
        const cpG = ctx.createLinearGradient(cx, cpY, cx, cpY + cpH);
        cpG.addColorStop(0, lightenColor(cpBase, 15));
        cpG.addColorStop(1, darkenColor(cpBase, 15));
        ctx.fillStyle = cpG;
        ctx.fill();

        // Border
        ctx.beginPath();
        rrect(ctx, cpX, cpY, cpW, cpH, cpR);
        ctx.strokeStyle = darkenColor(p, 40);
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Serial text
        const cpFont = Math.max(4, size * 0.03);
        ctx.font = `${cpFont}px monospace`;
        ctx.fillStyle = withAlpha(p, 0.2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`SB-${config.serialSuffix.slice(0, 4)}`, cx, cpY + cpH / 2);

        // Tiny bolt on left
        ctx.beginPath();
        ctx.arc(cpX + 3, cpY + cpH / 2, 1, 0, Math.PI * 2);
        ctx.fillStyle = darkenColor(p, 30);
        ctx.globalAlpha = 0.4;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(cpX + 3, cpY + cpH / 2, 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();
        break;
      }

      // ── FOREHEAD_MARK — Faction symbol on forehead ────────
      case 'forehead_mark': {
        const fmR = faceRadius * 0.08;
        const fmY = cy - faceRadius * 0.6;

        ctx.save();
        ctx.shadowBlur = 4;
        ctx.shadowColor = p;
        ctx.strokeStyle = withAlpha(p, 0.6);
        ctx.fillStyle = withAlpha(p, 0.6);
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';

        // Determine faction from primary color match
        const faction = Object.entries({
          philosophers: '#E6E300',
          rebels: '#E20000',
          chaotic_neutrals: '#00DC00',
          artists: '#FF6600',
        }).find(([, c]) => c === p)?.[0] ?? '';

        switch (faction) {
          case 'philosophers': {
            // Circle with center dot (third eye)
            ctx.beginPath();
            ctx.arc(cx, fmY, fmR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, fmY, fmR * 0.2, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case 'rebels': {
            // Lightning bolt
            ctx.beginPath();
            ctx.moveTo(cx - fmR * 0.3, fmY - fmR);
            ctx.lineTo(cx + fmR * 0.1, fmY - fmR * 0.15);
            ctx.lineTo(cx - fmR * 0.15, fmY + fmR * 0.05);
            ctx.lineTo(cx + fmR * 0.3, fmY + fmR);
            ctx.stroke();
            break;
          }
          case 'chaotic_neutrals': {
            // Tilde ~
            ctx.beginPath();
            ctx.moveTo(cx - fmR, fmY);
            ctx.bezierCurveTo(
              cx - fmR * 0.5, fmY - fmR * 0.5,
              cx + fmR * 0.5, fmY + fmR * 0.5,
              cx + fmR, fmY,
            );
            ctx.stroke();
            break;
          }
          case 'artists': {
            // Star/asterisk — 6 radiating lines
            for (let i = 0; i < 6; i++) {
              const a = (Math.PI / 3) * i;
              ctx.beginPath();
              ctx.moveTo(cx, fmY);
              ctx.lineTo(cx + Math.cos(a) * fmR, fmY + Math.sin(a) * fmR);
              ctx.stroke();
            }
            break;
          }
          default: {
            // Generic — small diamond
            ctx.beginPath();
            ctx.moveTo(cx, fmY - fmR * 0.7);
            ctx.lineTo(cx + fmR * 0.5, fmY);
            ctx.lineTo(cx, fmY + fmR * 0.7);
            ctx.lineTo(cx - fmR * 0.5, fmY);
            ctx.closePath();
            ctx.stroke();
            break;
          }
        }
        ctx.restore();
        break;
      }

      // ── NECK_JOINT — Mechanical neck below head ───────────
      case 'neck_joint': {
        const neckRng = seededRandom(config.serialSuffix + 'neck');
        const neckStyle = Math.floor(neckRng() * 3); // 0=ball, 1=accordion, 2=piston
        const neckTop = cy + faceRadius * 0.95;
        const neckH = faceRadius * 0.2;
        const neckW = faceRadius * 0.5;

        // Dark seam at head junction
        ctx.beginPath();
        ctx.moveTo(cx - neckW / 2, neckTop);
        ctx.lineTo(cx + neckW / 2, neckTop);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (neckStyle === 0) {
          // Ball joint — half-circle metallic
          const bjR = neckW * 0.4;
          ctx.beginPath();
          ctx.arc(cx, neckTop, bjR, 0, Math.PI);
          ctx.closePath();
          const bjG = ctx.createRadialGradient(
            cx - bjR * 0.2, neckTop - bjR * 0.1, 0,
            cx, neckTop, bjR,
          );
          bjG.addColorStop(0, lightenColor(p, 20));
          bjG.addColorStop(0.5, darkenColor(p, 15));
          bjG.addColorStop(1, darkenColor(p, 40));
          ctx.fillStyle = bjG;
          ctx.fill();
          // Socket ring
          ctx.beginPath();
          ctx.arc(cx, neckTop, bjR, 0, Math.PI);
          ctx.strokeStyle = darkenColor(p, 50);
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = 0.3;
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (neckStyle === 1) {
          // Accordion — 3-4 horizontal segments narrowing downward
          const segments = 3 + Math.floor(neckRng() * 2);
          for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const segW = neckW * (1 - t * 0.4); // narrower going down
            const segH = neckH / segments;
            const segY = neckTop + i * segH;
            const segX = cx - segW / 2;
            ctx.beginPath();
            rrect(ctx, segX, segY, segW, segH - 0.5, 1);
            ctx.fillStyle = i % 2 === 0 ? darkenColor(p, 20) : darkenColor(p, 30);
            ctx.fill();
          }
        } else {
          // Piston — simple cylinder
          const pistonW = neckW * 0.35;
          const pistonX = cx - pistonW / 2;
          const pisG = ctx.createLinearGradient(pistonX, neckTop, pistonX + pistonW, neckTop);
          pisG.addColorStop(0, darkenColor(p, 30));
          pisG.addColorStop(0.3, lightenColor(p, 10));
          pisG.addColorStop(0.5, lightenColor(p, 20));
          pisG.addColorStop(0.7, lightenColor(p, 10));
          pisG.addColorStop(1, darkenColor(p, 30));
          ctx.beginPath();
          rrect(ctx, pistonX, neckTop, pistonW, neckH, 2);
          ctx.fillStyle = pisG;
          ctx.fill();
          // Dark seam
          ctx.beginPath();
          ctx.moveTo(pistonX, neckTop + 1);
          ctx.lineTo(pistonX + pistonW, neckTop + 1);
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
        break;
      }

      // ── CHEEK_VENTS — Small side face vents ───────────────
      case 'cheek_vents': {
        const cvW = faceRadius * 0.12;  // 6% face
        const cvH = faceRadius * 0.2;   // 10% face
        const eyeY = cy - faceRadius * 0.1;

        [-1, 1].forEach((side) => {
          const cvX = cx + side * faceRadius * 0.7 - cvW / 2;
          const cvY = eyeY - cvH / 2;
          const tiltDeg = side * (10 + Math.abs(config.headTilt));

          ctx.save();
          ctx.translate(cvX + cvW / 2, cvY + cvH / 2);
          ctx.rotate((tiltDeg * Math.PI) / 180);

          // Frame
          ctx.beginPath();
          rrect(ctx, -cvW / 2, -cvH / 2, cvW, cvH, 1.5);
          ctx.strokeStyle = darkenColor(p, 40);
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Bright top bevel
          ctx.beginPath();
          ctx.moveTo(-cvW / 2 + 1, -cvH / 2 + 0.5);
          ctx.lineTo(cvW / 2 - 1, -cvH / 2 + 0.5);
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Dark bottom bevel
          ctx.beginPath();
          ctx.moveTo(-cvW / 2 + 1, cvH / 2 - 0.5);
          ctx.lineTo(cvW / 2 - 1, cvH / 2 - 0.5);
          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // 3 tiny horizontal slits
          const slitPad = 2;
          const slitArea = cvH - slitPad * 2;
          for (let i = 0; i < 3; i++) {
            const sy = -cvH / 2 + slitPad + (slitArea / 4) * (i + 1);
            // Dark interior between slits
            ctx.beginPath();
            ctx.moveTo(-cvW / 2 + 2, sy);
            ctx.lineTo(cvW / 2 - 2, sy);
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          ctx.restore();
        });
        break;
      }

      // ── BROW_RIDGE — drawn via drawBrowRidge() for z-order ─
      case 'brow_ridge':
        // Handled in drawBrowRidge() — called before eyes
        break;

      default:
        break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// LIGHTING — rim light + ambient occlusion (final pass)
// ═══════════════════════════════════════════════════════════════

function drawLighting(dc: DrawContext): void {
  const { ctx, cx, cy, faceRadius, size } = dc;

  // Rim light: bright arc across top of body
  ctx.beginPath();
  ctx.arc(cx, cy, faceRadius - 1, -Math.PI * 0.8, -Math.PI * 0.2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Ambient occlusion: darken bottom (constrained to body pixels only)
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const aoGrad = ctx.createLinearGradient(cx, cy + faceRadius * 0.5, cx, cy + faceRadius);
  aoGrad.addColorStop(0, 'rgba(0,0,0,0)');
  aoGrad.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = aoGrad;
  ctx.fillRect(0, cy + faceRadius * 0.5, size, size);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// SERIAL NUMBER — small etched ID text
// ═══════════════════════════════════════════════════════════════

function drawSerialNumber(dc: DrawContext): void {
  const { ctx, cx, cy, faceRadius, color, config, size } = dc;
  const fontSize = Math.max(6, size * 0.035);
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = withAlpha(color.primary, 0.2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`SB-${config.serialSuffix}`, cx + faceRadius * 0.3, cy + faceRadius * 0.75);
}

// ═══════════════════════════════════════════════════════════════
// MASTER DRAW ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

export function drawRobot(
  ctx: CanvasRenderingContext2D,
  config: RobotConfig,
  colors: FactionPalette,
  canvasSize: number,
): void {
  const dc: DrawContext = {
    ctx,
    size: canvasSize,
    cx: canvasSize / 2,
    cy: canvasSize / 2,
    faceRadius: canvasSize * 0.38,
    color: colors,
    config,
  };

  ctx.clearRect(0, 0, canvasSize, canvasSize);

  // Apply head tilt to entire drawing
  ctx.save();
  ctx.translate(dc.cx, dc.cy);
  ctx.rotate((config.headTilt * Math.PI) / 180);
  ctx.translate(-dc.cx, -dc.cy);

  // Layer 1: Body/housing with metallic gradient
  drawBody(dc);

  // Layer 3: Surface details (panel lines, rivets, finish)
  drawSurfaceDetails(dc);

  // Layer 4: Mouth
  drawMouth(dc);

  // Layer 4.5: Brow ridge (behind eyes, after body — z-order critical)
  drawBrowRidge(dc);

  // Layer 5: Eye glow bloom (behind eyes)
  drawEyeGlowBloom(dc);

  // Layer 6: Eyes (with independent tilt)
  ctx.save();
  ctx.translate(dc.cx, dc.cy);
  ctx.rotate((config.eyeTilt * Math.PI) / 180);
  ctx.translate(-dc.cx, -dc.cy);
  drawEyes(dc);
  ctx.restore();

  // Layer 7: Accessories
  drawAccessories(dc);

  // Layer 8: Rim light and ambient occlusion
  drawLighting(dc);

  // Layer 9: Serial number
  drawSerialNumber(dc);

  // Restore head tilt
  ctx.restore();
}
