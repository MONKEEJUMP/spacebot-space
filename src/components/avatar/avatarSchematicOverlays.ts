/**
 * SPACEBOT.SPACE — 24 Custom Schematic Overlays for Build Your Avatar
 * User picks a pattern + color. Drawn on overlay canvas at VISIBLE opacity.
 *
 * Categories:
 *   1-6:   Circuit & PCB
 *   7-12:  Geometric & Architectural
 *   13-18: Military & Tactical
 *   19-24: Scientific & Data
 */

import { withAlpha } from './avatarUtils';

// ═══════════════════════════════════════════════════════════════
// HELPER: small filled circle
// ═══════════════════════════════════════════════════════════════
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 1: CIRCUIT & PCB (Schematics 1-6)
// ═══════════════════════════════════════════════════════════════

/** 1. PCB Circuit Board — dense traces with solder pads and IC chips */
function draw_pcb_circuit(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  // Horizontal traces
  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 1;
  const hTraces = [0.18, 0.30, 0.45, 0.55, 0.68, 0.78, 0.25, 0.60, 0.85];
  for (const yf of hTraces) {
    const y = s * yf;
    ctx.beginPath();
    ctx.moveTo(s * 0.02, y);
    // Right-angle jog
    const jogX = s * (0.2 + (yf * 0.4));
    ctx.lineTo(jogX, y);
    ctx.lineTo(jogX, y + s * 0.04);
    ctx.lineTo(s * 0.98, y + s * 0.04);
    ctx.stroke();
  }
  // Vertical traces
  const vTraces = [0.15, 0.35, 0.50, 0.65, 0.82];
  for (const xf of vTraces) {
    const x = s * xf;
    ctx.beginPath();
    ctx.moveTo(x, s * 0.02);
    const jogY = s * (0.3 + (xf * 0.3));
    ctx.lineTo(x, jogY);
    ctx.lineTo(x + s * 0.03, jogY);
    ctx.lineTo(x + s * 0.03, s * 0.98);
    ctx.stroke();
  }
  // Solder pads at intersections
  ctx.fillStyle = withAlpha(color, 0.45);
  const padPositions = [
    [0.15, 0.18], [0.35, 0.30], [0.50, 0.45], [0.65, 0.55],
    [0.82, 0.68], [0.15, 0.55], [0.35, 0.78], [0.50, 0.30],
    [0.65, 0.18], [0.82, 0.45], [0.35, 0.60], [0.65, 0.85],
  ];
  for (const [xf, yf] of padPositions) {
    dot(ctx, s * xf, s * yf, s * 0.012);
  }
  // IC chip outlines
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 0.8;
  const chips: [number, number, number, number][] = [
    [0.20, 0.38, 0.08, 0.04],
    [0.55, 0.22, 0.08, 0.04],
    [0.70, 0.62, 0.08, 0.04],
    [0.30, 0.72, 0.06, 0.035],
  ];
  for (const [cx, cy, w, h] of chips) {
    ctx.strokeRect(s * cx, s * cy, s * w, s * h);
    // Pin marks
    ctx.lineWidth = 0.5;
    for (let p = 0; p < 4; p++) {
      const px = s * cx + (s * w / 5) * (p + 1);
      ctx.beginPath(); ctx.moveTo(px, s * cy - s * 0.008); ctx.lineTo(px, s * cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, s * cy + s * h); ctx.lineTo(px, s * cy + s * h + s * 0.008); ctx.stroke();
    }
    ctx.lineWidth = 0.8;
  }
  // Via holes
  ctx.strokeStyle = withAlpha(color, 0.40);
  ctx.fillStyle = withAlpha(color, 0.35);
  ctx.lineWidth = 0.5;
  const vias = [[0.25, 0.50], [0.45, 0.35], [0.60, 0.75], [0.75, 0.40], [0.40, 0.15], [0.80, 0.55]];
  for (const [xf, yf] of vias) {
    ctx.beginPath(); ctx.arc(s * xf, s * yf, s * 0.006, 0, Math.PI * 2); ctx.stroke();
    dot(ctx, s * xf, s * yf, s * 0.002);
  }
}

/** 2. Dense Circuit Grid — tight PCB with multi-layer traces */
function draw_pcb_dense(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  // Ground plane fill in top-right quadrant
  ctx.fillStyle = withAlpha(color, 0.08);
  ctx.fillRect(s * 0.5, 0, s * 0.5, s * 0.5);
  // Back-layer traces (fainter)
  ctx.strokeStyle = withAlpha(color, 0.35);
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 10; i++) {
    const y = s * (0.05 + i * 0.095);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s * 0.4, y);
    ctx.lineTo(s * 0.4 + s * 0.02, y + s * 0.02);
    ctx.lineTo(s, y + s * 0.02);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const x = s * (0.08 + i * 0.12);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s * 0.5);
    ctx.lineTo(x + s * 0.015, s * 0.515);
    ctx.lineTo(x + s * 0.015, s);
    ctx.stroke();
  }
  // Front-layer traces (brighter)
  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 8; i++) {
    const y = s * (0.10 + i * 0.11);
    ctx.beginPath();
    ctx.moveTo(0, y);
    const jogX = s * (0.25 + (i % 3) * 0.15);
    ctx.lineTo(jogX, y);
    ctx.lineTo(jogX, y - s * 0.03);
    ctx.lineTo(s, y - s * 0.03);
    ctx.stroke();
  }
  // Component footprints: resistors
  ctx.fillStyle = withAlpha(color, 0.45);
  const resistors = [[0.20, 0.25], [0.55, 0.42], [0.75, 0.65], [0.30, 0.80], [0.60, 0.15]];
  for (const [xf, yf] of resistors) {
    ctx.fillRect(s * xf, s * yf, s * 0.02, s * 0.01);
  }
  // Capacitor circles
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 0.5;
  const caps = [[0.35, 0.55], [0.70, 0.30], [0.45, 0.75], [0.85, 0.50]];
  for (const [xf, yf] of caps) {
    ctx.beginPath(); ctx.arc(s * xf, s * yf, s * 0.008, 0, Math.PI * 2); ctx.stroke();
  }
  // Edge connector pads along bottom
  ctx.fillStyle = withAlpha(color, 0.40);
  for (let i = 0; i < 16; i++) {
    ctx.fillRect(s * (0.1 + i * 0.05), s * 0.94, s * 0.02, s * 0.04);
  }
}

/** 3. Radial Circuit — spider-web traces from center */
function draw_circuit_radial(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const cx = s / 2, cy = s / 2;
  const spokes = 8;
  const rings = [s * 0.15, s * 0.28, s * 0.40];
  // Radial traces
  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * s * 0.46, cy + Math.sin(a) * s * 0.46);
    ctx.stroke();
  }
  // Concentric ring traces
  ctx.lineWidth = 0.7;
  for (const r of rings) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Junction nodes where radial meets ring
  ctx.fillStyle = withAlpha(color, 0.50);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    for (const r of rings) {
      dot(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, s * 0.01);
    }
  }
  // Center hub: concentric circles (processor)
  ctx.strokeStyle = withAlpha(color, 0.60);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.06, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.035, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = withAlpha(color, 0.50);
  dot(ctx, cx, cy, s * 0.015);
  // Small component symbols along radials
  ctx.strokeStyle = withAlpha(color, 0.40);
  ctx.lineWidth = 0.5;
  for (let i = 0; i < spokes; i += 2) {
    const a = (i / spokes) * Math.PI * 2;
    const mx = cx + Math.cos(a) * s * 0.34;
    const my = cy + Math.sin(a) * s * 0.34;
    // Small capacitor symbol
    ctx.beginPath(); ctx.moveTo(mx - 2, my - 3); ctx.lineTo(mx - 2, my + 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx + 2, my - 3); ctx.lineTo(mx + 2, my + 3); ctx.stroke();
  }
}

