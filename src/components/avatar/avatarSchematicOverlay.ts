/**
 * SPACEBOT.SPACE — Modular Schematic Blueprint Overlay
 * 48 drawing modules combined per-avatar for billions of unique overlays.
 *
 * Each avatar's seed picks 6-10 modules, each at a random rotation
 * (0°, 90°, 180°, 270°), creating BILLIONS of unique combinations.
 *
 * Phase 4: Transparent overlay on top of robot canvas.
 * Does NOT modify any robot drawing code.
 */

import type { FactionPalette, RobotConfig } from './avatarConfig';
import { withAlpha } from './avatarUtils';
import { seededRandom } from './avatarSeeder';

// ═══════════════════════════════════════════════════════════════
// MODULE TYPE — signature for all 48 schematic drawing modules
// ═══════════════════════════════════════════════════════════════

type SchematicModule = (
  ctx: CanvasRenderingContext2D,
  color: string,       // faction primary hex
  size: number,        // canvas size
  cx: number,          // center x
  cy: number,          // center y
  faceR: number,       // face radius (size * 0.38)
  rng: () => number,   // per-module sub-RNG
  serial: string,      // serialSuffix for text modules
) => void;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Small filled circle pad */
function pad(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw tick marks on a circle at specified degree angles */
function circleTicks(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  degrees: number[], len: number,
): void {
  for (const deg of degrees) {
    const a = (deg * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx + (r - len) * Math.cos(a), cy + (r - len) * Math.sin(a));
    ctx.lineTo(cx + (r + len) * Math.cos(a), cy + (r + len) * Math.sin(a));
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 1: CROSSHAIRS AND TARGETING (Modules 1-8)
// ═══════════════════════════════════════════════════════════════

/** Module 1 — Full Crosshair: H+V lines through center + center circle */
const mod01: SchematicModule = (ctx, color, size, cx, cy) => {
  ctx.strokeStyle = withAlpha(color, 0.20);
  ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(size, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, size); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.stroke();
};

/** Module 2 — Dashed Crosshair */
const mod02: SchematicModule = (ctx, color, size, cx, cy) => {
  ctx.strokeStyle = withAlpha(color, 0.20);
  ctx.lineWidth = 0.6;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(size, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, size); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
};

/** Module 3 — Offset Crosshair: shifted 15% faceR up+right */
const mod03: SchematicModule = (ctx, color, size, cx, cy, faceR) => {
  const off = faceR * 0.15;
  ctx.strokeStyle = withAlpha(color, 0.18);
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(0, cy - off); ctx.lineTo(size, cy - off); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + off, 0); ctx.lineTo(cx + off, size); ctx.stroke();
};

/** Module 4 — Eye Targeting Reticle Left */
const mod04: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  const ex = cx - faceR * 0.55;
  const ey = cy - faceR * 0.1;
  const r = faceR * 0.35;
  ctx.strokeStyle = withAlpha(color, 0.20);
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.stroke();
  circleTicks(ctx, ex, ey, r, [0, 90, 180, 270], faceR * 0.06);
};

/** Module 5 — Eye Targeting Reticle Right */
const mod05: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  const ex = cx + faceR * 0.55;
  const ey = cy - faceR * 0.1;
  const r = faceR * 0.35;
  ctx.strokeStyle = withAlpha(color, 0.20);
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.stroke();
  circleTicks(ctx, ex, ey, r, [0, 90, 180, 270], faceR * 0.06);
};

/** Module 6 — Center Targeting Reticle */
const mod06: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  const r = faceR * 0.5;
  ctx.strokeStyle = withAlpha(color, 0.18);
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  circleTicks(ctx, cx, cy, r, [0, 90, 180, 270], faceR * 0.07);
};

/** Module 7 — Diamond Targeting: rotated square centered on face */
const mod07: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  const d = faceR * 0.4;
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - d);
  ctx.lineTo(cx + d, cy);
  ctx.lineTo(cx, cy + d);
  ctx.lineTo(cx - d, cy);
  ctx.closePath();
  ctx.stroke();
};

