/**
 * SPACEBOT.SPACE — Shared Avatar Accessories (Orbital & Science)
 * 20 accessories that work on BOTH bot and human avatars.
 * Drawn after type-specific accessories on the main canvas.
 *
 * electron_orbits, dna_helix, saturn_rings, particle_cloud, fibonacci_spiral,
 * atom_burst, shield_arcs_orbital, binary_rain, sound_waves, gravitational_lens,
 * quantum_link, star_field, holographic_horns, propeller_cap, earbuds_wire,
 * square_ears, ear_cuffs, round_glasses, eye_patch, mohawk_fin
 */

import type { RobotConfig, FactionPalette } from './avatarConfig';
import { seededRandom } from './avatarSeeder';
import { lightenColor, darkenColor, withAlpha } from './avatarUtils';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface AccParams {
  ctx: CanvasRenderingContext2D;
  size: number;
  cx: number;
  cy: number;
  faceR: number;
  primary: string;
  light: string;
  dark: string;
  serial: string;
}

type AccDrawFn = (p: AccParams) => void;

// ═══════════════════════════════════════════════════════════════
// DISPATCH TABLE
// ═══════════════════════════════════════════════════════════════

const ACC_DRAW: Record<string, AccDrawFn> = {
  electron_orbits: drawElectronOrbits,
  dna_helix: drawDnaHelix,
  saturn_rings: drawSaturnRings,
  particle_cloud: drawParticleCloud,
  fibonacci_spiral: drawFibonacciSpiral,
  atom_burst: drawAtomBurst,
  shield_arcs_orbital: drawShieldArcsOrbital,
  binary_rain: drawBinaryRain,
  sound_waves: drawSoundWaves,
  gravitational_lens: drawGravitationalLens,
  quantum_link: drawQuantumLink,
  star_field: drawStarField,
  holographic_horns: drawHolographicHorns,
  propeller_cap: drawPropellerCap,
  earbuds_wire: drawEarbudsWire,
  square_ears: drawSquareEars,
  ear_cuffs: drawEarCuffs,
  round_glasses: drawRoundGlasses,
  eye_patch: drawEyePatch,
  mohawk_fin: drawMohawkFin,
};

// Behind-face accessories that need destination-over composite
const BEHIND_FACE: Set<string> = new Set([
  'atom_burst',
]);

// ═══════════════════════════════════════════════════════════════
// MASTER DRAW — called from AvatarGenerator for ALL avatars
// ═══════════════════════════════════════════════════════════════