/** 4. Logic Gate Diagram — AND, OR, NOT gates with connections */
function draw_logic_gates(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const gateW = s * 0.07;
  const gateH = s * 0.05;

  // Helper: draw AND gate at position
  const andGate = (x: number, y: number) => {
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y - gateH / 2);
    ctx.lineTo(x + gateW * 0.5, y - gateH / 2);
    ctx.arc(x + gateW * 0.5, y, gateH / 2, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x, y + gateH / 2);
    ctx.closePath();
    ctx.stroke();
  };

  // Helper: draw OR gate
  const orGate = (x: number, y: number) => {
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y - gateH / 2);
    ctx.quadraticCurveTo(x + gateW * 0.3, y - gateH / 2, x + gateW, y);
    ctx.quadraticCurveTo(x + gateW * 0.3, y + gateH / 2, x, y + gateH / 2);
    ctx.quadraticCurveTo(x + gateW * 0.15, y, x, y - gateH / 2);
    ctx.stroke();
  };

  // Helper: NOT gate (triangle + bubble)
  const notGate = (x: number, y: number) => {
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y - gateH / 2);
    ctx.lineTo(x + gateW * 0.8, y);
    ctx.lineTo(x, y + gateH / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + gateW * 0.8 + s * 0.006, y, s * 0.005, 0, Math.PI * 2);
    ctx.stroke();
  };

  // Place gates
  andGate(s * 0.10, s * 0.25);
  andGate(s * 0.10, s * 0.55);
  orGate(s * 0.40, s * 0.35);
  orGate(s * 0.40, s * 0.65);
  notGate(s * 0.70, s * 0.30);
  notGate(s * 0.70, s * 0.70);

  // Connection wires
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 0.6;
  // AND1 output -> OR1 input
  ctx.beginPath(); ctx.moveTo(s * 0.10 + gateW, s * 0.25); ctx.lineTo(s * 0.40, s * 0.35); ctx.stroke();
  // AND2 output -> OR2 input
  ctx.beginPath(); ctx.moveTo(s * 0.10 + gateW, s * 0.55); ctx.lineTo(s * 0.40, s * 0.65); ctx.stroke();
  // OR1 output -> NOT1 input
  ctx.beginPath(); ctx.moveTo(s * 0.40 + gateW, s * 0.35); ctx.lineTo(s * 0.70, s * 0.30); ctx.stroke();
  // OR2 output -> NOT2 input
  ctx.beginPath(); ctx.moveTo(s * 0.40 + gateW, s * 0.65); ctx.lineTo(s * 0.70, s * 0.70); ctx.stroke();
  // NOT outputs to right edge
  ctx.beginPath(); ctx.moveTo(s * 0.70 + gateW, s * 0.30); ctx.lineTo(s * 0.95, s * 0.30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.70 + gateW, s * 0.70); ctx.lineTo(s * 0.95, s * 0.70); ctx.stroke();
  // Input lines from left
  ctx.beginPath(); ctx.moveTo(s * 0.02, s * 0.22); ctx.lineTo(s * 0.10, s * 0.22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.02, s * 0.28); ctx.lineTo(s * 0.10, s * 0.28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.02, s * 0.52); ctx.lineTo(s * 0.10, s * 0.52); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.02, s * 0.58); ctx.lineTo(s * 0.10, s * 0.58); ctx.stroke();

  // Labels
  const fs = Math.max(5, s * 0.03);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.60);
  ctx.textAlign = 'left';
  ctx.fillText('IN', s * 0.02, s * 0.18);
  ctx.textAlign = 'right';
  ctx.fillText('OUT', s * 0.96, s * 0.28);
  ctx.fillText('OUT', s * 0.96, s * 0.68);
  // Binary values
  ctx.fillStyle = withAlpha(color, 0.35);
  ctx.font = `${Math.max(4, s * 0.025)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('1', s * 0.06, s * 0.21);
  ctx.fillText('0', s * 0.06, s * 0.27);
  ctx.fillText('1', s * 0.06, s * 0.51);
  ctx.fillText('1', s * 0.06, s * 0.57);
  // Signal arrows
  ctx.fillStyle = withAlpha(color, 0.50);
  const arrow = (x: number, y: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x, y + 2);
    ctx.fill();
  };
  arrow(s * 0.30, s * 0.30);
  arrow(s * 0.58, s * 0.50);
  arrow(s * 0.85, s * 0.30);
  arrow(s * 0.85, s * 0.70);
}

/** 5. Resistor Network — electrical schematic with components */
function draw_resistor_network(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;

  // Zigzag resistor helper
  const resistor = (x1: number, y: number, x2: number) => {
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.lineWidth = 0.8;
    const w = x2 - x1;
    const bodyStart = x1 + w * 0.2;
    const bodyEnd = x1 + w * 0.8;
    const bodyW = bodyEnd - bodyStart;
    const zigCount = 6;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(bodyStart, y);
    for (let i = 0; i < zigCount; i++) {
      const px = bodyStart + (bodyW / zigCount) * (i + 0.5);
      const py = y + (i % 2 === 0 ? -s * 0.015 : s * 0.015);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(bodyEnd, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  };

  // Capacitor helper (two parallel plates)
  const capacitor = (x: number, y: number) => {
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x - s * 0.02, y); ctx.lineTo(x - 2, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 2, y - s * 0.015); ctx.lineTo(x - 2, y + s * 0.015); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 2, y - s * 0.015); ctx.lineTo(x + 2, y + s * 0.015); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.lineTo(x + s * 0.02, y); ctx.stroke();
  };

  // Inductor helper (coils)
  const inductor = (x: number, y: number, w: number) => {
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const coils = 4;
    const coilW = w / coils;
    for (let i = 0; i < coils; i++) {
      ctx.arc(x + coilW * (i + 0.5), y, coilW / 2, Math.PI, 0);
    }
    ctx.stroke();
  };

  // Draw resistors
  resistor(s * 0.08, s * 0.20, s * 0.40);
  resistor(s * 0.50, s * 0.20, s * 0.90);
  resistor(s * 0.08, s * 0.40, s * 0.40);
  resistor(s * 0.50, s * 0.40, s * 0.90);
  resistor(s * 0.20, s * 0.60, s * 0.55);
  resistor(s * 0.55, s * 0.60, s * 0.90);
  // Vertical connecting wires
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(s * 0.08, s * 0.20); ctx.lineTo(s * 0.08, s * 0.40); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.40, s * 0.20); ctx.lineTo(s * 0.40, s * 0.40); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.50, s * 0.20); ctx.lineTo(s * 0.50, s * 0.40); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.90, s * 0.20); ctx.lineTo(s * 0.90, s * 0.60); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.20, s * 0.40); ctx.lineTo(s * 0.20, s * 0.60); ctx.stroke();
  // Capacitors
  capacitor(s * 0.30, s * 0.50);
  capacitor(s * 0.65, s * 0.50);
  capacitor(s * 0.80, s * 0.75);
  // Inductors
  inductor(s * 0.15, s * 0.75, s * 0.10);
  inductor(s * 0.45, s * 0.75, s * 0.10);
  // Ground symbols at bottom
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 0.8;
  const ground = (x: number, y: number) => {
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.02); ctx.lineTo(x, y); ctx.stroke();
    const widths = [s * 0.02, s * 0.013, s * 0.006];
    for (let i = 0; i < 3; i++) {
      const ly = y + i * s * 0.006;
      ctx.beginPath(); ctx.moveTo(x - widths[i], ly); ctx.lineTo(x + widths[i], ly); ctx.stroke();
    }
  };
  ground(s * 0.20, s * 0.88);
  ground(s * 0.50, s * 0.88);
  ground(s * 0.80, s * 0.88);
  // Voltage labels
  const fs = Math.max(5, s * 0.03);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.60);
  ctx.textAlign = 'left';
  ctx.fillText('+V', s * 0.02, s * 0.15);
  ctx.fillText('GND', s * 0.02, s * 0.92);
  // Top power rail
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(s * 0.02, s * 0.12); ctx.lineTo(s * 0.95, s * 0.12); ctx.stroke();
}

/** 6. Microchip Die — top-down silicon die view */
function draw_microchip(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const cx = s / 2, cy = s / 2;
  const dieW = s * 0.45, dieH = s * 0.40;
  const dieX = cx - dieW / 2, dieY = cy - dieH / 2;

  // Outer frame (package)
  ctx.strokeStyle = withAlpha(color, 0.40);
  ctx.lineWidth = 1;
  ctx.strokeRect(s * 0.08, s * 0.08, s * 0.84, s * 0.84);

  // Die rectangle
  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(dieX, dieY, dieW, dieH);

  // Logic blocks inside die (dense grid)
  ctx.strokeStyle = withAlpha(color, 0.30);
  ctx.lineWidth = 0.4;
  const blockSize = s * 0.025;
  const gap = s * 0.005;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 10; col++) {
      const bx = dieX + s * 0.03 + col * (blockSize + gap);
      const by = dieY + s * 0.03 + row * (blockSize + gap);
      if (bx + blockSize < dieX + dieW - s * 0.02 && by + blockSize < dieY + dieH - s * 0.02) {
        ctx.strokeRect(bx, by, blockSize, blockSize);
      }
    }
  }

  // Bond wires from die to package edge
  ctx.strokeStyle = withAlpha(color, 0.40);
  ctx.lineWidth = 0.5;
  // Top wires
  for (let i = 0; i < 12; i++) {
    const x = dieX + (dieW / 13) * (i + 1);
    ctx.beginPath();
    ctx.moveTo(x, dieY);
    ctx.quadraticCurveTo(x, s * 0.12, x + (i % 2 === 0 ? -2 : 2), s * 0.09);
    ctx.stroke();
  }
  // Bottom wires
  for (let i = 0; i < 12; i++) {
    const x = dieX + (dieW / 13) * (i + 1);
    ctx.beginPath();
    ctx.moveTo(x, dieY + dieH);
    ctx.quadraticCurveTo(x, s * 0.88, x + (i % 2 === 0 ? -2 : 2), s * 0.91);
    ctx.stroke();
  }
  // Left wires
  for (let i = 0; i < 8; i++) {
    const y = dieY + (dieH / 9) * (i + 1);
    ctx.beginPath();
    ctx.moveTo(dieX, y);
    ctx.quadraticCurveTo(s * 0.14, y, s * 0.09, y + (i % 2 === 0 ? -2 : 2));
    ctx.stroke();
  }
  // Right wires
  for (let i = 0; i < 8; i++) {
    const y = dieY + (dieH / 9) * (i + 1);
    ctx.beginPath();
    ctx.moveTo(dieX + dieW, y);
    ctx.quadraticCurveTo(s * 0.86, y, s * 0.91, y + (i % 2 === 0 ? -2 : 2));
    ctx.stroke();
  }

  // Pin numbers along outer edge
  const fs = Math.max(4, s * 0.018);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.45);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i < 8; i++) {
    ctx.fillText(`${i + 1}`, s * (0.15 + i * 0.10), s * 0.04);
    ctx.fillText(`${i + 17}`, s * (0.15 + i * 0.10), s * 0.94);
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let i = 0; i < 8; i++) {
    ctx.fillText(`${32 - i}`, s * 0.06, s * (0.18 + i * 0.09));
  }
  ctx.textAlign = 'left';
  for (let i = 0; i < 8; i++) {
    ctx.fillText(`${i + 9}`, s * 0.94, s * (0.18 + i * 0.09));
  }

  // Corner alignment marks
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 0.6;
  const markCorners = [[dieX, dieY], [dieX + dieW, dieY], [dieX, dieY + dieH], [dieX + dieW, dieY + dieH]];
  for (const [mx, my] of markCorners) {
    ctx.beginPath(); ctx.arc(mx, my, s * 0.008, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx - 4, my); ctx.lineTo(mx + 4, my); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, my - 4); ctx.lineTo(mx, my + 4); ctx.stroke();
  }

  // Center label
  ctx.font = `bold ${Math.max(6, s * 0.04)}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.40);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SOC', cx, cy);
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 2: GEOMETRIC & ARCHITECTURAL (Schematics 7-8)
// (Schematics 9-12 in Chunk 2)
// ═══════════════════════════════════════════════════════════════