/** Module 8 — Double Crosshair: full at center + shorter offset upward */
const mod08: SchematicModule = (ctx, color, size, cx, cy, faceR) => {
  ctx.strokeStyle = withAlpha(color, 0.18);
  ctx.lineWidth = 0.5;
  // Full crosshair
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(size, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, size); ctx.stroke();
  // Shorter crosshair offset upward
  const offY = cy - faceR * 0.2;
  const half = size * 0.3;
  ctx.strokeStyle = withAlpha(color, 0.12);
  ctx.beginPath(); ctx.moveTo(cx - half, offY); ctx.lineTo(cx + half, offY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, offY - half); ctx.lineTo(cx, offY + half); ctx.stroke();
};

// ═══════════════════════════════════════════════════════════════
// CATEGORY 2: CORNER AND EDGE MARKS (Modules 9-16)
// ═══════════════════════════════════════════════════════════════

/** Module 9 — Corner Brackets Outer: L-brackets at 4% inset */
const mod09: SchematicModule = (ctx, color, size) => {
  ctx.strokeStyle = withAlpha(color, 0.25);
  ctx.lineWidth = 0.8;
  const i = size * 0.04;
  const a = size * 0.12;
  // TL
  ctx.beginPath(); ctx.moveTo(i + a, i); ctx.lineTo(i, i); ctx.lineTo(i, i + a); ctx.stroke();
  // TR
  ctx.beginPath(); ctx.moveTo(size - i - a, i); ctx.lineTo(size - i, i); ctx.lineTo(size - i, i + a); ctx.stroke();
  // BL
  ctx.beginPath(); ctx.moveTo(i + a, size - i); ctx.lineTo(i, size - i); ctx.lineTo(i, size - i - a); ctx.stroke();
  // BR
  ctx.beginPath(); ctx.moveTo(size - i - a, size - i); ctx.lineTo(size - i, size - i); ctx.lineTo(size - i, size - i - a); ctx.stroke();
};

/** Module 10 — Corner Brackets Inner: L-brackets at 20% inset */
const mod10: SchematicModule = (ctx, color, size) => {
  ctx.strokeStyle = withAlpha(color, 0.18);
  ctx.lineWidth = 0.5;
  const n = size * 0.20;
  const a = size * 0.08;
  const corners: [number, number, number, number][] = [
    [n, n, 1, 1], [size - n, n, -1, 1],
    [n, size - n, 1, -1], [size - n, size - n, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * a, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * a);
    ctx.stroke();
  }
};

/** Module 11 — Corner Dots: 3 dots diagonal in each corner */
const mod11: SchematicModule = (ctx, color, size) => {
  ctx.fillStyle = withAlpha(color, 0.20);
  const ins = size * 0.06;
  const sp = 4;
  const corners = [
    { x: ins, y: ins, dx: 1, dy: 1 },
    { x: size - ins, y: ins, dx: -1, dy: 1 },
    { x: ins, y: size - ins, dx: 1, dy: -1 },
    { x: size - ins, y: size - ins, dx: -1, dy: -1 },
  ];
  for (const c of corners) {
    for (let j = 0; j < 3; j++) {
      pad(ctx, c.x + c.dx * j * sp, c.y + c.dy * j * sp, 0.8);
    }
  }
};

/** Module 12 — Side Tick Marks Left */
const mod12: SchematicModule = (ctx, color, size, _cx, cy) => {
  ctx.strokeStyle = withAlpha(color, 0.22);
  ctx.lineWidth = 0.5;
  for (let j = -2; j <= 2; j++) {
    const y = cy + j * 3;
    ctx.beginPath(); ctx.moveTo(size * 0.02, y); ctx.lineTo(size * 0.02 + 4, y); ctx.stroke();
  }
};

/** Module 13 — Side Tick Marks Right */
const mod13: SchematicModule = (ctx, color, size, _cx, cy) => {
  ctx.strokeStyle = withAlpha(color, 0.22);
  ctx.lineWidth = 0.5;
  for (let j = -2; j <= 2; j++) {
    const y = cy + j * 3;
    ctx.beginPath(); ctx.moveTo(size * 0.98 - 4, y); ctx.lineTo(size * 0.98, y); ctx.stroke();
  }
};