export function drawSharedAccessories(
  ctx: CanvasRenderingContext2D,
  config: RobotConfig,
  colors: FactionPalette,
  canvasSize: number,
): void {
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const faceR = canvasSize * 0.38;
  const p: AccParams = {
    ctx,
    size: canvasSize,
    cx,
    cy,
    faceR,
    primary: colors.primary,
    light: colors.light,
    dark: colors.dark,
    serial: config.serialSuffix,
  };

  // Shared names may be in either humanAccessories or botAccessories
  const allAcc = [...config.humanAccessories, ...config.botAccessories];

  // Draw behind-face items first (destination-over)
  for (const acc of allAcc) {
    if (BEHIND_FACE.has(acc)) {
      const fn = ACC_DRAW[acc];
      if (fn) fn(p);
    }
  }

  // Draw on-top items
  for (const acc of allAcc) {
    if (!BEHIND_FACE.has(acc)) {
      const fn = ACC_DRAW[acc];
      if (fn) fn(p);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════

function eyePositions(cx: number, cy: number, faceR: number) {
  const eyeY = cy - faceR * 0.1;
  const eyeSpacing = faceR * 0.55;
  return {
    eyeY,
    leftEyeX: cx - eyeSpacing,
    rightEyeX: cx + eyeSpacing,
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. ELECTRON ORBITS — Atomic Electron Rings
// ═══════════════════════════════════════════════════════════════

function drawElectronOrbits({ ctx, cx, cy, faceR, size, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':orbits');

  const orbits = [
    { rx: faceR * 1.3, ry: faceR * 0.4, angle: 15, alpha: 0.18, sw: 0.6 },
    { rx: faceR * 1.2, ry: faceR * 0.35, angle: -40, alpha: 0.14, sw: 0.5 },
  ];

  // 50% chance of a third ring
  if (rng() > 0.5) {
    orbits.push({ rx: faceR * 1.1, ry: faceR * 0.3, angle: 70, alpha: 0.10, sw: 0.4 });
  }

  for (const orbit of orbits) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(orbit.angle * Math.PI / 180);

    // Orbit ring
    ctx.beginPath();
    ctx.ellipse(0, 0, orbit.rx, orbit.ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(primary, orbit.alpha);
    ctx.lineWidth = orbit.sw;
    ctx.stroke();

    // Electron dot — positioned along the ring by seed
    const electronAngle = rng() * Math.PI * 2;
    const ex = Math.cos(electronAngle) * orbit.rx;
    const ey = Math.sin(electronAngle) * orbit.ry;

    ctx.save();
    ctx.shadowBlur = 3;
    ctx.shadowColor = primary;
    ctx.beginPath();
    ctx.arc(ex, ey, size * 0.006, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(primary, 0.6);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. DNA HELIX — Double Helix Spiral
// ═══════════════════════════════════════════════════════════════

function drawDnaHelix({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const centerX = cx + faceR * 1.1;
  const topY = cy - faceR * 0.8;
  const botY = cy + faceR * 0.8;
  const amplitude = size * 0.03;
  const steps = 40;
  const rotations = 2.5;
  const height = botY - topY;

  // Generate both strands
  const strand1: Array<{ x: number; y: number; depth: number }> = [];
  const strand2: Array<{ x: number; y: number; depth: number }> = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = topY + height * t;
    const angle = t * rotations * Math.PI * 2;
    strand1.push({ x: centerX + Math.sin(angle) * amplitude, y, depth: Math.cos(angle) });
    strand2.push({ x: centerX - Math.sin(angle) * amplitude, y, depth: -Math.cos(angle) });
  }

  // Draw strands — brightness varies with depth (front vs back)
  for (const strand of [strand1, strand2]) {
    for (let i = 0; i < strand.length - 1; i++) {
      const p = strand[i];
      const n = strand[i + 1];
      const alpha = p.depth > 0 ? 0.22 : 0.12;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(n.x, n.y);
      ctx.strokeStyle = withAlpha(primary, alpha);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  // Rungs — connect strands at regular intervals
  const rungCount = 6;
  for (let i = 0; i < rungCount; i++) {
    const idx = Math.floor(((i + 0.5) / rungCount) * steps);
    const s1 = strand1[idx];
    const s2 = strand2[idx];
    if (s1 && s2) {
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.strokeStyle = withAlpha(primary, 0.1);
      ctx.lineWidth = 0.3;
      ctx.stroke();
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. SATURN RINGS — Flat Ring Around Head
// ═══════════════════════════════════════════════════════════════

function drawSaturnRings({ ctx, cx, cy, faceR, primary }: AccParams): void {
  const ringCy = cy + faceR * 0.1;
  const mainOuterRx = faceR * 1.5;
  const mainOuterRy = faceR * 0.26;
  const mainInnerRx = faceR * 1.12;
  const mainInnerRy = faceR * 0.145;

  const outerBandOuterRx = faceR * 1.68;
  const outerBandOuterRy = faceR * 0.3;
  const outerBandInnerRx = faceR * 1.56;
  const outerBandInnerRy = faceR * 0.24;

  ctx.save();

  // Sci-fi glow around both bands
  ctx.shadowBlur = faceR * 0.16;
  ctx.shadowColor = withAlpha(primary, 0.75);

  // Main ring band
  ctx.beginPath();
  ctx.ellipse(cx, ringCy, mainOuterRx, mainOuterRy, 0, 0, Math.PI * 2);
  ctx.ellipse(cx, ringCy, mainInnerRx, mainInnerRy, 0, Math.PI * 2, 0, true);
  ctx.fillStyle = withAlpha(primary, 0.42);
  ctx.fill();

  // Outer secondary band
  ctx.beginPath();
  ctx.ellipse(cx, ringCy, outerBandOuterRx, outerBandOuterRy, 0, 0, Math.PI * 2);
  ctx.ellipse(cx, ringCy, outerBandInnerRx, outerBandInnerRy, 0, Math.PI * 2, 0, true);
  ctx.fillStyle = withAlpha(primary, 0.28);
  ctx.fill();

  ctx.shadowBlur = 0;

  // Cassini-like division gap between the two bands
  const divisionRx = (mainOuterRx + outerBandInnerRx) / 2;
  const divisionRy = (mainOuterRy + outerBandInnerRy) / 2;
  ctx.beginPath();
  ctx.ellipse(cx, ringCy, divisionRx, divisionRy, 0, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha('#000000', 0.55);
  ctx.lineWidth = Math.max(0.8, faceR * 0.018);
  ctx.stroke();

  // Brighter near-side (bottom) arcs for depth
  const nearStart = Math.PI * 0.03;
  const nearEnd = Math.PI - Math.PI * 0.03;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.ellipse(cx, ringCy, mainOuterRx, mainOuterRy, 0, nearStart, nearEnd);
  ctx.strokeStyle = withAlpha(primary, 0.82);
  ctx.lineWidth = Math.max(1.3, faceR * 0.03);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, ringCy, mainInnerRx, mainInnerRy, 0, nearStart, nearEnd);
  ctx.strokeStyle = withAlpha(primary, 0.72);
  ctx.lineWidth = Math.max(1.1, faceR * 0.024);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, ringCy, outerBandOuterRx, outerBandOuterRy, 0, nearStart, nearEnd);
  ctx.strokeStyle = withAlpha(primary, 0.62);
  ctx.lineWidth = Math.max(1, faceR * 0.022);
  ctx.stroke();

  // Darker far-side (top) arcs to enhance 3D depth
  const farStart = Math.PI;
  const farEnd = Math.PI * 2;
  ctx.beginPath();
  ctx.ellipse(cx, ringCy, mainOuterRx, mainOuterRy, 0, farStart, farEnd);
  ctx.strokeStyle = withAlpha('#000000', 0.28);
  ctx.lineWidth = Math.max(1.1, faceR * 0.024);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, ringCy, outerBandOuterRx, outerBandOuterRy, 0, farStart, farEnd);
  ctx.strokeStyle = withAlpha('#000000', 0.22);
  ctx.lineWidth = Math.max(0.9, faceR * 0.02);
  ctx.stroke();

  // Crisp edge highlights for the main ring
  ctx.beginPath();
  ctx.ellipse(cx, ringCy, mainOuterRx, mainOuterRy, 0, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(primary, 0.7);
  ctx.lineWidth = Math.max(0.9, faceR * 0.018);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, ringCy, mainInnerRx, mainInnerRy, 0, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(primary, 0.62);
  ctx.lineWidth = Math.max(0.85, faceR * 0.016);
  ctx.stroke();

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// 4. PARTICLE CLOUD — Floating Particle Field
// ═══════════════════════════════════════════════════════════════

function drawParticleCloud({ ctx, cx, cy, faceR, size, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':particles');
  const count = 10 + Math.floor(rng() * 6); // 10-15

  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = faceR * (0.9 + rng() * 0.7);
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;

    const closeness = 1 - (dist - faceR * 0.9) / (faceR * 0.7);
    const r = size * (0.003 + closeness * 0.005);
    const alpha = 0.15 + closeness * 0.25;

    ctx.save();
    ctx.shadowBlur = r * 2;
    ctx.shadowColor = primary;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(primary, alpha);
    ctx.fill();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. FIBONACCI SPIRAL — Golden Ratio Spiral
// ═══════════════════════════════════════════════════════════════

function drawFibonacciSpiral({ ctx, cx, cy, faceR, primary }: AccParams): void {
  const originX = cx - faceR * 0.1;
  const originY = cy + faceR * 0.1;

  ctx.save();
  ctx.shadowBlur = 2;
  ctx.shadowColor = primary;
  ctx.beginPath();

  const steps = 80;
  const maxAngle = 4 * Math.PI;
  const growthRate = 0.15;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * maxAngle;
    const r = faceR * 0.08 * Math.exp(growthRate * angle);
    const x = originX + Math.cos(angle) * r;
    const y = originY + Math.sin(angle) * r;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.strokeStyle = withAlpha(primary, 0.15);
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// 6. ATOM BURST — Radiating Energy Lines (BEHIND FACE)
// ═══════════════════════════════════════════════════════════════

function drawAtomBurst({ ctx, cx, cy, faceR, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':atomburst');
  const numLines = 12 + Math.floor(rng() * 5);

  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';

  for (let i = 0; i < numLines; i++) {
    const angle = (i / numLines) * Math.PI * 2 + rng() * 0.2;
    const startR = faceR * 0.85;
    const endR = faceR * (1.1 + rng() * 0.2);
    const alpha = 0.12 + rng() * 0.08;

    const sx = cx + Math.cos(angle) * startR;
    const sy = cy + Math.sin(angle) * startR;
    const ex = cx + Math.cos(angle) * endR;
    const ey = cy + Math.sin(angle) * endR;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = withAlpha(primary, alpha);
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Tip glow dot
    ctx.beginPath();
    ctx.arc(ex, ey, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(primary, 0.25);
    ctx.fill();
  }

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// 7. SHIELD ARCS ORBITAL — Energy Arc Segments Orbiting
// ═══════════════════════════════════════════════════════════════

function drawShieldArcsOrbital({ ctx, cx, cy, faceR, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':sarcs');

  const arcs = [
    { r: faceR * 1.15, start: -0.6, span: 1.2, alpha: 0.18, lw: 0.8 },
    { r: faceR * 1.25, start: 2.2, span: 0.96, alpha: 0.14, lw: 0.6 },
    { r: faceR * 1.1, start: -2.3, span: 0.78, alpha: 0.10, lw: 0.5 },
  ];

  if (rng() > 0.5) {
    arcs.push({ r: faceR * 1.3, start: -1.6, span: 1.05, alpha: 0.08, lw: 0.4 });
  }

  ctx.save();
  ctx.shadowBlur = 2;
  ctx.shadowColor = primary;

  for (const arc of arcs) {
    ctx.beginPath();
    ctx.arc(cx, cy, arc.r, arc.start, arc.start + arc.span);
    ctx.strokeStyle = withAlpha(primary, arc.alpha);
    ctx.lineWidth = arc.lw;
    ctx.stroke();

    for (const t of [arc.start, arc.start + arc.span]) {
      const nx = cx + Math.cos(t) * arc.r;
      const ny = cy + Math.sin(t) * arc.r;
      ctx.beginPath();
      ctx.arc(nx, ny, 1, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(primary, 0.2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// 8. BINARY RAIN — Matrix-Style Binary Columns
// ═══════════════════════════════════════════════════════════════

function drawBinaryRain({ ctx, cx, cy, faceR, size, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':binary');
  const numCols = 4 + Math.floor(rng() * 3);
  const fontSize = Math.max(3, size * 0.018);

  ctx.font = `${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let col = 0; col < numCols; col++) {
    const colX = cx + (rng() - 0.5) * faceR * 2.6;
    const colTopY = cy - faceR * (0.8 + rng() * 0.4);
    const numChars = 5 + Math.floor(rng() * 4);

    for (let row = 0; row < numChars; row++) {
      const char = rng() > 0.5 ? '1' : '0';
      const t = row / numChars;
      const alpha = 0.25 - t * 0.20;
      if (alpha <= 0) continue;

      const charY = colTopY + row * fontSize * 1.2;
      ctx.fillStyle = withAlpha(primary, alpha);
      ctx.fillText(char, colX, charY);
    }
  }

  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// ═══════════════════════════════════════════════════════════════
// 9. SOUND WAVES — Audio Broadcast Semicircles
// ═══════════════════════════════════════════════════════════════

function drawSoundWaves({ ctx, cx, cy, faceR, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':soundwaves');
  const side = rng() > 0.5 ? -1 : 1;
  const srcX = cx + side * faceR;

  const waves = [
    { r: faceR * 0.2, alpha: 0.25, lw: 0.7 },
    { r: faceR * 0.35, alpha: 0.18, lw: 0.6 },
    { r: faceR * 0.5, alpha: 0.12, lw: 0.5 },
    { r: faceR * 0.65, alpha: 0.07, lw: 0.4 },
  ];

  const startAngle = side === -1 ? Math.PI * 0.5 : -Math.PI * 0.5;
  const endAngle = side === -1 ? Math.PI * 1.5 : Math.PI * 0.5;

  for (const w of waves) {
    ctx.beginPath();
    ctx.arc(srcX, cy, w.r, startAngle, endAngle);
    ctx.strokeStyle = withAlpha(primary, w.alpha);
    ctx.lineWidth = w.lw;
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════
// 10. GRAVITATIONAL LENS — Space-Time Distortion Lines
// ═══════════════════════════════════════════════════════════════

function drawGravitationalLens({ ctx, cx, cy, faceR, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':gravity');
  const numLines = 4 + Math.floor(rng() * 3);

  for (let i = 0; i < numLines; i++) {
    const baseAngle = rng() * Math.PI * 2;
    const passAngle = baseAngle + Math.PI * (0.6 + rng() * 0.3);
    const bendDist = faceR * (0.7 + rng() * 0.4);

    const startDist = faceR * 1.6;
    const endDist = faceR * 1.6;

    const sx = cx + Math.cos(baseAngle) * startDist;
    const sy = cy + Math.sin(baseAngle) * startDist;
    const ex = cx + Math.cos(passAngle) * endDist;
    const ey = cy + Math.sin(passAngle) * endDist;

    const midAngle = (baseAngle + passAngle) / 2;
    const cpx = cx + Math.cos(midAngle) * bendDist;
    const cpy = cy + Math.sin(midAngle) * bendDist;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpx, cpy, ex, ey);
    ctx.strokeStyle = withAlpha(primary, 0.08 + rng() * 0.04);
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════
// 11. QUANTUM LINK — Entangled Particle Pair
// ═══════════════════════════════════════════════════════════════

function drawQuantumLink({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const pA = { x: cx - faceR * 1.1, y: cy - faceR * 0.3 };
  const pB = { x: cx + faceR * 1.0, y: cy + faceR * 0.4 };
  const particleR = size * 0.008;

  // Particles with glow
  for (const pt of [pA, pB]) {
    ctx.save();
    ctx.shadowBlur = 3;
    ctx.shadowColor = primary;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, particleR, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(primary, 0.3);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, particleR * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(primary, 0.5);
    ctx.fill();
  }

  // Dashed link line
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(pA.x, pA.y);
  ctx.lineTo(pB.x, pB.y);
  ctx.strokeStyle = withAlpha(primary, 0.12);
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Infinity symbol at midpoint
  const midX = (pA.x + pB.x) / 2;
  const midY = (pA.y + pB.y) / 2;
  const infR = size * 0.008;

  ctx.beginPath();
  ctx.arc(midX - infR, midY, infR, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(primary, 0.15);
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(midX + infR, midY, infR, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(primary, 0.15);
  ctx.lineWidth = 0.4;
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
// 12. STAR FIELD — Deep Space Star Points
// ═══════════════════════════════════════════════════════════════

function drawStarField({ ctx, cx, cy, faceR, size, serial }: AccParams): void {
  const rng = seededRandom(serial + ':stars');
  const count = 12 + Math.floor(rng() * 9);

  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = faceR * (1.0 + rng() * 0.8);
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist;
    const r = size * (0.002 + rng() * 0.003);
    const alpha = 0.15 + rng() * 0.25;

    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();

    // 2-3 stars get sparkle crosses
    if (i < 3 && rng() > 0.4) {
      const sparkleR = r * 2.5;
      ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.5})`;
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(sx - sparkleR, sy);
      ctx.lineTo(sx + sparkleR, sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx, sy - sparkleR);
      ctx.lineTo(sx, sy + sparkleR);
      ctx.stroke();
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 13. HOLOGRAPHIC HORNS — Translucent Light Horns
// ═══════════════════════════════════════════════════════════════

function drawHolographicHorns({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const horns = [
    {
      baseX: cx - faceR * 0.5, baseY: cy - faceR * 0.6,
      tipX: cx - faceR * 0.3, tipY: cy - faceR - size * 0.1,
      cpX: cx - faceR * 0.6, cpY: cy - faceR * 0.9,
    },
    {
      baseX: cx + faceR * 0.5, baseY: cy - faceR * 0.6,
      tipX: cx + faceR * 0.3, tipY: cy - faceR - size * 0.1,
      cpX: cx + faceR * 0.6, cpY: cy - faceR * 0.9,
    },
  ];

  for (const h of horns) {
    const steps = 10;
    const baseW = size * 0.015;

    ctx.save();
    ctx.shadowBlur = 3;
    ctx.shadowColor = primary;

    // Tapered translucent segments
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const w0 = baseW * (1 - t0);

      const x0 = (1 - t0) * (1 - t0) * h.baseX + 2 * (1 - t0) * t0 * h.cpX + t0 * t0 * h.tipX;
      const y0 = (1 - t0) * (1 - t0) * h.baseY + 2 * (1 - t0) * t0 * h.cpY + t0 * t0 * h.tipY;
      const x1 = (1 - t1) * (1 - t1) * h.baseX + 2 * (1 - t1) * t1 * h.cpX + t1 * t1 * h.tipX;
      const y1 = (1 - t1) * (1 - t1) * h.baseY + 2 * (1 - t1) * t1 * h.cpY + t1 * t1 * h.tipY;

      const alpha = 0.2 * (1 - t0);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = withAlpha(primary, alpha);
      ctx.lineWidth = w0;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Edge glow outline
    ctx.beginPath();
    ctx.moveTo(h.baseX, h.baseY);
    ctx.quadraticCurveTo(h.cpX, h.cpY, h.tipX, h.tipY);
    ctx.strokeStyle = withAlpha(primary, 0.25);
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.restore();
  }

  ctx.lineCap = 'butt';
}

// ═══════════════════════════════════════════════════════════════
// 14. PROPELLER CAP — Spinning Propeller on Top
// ═══════════════════════════════════════════════════════════════

function drawPropellerCap({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const hubX = cx;
  const hubY = cy - faceR - size * 0.01;
  const hubR = size * 0.008;
  const bladeRx = size * 0.03;
  const bladeRy = size * 0.007;

  // Post
  ctx.beginPath();
  ctx.moveTo(hubX, hubY);
  ctx.lineTo(hubX, hubY + size * 0.015);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = size * 0.004;
  ctx.stroke();

  // 3 blades at 120° intervals
  for (let i = 0; i < 3; i++) {
    const angle = (i * 120) * Math.PI / 180;

    ctx.save();
    ctx.translate(hubX, hubY);
    ctx.rotate(angle);

    const bladeGrad = ctx.createLinearGradient(0, 0, bladeRx, 0);
    bladeGrad.addColorStop(0, lightenColor(primary, 20));
    bladeGrad.addColorStop(1, primary);

    ctx.beginPath();
    ctx.ellipse(bladeRx * 0.5, 0, bladeRx, bladeRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = bladeGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(bladeRx * 0.5, 0, bladeRx, bladeRy, 0, -Math.PI, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.3;
    ctx.stroke();

    ctx.restore();
  }

  // Hub
  const hubGrad = ctx.createRadialGradient(hubX - hubR * 0.3, hubY - hubR * 0.3, 0, hubX, hubY, hubR);
  hubGrad.addColorStop(0, '#888');
  hubGrad.addColorStop(1, '#444');
  ctx.beginPath();
  ctx.arc(hubX, hubY, hubR, 0, Math.PI * 2);
  ctx.fillStyle = hubGrad;
  ctx.fill();

  // Motion blur hint
  ctx.beginPath();
  ctx.arc(hubX, hubY, bladeRx * 1.2, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(primary, 0.04);
  ctx.lineWidth = 0.3;
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
// 15. EARBUDS WIRE — In-Ear Buds with Dangling Wire
// ═══════════════════════════════════════════════════════════════

function drawEarbudsWire({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const budR = size * 0.018;
  const buds = [
    { x: cx - faceR * 0.85, y: cy + faceR * 0.05 },
    { x: cx + faceR * 0.85, y: cy + faceR * 0.05 },
  ];

  for (const bud of buds) {
    // Wire
    ctx.beginPath();
    ctx.moveTo(bud.x, bud.y);
    ctx.bezierCurveTo(
      bud.x, cy + faceR * 0.5,
      cx, cy + faceR * 0.6,
      cx, cy + faceR * 0.8,
    );
    ctx.strokeStyle = withAlpha(darkenColor(primary, 25), 0.3);
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Strain relief
    ctx.beginPath();
    ctx.moveTo(bud.x, bud.y + budR);
    ctx.lineTo(bud.x, bud.y + budR + 2);
    ctx.strokeStyle = withAlpha(darkenColor(primary, 20), 0.4);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Bud
    const bg = ctx.createRadialGradient(
      bud.x - budR * 0.3, bud.y - budR * 0.3, 0,
      bud.x, bud.y, budR,
    );
    bg.addColorStop(0, lightenColor(primary, 30));
    bg.addColorStop(1, darkenColor(primary, 20));
    ctx.beginPath();
    ctx.arc(bud.x, bud.y, budR, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();

    // Specular dot
    ctx.beginPath();
    ctx.arc(bud.x - budR * 0.25, bud.y - budR * 0.25, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// 16. SQUARE EARS — Rectangular Sensor Panels
// ═══════════════════════════════════════════════════════════════

function drawSquareEars({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const earW = size * 0.05;
  const earH = size * 0.09;
  const rx = size * 0.008;

  const ears = [
    { x: cx - faceR - size * 0.04, y: cy - earH / 2 },
    { x: cx + faceR + size * 0.01, y: cy - earH / 2 },
  ];

  for (const ear of ears) {
    const g = ctx.createLinearGradient(ear.x, ear.y, ear.x, ear.y + earH);
    g.addColorStop(0, lightenColor(primary, 25));
    g.addColorStop(0.5, primary);
    g.addColorStop(1, darkenColor(primary, 30));

    ctx.beginPath();
    ctx.roundRect(ear.x, ear.y, earW, earH, rx);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = withAlpha(darkenColor(primary, 40), 0.4);
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // Speaker grille
    ctx.strokeStyle = withAlpha(primary, 0.05);
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 2; i++) {
      const ly = ear.y + earH * (i / 3);
      ctx.beginPath();
      ctx.moveTo(ear.x + earW * 0.2, ly);
      ctx.lineTo(ear.x + earW * 0.8, ly);
      ctx.stroke();
    }

    // Top highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(ear.x + rx, ear.y + 0.5);
    ctx.lineTo(ear.x + earW - rx, ear.y + 0.5);
    ctx.stroke();

    // Mounting bolt
    ctx.beginPath();
    ctx.arc(ear.x + (ear.x < cx ? earW : 0), cy, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = darkenColor(primary, 45);
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// 17. EAR CUFFS — Metallic Rings Clipped to Sides
// ═══════════════════════════════════════════════════════════════

function drawEarCuffs({ ctx, size, cx, cy, faceR, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':earcuffs');
  const cuffR = size * 0.012;

  const cuffs = [
    { x: cx - faceR * 0.95, y: cy - faceR * 0.05 },
    { x: cx + faceR * 0.95, y: cy - faceR * 0.05 },
  ];

  for (const c of cuffs) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, cuffR, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(lightenColor(primary, 30), 0.5);
    ctx.lineWidth = size * 0.006;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(c.x, c.y, cuffR, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }

  // Optional double cuff
  if (rng() > 0.5) {
    const side = rng() > 0.5 ? 0 : 1;
    const c = cuffs[side];
    ctx.beginPath();
    ctx.arc(c.x, c.y + cuffR * 2.5, cuffR * 0.8, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(lightenColor(primary, 30), 0.35);
    ctx.lineWidth = size * 0.005;
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════
// 18. ROUND GLASSES — Wire Frame Circles
// ═══════════════════════════════════════════════════════════════

function drawRoundGlasses({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const { eyeY, leftEyeX, rightEyeX } = eyePositions(cx, cy, faceR);
  const lensR = faceR * 0.3;
  const wireColor = withAlpha(darkenColor(primary, 25), 0.45);
  const wireW = size * 0.005;

  // Left lens
  ctx.beginPath();
  ctx.arc(leftEyeX, eyeY, lensR, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(primary, 0.03);
  ctx.fill();
  ctx.strokeStyle = wireColor;
  ctx.lineWidth = wireW;
  ctx.stroke();

  // Right lens
  ctx.beginPath();
  ctx.arc(rightEyeX, eyeY, lensR, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(primary, 0.03);
  ctx.fill();
  ctx.strokeStyle = wireColor;
  ctx.lineWidth = wireW;
  ctx.stroke();

  // Bridge
  ctx.beginPath();
  ctx.moveTo(leftEyeX + lensR, eyeY);
  ctx.lineTo(rightEyeX - lensR, eyeY);
  ctx.strokeStyle = wireColor;
  ctx.lineWidth = wireW;
  ctx.stroke();

  // Temple arms
  ctx.beginPath();
  ctx.moveTo(leftEyeX - lensR, eyeY);
  ctx.lineTo(leftEyeX - faceR * 0.45, eyeY + size * 0.01);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightEyeX + lensR, eyeY);
  ctx.lineTo(rightEyeX + faceR * 0.45, eyeY + size * 0.01);
  ctx.stroke();

  // Nose pads
  for (const nx of [leftEyeX + lensR - 1, rightEyeX - lensR + 1]) {
    ctx.beginPath();
    ctx.arc(nx, eyeY + 1, 0.8, 0, Math.PI * 2);
    ctx.fillStyle = darkenColor(primary, 30);
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// 19. EYE PATCH — Single Eye Covering
// ═══════════════════════════════════════════════════════════════

function drawEyePatch({ ctx, size, cx, cy, faceR, serial }: AccParams): void {
  const rng = seededRandom(serial + ':eyepatch');
  const { eyeY, leftEyeX, rightEyeX } = eyePositions(cx, cy, faceR);
  const side = rng() > 0.5 ? 1 : -1;
  const eyeX = side === 1 ? rightEyeX : leftEyeX;
  const patchR = faceR * 0.3;

  // Patch — near-black circle, opaque
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, patchR, 0, Math.PI * 2);
  ctx.fillStyle = '#111111';
  ctx.fill();

  // Leather texture dots
  for (let i = 0; i < 4; i++) {
    const dx = (rng() - 0.5) * patchR * 1.2;
    const dy = (rng() - 0.5) * patchR * 1.2;
    if (dx * dx + dy * dy < patchR * patchR * 0.7) {
      ctx.beginPath();
      ctx.arc(eyeX + dx, eyeY + dy, 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34,34,34,0.1)';
      ctx.fill();
    }
  }

  // Strap — horizontal band across face
  ctx.beginPath();
  ctx.moveTo(cx - faceR * 0.85, eyeY);
  ctx.lineTo(cx + faceR * 0.85, eyeY);
  ctx.strokeStyle = 'rgba(51,51,51,0.4)';
  ctx.lineWidth = size * 0.004;
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
// 20. MOHAWK FIN — Metallic Dorsal Ridge
// ═══════════════════════════════════════════════════════════════

function drawMohawkFin({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const frontX = cx - faceR * 0.15;
  const frontY = cy - faceR * 0.7;
  const backX = cx + faceR * 0.15;
  const backY = cy - faceR * 0.3;
  const finH = size * 0.04;
  const midX = (frontX + backX) / 2;
  const midBaseY = cy - faceR;
  const midPeakY = midBaseY - finH;

  // Fin shape
  ctx.beginPath();
  ctx.moveTo(frontX, frontY);
  ctx.quadraticCurveTo(midX, midBaseY - size * 0.005, backX, backY);
  ctx.lineTo(backX - size * 0.005, backY - finH * 0.3);
  ctx.quadraticCurveTo(midX, midPeakY, frontX + size * 0.005, frontY - finH * 0.3);
  ctx.closePath();

  const fg = ctx.createLinearGradient(frontX, midPeakY, backX, midBaseY);
  fg.addColorStop(0, lightenColor(primary, 30));
  fg.addColorStop(0.5, primary);
  fg.addColorStop(1, darkenColor(primary, 25));
  ctx.fillStyle = fg;
  ctx.fill();

  // Ridge highlight
  ctx.beginPath();
  ctx.moveTo(frontX + size * 0.008, frontY - finH * 0.25);
  ctx.quadraticCurveTo(midX, midPeakY + 0.5, backX - size * 0.008, backY - finH * 0.25);
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // Base shadow
  ctx.beginPath();
  ctx.moveTo(frontX + size * 0.005, frontY + 0.5);
  ctx.quadraticCurveTo(midX, midBaseY + 0.5, backX - size * 0.005, backY + 0.5);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}