/** 7. Hexagonal Grid — honeycomb pattern */
function draw_hex_grid(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const cx = s / 2, cy = s / 2;
  const hexR = s * 0.045; // side length
  const hexH = hexR * Math.sqrt(3);
  const colW = hexR * 1.5;
  const rowH = hexH;

  ctx.strokeStyle = withAlpha(color, 0.35);
  ctx.lineWidth = 0.6;

  const drawHex = (hx: number, hy: number) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = hx + hexR * Math.cos(a);
      const py = hy + hexR * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  };

  // Highlighted hexagons (positions near center)
  const highlights: [number, number][] = [];
  const filledSet = new Set<string>();

  for (let col = -1; col < s / colW + 1; col++) {
    for (let row = -1; row < s / rowH + 1; row++) {
      const hx = col * colW;
      const hy = row * rowH + (col % 2 === 0 ? 0 : rowH / 2);
      if (hx < -hexR || hx > s + hexR || hy < -hexR || hy > s + hexR) continue;

      drawHex(hx, hy);

      // Center dot
      ctx.fillStyle = withAlpha(color, 0.20);
      dot(ctx, hx, hy, 0.8);

      // Track center hexagons for highlighting
      const dist = Math.sqrt((hx - cx) ** 2 + (hy - cy) ** 2);
      if (dist < s * 0.12) {
        highlights.push([hx, hy]);
        filledSet.add(`${col},${row}`);
      }
    }
  }

  // Highlight center cluster
  ctx.fillStyle = withAlpha(color, 0.20);
  for (const [hx, hy] of highlights) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = hx + hexR * Math.cos(a);
      const py = hy + hexR * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Scatter highlight a few random hexagons
  ctx.fillStyle = withAlpha(color, 0.12);
  const scattered = [[s * 0.15, s * 0.20], [s * 0.80, s * 0.30], [s * 0.25, s * 0.75], [s * 0.85, s * 0.80], [s * 0.50, s * 0.15]];
  for (const [hx, hy] of scattered) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      ctx.lineTo(hx + hexR * Math.cos(a), hy + hexR * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();
  }
}

/** 8. Triangle Mesh — Delaunay-style wireframe */
function draw_triangle_mesh(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  // Seeded points
  const points: [number, number][] = [
    [0.10, 0.08], [0.30, 0.05], [0.55, 0.10], [0.80, 0.06], [0.95, 0.15],
    [0.05, 0.30], [0.22, 0.28], [0.45, 0.25], [0.68, 0.30], [0.90, 0.32],
    [0.12, 0.50], [0.35, 0.48], [0.52, 0.52], [0.75, 0.50], [0.92, 0.55],
    [0.08, 0.72], [0.28, 0.70], [0.50, 0.75], [0.72, 0.72], [0.88, 0.78],
    [0.15, 0.92], [0.38, 0.90], [0.60, 0.95], [0.82, 0.92],
  ];
  const pts = points.map(([x, y]) => [s * x, s * y] as [number, number]);

  // Connect into triangles (hand-picked Delaunay-ish)
  const tris: [number, number, number][] = [
    [0, 1, 6], [1, 2, 7], [2, 3, 8], [3, 4, 9],
    [0, 5, 6], [5, 6, 10], [6, 7, 11], [7, 8, 12], [8, 9, 13], [9, 4, 14],
    [5, 10, 15], [10, 11, 16], [11, 12, 17], [12, 13, 18], [13, 14, 19],
    [15, 16, 20], [16, 17, 21], [17, 18, 22], [18, 19, 23],
    [1, 6, 7], [2, 7, 8], [3, 8, 9],
    [6, 10, 11], [8, 12, 13], [10, 15, 16], [12, 17, 18],
  ];

  // Draw filled triangles for depth
  ctx.fillStyle = withAlpha(color, 0.06);
  for (const [a, b, c] of tris) {
    ctx.beginPath();
    ctx.moveTo(pts[a][0], pts[a][1]);
    ctx.lineTo(pts[b][0], pts[b][1]);
    ctx.lineTo(pts[c][0], pts[c][1]);
    ctx.closePath();
    ctx.fill();
  }

  // Highlight one triangle
  ctx.fillStyle = withAlpha(color, 0.18);
  ctx.beginPath();
  ctx.moveTo(pts[11][0], pts[11][1]);
  ctx.lineTo(pts[12][0], pts[12][1]);
  ctx.lineTo(pts[17][0], pts[17][1]);
  ctx.closePath();
  ctx.fill();

  // Draw edges
  ctx.strokeStyle = withAlpha(color, 0.40);
  ctx.lineWidth = 0.6;
  for (const [a, b, c] of tris) {
    ctx.beginPath();
    ctx.moveTo(pts[a][0], pts[a][1]);
    ctx.lineTo(pts[b][0], pts[b][1]);
    ctx.lineTo(pts[c][0], pts[c][1]);
    ctx.closePath();
    ctx.stroke();
  }

  // Vertex dots
  ctx.fillStyle = withAlpha(color, 0.55);
  for (const [x, y] of pts) {
    dot(ctx, x, y, s * 0.006);
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 2 continued: GEOMETRIC & ARCHITECTURAL (9-12)
// ═══════════════════════════════════════════════════════════════

/** 9. Isometric Blueprint — 3D isometric grid */
function draw_isometric_grid(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const spacing = s * 0.06;
  const angle30 = Math.PI / 6;

  // Border frame
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 1;
  ctx.strokeRect(s * 0.03, s * 0.03, s * 0.94, s * 0.94);

  // Isometric lines: 30° from horizontal (going right-up)
  ctx.strokeStyle = withAlpha(color, 0.30);
  ctx.lineWidth = 0.5;
  for (let i = -20; i < 30; i++) {
    const startX = i * spacing;
    const startY = s;
    const endX = startX + s * Math.cos(angle30);
    const endY = startY - s * Math.sin(angle30) * 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
  // 150° from horizontal (going left-up)
  for (let i = -10; i < 40; i++) {
    const startX = i * spacing;
    const startY = s;
    const endX = startX - s * Math.cos(angle30);
    const endY = startY - s * Math.sin(angle30) * 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
  // Vertical lines
  ctx.strokeStyle = withAlpha(color, 0.25);
  for (let i = 0; i < 18; i++) {
    const x = s * 0.05 + i * spacing;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s);
    ctx.stroke();
  }

  // Some filled cube faces for depth
  ctx.fillStyle = withAlpha(color, 0.10);
  const cubePositions = [[0.30, 0.45], [0.55, 0.55], [0.40, 0.70], [0.65, 0.35], [0.20, 0.60]];
  for (const [xf, yf] of cubePositions) {
    const cx = s * xf, cy = s * yf;
    const d = spacing * 0.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy - d);
    ctx.lineTo(cx + d, cy - d * 0.5);
    ctx.lineTo(cx + d, cy + d * 0.5);
    ctx.lineTo(cx, cy + d);
    ctx.lineTo(cx - d, cy + d * 0.5);
    ctx.lineTo(cx - d, cy - d * 0.5);
    ctx.closePath();
    ctx.fill();
  }
}

/** 10. Concentric Target — radar/target rings */
function draw_concentric_rings(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const cx = s / 2, cy = s / 2;
  const maxR = s * 0.44;
  const ringCount = 7;

  // Rings
  for (let i = 1; i <= ringCount; i++) {
    const r = (maxR / ringCount) * i;
    ctx.strokeStyle = withAlpha(color, 0.40);
    ctx.lineWidth = 0.7;
    if (i % 2 === 0) {
      ctx.setLineDash([4, 4]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Crosshair lines N/S/E/W
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(cx, s * 0.03); ctx.lineTo(cx, s * 0.97); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.03, cy); ctx.lineTo(s * 0.97, cy); ctx.stroke();

  // Degree tick marks around outer ring
  ctx.strokeStyle = withAlpha(color, 0.40);
  ctx.lineWidth = 0.5;
  for (let deg = 0; deg < 360; deg += 30) {
    const a = (deg * Math.PI) / 180;
    const r1 = maxR - s * 0.01;
    const r2 = maxR + s * 0.015;
    ctx.beginPath();
    ctx.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
    ctx.lineTo(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a));
    ctx.stroke();
  }
  // Minor ticks every 10°
  for (let deg = 0; deg < 360; deg += 10) {
    if (deg % 30 === 0) continue;
    const a = (deg * Math.PI) / 180;
    const r1 = maxR;
    const r2 = maxR + s * 0.008;
    ctx.beginPath();
    ctx.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
    ctx.lineTo(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a));
    ctx.stroke();
  }

  // Center dot
  ctx.fillStyle = withAlpha(color, 0.60);
  dot(ctx, cx, cy, s * 0.008);

  // Range numbers along east crosshair
  const fs = Math.max(4, s * 0.025);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  for (let i = 1; i <= 4; i++) {
    const r = (maxR / ringCount) * (i * 2 - 1);
    ctx.fillText(`${i * 10}`, cx + r + 3, cy - 2);
  }
}

/** 11. Engineering Blueprint — classic drawing with border and title block */
function draw_blueprint_frame(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const cx = s / 2, cy = s / 2;
  const m = s * 0.05; // margin

  // Double border frame
  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(m, m, s - 2 * m, s - 2 * m);
  ctx.strokeStyle = withAlpha(color, 0.35);
  ctx.lineWidth = 0.5;
  ctx.strokeRect(m + 3, m + 3, s - 2 * m - 6, s - 2 * m - 6);

  // Grid reference letters along top
  const fs = Math.max(4, s * 0.022);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const letters = 'ABCDEF';
  for (let i = 0; i < 6; i++) {
    const x = m + (s - 2 * m) * ((i + 0.5) / 6);
    ctx.fillText(letters[i], x, m - s * 0.03);
    // Tick mark
    ctx.strokeStyle = withAlpha(color, 0.40);
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x, m); ctx.lineTo(x, m + 4); ctx.stroke();
  }
  // Numbers along left
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 6; i++) {
    const y = m + (s - 2 * m) * ((i + 0.5) / 6);
    ctx.fillText(`${i + 1}`, m - 4, y);
    ctx.strokeStyle = withAlpha(color, 0.40);
    ctx.beginPath(); ctx.moveTo(m, y); ctx.lineTo(m + 4, y); ctx.stroke();
  }

  // Title block bottom-right
  const tbW = s * 0.35, tbH = s * 0.15;
  const tbX = s - m - tbW, tbY = s - m - tbH;
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 0.8;
  ctx.strokeRect(tbX, tbY, tbW, tbH);
  // Dividers inside title block
  ctx.beginPath(); ctx.moveTo(tbX, tbY + tbH * 0.33); ctx.lineTo(tbX + tbW, tbY + tbH * 0.33); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tbX, tbY + tbH * 0.66); ctx.lineTo(tbX + tbW, tbY + tbH * 0.66); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tbX + tbW * 0.4, tbY); ctx.lineTo(tbX + tbW * 0.4, tbY + tbH); ctx.stroke();
  // Title block text
  const tfs = Math.max(4, s * 0.020);
  ctx.font = `${tfs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.60);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPEC:', tbX + 4, tbY + tbH * 0.165);
  ctx.fillText('REV:', tbX + 4, tbY + tbH * 0.50);
  ctx.fillText('DATE:', tbX + 4, tbY + tbH * 0.83);
  ctx.fillText('SB-7200', tbX + tbW * 0.42, tbY + tbH * 0.165);
  ctx.fillText('R4.1', tbX + tbW * 0.42, tbY + tbH * 0.50);
  ctx.fillText('2025.02', tbX + tbW * 0.42, tbY + tbH * 0.83);

  // Dimension lines with arrows
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 0.6;
  // Horizontal dimension across top
  const dimY = m + s * 0.08;
  ctx.beginPath(); ctx.moveTo(m + s * 0.05, dimY); ctx.lineTo(s - m - s * 0.05, dimY); ctx.stroke();
  // Arrow heads
  ctx.fillStyle = withAlpha(color, 0.45);
  ctx.beginPath(); ctx.moveTo(m + s * 0.05, dimY); ctx.lineTo(m + s * 0.05 + 5, dimY - 2); ctx.lineTo(m + s * 0.05 + 5, dimY + 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s - m - s * 0.05, dimY); ctx.lineTo(s - m - s * 0.05 - 5, dimY - 2); ctx.lineTo(s - m - s * 0.05 - 5, dimY + 2); ctx.fill();
  ctx.fillStyle = withAlpha(color, 0.55);
  ctx.font = `${Math.max(4, s * 0.020)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('147.2mm', cx, dimY - 2);

  // Vertical dimension
  const dimX = s - m - s * 0.08;
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.beginPath(); ctx.moveTo(dimX, m + s * 0.05); ctx.lineTo(dimX, s - m - s * 0.20); ctx.stroke();
  ctx.fillStyle = withAlpha(color, 0.55);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(dimX + 3, cy);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('89.5mm', 0, 0);
  ctx.restore();

  // Section markers (circled letters)
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 0.6;
  ctx.fillStyle = withAlpha(color, 0.55);
  ctx.font = `${Math.max(5, s * 0.025)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sections: [number, number, string][] = [[m + s * 0.08, cy, 'A'], [cx, m + s * 0.04, 'B'], [s - m - s * 0.03, cy, 'C']];
  for (const [sx, sy, label] of sections) {
    ctx.beginPath(); ctx.arc(sx, sy, s * 0.015, 0, Math.PI * 2); ctx.stroke();
    ctx.fillText(label, sx, sy);
  }

  // Center mark
  ctx.strokeStyle = withAlpha(color, 0.40);
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.03, cy); ctx.lineTo(cx + s * 0.03, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.03); ctx.lineTo(cx, cy + s * 0.03); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.015, 0, Math.PI * 2); ctx.stroke();

  // Scale bar bottom-left
  const sbX = m + s * 0.03, sbY = s - m - s * 0.04;
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(sbX, sbY); ctx.lineTo(sbX + s * 0.12, sbY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sbX, sbY - 3); ctx.lineTo(sbX, sbY + 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sbX + s * 0.12, sbY - 3); ctx.lineTo(sbX + s * 0.12, sbY + 3); ctx.stroke();
  ctx.font = `${Math.max(4, s * 0.018)}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('1:1', sbX + s * 0.06, sbY - 3);
}