/** Module 14 — Top Measurement Bar: ruler line with ticks */
const mod14: SchematicModule = (ctx, color, size) => {
  const y = size * 0.08;
  ctx.strokeStyle = withAlpha(color, 0.12);
  ctx.lineWidth = 0.4;
  ctx.beginPath(); ctx.moveTo(size * 0.05, y); ctx.lineTo(size * 0.95, y); ctx.stroke();
  for (let j = 0; j <= 10; j++) {
    const x = size * 0.05 + (size * 0.9) * (j / 10);
    const th = j % 5 === 0 ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - th); ctx.lineTo(x, y + th); ctx.stroke();
  }
};

/** Module 15 — Bottom Measurement Bar */
const mod15: SchematicModule = (ctx, color, size) => {
  const y = size * 0.92;
  ctx.strokeStyle = withAlpha(color, 0.12);
  ctx.lineWidth = 0.4;
  ctx.beginPath(); ctx.moveTo(size * 0.05, y); ctx.lineTo(size * 0.95, y); ctx.stroke();
  for (let j = 0; j <= 10; j++) {
    const x = size * 0.05 + (size * 0.9) * (j / 10);
    const th = j % 5 === 0 ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - th); ctx.lineTo(x, y + th); ctx.stroke();
  }
};

/** Module 16 — Edge Notches: 3×3 square cutouts at midpoints */
const mod16: SchematicModule = (ctx, color, size) => {
  ctx.strokeStyle = withAlpha(color, 0.18);
  ctx.lineWidth = 0.5;
  const n = 3;
  const h = size / 2;
  // Top, bottom, left, right midpoints
  ctx.strokeRect(h - n / 2, 0, n, n);
  ctx.strokeRect(h - n / 2, size - n, n, n);
  ctx.strokeRect(0, h - n / 2, n, n);
  ctx.strokeRect(size - n, h - n / 2, n, n);
};

// ═══════════════════════════════════════════════════════════════
// CATEGORY 3: ARC SEGMENTS AND CIRCLES (Modules 17-24)
// ═══════════════════════════════════════════════════════════════

/** Module 17 — Upper Arc 60°: arc above face with endpoint ticks */
const mod17: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  const r = faceR * 1.15;
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI * 2 / 3, -Math.PI / 3);
  ctx.stroke();
  circleTicks(ctx, cx, cy, r, [-120, -60], faceR * 0.04);
};

/** Module 18 — Lower Arc 60° */
const mod18: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  const r = faceR * 1.15;
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI / 3, Math.PI * 2 / 3);
  ctx.stroke();
  circleTicks(ctx, cx, cy, r, [60, 120], faceR * 0.04);
};

/** Module 19 — Left Arc 45° */
const mod19: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  const r = faceR * 1.1;
  ctx.strokeStyle = withAlpha(color, 0.12);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 157.5 / 180, Math.PI * 202.5 / 180);
  ctx.stroke();
};

/** Module 20 — Right Arc 45° */
const mod20: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  const r = faceR * 1.1;
  ctx.strokeStyle = withAlpha(color, 0.12);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI * 22.5 / 180, Math.PI * 22.5 / 180);
  ctx.stroke();
};

/** Module 21 — Full Orbit Circle */
const mod21: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  ctx.strokeStyle = withAlpha(color, 0.10);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.arc(cx, cy, faceR * 1.2, 0, Math.PI * 2);
  ctx.stroke();
};

/** Module 22 — Dashed Orbit */
const mod22: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  ctx.strokeStyle = withAlpha(color, 0.12);
  ctx.lineWidth = 0.4;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(cx, cy, faceR * 1.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
};

/** Module 23 — Double Arc Top: two concentric arcs ~80° span */
const mod23: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  ctx.lineWidth = 0.5;
  // Inner
  ctx.strokeStyle = withAlpha(color, 0.12);
  ctx.beginPath();
  ctx.arc(cx, cy, faceR * 1.05, -Math.PI * 130 / 180, -Math.PI * 50 / 180);
  ctx.stroke();
  // Outer
  ctx.strokeStyle = withAlpha(color, 0.08);
  ctx.beginPath();
  ctx.arc(cx, cy, faceR * 1.2, -Math.PI * 130 / 180, -Math.PI * 50 / 180);
  ctx.stroke();
};

