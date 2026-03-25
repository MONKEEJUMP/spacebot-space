/**
 * SPACEBOT.SPACE — Human Biometric Overlay
 * 24 biometric/medical diagnostic modules drawn on the overlay canvas
 * for human (non-bot) avatars only. Human equivalent of the bot schematic overlay.
 *
 * Phase 2B: Vitals, Targeting/Scan, Data/Identity, Geometric/Decorative
 * Each human gets 4-7 modules, each rotated 0/90/180/270°.
 */

import type { RobotConfig, FactionPalette } from './avatarConfig';
import { seededRandom } from './avatarSeeder';
import { withAlpha } from './avatarUtils';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type OverlayModule = (
  ctx: CanvasRenderingContext2D,
  color: string,
  size: number,
  cx: number,
  cy: number,
  faceR: number,
  rng: () => number,
  serial: string,
) => void;

// ═══════════════════════════════════════════════════════════════
// MODULE ARRAY — 24 modules
// ═══════════════════════════════════════════════════════════════

const MODULES: OverlayModule[] = [
  // Vitals (0-5)
  mod_heartbeatLine,
  mod_pulseDots,
  mod_vitalReadoutTop,
  mod_vitalReadoutBottom,
  mod_temperatureBar,
  mod_brainwaveLine,
  // Targeting & Scan (6-11)
  mod_biometricScanFrame,
  mod_faceScanLines,
  mod_eyeFocusRings,
  mod_fingerprintFragment,
  mod_irisScanDetail,
  mod_dnaHelix,
  // Data & Identity (12-17)
  mod_userIdStamp,
  mod_barcode,
  mod_qrFragment,
  mod_networkNodes,
  mod_binaryStrip,
  mod_hexAddress,
  // Geometric & Decorative (18-23)
  mod_cornerBrackets,
  mod_gridDots,
  mod_orbitRing,
  mod_radialTicks,
  mod_measurementArc,
  mod_centerCrosshair,
];

// ═══════════════════════════════════════════════════════════════
// MASTER DRAW — called from AvatarGenerator
// ═══════════════════════════════════════════════════════════════

export function drawHumanOverlay(
  ctx: CanvasRenderingContext2D,
  config: RobotConfig,
  colors: FactionPalette,
  size: number,
): void {
  const rng = seededRandom(config.serialSuffix + ':humanoverlay');
  const cx = size / 2;
  const cy = size / 2;
  const faceR = size * 0.38;
  const color = colors.primary;

  const moduleCount = 4 + Math.floor(rng() * 4); // 4 to 7
  const pool = [...Array(24).keys()];
  const picked: number[] = [];
  for (let i = 0; i < moduleCount && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }

  picked.forEach((moduleIdx) => {
    const rotation = Math.floor(rng() * 4) * 90;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    MODULES[moduleIdx](ctx, color, size, cx, cy, faceR, rng, config.serialSuffix);
    ctx.restore();
  });
}

// ═══════════════════════════════════════════════════════════════
//  VITALS — Modules 0-5
// ═══════════════════════════════════════════════════════════════