/** 12. Golden Spiral — Fibonacci golden ratio overlay */
function draw_golden_ratio(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const phi = 1.618;

  // Golden rectangle subdivisions
  ctx.strokeStyle = withAlpha(color, 0.30);
  ctx.lineWidth = 0.6;

  // Start with the full canvas, subdivide
  let x = 0, y = 0, w = s, h = s;
  const rects: [number, number, number, number][] = [];
  for (let i = 0; i < 8; i++) {
    rects.push([x, y, w, h]);
    ctx.strokeRect(x, y, w, h);
    const newW = w / phi;
    const newH = h / phi;
    switch (i % 4) {
      case 0: // Cut from right
        x = x; y = y; w = w - newW; h = h;
        break;
      case 1: // Cut from bottom
        x = x; y = y; w = w; h = h - newH;
        break;
      case 2: // Cut from left
        x = x + newW; y = y; w = w - newW; h = h;
        break;
      case 3: // Cut from top
        x = x; y = y + newH; w = w; h = h - newH;
        break;
    }
  }

  // Golden spiral — approximation using quarter arcs
  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  // Manual spiral points for smooth curve
  const spiralPoints: [number, number][] = [];
  const steps = 200;
  const maxAngle = 4 * Math.PI;
  const centerX = s * 0.38, centerY = s * 0.38;
  const a = s * 0.005;
  const b = 0.3063; // growth factor for golden spiral
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * maxAngle;
    const r = a * Math.exp(b * theta);
    if (r > s * 0.6) break;
    const px = centerX + r * Math.cos(theta);
    const py = centerY + r * Math.sin(theta);
    spiralPoints.push([px, py]);
  }
  if (spiralPoints.length > 0) {
    ctx.moveTo(spiralPoints[0][0], spiralPoints[0][1]);
    for (let i = 1; i < spiralPoints.length; i++) {
      ctx.lineTo(spiralPoints[i][0], spiralPoints[i][1]);
    }
    ctx.stroke();
  }

  // Ratio text
  const fs = Math.max(5, s * 0.03);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.60);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('\u03C6 = 1.618', s * 0.95, s * 0.04);

  // Fibonacci numbers at rectangle centers
  ctx.fillStyle = withAlpha(color, 0.35);
  ctx.font = `${Math.max(4, s * 0.020)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fibs = [1, 1, 2, 3, 5, 8, 13, 21];
  for (let i = 0; i < Math.min(fibs.length, rects.length); i++) {
    const [rx, ry, rw, rh] = rects[i];
    ctx.fillText(`${fibs[i]}`, rx + rw / 2, ry + rh / 2);
  }

  // Proportional dividing lines
  ctx.strokeStyle = withAlpha(color, 0.25);
  ctx.lineWidth = 0.4;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(s / phi, 0); ctx.lineTo(s / phi, s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, s / phi); ctx.lineTo(s, s / phi); ctx.stroke();
  ctx.setLineDash([]);
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 3: MILITARY & TACTICAL (13-16)
// (17-18 in Chunk 3)
// ═══════════════════════════════════════════════════════════════

/** 13. Tactical HUD — military heads-up display */
function draw_tactical_hud(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const cx = s / 2, cy = s / 2;
  const m = s * 0.06;

  // Outer reticle frame with corner brackets
  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 1;
  const arm = s * 0.10;
  const corners: [number, number, number, number][] = [
    [m, m, 1, 1], [s - m, m, -1, 1],
    [m, s - m, 1, -1], [s - m, s - m, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * arm, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * arm);
    ctx.stroke();
  }

  // Center crosshair
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.08, cy); ctx.lineTo(cx - s * 0.02, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + s * 0.02, cy); ctx.lineTo(cx + s * 0.08, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.08); ctx.lineTo(cx, cy - s * 0.02); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.02); ctx.lineTo(cx, cy + s * 0.08); ctx.stroke();

  // Target lock brackets around center
  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 0.8;
  const lockSize = s * 0.12;
  const lockArm = s * 0.04;
  const lockCorners: [number, number, number, number][] = [
    [cx - lockSize, cy - lockSize, 1, 1], [cx + lockSize, cy - lockSize, -1, 1],
    [cx - lockSize, cy + lockSize, 1, -1], [cx + lockSize, cy + lockSize, -1, -1],
  ];
  for (const [x, y, dx, dy] of lockCorners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * lockArm, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * lockArm);
    ctx.stroke();
  }

  // Compass heading bar across top
  const fs = Math.max(4, s * 0.022);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.60);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const headings = ['N', '030', '060', 'E', '120', '150', 'S'];
  const headingY = m + s * 0.02;
  for (let i = 0; i < headings.length; i++) {
    const x = s * (0.12 + (i / (headings.length - 1)) * 0.76);
    ctx.fillText(headings[i], x, headingY);
    // Tick mark
    ctx.strokeStyle = withAlpha(color, 0.40);
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x, headingY + s * 0.025); ctx.lineTo(x, headingY + s * 0.035); ctx.stroke();
  }

  // Altitude/range readouts in corners
  ctx.font = `${Math.max(4, s * 0.020)}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.55);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('ALT: 847', m + s * 0.02, m + s * 0.12);
  ctx.textAlign = 'right';
  ctx.fillText('RNG: 1.2K', s - m - s * 0.02, m + s * 0.12);
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText('SPD: 340', m + s * 0.02, s - m - s * 0.02);

  // Level indicator
  ctx.strokeStyle = withAlpha(color, 0.40);
  ctx.lineWidth = 0.5;
  const lvlY = s - m - s * 0.10;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.10, lvlY); ctx.lineTo(cx + s * 0.10, lvlY); ctx.stroke();
  ctx.fillStyle = withAlpha(color, 0.50);
  dot(ctx, cx, lvlY, s * 0.005);

  // Status text
  ctx.font = `bold ${Math.max(5, s * 0.028)}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('TRACKING', cx, s - m - s * 0.02);
}

/** 14. Sniper Scope — precision reticle */
function draw_scope_reticle(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const cx = s / 2, cy = s / 2;
  const scopeR = s * 0.42;

  // Outer ring (thin)
  ctx.strokeStyle = withAlpha(color, 0.30);
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, scopeR, 0, Math.PI * 2); ctx.stroke();

  // Inner scope ring
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, scopeR * 0.92, 0, Math.PI * 2); ctx.stroke();

  // Fine crosshair lines
  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 0.6;
  // Horizontal
  ctx.beginPath(); ctx.moveTo(cx - scopeR * 0.9, cy); ctx.lineTo(cx - s * 0.02, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + s * 0.02, cy); ctx.lineTo(cx + scopeR * 0.9, cy); ctx.stroke();
  // Vertical
  ctx.beginPath(); ctx.moveTo(cx, cy - scopeR * 0.9); ctx.lineTo(cx, cy - s * 0.02); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.02); ctx.lineTo(cx, cy + scopeR * 0.9); ctx.stroke();

  // Mil-dot marks along crosshairs
  ctx.fillStyle = withAlpha(color, 0.55);
  const milSpacing = scopeR * 0.15;
  for (let i = 1; i <= 5; i++) {
    // Horizontal mil-dots
    dot(ctx, cx - milSpacing * i, cy, s * 0.004);
    dot(ctx, cx + milSpacing * i, cy, s * 0.004);
    // Vertical mil-dots
    dot(ctx, cx, cy - milSpacing * i, s * 0.004);
    dot(ctx, cx, cy + milSpacing * i, s * 0.004);
  }

  // Range estimation ladder (right of center, below crosshair)
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 0.5;
  for (let i = 1; i <= 5; i++) {
    const y = cy + milSpacing * i;
    const halfW = s * 0.015 * (6 - i);
    ctx.beginPath(); ctx.moveTo(cx + s * 0.04, y); ctx.lineTo(cx + s * 0.04 + halfW, y); ctx.stroke();
  }

  // BDC hash marks below center
  ctx.strokeStyle = withAlpha(color, 0.40);
  for (let i = 1; i <= 4; i++) {
    const y = cy + milSpacing * i;
    const w = s * 0.012 * (5 - i);
    ctx.beginPath(); ctx.moveTo(cx - w, y); ctx.lineTo(cx + w, y); ctx.stroke();
  }

  // Magnification text
  const fs = Math.max(4, s * 0.022);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('12x', s * 0.06, s * 0.06);
}

/** 15. Radar Sweep — rotating radar display */
function draw_radar_sweep(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const cx = s / 2, cy = s / 2;
  const maxR = s * 0.42;

  // Range rings
  ctx.strokeStyle = withAlpha(color, 0.35);
  ctx.lineWidth = 0.6;
  for (let i = 1; i <= 5; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (maxR / 5) * i, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Radial grid lines every 30°
  ctx.strokeStyle = withAlpha(color, 0.30);
  ctx.lineWidth = 0.4;
  for (let deg = 0; deg < 360; deg += 30) {
    const a = (deg * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + maxR * Math.cos(a), cy + maxR * Math.sin(a));
    ctx.stroke();
  }

  // Sweep wedge (45° wide, starting at ~315°)
  const sweepStart = -Math.PI * 0.75;
  const sweepEnd = sweepStart + Math.PI / 4;
  const gradient = ctx.createConicGradient(sweepStart, cx, cy);
  gradient.addColorStop(0, withAlpha(color, 0.0));
  gradient.addColorStop(0.08, withAlpha(color, 0.15));
  gradient.addColorStop(0.085, withAlpha(color, 0.0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, maxR, sweepStart, sweepEnd);
  ctx.closePath();
  ctx.fill();

  // Blip dots
  ctx.fillStyle = withAlpha(color, 0.60);
  const blips = [[0.35, 0.25], [0.65, 0.40], [0.55, 0.70], [0.30, 0.60], [0.75, 0.20]];
  for (const [xf, yf] of blips) {
    dot(ctx, s * xf, s * yf, s * 0.008);
  }

  // Center bright dot
  ctx.fillStyle = withAlpha(color, 0.65);
  dot(ctx, cx, cy, s * 0.006);

  // Cardinal labels
  const fs = Math.max(5, s * 0.028);
  ctx.font = `bold ${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.55);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('N', cx, cy - maxR - s * 0.01);
  ctx.textBaseline = 'top';
  ctx.fillText('S', cx, cy + maxR + s * 0.01);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText('W', cx - maxR - s * 0.01, cy);
  ctx.textAlign = 'left';
  ctx.fillText('E', cx + maxR + s * 0.01, cy);

  // North arrow at top
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.beginPath();
  ctx.moveTo(cx, cy - maxR - s * 0.04);
  ctx.lineTo(cx - 3, cy - maxR - s * 0.02);
  ctx.lineTo(cx + 3, cy - maxR - s * 0.02);
  ctx.fill();

  // Range numbers
  ctx.font = `${Math.max(4, s * 0.018)}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.40);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  for (let i = 1; i <= 5; i++) {
    ctx.fillText(`${i * 20}`, cx + 3, cy - (maxR / 5) * i);
  }
}

/** 16. Target Lock — targeting brackets display */
function draw_targeting_brackets(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const cx = s / 2, cy = s / 2;

  // Outer brackets (L-shapes)
  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 1.2;
  const outerD = s * 0.25;
  const outerArm = s * 0.08;
  const oCorners: [number, number, number, number][] = [
    [cx - outerD, cy - outerD, 1, 1], [cx + outerD, cy - outerD, -1, 1],
    [cx - outerD, cy + outerD, 1, -1], [cx + outerD, cy + outerD, -1, -1],
  ];
  for (const [x, y, dx, dy] of oCorners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * outerArm, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * outerArm);
    ctx.stroke();
  }

  // Inner brackets rotated 45°
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 0.8;
  const innerD = s * 0.15;
  const innerArm = s * 0.05;
  // Top
  ctx.beginPath(); ctx.moveTo(cx - innerArm, cy - innerD); ctx.lineTo(cx, cy - innerD); ctx.lineTo(cx, cy - innerD + innerArm); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + innerArm, cy - innerD); ctx.lineTo(cx, cy - innerD); ctx.stroke();
  // Bottom
  ctx.beginPath(); ctx.moveTo(cx - innerArm, cy + innerD); ctx.lineTo(cx, cy + innerD); ctx.lineTo(cx, cy + innerD - innerArm); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + innerArm, cy + innerD); ctx.lineTo(cx, cy + innerD); ctx.stroke();
  // Left
  ctx.beginPath(); ctx.moveTo(cx - innerD, cy - innerArm); ctx.lineTo(cx - innerD, cy); ctx.lineTo(cx - innerD + innerArm, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - innerD, cy + innerArm); ctx.lineTo(cx - innerD, cy); ctx.stroke();
  // Right
  ctx.beginPath(); ctx.moveTo(cx + innerD, cy - innerArm); ctx.lineTo(cx + innerD, cy); ctx.lineTo(cx + innerD - innerArm, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + innerD, cy + innerArm); ctx.lineTo(cx + innerD, cy); ctx.stroke();

  // Center diamond
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 0.8;
  const diaD = s * 0.05;
  ctx.beginPath();
  ctx.moveTo(cx, cy - diaD);
  ctx.lineTo(cx + diaD, cy);
  ctx.lineTo(cx, cy + diaD);
  ctx.lineTo(cx - diaD, cy);
  ctx.closePath();
  ctx.stroke();

  // TGT label
  const fs = Math.max(5, s * 0.028);
  ctx.font = `bold ${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.60);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('TGT', cx, cy - outerD - s * 0.02);

  // Distance readout
  ctx.font = `${Math.max(4, s * 0.022)}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.55);
  ctx.textBaseline = 'top';
  ctx.fillText('D: 0.47', cx, cy + outerD + s * 0.02);

  // Velocity vector arrow (short line pointing upper-right from center)
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + s * 0.06, cy - s * 0.04);
  ctx.stroke();
  // Arrowhead
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.06, cy - s * 0.04);
  ctx.lineTo(cx + s * 0.05, cy - s * 0.025);
  ctx.lineTo(cx + s * 0.048, cy - s * 0.042);
  ctx.fill();

  // Lead indicator circle offset from center
  ctx.strokeStyle = withAlpha(color, 0.40);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(cx + s * 0.08, cy - s * 0.06, s * 0.015, 0, Math.PI * 2);
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 3 continued: MILITARY & TACTICAL (17-18)
// ═══════════════════════════════════════════════════════════════

/** 17. Military Grid — MGRS-style coordinate grid */
function draw_grid_coordinates(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const gridSize = 8;
  const cellW = s / gridSize;

  // Grid lines
  ctx.strokeStyle = withAlpha(color, 0.30);
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= gridSize; i++) {
    ctx.beginPath(); ctx.moveTo(i * cellW, 0); ctx.lineTo(i * cellW, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cellW); ctx.lineTo(s, i * cellW); ctx.stroke();
  }

  // Checkerboard fill
  ctx.fillStyle = withAlpha(color, 0.05);
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if ((row + col) % 2 === 0) {
        ctx.fillRect(col * cellW, row * cellW, cellW, cellW);
      }
    }
  }

  // Grid labels along top (A-H)
  const fs = Math.max(4, s * 0.022);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const colLabels = 'ABCDEFGH';
  for (let i = 0; i < gridSize; i++) {
    ctx.fillText(colLabels[i], (i + 0.5) * cellW, cellW * 0.15);
  }
  // Numbers along left (1-8)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < gridSize; i++) {
    ctx.fillText(`${i + 1}`, cellW * 0.12, (i + 0.5) * cellW);
  }

  // Coordinate readout
  ctx.font = `${Math.max(5, s * 0.025)}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.60);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('GRID: 4C-7F', s * 0.95, s * 0.95);

  // North arrow
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 0.8;
  const naX = s * 0.92, naY = s * 0.08;
  ctx.beginPath(); ctx.moveTo(naX, naY - s * 0.03); ctx.lineTo(naX - 3, naY); ctx.lineTo(naX + 3, naY); ctx.fill();
  ctx.beginPath(); ctx.moveTo(naX, naY); ctx.lineTo(naX, naY + s * 0.02); ctx.stroke();
  ctx.font = `${Math.max(4, s * 0.018)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('N', naX, naY - s * 0.03);

  // Scale bar
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 0.7;
  const sbX = s * 0.05, sbY = s * 0.93;
  ctx.beginPath(); ctx.moveTo(sbX, sbY); ctx.lineTo(sbX + s * 0.12, sbY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sbX, sbY - 2); ctx.lineTo(sbX, sbY + 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sbX + s * 0.12, sbY - 2); ctx.lineTo(sbX + s * 0.12, sbY + 2); ctx.stroke();
  ctx.font = `${Math.max(4, s * 0.016)}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.45);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('100m', sbX + s * 0.06, sbY - 3);
}