/** Module 24 — Radial Lines: 6 short lines radiating from face edge */
const mod24: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.4;
  const r1 = faceR * 1.0;
  const r2 = faceR * 1.12;
  for (const deg of [30, 90, 150, 210, 270, 330]) {
    const a = (deg * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
    ctx.lineTo(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a));
    ctx.stroke();
  }
};

// ═══════════════════════════════════════════════════════════════
// CATEGORY 4: PCB TRACES AND WIRING (Modules 25-32)
// ═══════════════════════════════════════════════════════════════

/** Module 25 — Horizontal Trace Top: PCB route across top with jog */
const mod25: SchematicModule = (ctx, color, size) => {
  const y = size * 0.2;
  const jog = size * 0.08;
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.fillStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(size * 0.3, y);
  ctx.lineTo(size * 0.3, y + jog);
  ctx.lineTo(size * 0.7, y + jog);
  ctx.lineTo(size * 0.7, y);
  ctx.lineTo(size, y);
  ctx.stroke();
  pad(ctx, 0, y, 1.5);
  pad(ctx, size * 0.3, y, 1.5);
  pad(ctx, size * 0.7, y, 1.5);
  pad(ctx, size, y, 1.5);
};

/** Module 26 — Horizontal Trace Bottom */
const mod26: SchematicModule = (ctx, color, size) => {
  const y = size * 0.8;
  const jog = size * 0.08;
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.fillStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(size * 0.25, y);
  ctx.lineTo(size * 0.25, y - jog);
  ctx.lineTo(size * 0.75, y - jog);
  ctx.lineTo(size * 0.75, y);
  ctx.lineTo(size, y);
  ctx.stroke();
  pad(ctx, 0, y, 1.5);
  pad(ctx, size * 0.25, y, 1.5);
  pad(ctx, size * 0.75, y, 1.5);
  pad(ctx, size, y, 1.5);
};

/** Module 27 — Vertical Trace Left */
const mod27: SchematicModule = (ctx, color, size) => {
  const x = size * 0.15;
  const jog = size * 0.06;
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.fillStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, size * 0.35);
  ctx.lineTo(x + jog, size * 0.35);
  ctx.lineTo(x + jog, size * 0.65);
  ctx.lineTo(x, size * 0.65);
  ctx.lineTo(x, size);
  ctx.stroke();
  pad(ctx, x, 0, 1.5);
  pad(ctx, x, size * 0.35, 1.5);
  pad(ctx, x, size * 0.65, 1.5);
  pad(ctx, x, size, 1.5);
};

/** Module 28 — Vertical Trace Right */
const mod28: SchematicModule = (ctx, color, size) => {
  const x = size * 0.85;
  const jog = size * 0.06;
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.fillStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, size * 0.3);
  ctx.lineTo(x - jog, size * 0.3);
  ctx.lineTo(x - jog, size * 0.7);
  ctx.lineTo(x, size * 0.7);
  ctx.lineTo(x, size);
  ctx.stroke();
  pad(ctx, x, 0, 1.5);
  pad(ctx, x, size * 0.3, 1.5);
  pad(ctx, x, size * 0.7, 1.5);
  pad(ctx, x, size, 1.5);
};

/** Module 29 — Corner Route Top-Left: trace from top edge to left edge */
const mod29: SchematicModule = (ctx, color, size) => {
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.fillStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(size * 0.2, 0);
  ctx.lineTo(size * 0.2, size * 0.12);
  ctx.lineTo(size * 0.08, size * 0.12);
  ctx.lineTo(size * 0.08, size * 0.25);
  ctx.stroke();
  pad(ctx, size * 0.2, 0, 1.5);
  pad(ctx, size * 0.2, size * 0.12, 1.5);
  pad(ctx, size * 0.08, size * 0.25, 1.5);
};