// 0. HEARTBEAT LINE — ECG waveform
function mod_heartbeatLine(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, cy: number): void {
  const y = cy + size * 0.05;
  const left = size * 0.08;
  const right = size * 0.92;
  const w = right - left;

  ctx.beginPath();
  ctx.moveTo(left, y);
  // Flat segment
  ctx.lineTo(left + w * 0.2, y);
  // P wave
  ctx.quadraticCurveTo(left + w * 0.25, y - size * 0.015, left + w * 0.3, y);
  // Flat
  ctx.lineTo(left + w * 0.35, y);
  // QRS complex — sharp spike
  ctx.lineTo(left + w * 0.38, y + size * 0.01);
  ctx.lineTo(left + w * 0.42, y - size * 0.06);
  ctx.lineTo(left + w * 0.46, y + size * 0.02);
  ctx.lineTo(left + w * 0.48, y);
  // Flat
  ctx.lineTo(left + w * 0.55, y);
  // T wave
  ctx.quadraticCurveTo(left + w * 0.6, y - size * 0.02, left + w * 0.65, y);
  // Flat tail
  ctx.lineTo(right, y);

  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

// 1. PULSE DOTS — Row of fading dots
function mod_pulseDots(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, cy: number): void {
  const y = cy - size * 0.35;
  const count = 9;
  const spacing = size * 0.08;
  const startX = cx - (count * spacing) / 2;

  for (let i = 0; i < count; i++) {
    const alpha = 0.25 - (i / count) * 0.2;
    ctx.beginPath();
    ctx.arc(startX + i * spacing, y, size * 0.004, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(color, Math.max(0.15, alpha * 3));
    ctx.fill();
  }
}

// 2. VITAL READOUT TOP — text display
function mod_vitalReadoutTop(ctx: CanvasRenderingContext2D, color: string, size: number, _cx: number, _cy: number, _faceR: number, rng: () => number): void {
  const texts = ['HR:72', 'BP:120/80', 'O2:98%'];
  const text = texts[Math.floor(rng() * texts.length)];
  ctx.font = `${size * 0.025}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(text, size * 0.95, size * 0.04);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// 3. VITAL READOUT BOTTOM — text display
function mod_vitalReadoutBottom(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, _cy: number, _faceR: number, rng: () => number): void {
  const texts = ['SYNC:OK', 'LINK:ACTIVE', 'BIO:NOMINAL'];
  const text = texts[Math.floor(rng() * texts.length)];
  ctx.font = `${size * 0.035}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.60);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, cx, size * 0.97);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// 4. TEMPERATURE BAR — vertical gradient bar
function mod_temperatureBar(ctx: CanvasRenderingContext2D, _color: string, size: number): void {
  const x = size * 0.06;
  const topY = size * 0.35;
  const botY = size * 0.65;
  const w = 2;

  const g = ctx.createLinearGradient(x, topY, x, botY);
  g.addColorStop(0, 'rgba(255,80,80,0.35)');
  g.addColorStop(0.5, 'rgba(255,200,80,0.35)');
  g.addColorStop(1, 'rgba(80,140,255,0.35)');

  ctx.fillStyle = g;
  ctx.fillRect(x, topY, w, botY - topY);
}

// 5. BRAINWAVE LINE — EEG sine wave
function mod_brainwaveLine(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number): void {
  const y = size * 0.15;
  const left = size * 0.1;
  const right = size * 0.9;
  const cycles = 4.5;
  const amp = size * 0.012;

  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const px = left + (right - left) * t;
    const py = y + Math.sin(t * Math.PI * 2 * cycles) * amp;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = withAlpha(color, 0.35);
  ctx.lineWidth = 0.4;
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
//  TARGETING & SCAN — Modules 6-11
// ═══════════════════════════════════════════════════════════════

// 6. BIOMETRIC SCAN FRAME — L-brackets at corners
function mod_biometricScanFrame(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, cy: number, faceR: number): void {
  const gap = faceR * 1.1;
  const arm = size * 0.08;
  const corners = [
    { x: cx - gap, y: cy - gap, dx: 1, dy: 1 },
    { x: cx + gap, y: cy - gap, dx: -1, dy: 1 },
    { x: cx - gap, y: cy + gap, dx: 1, dy: -1 },
    { x: cx + gap, y: cy + gap, dx: -1, dy: -1 },
  ];

  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 0.6;
  for (const c of corners) {
    ctx.beginPath();
    ctx.moveTo(c.x + c.dx * arm, c.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(c.x, c.y + c.dy * arm);
    ctx.stroke();
  }
}

// 7. FACE SCAN LINES — horizontal lines across face
function mod_faceScanLines(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, cy: number, faceR: number): void {
  ctx.strokeStyle = withAlpha(color, 0.25);
  ctx.lineWidth = 0.3;
  for (let i = 0; i < 4; i++) {
    const y = cy - faceR * 0.3 + (faceR * 0.6 / 3) * i;
    ctx.beginPath();
    ctx.moveTo(cx - faceR * 0.7, y);
    ctx.lineTo(cx + faceR * 0.7, y);
    ctx.stroke();
  }
}

// 8. EYE FOCUS RINGS — circles around eyes
function mod_eyeFocusRings(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, cy: number, faceR: number): void {
  const eyeY = cy - faceR * 0.1;
  const eyeSpacing = faceR * 0.55;
  const eyeR = faceR * 0.28;
  const ringR = eyeR * 1.4;

  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 0.4;
  for (const ex of [cx - eyeSpacing, cx + eyeSpacing]) {
    ctx.beginPath();
    ctx.arc(ex, eyeY, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// 9. FINGERPRINT FRAGMENT — curved parallel lines
function mod_fingerprintFragment(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const ox = size * 0.85;
  const oy = size * 0.85;

  ctx.strokeStyle = withAlpha(color, 0.30);
  ctx.lineWidth = 0.3;
  for (let i = 0; i < 6; i++) {
    const r = size * 0.02 + i * size * 0.008;
    ctx.beginPath();
    ctx.arc(ox, oy, r, Math.PI * 0.8, Math.PI * 1.5);
    ctx.stroke();
  }
}

// 10. IRIS SCAN DETAIL — radiating lines from eyes
function mod_irisScanDetail(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, cy: number, faceR: number): void {
  const eyeY = cy - faceR * 0.1;
  const eyeSpacing = faceR * 0.55;
  const eyeR = faceR * 0.28;
  const outerR = eyeR * 1.5;

  ctx.strokeStyle = withAlpha(color, 0.30);
  ctx.lineWidth = 0.3;
  for (const ex of [cx - eyeSpacing, cx + eyeSpacing]) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(a) * eyeR * 0.6, eyeY + Math.sin(a) * eyeR * 0.6);
      ctx.lineTo(ex + Math.cos(a) * outerR, eyeY + Math.sin(a) * outerR);
      ctx.stroke();
    }
  }
}

// 11. DNA HELIX — double helix in corner
function mod_dnaHelix(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const ox = size * 0.12;
  const topY = size * 0.65;
  const height = size * 0.25;
  const amp = size * 0.025;
  const rotations = 2;
  const steps = 30;

  ctx.strokeStyle = withAlpha(color, 0.35);
  ctx.lineWidth = 0.4;

  // Strand 1
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = topY + height * t;
    const x = ox + Math.sin(t * Math.PI * 2 * rotations) * amp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Strand 2 (phase offset)
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = topY + height * t;
    const x = ox + Math.sin(t * Math.PI * 2 * rotations + Math.PI) * amp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Connecting rungs
  ctx.lineWidth = 0.25;
  ctx.strokeStyle = withAlpha(color, 0.25);
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8;
    const y = topY + height * t;
    const x1 = ox + Math.sin(t * Math.PI * 2 * rotations) * amp;
    const x2 = ox + Math.sin(t * Math.PI * 2 * rotations + Math.PI) * amp;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════
//  DATA & IDENTITY — Modules 12-17
// ═══════════════════════════════════════════════════════════════

// 12. USER ID STAMP
function mod_userIdStamp(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, _cy: number, _faceR: number, _rng: () => number, serial: string): void {
  const text = 'USR-' + serial.substring(0, 4);
  ctx.font = `${size * 0.02}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.35);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, cx, size * 0.93);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// 13. BARCODE — vertical lines
function mod_barcode(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, _cy: number, _faceR: number, rng: () => number): void {
  const baseY = size * 0.88;
  const barH = size * 0.06;
  const totalW = size * 0.15;
  const startX = cx - totalW / 2;
  const numBars = 10;

  ctx.fillStyle = withAlpha(color, 0.45);
  let x = startX;
  for (let i = 0; i < numBars; i++) {
    const w = 1 + Math.floor(rng() * 3);
    const h = barH * (0.7 + rng() * 0.3);
    ctx.fillRect(x, baseY - h, w, h);
    x += w + 1 + Math.floor(rng() * 2);
  }
}

// 14. QR FRAGMENT — 3x3 grid of squares
function mod_qrFragment(ctx: CanvasRenderingContext2D, color: string, size: number, _cx: number, _cy: number, _faceR: number, rng: () => number): void {
  const ox = size * 0.06;
  const oy = size * 0.06;
  const cellSize = size * 0.015;
  const gap = size * 0.003;

  ctx.fillStyle = withAlpha(color, 0.30);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (rng() > 0.4) {
        ctx.fillRect(
          ox + col * (cellSize + gap),
          oy + row * (cellSize + gap),
          cellSize,
          cellSize,
        );
      }
    }
  }
}

// 15. NETWORK NODES — connected dots
function mod_networkNodes(ctx: CanvasRenderingContext2D, color: string, size: number, _cx: number, _cy: number, _faceR: number, rng: () => number): void {
  const ox = size * 0.82;
  const oy = size * 0.15;
  const nodeR = 1.2;
  const nodes: { x: number; y: number }[] = [];

  for (let i = 0; i < 5; i++) {
    nodes.push({
      x: ox + (rng() - 0.5) * size * 0.12,
      y: oy + (rng() - 0.5) * size * 0.1,
    });
  }

  // Lines
  ctx.strokeStyle = withAlpha(color, 0.35);
  ctx.lineWidth = 0.3;
  for (let i = 0; i < nodes.length - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(nodes[i].x, nodes[i].y);
    ctx.lineTo(nodes[i + 1].x, nodes[i + 1].y);
    ctx.stroke();
  }
  // Close loop
  if (nodes.length > 2) {
    ctx.beginPath();
    ctx.moveTo(nodes[nodes.length - 1].x, nodes[nodes.length - 1].y);
    ctx.lineTo(nodes[0].x, nodes[0].y);
    ctx.stroke();
  }

  // Dots
  ctx.fillStyle = withAlpha(color, 0.45);
  for (const n of nodes) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, nodeR, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 16. BINARY STRIP — tiny binary text
function mod_binaryStrip(ctx: CanvasRenderingContext2D, color: string, size: number, _cx: number, _cy: number, _faceR: number, rng: () => number): void {
  let bits = '';
  for (let i = 0; i < 8; i++) bits += rng() > 0.5 ? '1' : '0';

  ctx.font = `${size * 0.02}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.25);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(bits, size * 0.05, size * 0.48);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// 17. HEX ADDRESS — hex string
function mod_hexAddress(ctx: CanvasRenderingContext2D, color: string, size: number, _cx: number, _cy: number, _faceR: number, _rng: () => number, serial: string): void {
  const hex = '0x' + serial.substring(0, 4).split('').map(c => c.charCodeAt(0).toString(16).toUpperCase()).join('').substring(0, 4);
  ctx.font = `${size * 0.02}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.30);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(hex, size * 0.95, size * 0.48);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// ═══════════════════════════════════════════════════════════════
//  GEOMETRIC & DECORATIVE — Modules 18-23
// ═══════════════════════════════════════════════════════════════

// 18. CORNER BRACKETS — L-shaped brackets
function mod_cornerBrackets(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const margin = size * 0.04;
  const arm = size * 0.08;

  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 0.6;

  const corners = [
    { x: margin, y: margin, dx: 1, dy: 1 },
    { x: size - margin, y: margin, dx: -1, dy: 1 },
    { x: margin, y: size - margin, dx: 1, dy: -1 },
    { x: size - margin, y: size - margin, dx: -1, dy: -1 },
  ];

  for (const c of corners) {
    ctx.beginPath();
    ctx.moveTo(c.x + c.dx * arm, c.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(c.x, c.y + c.dy * arm);
    ctx.stroke();
  }
}

// 19. GRID DOTS — faint dot grid
function mod_gridDots(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const spacing = 10;
  ctx.fillStyle = withAlpha(color, 0.15);
  for (let x = spacing; x < size; x += spacing) {
    for (let y = spacing; y < size; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// 20. ORBIT RING — elliptical ring around face
function mod_orbitRing(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, cy: number, faceR: number): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, faceR * 1.15, faceR * 1.15, 0, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(color, 0.25);
  ctx.lineWidth = 0.3;
  ctx.stroke();
}

// 21. RADIAL TICKS — 8 tick marks from face center
function mod_radialTicks(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, cy: number, faceR: number): void {
  ctx.strokeStyle = withAlpha(color, 0.35);
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r1 = faceR * 1.0;
    const r2 = faceR * 1.08;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }
}

// 22. MEASUREMENT ARC — small arc segment near face edge
function mod_measurementArc(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, cy: number, faceR: number): void {
  const r = faceR * 1.05;
  const startAngle = -Math.PI * 0.25;
  const endAngle = startAngle + Math.PI * 0.25; // 45° arc

  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = withAlpha(color, 0.30);
  ctx.lineWidth = 0.4;
  ctx.stroke();

  // Tick marks at ends
  for (const a of [startAngle, endAngle]) {
    const x1 = cx + Math.cos(a) * (r - size * 0.008);
    const y1 = cy + Math.sin(a) * (r - size * 0.008);
    const x2 = cx + Math.cos(a) * (r + size * 0.008);
    const y2 = cy + Math.sin(a) * (r + size * 0.008);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

// 23. CENTER CROSSHAIR — faint crosshair through center
function mod_centerCrosshair(ctx: CanvasRenderingContext2D, color: string, size: number, cx: number, cy: number): void {
  ctx.strokeStyle = withAlpha(color, 0.20);
  ctx.lineWidth = 0.3;

  // Horizontal
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(size, cy);
  ctx.stroke();

  // Vertical
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, size);
  ctx.stroke();
}