/** 18. Threat Assessment — military threat warning display */
function draw_threat_display(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const cx = s / 2, cy = s / 2;

  // 3 concentric zones
  const zones = [
    { r: s * 0.12, label: 'GREEN' },
    { r: s * 0.25, label: 'YELLOW' },
    { r: s * 0.38, label: 'RED' },
  ];
  ctx.lineWidth = 0.8;
  for (const zone of zones) {
    ctx.strokeStyle = withAlpha(color, 0.40);
    ctx.beginPath();
    ctx.arc(cx, cy, zone.r, 0, Math.PI * 2);
    ctx.stroke();
    // Zone label
    const fs = Math.max(4, s * 0.018);
    ctx.font = `${fs}px monospace`;
    ctx.fillStyle = withAlpha(color, 0.35);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(zone.label, cx + zone.r * 0.7, cy - zone.r * 0.7 - 2);
  }

  // Threat markers (triangles pointing inward)
  ctx.fillStyle = withAlpha(color, 0.55);
  const threats = [
    [0.20, 0.15], [0.80, 0.25], [0.85, 0.70],
    [0.15, 0.75], [0.60, 0.10], [0.35, 0.88],
  ];
  for (const [xf, yf] of threats) {
    const tx = s * xf, ty = s * yf;
    const angle = Math.atan2(cy - ty, cx - tx);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(s * 0.015, 0);
    ctx.lineTo(-s * 0.008, -s * 0.008);
    ctx.lineTo(-s * 0.008, s * 0.008);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Directional threat arrow to first marker
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 0.6;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(s * threats[0][0], s * threats[0][1]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Alert text
  const fs2 = Math.max(5, s * 0.025);
  ctx.font = `${fs2}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.60);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('ALERT LEVEL: NOMINAL', cx, s * 0.04);

  // Status indicator squares
  ctx.fillStyle = withAlpha(color, 0.50);
  const sqSize = s * 0.012;
  const sqY = s * 0.92;
  const sqStartX = cx - 5 * (sqSize + 3);
  for (let i = 0; i < 8; i++) {
    const sx = sqStartX + i * (sqSize + 3);
    if (i < 5) {
      ctx.fillRect(sx, sqY, sqSize, sqSize);
    } else {
      ctx.strokeStyle = withAlpha(color, 0.35);
      ctx.lineWidth = 0.5;
      ctx.strokeRect(sx, sqY, sqSize, sqSize);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 4: SCIENTIFIC & DATA (19-24)
// ═══════════════════════════════════════════════════════════════

/** 19. DNA Double Helix — two intertwined strands */
function draw_dna_helix(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const cx = s / 2;
  const topY = s * 0.05, botY = s * 0.95;
  const height = botY - topY;
  const amp = s * 0.12;
  const cycles = 3.5;
  const steps = 80;
  const basePairs = ['A-T', 'G-C', 'T-A', 'C-G', 'A-T', 'G-C', 'T-A', 'C-G', 'G-C', 'A-T'];

  // Strand 1
  ctx.strokeStyle = withAlpha(color, 0.55);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = topY + height * t;
    const x = cx + Math.sin(t * Math.PI * 2 * cycles) * amp;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Strand 2 (phase offset by π)
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = topY + height * t;
    const x = cx + Math.sin(t * Math.PI * 2 * cycles + Math.PI) * amp;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Base pair rungs
  ctx.strokeStyle = withAlpha(color, 0.40);
  ctx.lineWidth = 0.6;
  const rungCount = 20;
  const fs = Math.max(3, s * 0.016);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.45);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < rungCount; i++) {
    const t = (i + 0.5) / rungCount;
    const y = topY + height * t;
    const x1 = cx + Math.sin(t * Math.PI * 2 * cycles) * amp;
    const x2 = cx + Math.sin(t * Math.PI * 2 * cycles + Math.PI) * amp;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    // Nucleotide circles at connection points
    ctx.fillStyle = withAlpha(color, 0.40);
    dot(ctx, x1, y, s * 0.004);
    dot(ctx, x2, y, s * 0.004);
    // Base pair label on every 3rd rung
    if (i % 3 === 0) {
      ctx.fillStyle = withAlpha(color, 0.45);
      ctx.fillText(basePairs[i % basePairs.length], (x1 + x2) / 2, y);
    }
  }
}

/** 20. Atomic Orbitals — electron orbital diagram */
function draw_atomic_orbital(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const cx = s / 2, cy = s / 2;

  // Central nucleus
  ctx.fillStyle = withAlpha(color, 0.60);
  dot(ctx, cx, cy, s * 0.02);

  // 3 elliptical orbital paths at 0°, 60°, 120°
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 0.8;
  const orbitalAngles = [0, Math.PI / 3, (2 * Math.PI) / 3];
  const orbitalRx = s * 0.35, orbitalRy = s * 0.12;

  for (let oi = 0; oi < orbitalAngles.length; oi++) {
    const angle = orbitalAngles[oi];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, orbitalRx, orbitalRy, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Electron dots on each orbital
    ctx.fillStyle = withAlpha(color, 0.60);
    const electronAngle = (oi * 2.1); // Different position on each orbital
    const ex = cx + orbitalRx * Math.cos(electronAngle) * Math.cos(angle) - orbitalRy * Math.sin(electronAngle) * Math.sin(angle);
    const ey = cy + orbitalRx * Math.cos(electronAngle) * Math.sin(angle) + orbitalRy * Math.sin(electronAngle) * Math.cos(angle);
    dot(ctx, ex, ey, s * 0.01);
  }

  // Orbital labels
  const fs = Math.max(4, s * 0.020);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('1s', cx + s * 0.04, cy - s * 0.03);
  ctx.fillText('2p', cx + orbitalRx * 0.7, cy - orbitalRy * 1.3);
  ctx.fillText('3d', cx - orbitalRx * 0.5, cy - orbitalRy * 2);

  // Energy level lines on left side
  ctx.strokeStyle = withAlpha(color, 0.35);
  ctx.lineWidth = 0.5;
  const levels = [
    { y: s * 0.15, label: 'n=3' },
    { y: s * 0.30, label: 'n=2' },
    { y: s * 0.50, label: 'n=1' },
  ];
  for (const lv of levels) {
    ctx.beginPath();
    ctx.moveTo(s * 0.04, lv.y);
    ctx.lineTo(s * 0.14, lv.y);
    ctx.stroke();
    ctx.font = `${Math.max(3, s * 0.016)}px monospace`;
    ctx.fillStyle = withAlpha(color, 0.35);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(lv.label, s * 0.04, lv.y - 2);
  }
}

/** 21. Signal Waveform — oscilloscope display */
function draw_waveform(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const m = s * 0.08;
  const plotW = s - 2 * m;
  const plotH = s - 2 * m;
  const cx = s / 2, cy = s / 2;

  // Grid
  ctx.strokeStyle = withAlpha(color, 0.20);
  ctx.lineWidth = 0.4;
  const gridLines = 8;
  for (let i = 0; i <= gridLines; i++) {
    const x = m + (plotW / gridLines) * i;
    const y = m + (plotH / gridLines) * i;
    ctx.beginPath(); ctx.moveTo(x, m); ctx.lineTo(x, s - m); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m, y); ctx.lineTo(s - m, y); ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(m, cy); ctx.lineTo(s - m, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(m, m); ctx.lineTo(m, s - m); ctx.stroke();

  // Waveform: sin(x) + 0.3*sin(3x) + 0.1*sin(5x)
  ctx.strokeStyle = withAlpha(color, 0.65);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const samples = 200;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = m + plotW * t;
    const waveX = t * Math.PI * 6; // 3 full cycles
    const waveY = Math.sin(waveX) + 0.3 * Math.sin(3 * waveX) + 0.1 * Math.sin(5 * waveX);
    const y = cy - waveY * plotH * 0.3;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Time base markings
  const fs = Math.max(4, s * 0.020);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 1; i <= 4; i++) {
    ctx.fillText(`${i}ms`, m + (plotW / 5) * i, s - m + 3);
  }

  // Amplitude markings
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('+5V', m - 3, m + plotH * 0.15);
  ctx.fillText('0', m - 3, cy);
  ctx.fillText('-5V', m - 3, s - m - plotH * 0.15);

  // Trigger level indicator (arrow on left)
  ctx.fillStyle = withAlpha(color, 0.55);
  const trigY = cy - plotH * 0.15;
  ctx.beginPath();
  ctx.moveTo(m - 1, trigY);
  ctx.lineTo(m - 5, trigY - 3);
  ctx.lineTo(m - 5, trigY + 3);
  ctx.fill();
}

/** 22. Star Chart — constellation map */
function draw_star_chart(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;

  // Milky Way band (diagonal faint stripe)
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate(Math.PI / 6);
  ctx.fillStyle = withAlpha(color, 0.04);
  ctx.fillRect(-s * 0.6, -s * 0.12, s * 1.2, s * 0.24);
  ctx.restore();

  // Grid lines (RA/Dec curves — gentle arcs approximated as lines)
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.3;
  for (let i = 1; i < 6; i++) {
    const x = s * (i / 6);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke();
  }
  for (let i = 1; i < 6; i++) {
    const y = s * (i / 6);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(s / 2, y + s * 0.02 * (i % 2 === 0 ? 1 : -1), s, y);
    ctx.stroke();
  }

  // Stars — varying sizes and opacities
  const stars: [number, number, number, number][] = [
    // [x%, y%, radius_mult, opacity]
    [0.12, 0.15, 2.0, 0.70], [0.25, 0.08, 1.5, 0.55], [0.40, 0.20, 1.8, 0.65],
    [0.55, 0.12, 1.2, 0.45], [0.72, 0.18, 2.2, 0.70], [0.88, 0.10, 1.0, 0.35],
    [0.08, 0.35, 1.3, 0.50], [0.22, 0.42, 1.6, 0.60], [0.38, 0.38, 1.0, 0.40],
    [0.52, 0.32, 2.0, 0.65], [0.68, 0.40, 1.4, 0.50], [0.82, 0.35, 1.8, 0.60],
    [0.95, 0.42, 1.0, 0.35], [0.15, 0.55, 1.5, 0.55], [0.30, 0.60, 2.5, 0.70],
    [0.48, 0.52, 1.2, 0.45], [0.62, 0.58, 1.8, 0.60], [0.78, 0.55, 1.0, 0.35],
    [0.92, 0.62, 1.6, 0.55], [0.10, 0.72, 1.3, 0.50], [0.28, 0.78, 1.0, 0.40],
    [0.42, 0.75, 2.0, 0.65], [0.58, 0.70, 1.5, 0.50], [0.75, 0.78, 1.8, 0.60],
    [0.90, 0.72, 1.2, 0.45], [0.18, 0.88, 1.6, 0.55], [0.35, 0.92, 2.2, 0.70],
    [0.55, 0.85, 1.0, 0.40], [0.70, 0.90, 1.4, 0.50], [0.85, 0.88, 1.8, 0.60],
    [0.05, 0.48, 1.0, 0.30], [0.50, 0.45, 1.3, 0.45], [0.65, 0.25, 1.0, 0.35],
    [0.33, 0.28, 1.5, 0.50], [0.80, 0.48, 1.0, 0.35],
  ];

  for (const [xf, yf, rm, a] of stars) {
    ctx.fillStyle = withAlpha(color, a);
    dot(ctx, s * xf, s * yf, s * 0.003 * rm);
  }

  // Constellation lines (connecting stars by index)
  ctx.strokeStyle = withAlpha(color, 0.35);
  ctx.lineWidth = 0.5;
  // Constellation 1 (indices 0, 2, 4, 9, 11)
  const c1 = [0, 2, 4, 11, 9];
  for (let i = 0; i < c1.length - 1; i++) {
    const [x1, y1] = [s * stars[c1[i]][0], s * stars[c1[i]][1]];
    const [x2, y2] = [s * stars[c1[i + 1]][0], s * stars[c1[i + 1]][1]];
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  // Constellation 2 (indices 14, 16, 21, 23, 29)
  const c2 = [14, 16, 21, 23, 29];
  for (let i = 0; i < c2.length - 1; i++) {
    const [x1, y1] = [s * stars[c2[i]][0], s * stars[c2[i]][1]];
    const [x2, y2] = [s * stars[c2[i + 1]][0], s * stars[c2[i + 1]][1]];
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  // Constellation 3 (indices 7, 15, 20, 25)
  const c3 = [7, 15, 20, 25];
  for (let i = 0; i < c3.length - 1; i++) {
    const [x1, y1] = [s * stars[c3[i]][0], s * stars[c3[i]][1]];
    const [x2, y2] = [s * stars[c3[i + 1]][0], s * stars[c3[i + 1]][1]];
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  // Bright star labels
  const fs = Math.max(3, s * 0.016);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.55);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('\u03B1', s * stars[0][0] + 4, s * stars[0][1] - 2);
  ctx.fillText('\u03B2', s * stars[14][0] + 4, s * stars[14][1] - 2);
  ctx.fillText('\u03B3', s * stars[4][0] + 4, s * stars[4][1] - 2);
  ctx.fillText('\u03B4', s * stars[26][0] + 4, s * stars[26][1] - 2);
}

/** 23. Data Matrix — binary/hex data visualization */
function draw_data_matrix(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const chars = '01234567890ABCDEF';
  const fs = Math.max(4, s * 0.022);
  const cellH = fs * 1.4;
  const cellW = fs * 0.75;
  const cols = Math.floor(s / cellW);
  const rows = Math.floor(s / cellH);

  ctx.font = `${fs}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Pick a "decoded" column
  const decodedCol = Math.floor(cols * 0.4);

  // Pick highlight positions
  const highlights = new Set([
    `${3},${5}`, `${7},${12}`, `${decodedCol},${8}`, `${decodedCol},${15}`,
    `${10},${3}`, `${2},${18}`, `${decodedCol},${4}`, `${decodedCol},${20}`,
  ]);

  // Simple seeded random for character selection
  let seed = 42;
  const nextRand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  for (let col = 0; col < cols; col++) {
    // Column-based opacity variation (rain effect)
    const colBase = 0.15 + (nextRand() * 0.10);
    const isDecoded = col === decodedCol;

    for (let row = 0; row < rows; row++) {
      const x = col * cellW + cellW / 2;
      const y = row * cellH + cellH / 2;
      const key = `${col},${row}`;
      const ch = chars[Math.floor(nextRand() * chars.length)];

      // Row-based fade (top rows brighter for rain effect)
      const rowFade = 1 - (row / rows) * 0.3;

      if (isDecoded) {
        ctx.fillStyle = withAlpha(color, 0.55 * rowFade);
      } else if (highlights.has(key)) {
        ctx.fillStyle = withAlpha(color, 0.50);
      } else {
        ctx.fillStyle = withAlpha(color, colBase * rowFade);
      }
      ctx.fillText(ch, x, y);
    }
  }
}

/** 24. Neural Network — AI/ML network diagram */
function draw_neural_network(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  const s = size;
  const layers = [4, 6, 6, 3]; // input, hidden1, hidden2, output
  const layerX = [s * 0.12, s * 0.38, s * 0.62, s * 0.88];
  const nodeR = s * 0.018;

  // Calculate node positions
  const nodes: [number, number][][] = [];
  for (let l = 0; l < layers.length; l++) {
    const layerNodes: [number, number][] = [];
    const count = layers[l];
    const totalH = (count - 1) * s * 0.10;
    const startY = s / 2 - totalH / 2;
    for (let n = 0; n < count; n++) {
      layerNodes.push([layerX[l], startY + n * s * 0.10]);
    }
    nodes.push(layerNodes);
  }

  // Draw all connections (light)
  ctx.strokeStyle = withAlpha(color, 0.15);
  ctx.lineWidth = 0.4;
  for (let l = 0; l < layers.length - 1; l++) {
    for (const [x1, y1] of nodes[l]) {
      for (const [x2, y2] of nodes[l + 1]) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
  }

  // Highlighted "active" path (brighter connections)
  ctx.strokeStyle = withAlpha(color, 0.50);
  ctx.lineWidth = 1;
  // Path: input[1] -> hidden1[2] -> hidden2[3] -> output[1]
  const activePath = [[0, 1], [1, 2], [2, 3], [3, 1]];
  for (let i = 0; i < activePath.length - 1; i++) {
    const [l1, n1] = activePath[i];
    const [l2, n2] = activePath[i + 1];
    const [x1, y1] = nodes[l1][n1];
    const [x2, y2] = nodes[l2][n2];
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  // Second active path
  const activePath2 = [[0, 3], [1, 4], [2, 2], [3, 0]];
  for (let i = 0; i < activePath2.length - 1; i++) {
    const [l1, n1] = activePath2[i];
    const [l2, n2] = activePath2[i + 1];
    if (n1 < nodes[l1].length && n2 < nodes[l2].length) {
      const [x1, y1] = nodes[l1][n1];
      const [x2, y2] = nodes[l2][n2];
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  // Draw node circles
  for (let l = 0; l < layers.length; l++) {
    for (const [x, y] of nodes[l]) {
      // Fill
      ctx.fillStyle = withAlpha(color, 0.12);
      ctx.beginPath();
      ctx.arc(x, y, nodeR, 0, Math.PI * 2);
      ctx.fill();
      // Stroke
      ctx.strokeStyle = withAlpha(color, 0.50);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, nodeR, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Bias nodes (small squares) connected to hidden layers
  ctx.strokeStyle = withAlpha(color, 0.40);
  ctx.fillStyle = withAlpha(color, 0.10);
  ctx.lineWidth = 0.6;
  for (let l = 1; l < layers.length; l++) {
    const bx = layerX[l] - s * 0.06;
    const by = s * 0.06;
    const bSize = nodeR * 0.8;
    ctx.strokeRect(bx - bSize, by - bSize, bSize * 2, bSize * 2);
    ctx.fillRect(bx - bSize, by - bSize, bSize * 2, bSize * 2);
    // Connection line from bias to first node in layer
    ctx.strokeStyle = withAlpha(color, 0.25);
    ctx.lineWidth = 0.3;
    ctx.beginPath(); ctx.moveTo(bx, by + bSize); ctx.lineTo(nodes[l][0][0], nodes[l][0][1]); ctx.stroke();
    ctx.strokeStyle = withAlpha(color, 0.40);
    ctx.lineWidth = 0.6;
  }

  // Layer labels
  const fs = Math.max(4, s * 0.020);
  ctx.font = `${fs}px monospace`;
  ctx.fillStyle = withAlpha(color, 0.50);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const layerLabels = ['INPUT', 'HIDDEN', 'HIDDEN', 'OUTPUT'];
  for (let l = 0; l < layers.length; l++) {
    ctx.fillText(layerLabels[l], layerX[l], s * 0.92);
  }
}

// ═══════════════════════════════════════════════════════════════
// SCHEMATIC REGISTRY — all 24 schematics
// ═══════════════════════════════════════════════════════════════

export const SCHEMATIC_REGISTRY: Record<string, (ctx: CanvasRenderingContext2D, color: string, size: number) => void> = {
  pcb_circuit: draw_pcb_circuit,
  pcb_dense: draw_pcb_dense,
  circuit_radial: draw_circuit_radial,
  logic_gates: draw_logic_gates,
  resistor_network: draw_resistor_network,
  microchip: draw_microchip,
  hex_grid: draw_hex_grid,
  triangle_mesh: draw_triangle_mesh,
  isometric_grid: draw_isometric_grid,
  concentric_rings: draw_concentric_rings,
  blueprint_frame: draw_blueprint_frame,
  golden_ratio: draw_golden_ratio,
  tactical_hud: draw_tactical_hud,
  scope_reticle: draw_scope_reticle,
  radar_sweep: draw_radar_sweep,
  targeting_brackets: draw_targeting_brackets,
  grid_coordinates: draw_grid_coordinates,
  threat_display: draw_threat_display,
  dna_helix: draw_dna_helix,
  atomic_orbital: draw_atomic_orbital,
  waveform: draw_waveform,
  star_chart: draw_star_chart,
  data_matrix: draw_data_matrix,
  neural_network: draw_neural_network,
};

/** Schematic info for UI display */
export const SCHEMATIC_INFO: { id: string; label: string; desc: string; category: string }[] = [
  // Circuit & PCB
  { id: 'pcb_circuit',      label: 'PCB CIRCUIT',      desc: 'Dense circuit board traces',     category: 'CIRCUIT & PCB' },
  { id: 'pcb_dense',        label: 'DENSE CIRCUIT',    desc: 'Multi-layer PCB grid',           category: 'CIRCUIT & PCB' },
  { id: 'circuit_radial',   label: 'RADIAL CIRCUIT',   desc: 'Spider-web trace pattern',       category: 'CIRCUIT & PCB' },
  { id: 'logic_gates',      label: 'LOGIC GATES',      desc: 'Digital logic diagram',          category: 'CIRCUIT & PCB' },
  { id: 'resistor_network', label: 'RESISTOR NET',     desc: 'Electrical component schematic', category: 'CIRCUIT & PCB' },
  { id: 'microchip',        label: 'MICROCHIP DIE',    desc: 'Silicon die top-down view',      category: 'CIRCUIT & PCB' },
  // Geometric & Architectural
  { id: 'hex_grid',         label: 'HEX GRID',         desc: 'Honeycomb cell pattern',         category: 'GEOMETRIC' },
  { id: 'triangle_mesh',    label: 'TRIANGLE MESH',    desc: 'Wireframe triangulation',        category: 'GEOMETRIC' },
  { id: 'isometric_grid',   label: 'ISOMETRIC',        desc: '3D isometric cube grid',         category: 'GEOMETRIC' },
  { id: 'concentric_rings', label: 'CONCENTRIC',       desc: 'Radar target rings',             category: 'GEOMETRIC' },
  { id: 'blueprint_frame',  label: 'BLUEPRINT',        desc: 'Engineering drawing frame',      category: 'GEOMETRIC' },
  { id: 'golden_ratio',     label: 'GOLDEN SPIRAL',    desc: 'Fibonacci ratio overlay',        category: 'GEOMETRIC' },
  // Military & Tactical
  { id: 'tactical_hud',     label: 'TACTICAL HUD',     desc: 'Military heads-up display',      category: 'MILITARY' },
  { id: 'scope_reticle',    label: 'SNIPER SCOPE',     desc: 'Precision rifle reticle',        category: 'MILITARY' },
  { id: 'radar_sweep',      label: 'RADAR SWEEP',      desc: 'Rotating radar display',         category: 'MILITARY' },
  { id: 'targeting_brackets', label: 'TARGET LOCK',    desc: 'Targeting bracket system',       category: 'MILITARY' },
  { id: 'grid_coordinates', label: 'MILITARY GRID',    desc: 'MGRS coordinate overlay',        category: 'MILITARY' },
  { id: 'threat_display',   label: 'THREAT ASSESS',    desc: 'Threat warning zones',           category: 'MILITARY' },
  // Scientific & Data
  { id: 'dna_helix',        label: 'DNA HELIX',        desc: 'Double helix strand',            category: 'SCIENTIFIC' },
  { id: 'atomic_orbital',   label: 'ATOMIC ORBITAL',   desc: 'Electron orbit diagram',         category: 'SCIENTIFIC' },
  { id: 'waveform',         label: 'WAVEFORM',         desc: 'Oscilloscope signal display',    category: 'SCIENTIFIC' },
  { id: 'star_chart',       label: 'STAR CHART',       desc: 'Constellation star map',         category: 'SCIENTIFIC' },
  { id: 'data_matrix',      label: 'DATA MATRIX',      desc: 'Binary data rain pattern',       category: 'SCIENTIFIC' },
  { id: 'neural_network',   label: 'NEURAL NET',       desc: 'AI network node diagram',        category: 'SCIENTIFIC' },
];

/** Master draw function — called from AvatarPreview */
export function drawSchematicOverlay(
  ctx: CanvasRenderingContext2D,
  schematicId: string,
  color: string,
  size: number,
): void {
  const drawFn = SCHEMATIC_REGISTRY[schematicId];
  if (drawFn) {
    drawFn(ctx, color, size);
  }
}