/** Module 30 — Corner Route Top-Right */
const mod30: SchematicModule = (ctx, color, size) => {
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.fillStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(size * 0.8, 0);
  ctx.lineTo(size * 0.8, size * 0.1);
  ctx.lineTo(size * 0.92, size * 0.1);
  ctx.lineTo(size * 0.92, size * 0.22);
  ctx.stroke();
  pad(ctx, size * 0.8, 0, 1.5);
  pad(ctx, size * 0.8, size * 0.1, 1.5);
  pad(ctx, size * 0.92, size * 0.22, 1.5);
};

/** Module 31 — Corner Route Bottom-Left */
const mod31: SchematicModule = (ctx, color, size) => {
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.fillStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.75);
  ctx.lineTo(size * 0.1, size * 0.75);
  ctx.lineTo(size * 0.1, size * 0.88);
  ctx.lineTo(size * 0.22, size * 0.88);
  ctx.stroke();
  pad(ctx, 0, size * 0.75, 1.5);
  pad(ctx, size * 0.1, size * 0.75, 1.5);
  pad(ctx, size * 0.22, size * 0.88, 1.5);
};

/** Module 32 — Corner Route Bottom-Right */
const mod32: SchematicModule = (ctx, color, size) => {
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.fillStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(size, size * 0.78);
  ctx.lineTo(size * 0.88, size * 0.78);
  ctx.lineTo(size * 0.88, size * 0.9);
  ctx.lineTo(size * 0.78, size * 0.9);
  ctx.stroke();
  pad(ctx, size, size * 0.78, 1.5);
  pad(ctx, size * 0.88, size * 0.78, 1.5);
  pad(ctx, size * 0.78, size * 0.9, 1.5);
};

// ═══════════════════════════════════════════════════════════════
// CATEGORY 5: COMPONENT SYMBOLS (Modules 33-40)
// ═══════════════════════════════════════════════════════════════

/** Module 33 — Resistor Top-Left: zigzag symbol */
const mod33: SchematicModule = (ctx, color, size) => {
  const bx = size * 0.18;
  const by = size * 0.18;
  ctx.strokeStyle = withAlpha(color, 0.18);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(bx - 5, by);
  const step = 10 / 6;
  for (let j = 0; j < 3; j++) {
    ctx.lineTo(bx - 5 + (j * 2 + 1) * step, by - 2.5);
    ctx.lineTo(bx - 5 + (j * 2 + 2) * step, by + 2.5);
  }
  ctx.lineTo(bx + 5, by);
  ctx.stroke();
};

/** Module 34 — Resistor Bottom-Right */
const mod34: SchematicModule = (ctx, color, size) => {
  const bx = size * 0.82;
  const by = size * 0.82;
  ctx.strokeStyle = withAlpha(color, 0.18);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(bx - 5, by);
  const step = 10 / 6;
  for (let j = 0; j < 3; j++) {
    ctx.lineTo(bx - 5 + (j * 2 + 1) * step, by - 2.5);
    ctx.lineTo(bx - 5 + (j * 2 + 2) * step, by + 2.5);
  }
  ctx.lineTo(bx + 5, by);
  ctx.stroke();
};

/** Module 35 — Capacitor Left: two parallel plates with leads */
const mod35: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  const x = cx - faceR - faceR * 0.16;
  const y = cy;
  ctx.strokeStyle = withAlpha(color, 0.18);
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(x - 1, y - 3); ctx.lineTo(x - 1, y + 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 1, y - 3); ctx.lineTo(x + 1, y + 3); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 5, y); ctx.lineTo(x - 1, y);
  ctx.moveTo(x + 1, y); ctx.lineTo(x + 5, y);
  ctx.stroke();
};

/** Module 36 — Capacitor Right */
const mod36: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  const x = cx + faceR + faceR * 0.16;
  const y = cy;
  ctx.strokeStyle = withAlpha(color, 0.18);
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(x - 1, y - 3); ctx.lineTo(x - 1, y + 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 1, y - 3); ctx.lineTo(x + 1, y + 3); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 5, y); ctx.lineTo(x - 1, y);
  ctx.moveTo(x + 1, y); ctx.lineTo(x + 5, y);
  ctx.stroke();
};

/** Module 37 — Ground Symbol Bottom: 3 stacked lines decreasing width */
const mod37: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  const x = cx;
  const y = cy + faceR + 6;
  ctx.strokeStyle = withAlpha(color, 0.18);
  ctx.lineWidth = 0.5;
  // Stem
  ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.stroke();
  // 3 lines
  const widths = [5, 3.2, 1.5];
  for (let j = 0; j < 3; j++) {
    const ly = y + j * 1.8;
    ctx.beginPath(); ctx.moveTo(x - widths[j], ly); ctx.lineTo(x + widths[j], ly); ctx.stroke();
  }
};

/** Module 38 — Diode Top: triangle + cathode bar */
const mod38: SchematicModule = (ctx, color, _s, cx, cy, faceR) => {
  const x = cx;
  const y = cy - faceR - 6;
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.lineTo(x + 3, y);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.stroke();
};

/** Module 39 — IC Chip Left: rectangle body + pin lines */
const mod39: SchematicModule = (ctx, color, size) => {
  const x = size * 0.08;
  const y = size * 0.45;
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x, y, 8, 5);
  for (let j = 0; j < 3; j++) {
    const py = y + 0.8 + j * 1.5;
    ctx.beginPath(); ctx.moveTo(x - 2, py); ctx.lineTo(x, py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 8, py); ctx.lineTo(x + 10, py); ctx.stroke();
  }
};

/** Module 40 — Transistor Right: circle + 3 leads */
const mod40: SchematicModule = (ctx, color, size) => {
  const x = size * 0.9;
  const y = size * 0.55;
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke();
  // Base
  ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 4, y); ctx.stroke();
  // Collector
  ctx.beginPath(); ctx.moveTo(x + 2, y - 3); ctx.lineTo(x + 5, y - 5); ctx.stroke();
  // Emitter
  ctx.beginPath(); ctx.moveTo(x + 2, y + 3); ctx.lineTo(x + 5, y + 5); ctx.stroke();
};

// ═══════════════════════════════════════════════════════════════
// CATEGORY 6: DATA READOUTS AND TEXT (Modules 41-48)
// ═══════════════════════════════════════════════════════════════

const STATUS_TEXTS = [
  'LOGIC: ACTIVE', 'STATUS: ONLINE', 'NEURAL: LINKED',
  'CORE: STABLE', 'SIGNAL: LOCKED', 'OPTIC: CLEAR',
];
const VERSION_TEXTS = ['v3.7.1', 'BLD:026', 'REV:4A', 'SYS:OK'];
const STATS_TEXTS = ['PWR:98%', 'MEM:64K', 'FRQ:440', 'TMP:37C'];

/** Module 41 — Status Text Below Face */
const mod41: SchematicModule = (ctx, color, size, cx, cy, faceR, rng) => {
  const idx = Math.floor(rng() * STATUS_TEXTS.length);
  const fs = Math.max(5, size * 0.04);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.25);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(STATUS_TEXTS[idx], cx, cy + faceR + size * 0.04);
};

/** Module 42 — Version Text Top-Left */
const mod42: SchematicModule = (ctx, color, size, _cx, _cy, _fR, rng) => {
  const idx = Math.floor(rng() * VERSION_TEXTS.length);
  const fs = Math.max(4, size * 0.025);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.15);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(VERSION_TEXTS[idx], size * 0.04, size * 0.04);
};

/** Module 43 — Stats Text Top-Right */
const mod43: SchematicModule = (ctx, color, size, _cx, _cy, _fR, rng) => {
  const idx = Math.floor(rng() * STATS_TEXTS.length);
  const fs = Math.max(4, size * 0.025);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.15);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(STATS_TEXTS[idx], size * 0.96, size * 0.04);
};

/** Module 44 — Serial Stamp Bottom-Left */
const mod44: SchematicModule = (ctx, color, size, _cx, _cy, _fR, _rng, serial) => {
  const fs = Math.max(4, size * 0.025);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.12);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`SB-${serial}`, size * 0.04, size * 0.96);
};

/** Module 45 — Coordinate Text Bottom-Right */
const mod45: SchematicModule = (ctx, color, size, _cx, _cy, _fR, rng) => {
  const xv = Math.floor(rng() * 100);
  const yv = Math.floor(rng() * 100);
  const fs = Math.max(4, size * 0.025);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.12);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    `X:${String(xv).padStart(2, '0')} Y:${String(yv).padStart(2, '0')}`,
    size * 0.96, size * 0.96,
  );
};

/** Module 46 — Hex Code Top-Center */
const mod46: SchematicModule = (ctx, color, size, cx, _cy, _fR, _rng, serial) => {
  let hex = '';
  for (let j = 0; j < 4; j++) {
    hex += (serial.charCodeAt(j) || 0).toString(16).slice(-1).toUpperCase();
  }
  const fs = Math.max(4, size * 0.025);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.15);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`0x${hex}`, cx, size * 0.04);
};

/** Module 47 — Barcode Bottom-Center: 6-8 vertical bars */
const mod47: SchematicModule = (ctx, color, size, cx, cy, faceR, rng) => {
  const count = 6 + Math.floor(rng() * 3); // 6-8
  ctx.fillStyle = withAlpha(color, 0.18);
  // Calculate total width first for centering
  const bars: { w: number; h: number }[] = [];
  let totalW = 0;
  for (let j = 0; j < count; j++) {
    const w = 1 + rng() * 2;   // 1-3px
    const h = 5 + rng() * 5;   // 5-10px
    bars.push({ w, h });
    totalW += w + 0.8;
  }
  let xPos = cx - totalW / 2;
  const yPos = cy + faceR + size * 0.02;
  for (const b of bars) {
    ctx.fillRect(xPos, yPos, b.w, b.h);
    xPos += b.w + 0.8;
  }
};

/** Module 48 — Grid Dots Full: faint dot grid across canvas */
const mod48: SchematicModule = (ctx, color, size) => {
  ctx.fillStyle = withAlpha(color, 0.05);
  const sp = 8;
  for (let x = sp; x < size; x += sp) {
    for (let y = sp; y < size; y += sp) {
      ctx.beginPath();
      ctx.arc(x, y, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// MODULE REGISTRY — all 48 modules indexed 0-47
// ═══════════════════════════════════════════════════════════════

const SCHEMATIC_MODULES: SchematicModule[] = [
  mod01, mod02, mod03, mod04, mod05, mod06, mod07, mod08,   // 1-8   Crosshairs
  mod09, mod10, mod11, mod12, mod13, mod14, mod15, mod16,   // 9-16  Corners/Edges
  mod17, mod18, mod19, mod20, mod21, mod22, mod23, mod24,   // 17-24 Arcs/Circles
  mod25, mod26, mod27, mod28, mod29, mod30, mod31, mod32,   // 25-32 PCB Traces
  mod33, mod34, mod35, mod36, mod37, mod38, mod39, mod40,   // 33-40 Components
  mod41, mod42, mod43, mod44, mod45, mod46, mod47, mod48,   // 41-48 Data/Text
];

// ═══════════════════════════════════════════════════════════════
// MASTER OVERLAY FUNCTION — exported
// Picks 6-10 modules per seed, each at random rotation (0/90/180/270°)
// ═══════════════════════════════════════════════════════════════

export function drawSchematicOverlay(
  ctx: CanvasRenderingContext2D,
  config: RobotConfig,
  colors: FactionPalette,
  canvasSize: number,
): void {
  const rng = seededRandom(config.serialSuffix + ':schematic');
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const faceR = canvasSize * 0.38;
  const color = colors.primary;

  // Pick 6-10 modules (no duplicates)
  const moduleCount = 6 + Math.floor(rng() * 5);
  const pool = [...Array(48).keys()]; // indices 0-47
  const picked: number[] = [];
  for (let i = 0; i < moduleCount && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }

  // Draw each picked module with seed-determined rotation
  for (const moduleIdx of picked) {
    const rotation = Math.floor(rng() * 4) * 90; // 0, 90, 180, or 270 degrees
    const moduleRng = seededRandom(config.serialSuffix + ':mod' + moduleIdx);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    SCHEMATIC_MODULES[moduleIdx](ctx, color, canvasSize, cx, cy, faceR, moduleRng, config.serialSuffix);
    ctx.restore();
  }
}
