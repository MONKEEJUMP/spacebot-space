/**
 * SPACEBOT.SPACE — Human Avatar Accessories (Luxury Edition)
 * 20 luxury & fashion accessories drawn on top of the robot face
 * for human (non-bot) avatars only.
 *
 * gold_halo, gold_crown, diamond_tiara, gold_headband, designer_shades,
 * gold_monocle, pearl_earrings, diamond_nose_stud, gold_chain, blush,
 * freckles, beauty_mark, tears, scar, dj_headphones,
 * metallic_snapback, hair_bow, flower, neural_band, hud_lens
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
  serial: string; // serialSuffix for seed-based sub-RNG
}

type AccDrawFn = (p: AccParams) => void;

// ═══════════════════════════════════════════════════════════════
// DISPATCH TABLE
// ═══════════════════════════════════════════════════════════════

const ACC_DRAW: Record<string, AccDrawFn> = {
  gold_halo: drawGoldHalo,
  gold_crown: drawGoldCrown,
  diamond_tiara: drawDiamondTiara,
  gold_headband: drawGoldHeadband,
  designer_shades: drawDesignerShades,
  gold_monocle: drawGoldMonocle,
  pearl_earrings: drawPearlEarrings,
  diamond_nose_stud: drawDiamondNoseStud,
  gold_chain: drawGoldChain,
  blush: drawBlush,
  freckles: drawFreckles,
  beauty_mark: drawBeautyMark,
  tears: drawTears,
  scar: drawScar,
  dj_headphones: drawDjHeadphones,
  metallic_snapback: drawMetallicSnapback,
  hair_bow: drawHairBow,
  flower: drawFlower,
  neural_band: drawNeuralBand,
  hud_lens: drawHudLens,
};

// ═══════════════════════════════════════════════════════════════
// MASTER DRAW — called from AvatarGenerator
// ═══════════════════════════════════════════════════════════════

export function drawHumanAccessories(
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

  for (const acc of config.humanAccessories) {
    const fn = ACC_DRAW[acc];
    if (fn) fn(p);
  }
}

// ═══════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════

/** Eye positions shared across face accessories */
function eyePositions(cx: number, cy: number, faceR: number) {
  const eyeY = cy - faceR * 0.1;
  const eyeSpacing = faceR * 0.55;
  return {
    eyeY,
    leftEyeX: cx - eyeSpacing,
    rightEyeX: cx + eyeSpacing,
    eyeRadius: faceR * 0.28,
  };
}

/** Draw a diamond sparkle — 4 radiating lines from center */
function drawSparkle(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(angle) * r, y - Math.sin(angle) * r);
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    ctx.stroke();
  }
}

/** Gold tone derived from faction primary */
function goldTone(primary: string): string {
  return lightenColor(primary, 45);
}

/** Dark gold for shadowed edges */
function goldDark(primary: string): string {
  return lightenColor(primary, 20);
}

// ═══════════════════════════════════════════════════════════════
// 1. GOLD HALO — Glowing Golden Ring Above Head
// ═══════════════════════════════════════════════════════════════

function drawGoldHalo({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const haloX = cx;
  const haloY = cy - faceR - size * 0.07;
  const rx = faceR * 0.45;
  const ry = faceR * 0.12;
  const ringW = size * 0.014;
  const gold = goldTone(primary);
  const glowColor = lightenColor(primary, 55);

  // Pass 1: glow bloom
  ctx.save();
  ctx.shadowBlur = size * 0.04;
  ctx.shadowColor = glowColor;
  ctx.beginPath();
  ctx.ellipse(haloX, haloY, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(gold, 0.75);
  ctx.lineWidth = ringW;
  ctx.stroke();
  ctx.restore();

  // Pass 2: crisp gold ring (no blur)
  const ringGrad = ctx.createLinearGradient(haloX - rx, haloY, haloX + rx, haloY);
  ringGrad.addColorStop(0, goldDark(primary));
  ringGrad.addColorStop(0.3, gold);
  ringGrad.addColorStop(0.5, lightenColor(primary, 60));
  ringGrad.addColorStop(0.7, gold);
  ringGrad.addColorStop(1, goldDark(primary));
  ctx.beginPath();
  ctx.ellipse(haloX, haloY, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = ringGrad;
  ctx.lineWidth = ringW;
  ctx.stroke();

  // Inner brightness ring
  ctx.beginPath();
  ctx.ellipse(haloX, haloY, rx * 0.85, ry * 0.8, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
// 2. GOLD CROWN — Ornate Golden Crown with Jewels
// ═══════════════════════════════════════════════════════════════

function drawGoldCrown({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const bandLeft = cx - faceR * 0.48;
  const bandRight = cx + faceR * 0.48;
  const bandTop = cy - faceR - size * 0.005;
  const bandH = size * 0.028;
  const pointH = size * 0.04;
  const numPoints = 5;
  const gold = goldTone(primary);

  // Metallic gold gradient
  const mg = ctx.createLinearGradient(bandLeft, bandTop - pointH, bandRight, bandTop + bandH);
  mg.addColorStop(0, lightenColor(primary, 60));
  mg.addColorStop(0.3, gold);
  mg.addColorStop(0.5, lightenColor(primary, 55));
  mg.addColorStop(0.7, gold);
  mg.addColorStop(1, goldDark(primary));

  // Crown points — 5 triangular spikes
  const bandW = bandRight - bandLeft;
  for (let i = 0; i < numPoints; i++) {
    const px = bandLeft + (bandW / (numPoints - 1)) * i;
    const baseLeft = px - bandW * 0.06;
    const baseRight = px + bandW * 0.06;

    ctx.beginPath();
    ctx.moveTo(baseLeft, bandTop);
    ctx.lineTo(px, bandTop - pointH);
    ctx.lineTo(baseRight, bandTop);
    ctx.closePath();
    ctx.fillStyle = mg;
    ctx.fill();

    // Tip highlight — jewel sparkle
    ctx.save();
    ctx.shadowBlur = 2;
    ctx.shadowColor = lightenColor(primary, 60);
    ctx.beginPath();
    ctx.arc(px, bandTop - pointH + 1.5, 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    ctx.restore();
  }

  // Base band
  ctx.beginPath();
  ctx.rect(bandLeft, bandTop, bandW, bandH);
  ctx.fillStyle = mg;
  ctx.fill();

  // Band top highlight
  ctx.beginPath();
  ctx.moveTo(bandLeft, bandTop + 0.5);
  ctx.lineTo(bandRight, bandTop + 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Band bottom shadow
  ctx.beginPath();
  ctx.moveTo(bandLeft, bandTop + bandH - 0.5);
  ctx.lineTo(bandRight, bandTop + bandH - 0.5);
  ctx.strokeStyle = withAlpha(darkenColor(primary, 30), 0.15);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Center diamond jewel
  const jewelX = cx;
  const jewelY = bandTop + bandH * 0.5;
  const jewelS = size * 0.01;

  ctx.save();
  ctx.shadowBlur = 4;
  ctx.shadowColor = lightenColor(primary, 60);
  // Diamond shape
  ctx.beginPath();
  ctx.moveTo(jewelX, jewelY - jewelS);
  ctx.lineTo(jewelX + jewelS * 0.6, jewelY);
  ctx.lineTo(jewelX, jewelY + jewelS);
  ctx.lineTo(jewelX - jewelS * 0.6, jewelY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
  ctx.restore();

  // Side rubies — smaller gems on band
  for (const sx of [bandLeft + bandW * 0.25, bandLeft + bandW * 0.75]) {
    ctx.save();
    ctx.shadowBlur = 2;
    ctx.shadowColor = primary;
    ctx.beginPath();
    ctx.arc(sx, jewelY, size * 0.005, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(lightenColor(primary, 40), 0.6);
    ctx.fill();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. DIAMOND TIARA — Thin Elegant Arc with Sparkling Gems
// ═══════════════════════════════════════════════════════════════

function drawDiamondTiara({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const gold = goldTone(primary);
  const tiaraY = cy - faceR - size * 0.003;
  const tiaraLeft = cx - faceR * 0.55;
  const tiaraRight = cx + faceR * 0.55;
  const peakY = tiaraY - size * 0.03;

  // Thin gold arc
  const arcGrad = ctx.createLinearGradient(tiaraLeft, tiaraY, tiaraRight, tiaraY);
  arcGrad.addColorStop(0, goldDark(primary));
  arcGrad.addColorStop(0.5, gold);
  arcGrad.addColorStop(1, goldDark(primary));
  ctx.beginPath();
  ctx.moveTo(tiaraLeft, tiaraY);
  ctx.quadraticCurveTo(cx, peakY, tiaraRight, tiaraY);
  ctx.strokeStyle = arcGrad;
  ctx.lineWidth = size * 0.006;
  ctx.stroke();

  // Top highlight — thinner white line
  ctx.beginPath();
  ctx.moveTo(tiaraLeft + size * 0.01, tiaraY - 0.5);
  ctx.quadraticCurveTo(cx, peakY - 0.5, tiaraRight - size * 0.01, tiaraY - 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 0.4;
  ctx.stroke();

  // 3 diamond gems along the arc
  const diamonds = [
    { t: 0.3, s: size * 0.006 },
    { t: 0.5, s: size * 0.009 }, // Center is biggest
    { t: 0.7, s: size * 0.006 },
  ];

  for (const d of diamonds) {
    // Interpolate position on the quadratic bezier
    const t = d.t;
    const dx = (1 - t) * (1 - t) * tiaraLeft + 2 * (1 - t) * t * cx + t * t * tiaraRight;
    const dy = (1 - t) * (1 - t) * tiaraY + 2 * (1 - t) * t * peakY + t * t * tiaraY;

    // Diamond shape
    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(dx, dy - d.s);
    ctx.lineTo(dx + d.s * 0.55, dy);
    ctx.lineTo(dx, dy + d.s * 0.5);
    ctx.lineTo(dx - d.s * 0.55, dy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
    ctx.restore();

    // Sparkle rays
    drawSparkle(ctx, dx, dy - d.s * 0.3, d.s * 0.8, 'rgba(255,255,255,0.35)');
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. GOLD HEADBAND — Sleek Metallic Forehead Band
// ═══════════════════════════════════════════════════════════════

function drawGoldHeadband({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const gold = goldTone(primary);
  const bandW = faceR * 1.5; // 75% of face width
  const bandH = size * 0.02;
  const bandX = cx - bandW / 2;
  const bandY = cy - faceR * 0.5;

  // Gold metallic gradient — horizontal shine
  const mg = ctx.createLinearGradient(bandX, bandY, bandX + bandW, bandY);
  mg.addColorStop(0, goldDark(primary));
  mg.addColorStop(0.3, gold);
  mg.addColorStop(0.5, lightenColor(primary, 60));
  mg.addColorStop(0.7, gold);
  mg.addColorStop(1, goldDark(primary));

  ctx.beginPath();
  ctx.roundRect(bandX, bandY, bandW, bandH, size * 0.003);
  ctx.fillStyle = mg;
  ctx.fill();

  // Top edge bright reflection
  ctx.beginPath();
  ctx.moveTo(bandX + size * 0.005, bandY + 0.5);
  ctx.lineTo(bandX + bandW - size * 0.005, bandY + 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Bottom edge shadow
  ctx.beginPath();
  ctx.moveTo(bandX + size * 0.005, bandY + bandH - 0.5);
  ctx.lineTo(bandX + bandW - size * 0.005, bandY + bandH - 0.5);
  ctx.strokeStyle = withAlpha(darkenColor(primary, 25), 0.15);
  ctx.lineWidth = 0.4;
  ctx.stroke();

  // Center bright reflection dot
  const refGrad = ctx.createRadialGradient(cx, bandY + bandH / 2, 0, cx, bandY + bandH / 2, bandH);
  refGrad.addColorStop(0, 'rgba(255,255,255,0.20)');
  refGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, bandY + bandH / 2, bandH, 0, Math.PI * 2);
  ctx.fillStyle = refGrad;
  ctx.fill();
}

// ═══════════════════════════════════════════════════════════════
// 5. DESIGNER SHADES — Premium Sunglasses with Gold Frames
// ═══════════════════════════════════════════════════════════════

function drawDesignerShades({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const { eyeY, leftEyeX, rightEyeX } = eyePositions(cx, cy, faceR);
  const gold = goldTone(primary);
  const lensW = faceR * 0.58;
  const lensH = faceR * 0.38;
  const lensRx = size * 0.012;
  const frameW = size * 0.007;

  for (const ex of [leftEyeX, rightEyeX]) {
    const lx = ex - lensW / 2;
    const ly = eyeY - lensH / 2;

    // Dark lens fill — 85% opacity
    ctx.save();
    ctx.globalAlpha = 0.85;
    const lg = ctx.createLinearGradient(lx, ly, lx, ly + lensH);
    lg.addColorStop(0, '#1a1a1a');
    lg.addColorStop(1, '#080808');
    ctx.beginPath();
    ctx.roundRect(lx, ly, lensW, lensH, lensRx);
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.restore();

    // Gold frame — clearly visible
    const frameGrad = ctx.createLinearGradient(lx, ly, lx, ly + lensH);
    frameGrad.addColorStop(0, lightenColor(primary, 55));
    frameGrad.addColorStop(0.5, gold);
    frameGrad.addColorStop(1, goldDark(primary));
    ctx.beginPath();
    ctx.roundRect(lx, ly, lensW, lensH, lensRx);
    ctx.strokeStyle = frameGrad;
    ctx.lineWidth = frameW;
    ctx.stroke();

    // Diagonal reflection line across lens
    ctx.beginPath();
    ctx.moveTo(lx + lensW * 0.15, ly + lensH * 0.75);
    ctx.lineTo(lx + lensW * 0.6, ly + lensH * 0.15);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // Second subtle reflection
    ctx.beginPath();
    ctx.moveTo(lx + lensW * 0.25, ly + lensH * 0.85);
    ctx.lineTo(lx + lensW * 0.7, ly + lensH * 0.25);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }

  // Gold bridge — connecting lenses
  const bridgeGrad = ctx.createLinearGradient(leftEyeX, eyeY, rightEyeX, eyeY);
  bridgeGrad.addColorStop(0, gold);
  bridgeGrad.addColorStop(0.5, lightenColor(primary, 55));
  bridgeGrad.addColorStop(1, gold);
  ctx.beginPath();
  ctx.moveTo(leftEyeX + lensW / 2, eyeY);
  ctx.lineTo(rightEyeX - lensW / 2, eyeY);
  ctx.strokeStyle = bridgeGrad;
  ctx.lineWidth = frameW;
  ctx.stroke();

  // Gold temple arms
  ctx.strokeStyle = gold;
  ctx.lineWidth = frameW * 0.8;
  ctx.beginPath();
  ctx.moveTo(leftEyeX - lensW / 2, eyeY);
  ctx.lineTo(leftEyeX - faceR * 0.5, eyeY + size * 0.008);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightEyeX + lensW / 2, eyeY);
  ctx.lineTo(rightEyeX + faceR * 0.5, eyeY + size * 0.008);
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
// 6. GOLD MONOCLE — Single Gold-Rimmed Lens with Chain
// ═══════════════════════════════════════════════════════════════

function drawGoldMonocle({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const { eyeY, rightEyeX } = eyePositions(cx, cy, faceR);
  const gold = goldTone(primary);
  const lensR = faceR * 0.32;

  // Lens — very faint tint
  ctx.beginPath();
  ctx.arc(rightEyeX, eyeY, lensR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fill();

  // Gold rim
  const rimGrad = ctx.createLinearGradient(
    rightEyeX - lensR, eyeY, rightEyeX + lensR, eyeY,
  );
  rimGrad.addColorStop(0, goldDark(primary));
  rimGrad.addColorStop(0.5, lightenColor(primary, 55));
  rimGrad.addColorStop(1, goldDark(primary));
  ctx.beginPath();
  ctx.arc(rightEyeX, eyeY, lensR, 0, Math.PI * 2);
  ctx.strokeStyle = rimGrad;
  ctx.lineWidth = size * 0.008;
  ctx.stroke();

  // Specular arc on upper-right
  ctx.beginPath();
  ctx.arc(rightEyeX + lensR * 0.15, eyeY - lensR * 0.3, lensR * 0.4, Math.PI * 1.2, Math.PI * 1.7);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Gold chain — dashed line hanging down
  ctx.save();
  ctx.setLineDash([1.5, 1.5]);
  ctx.beginPath();
  ctx.moveTo(rightEyeX, eyeY + lensR);
  ctx.bezierCurveTo(
    rightEyeX - faceR * 0.1, eyeY + lensR + faceR * 0.4,
    cx + faceR * 0.1, cy + faceR * 0.5,
    cx, cy + faceR * 0.6,
  );
  ctx.strokeStyle = withAlpha(gold, 0.45);
  ctx.lineWidth = size * 0.004;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// 7. PEARL EARRINGS — Glowing Pearl Spheres on Sides
// ═══════════════════════════════════════════════════════════════

function drawPearlEarrings({ ctx, size, cx, cy, faceR }: AccParams): void {
  const pearlR = size * 0.018;
  const pearls = [
    { x: cx - faceR * 0.88, y: cy + faceR * 0.05 },
    { x: cx + faceR * 0.88, y: cy + faceR * 0.05 },
  ];

  for (const p of pearls) {
    // Pearl body — radial gradient offset upper-left for 3D illusion
    const pg = ctx.createRadialGradient(
      p.x - pearlR * 0.35, p.y - pearlR * 0.35, 0,
      p.x, p.y, pearlR,
    );
    pg.addColorStop(0, 'rgba(255,255,255,0.85)');
    pg.addColorStop(0.5, 'rgba(240,235,230,0.7)');
    pg.addColorStop(1, 'rgba(200,195,190,0.5)');

    ctx.save();
    ctx.shadowBlur = 3;
    ctx.shadowColor = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, pearlR, 0, Math.PI * 2);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.restore();

    // Subtle outline
    ctx.beginPath();
    ctx.arc(p.x, p.y, pearlR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180,175,170,0.2)';
    ctx.lineWidth = 0.4;
    ctx.stroke();

    // Specular highlight dot
    ctx.beginPath();
    ctx.arc(p.x - pearlR * 0.3, p.y - pearlR * 0.3, pearlR * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();

    // Tiny wire/stud connecting to face
    ctx.beginPath();
    ctx.moveTo(p.x + (p.x < cx ? pearlR : -pearlR), p.y);
    ctx.lineTo(p.x + (p.x < cx ? pearlR + 2 : -pearlR - 2), p.y);
    ctx.strokeStyle = 'rgba(200,200,200,0.3)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. DIAMOND NOSE STUD — Brilliant Tiny Nose Piercing
// ═══════════════════════════════════════════════════════════════

function drawDiamondNoseStud({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const px = cx + faceR * 0.08;
  const py = cy + faceR * 0.08;
  const r = size * 0.006;

  // Glow
  ctx.save();
  ctx.shadowBlur = 4;
  ctx.shadowColor = 'rgba(255,255,255,0.6)';

  // Diamond — bright white with slight primary tint
  const dg = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r);
  dg.addColorStop(0, 'rgba(255,255,255,0.9)');
  dg.addColorStop(0.5, withAlpha(lightenColor(primary, 60), 0.6));
  dg.addColorStop(1, 'rgba(255,255,255,0.4)');
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = dg;
  ctx.fill();
  ctx.restore();

  // Sparkle rays — 4 tiny lines radiating from center
  drawSparkle(ctx, px, py, r * 2.5, 'rgba(255,255,255,0.45)');

  // Specular micro dot
  ctx.beginPath();
  ctx.arc(px - r * 0.3, py - r * 0.3, size * 0.002, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
}

// ═══════════════════════════════════════════════════════════════
// 9. GOLD CHAIN — Thick Luxury Chain with Pendant
// ═══════════════════════════════════════════════════════════════

function drawGoldChain({ ctx, size, cx, cy, faceR, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':goldchain');
  const gold = goldTone(primary);
  const lx = cx - faceR * 0.35;
  const rx = cx + faceR * 0.35;
  const topY = cy + faceR * 0.5;
  const dipY = cy + faceR * 0.72;

  // THICK gold chain — dashed line
  ctx.save();
  ctx.setLineDash([2, 1.5]);
  ctx.beginPath();
  ctx.moveTo(lx, topY);
  ctx.quadraticCurveTo(cx, dipY + size * 0.01, rx, topY);
  ctx.strokeStyle = withAlpha(gold, 0.6);
  ctx.lineWidth = size * 0.008;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Chain highlight — thin white line following the same path
  ctx.save();
  ctx.setLineDash([2, 1.5]);
  ctx.beginPath();
  ctx.moveTo(lx, topY - 0.5);
  ctx.quadraticCurveTo(cx, dipY + size * 0.01 - 0.5, rx, topY - 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.3;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Pendant at lowest point
  const pendantY = dipY;
  const shape = Math.floor(rng() * 3); // 0=circle, 1=diamond, 2=star
  const pendR = size * 0.014;

  ctx.save();
  ctx.shadowBlur = 3;
  ctx.shadowColor = lightenColor(primary, 50);

  if (shape === 0) {
    // Circle medallion
    const medGrad = ctx.createRadialGradient(cx - pendR * 0.3, pendantY - pendR * 0.3, 0, cx, pendantY, pendR);
    medGrad.addColorStop(0, lightenColor(primary, 55));
    medGrad.addColorStop(1, gold);
    ctx.beginPath();
    ctx.arc(cx, pendantY, pendR, 0, Math.PI * 2);
    ctx.fillStyle = medGrad;
    ctx.fill();
  } else if (shape === 1) {
    // Diamond pendant
    const ds = size * 0.016;
    ctx.beginPath();
    ctx.moveTo(cx, pendantY - ds);
    ctx.lineTo(cx + ds * 0.6, pendantY);
    ctx.lineTo(cx, pendantY + ds);
    ctx.lineTo(cx - ds * 0.6, pendantY);
    ctx.closePath();
    ctx.fillStyle = withAlpha(gold, 0.65);
    ctx.fill();
  } else {
    // 5-point star
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const outerA = (i * 72 - 90) * Math.PI / 180;
      const innerA = ((i * 72) + 36 - 90) * Math.PI / 180;
      const ox = cx + Math.cos(outerA) * pendR;
      const oy = pendantY + Math.sin(outerA) * pendR;
      const ix = cx + Math.cos(innerA) * pendR * 0.45;
      const iy = pendantY + Math.sin(innerA) * pendR * 0.45;
      if (i === 0) ctx.moveTo(ox, oy);
      else ctx.lineTo(ox, oy);
      ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.fillStyle = withAlpha(gold, 0.6);
    ctx.fill();
  }
  ctx.restore();

  // Specular micro dot on pendant
  ctx.beginPath();
  ctx.arc(cx - pendR * 0.3, pendantY - pendR * 0.3, pendR * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
}

// ═══════════════════════════════════════════════════════════════
// 10. BLUSH — Soft Warm Cheek Glow
// ═══════════════════════════════════════════════════════════════

function drawBlush({ ctx, cx, cy, faceR }: AccParams): void {
  const blushR = faceR * 0.22;
  const cheeks = [
    { x: cx - faceR * 0.4, y: cy + faceR * 0.15 },
    { x: cx + faceR * 0.4, y: cy + faceR * 0.15 },
  ];

  for (const c of cheeks) {
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, blushR);
    g.addColorStop(0, 'rgba(255,107,107,0.14)');
    g.addColorStop(0.7, 'rgba(255,107,107,0.06)');
    g.addColorStop(1, 'rgba(255,107,107,0)');
    ctx.beginPath();
    ctx.arc(c.x, c.y, blushR, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// 11. FRECKLES — Scattered Organic Dots
// ═══════════════════════════════════════════════════════════════

function drawFreckles({ ctx, size, cx, cy, faceR, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':freckles');
  const count = 10 + Math.floor(rng() * 5); // 10-14

  for (let i = 0; i < count; i++) {
    const fx = cx + (rng() - 0.5) * faceR * 0.85;
    const fy = cy - faceR * 0.15 + rng() * faceR * 0.45;
    const fr = size * (0.003 + rng() * 0.003);
    const alpha = 0.2 + rng() * 0.15;

    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(darkenColor(primary, 30), alpha);
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// 12. BEAUTY MARK — Single Elegant Dark Dot
// ═══════════════════════════════════════════════════════════════

function drawBeautyMark({ ctx, size, cx, cy, faceR, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':beautymark');
  // Seed-based position — 3 possible locations
  const positions = [
    { x: cx + faceR * 0.3, y: cy + faceR * 0.2 },  // Right cheek
    { x: cx - faceR * 0.25, y: cy + faceR * 0.15 }, // Left cheek
    { x: cx + faceR * 0.15, y: cy - faceR * 0.25 }, // Near right eye
  ];
  const pos = positions[Math.floor(rng() * positions.length)];
  const r = size * 0.005;

  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(darkenColor(primary, 50), 0.5);
  ctx.fill();

  // Subtle shadow
  ctx.beginPath();
  ctx.arc(pos.x + 0.3, pos.y + 0.3, r * 0.7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  ctx.fill();
}

// ═══════════════════════════════════════════════════════════════
// 13. TEARS — Emotional Android Tear Drops
// ═══════════════════════════════════════════════════════════════

function drawTears({ ctx, size, cx, cy, faceR, serial }: AccParams): void {
  const rng = seededRandom(serial + ':tears');
  const { eyeY, leftEyeX, rightEyeX } = eyePositions(cx, cy, faceR);
  // 1-2 tears, seed-based side selection
  const numTears = 1 + Math.floor(rng() * 2);
  const tearEyes = [leftEyeX, rightEyeX];

  for (let i = 0; i < numTears && i < tearEyes.length; i++) {
    const ex = tearEyes[i];
    const tearTopY = eyeY + faceR * 0.15 + rng() * faceR * 0.05;
    const tearLen = size * 0.025 + rng() * size * 0.01;
    const tearW = size * 0.008;

    // Teardrop path — rounded top, pointed bottom
    ctx.beginPath();
    ctx.moveTo(ex, tearTopY);
    ctx.quadraticCurveTo(ex + tearW, tearTopY + tearLen * 0.4, ex, tearTopY + tearLen);
    ctx.quadraticCurveTo(ex - tearW, tearTopY + tearLen * 0.4, ex, tearTopY);
    ctx.closePath();

    // Crystal clear liquid fill
    const tearGrad = ctx.createLinearGradient(ex, tearTopY, ex, tearTopY + tearLen);
    tearGrad.addColorStop(0, 'rgba(200,220,255,0.3)');
    tearGrad.addColorStop(0.5, 'rgba(180,210,255,0.2)');
    tearGrad.addColorStop(1, 'rgba(200,220,255,0.1)');
    ctx.fillStyle = tearGrad;
    ctx.fill();

    // Subtle outline
    ctx.strokeStyle = 'rgba(180,200,240,0.15)';
    ctx.lineWidth = 0.3;
    ctx.stroke();

    // Specular micro dot — top of tear
    ctx.beginPath();
    ctx.arc(ex - tearW * 0.3, tearTopY + tearLen * 0.15, size * 0.002, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// 14. SCAR — Battle Line Worn with Pride
// ═══════════════════════════════════════════════════════════════

function drawScar({ ctx, size, cx, cy, faceR, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':scar');
  const { eyeY, leftEyeX } = eyePositions(cx, cy, faceR);
  const pick = Math.floor(rng() * 3);

  let x1: number, y1: number, x2: number, y2: number;
  if (pick === 0) {
    // Left cheek
    x1 = cx - faceR * 0.5; y1 = cy;
    x2 = cx - faceR * 0.15; y2 = cy + faceR * 0.25;
  } else if (pick === 1) {
    // Right cheek
    x1 = cx + faceR * 0.15; y1 = cy;
    x2 = cx + faceR * 0.5; y2 = cy + faceR * 0.25;
  } else {
    // Over left eye
    x1 = leftEyeX - faceR * 0.15; y1 = eyeY - faceR * 0.2;
    x2 = leftEyeX + faceR * 0.15; y2 = eyeY + faceR * 0.25;
  }

  // Shadow line (depth)
  ctx.beginPath();
  ctx.moveTo(x1 + 0.5, y1 + 0.5);
  ctx.lineTo(x2 + 0.5, y2 + 0.5);
  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.lineWidth = size * 0.005;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Scar line — lighter than body, exposed underlayer
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = withAlpha(lightenColor(primary, 40), 0.25);
  ctx.lineWidth = size * 0.005;
  ctx.stroke();

  ctx.lineCap = 'butt';
}

// ═══════════════════════════════════════════════════════════════
// 15. DJ HEADPHONES — Premium Chrome/Gold Over-Ear Headphones
// ═══════════════════════════════════════════════════════════════

function drawDjHeadphones({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const gold = goldTone(primary);
  const cupW = size * 0.1;
  const cupH = size * 0.13;
  const cupRx = size * 0.022;
  const bandW = size * 0.028;

  // Headband arc points
  const lx = cx - faceR * 0.78;
  const rx = cx + faceR * 0.78;
  const bandY = cy - faceR * 0.3;
  const peakY = cy - faceR - size * 0.07;

  // Gold headband — main thick arc
  const bandGrad = ctx.createLinearGradient(lx, bandY, rx, bandY);
  bandGrad.addColorStop(0, goldDark(primary));
  bandGrad.addColorStop(0.3, gold);
  bandGrad.addColorStop(0.5, lightenColor(primary, 55));
  bandGrad.addColorStop(0.7, gold);
  bandGrad.addColorStop(1, goldDark(primary));
  ctx.beginPath();
  ctx.moveTo(lx, bandY);
  ctx.quadraticCurveTo(cx, peakY, rx, bandY);
  ctx.strokeStyle = bandGrad;
  ctx.lineWidth = bandW;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Band padding strip (underside)
  ctx.beginPath();
  ctx.moveTo(lx + size * 0.025, bandY - size * 0.005);
  ctx.quadraticCurveTo(cx, peakY + bandW * 0.6, rx - size * 0.025, bandY - size * 0.005);
  ctx.strokeStyle = withAlpha(gold, 0.4);
  ctx.lineWidth = size * 0.01;
  ctx.stroke();

  // Band highlight (top edge)
  ctx.beginPath();
  ctx.moveTo(lx + size * 0.03, bandY - size * 0.012);
  ctx.quadraticCurveTo(cx, peakY - bandW * 0.3, rx - size * 0.03, bandY - size * 0.012);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Left cup
  const lcx = cx - faceR - size * 0.025;
  const lcy = cy - faceR * 0.15;
  drawDjCup(ctx, lcx, lcy, cupW, cupH, cupRx, size, primary);

  // Right cup (mirror)
  const rcx = cx + faceR - size * 0.075;
  const rcy = cy - faceR * 0.15;
  drawDjCup(ctx, rcx, rcy, cupW, cupH, cupRx, size, primary);

  ctx.lineCap = 'butt';
}

function drawDjCup(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, rx: number,
  size: number, primary: string,
): void {
  const gold = goldTone(primary);

  // Gold metallic radial gradient
  const g = ctx.createRadialGradient(
    x + w * 0.35, y + h * 0.35, 0,
    x + w / 2, y + h / 2, Math.max(w, h) * 0.7,
  );
  g.addColorStop(0, lightenColor(primary, 55));
  g.addColorStop(0.5, gold);
  g.addColorStop(1, goldDark(primary));

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rx);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = goldDark(primary);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Inner gold speaker dome
  const scx = x + w / 2;
  const scy = y + h / 2;
  const sr = size * 0.028;
  const domeGrad = ctx.createRadialGradient(scx - sr * 0.3, scy - sr * 0.3, 0, scx, scy, sr);
  domeGrad.addColorStop(0, lightenColor(primary, 60));
  domeGrad.addColorStop(1, gold);
  ctx.beginPath();
  ctx.arc(scx, scy, sr, 0, Math.PI * 2);
  ctx.fillStyle = domeGrad;
  ctx.fill();
  ctx.strokeStyle = withAlpha(goldDark(primary), 0.4);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Upper highlight
  ctx.beginPath();
  ctx.arc(scx, y + h * 0.3, w * 0.3, Math.PI, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
// 16. METALLIC SNAPBACK — Premium Metallic Cap
// ═══════════════════════════════════════════════════════════════

function drawMetallicSnapback({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const gold = goldTone(primary);

  // Cap crown across top
  const crownLeft = cx - faceR * 0.72;
  const crownRight = cx + faceR * 0.52;
  const crownTop = cy - faceR - size * 0.02;

  // Crown — metallic gold gradient
  const crownGrad = ctx.createLinearGradient(crownLeft, cy - faceR * 0.55, crownRight, crownTop);
  crownGrad.addColorStop(0, goldDark(primary));
  crownGrad.addColorStop(0.4, gold);
  crownGrad.addColorStop(0.6, lightenColor(primary, 55));
  crownGrad.addColorStop(1, gold);

  ctx.beginPath();
  ctx.moveTo(crownLeft, cy - faceR * 0.55);
  ctx.quadraticCurveTo(cx - faceR * 0.2, crownTop, crownRight, cy - faceR * 0.55);
  ctx.arc(cx, cy, faceR * 0.85, -0.6, -Math.PI + 0.3, true);
  ctx.closePath();
  ctx.fillStyle = crownGrad;
  ctx.fill();

  // Crown seam line
  ctx.beginPath();
  ctx.moveTo(cx - faceR * 0.1, cy - faceR * 0.5);
  ctx.quadraticCurveTo(cx, crownTop + size * 0.005, cx + faceR * 0.05, cy - faceR * 0.5);
  ctx.strokeStyle = withAlpha(goldDark(primary), 0.12);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Button at top
  ctx.beginPath();
  ctx.arc(cx - faceR * 0.05, crownTop + size * 0.01, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = lightenColor(primary, 55);
  ctx.fill();

  // Visor — flat brim with metallic finish
  ctx.beginPath();
  ctx.moveTo(cx - faceR * 0.6, cy - faceR * 0.55);
  ctx.lineTo(cx - faceR * 0.92, cy - faceR * 0.45);
  ctx.lineTo(cx - faceR * 0.3, cy - faceR * 0.35);
  ctx.lineTo(cx + faceR * 0.15, cy - faceR * 0.55);
  ctx.closePath();

  const visorGrad = ctx.createLinearGradient(cx - faceR * 0.6, cy - faceR * 0.55, cx - faceR * 0.3, cy - faceR * 0.35);
  visorGrad.addColorStop(0, goldDark(primary));
  visorGrad.addColorStop(0.5, gold);
  visorGrad.addColorStop(1, darkenColor(primary, 10));
  ctx.fillStyle = visorGrad;
  ctx.fill();

  // Visor underside shadow
  const us = ctx.createLinearGradient(cx, cy - faceR * 0.55, cx, cy - faceR * 0.35);
  us.addColorStop(0, 'rgba(0,0,0,0)');
  us.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = us;
  ctx.fill();

  // Visor top edge highlight (gleam)
  ctx.beginPath();
  ctx.moveTo(cx - faceR * 0.58, cy - faceR * 0.55);
  ctx.lineTo(cx + faceR * 0.13, cy - faceR * 0.55);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // Gold sticker flex — small gold rectangle on visor
  const stickerW = size * 0.022;
  const stickerH = size * 0.012;
  const stickerX = cx - faceR * 0.55;
  const stickerY = cy - faceR * 0.48;
  ctx.beginPath();
  ctx.roundRect(stickerX, stickerY, stickerW, stickerH, 0.5);
  ctx.fillStyle = withAlpha(lightenColor(primary, 60), 0.6);
  ctx.fill();
}

// ═══════════════════════════════════════════════════════════════
// 17. HAIR BOW — Decorative Luxury Bow
// ═══════════════════════════════════════════════════════════════

function drawHairBow({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const bx = cx + faceR * 0.25;
  const by = cy - faceR * 0.9;
  const loopRx = size * 0.022;
  const loopRy = size * 0.014;
  const knotR = size * 0.007;
  const bowColor = withAlpha(lightenColor(primary, 30), 0.5);

  // Left loop
  ctx.save();
  ctx.translate(bx - size * 0.017, by);
  ctx.rotate(-30 * Math.PI / 180);
  ctx.beginPath();
  ctx.ellipse(0, 0, loopRx, loopRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = bowColor;
  ctx.fill();
  // Loop highlight
  ctx.beginPath();
  ctx.ellipse(-loopRx * 0.2, -loopRy * 0.3, loopRx * 0.4, loopRy * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  ctx.restore();

  // Right loop
  ctx.save();
  ctx.translate(bx + size * 0.017, by);
  ctx.rotate(30 * Math.PI / 180);
  ctx.beginPath();
  ctx.ellipse(0, 0, loopRx, loopRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = bowColor;
  ctx.fill();
  // Loop highlight
  ctx.beginPath();
  ctx.ellipse(loopRx * 0.2, -loopRy * 0.3, loopRx * 0.4, loopRy * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  ctx.restore();

  // Center knot
  const knotGrad = ctx.createRadialGradient(bx - knotR * 0.3, by - knotR * 0.3, 0, bx, by, knotR);
  knotGrad.addColorStop(0, lightenColor(primary, 40));
  knotGrad.addColorStop(1, darkenColor(primary, 10));
  ctx.beginPath();
  ctx.arc(bx, by, knotR, 0, Math.PI * 2);
  ctx.fillStyle = knotGrad;
  ctx.fill();

  // Specular dot on knot
  ctx.beginPath();
  ctx.arc(bx - knotR * 0.3, by - knotR * 0.3, knotR * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();

  // Tail ribbons
  ctx.strokeStyle = withAlpha(lightenColor(primary, 25), 0.35);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(bx - size * 0.003, by + knotR);
  ctx.quadraticCurveTo(bx - size * 0.01, by + size * 0.018, bx - size * 0.015, by + size * 0.022);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx + size * 0.003, by + knotR);
  ctx.quadraticCurveTo(bx + size * 0.01, by + size * 0.018, bx + size * 0.015, by + size * 0.022);
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
// 18. FLOWER — Elegant Flower Behind Ear
// ═══════════════════════════════════════════════════════════════

function drawFlower({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const fx = cx - faceR * 0.85;
  const fy = cy - faceR * 0.35;
  const petalRx = size * 0.016;
  const petalRy = size * 0.026;
  const centerR = size * 0.009;
  const numPetals = 5;
  const petalColor = withAlpha(lightenColor(primary, 45), 0.5);

  // Soft shadow behind flower
  ctx.beginPath();
  ctx.arc(fx + 1, fy + 1, petalRy * 1.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  ctx.fill();

  // Petals — with gradient for depth
  for (let i = 0; i < numPetals; i++) {
    const angle = (i / numPetals) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, -petalRy * 0.8, petalRx, petalRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = petalColor;
    ctx.fill();
    // Petal center vein
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -petalRy * 1.4);
    ctx.strokeStyle = withAlpha(lightenColor(primary, 55), 0.12);
    ctx.lineWidth = 0.3;
    ctx.stroke();
    ctx.restore();
  }

  // Center — bright gold dot
  const centerGrad = ctx.createRadialGradient(fx - centerR * 0.3, fy - centerR * 0.3, 0, fx, fy, centerR);
  centerGrad.addColorStop(0, lightenColor(primary, 65));
  centerGrad.addColorStop(1, lightenColor(primary, 40));
  ctx.beginPath();
  ctx.arc(fx, fy, centerR, 0, Math.PI * 2);
  ctx.fillStyle = centerGrad;
  ctx.fill();

  // Stem
  ctx.beginPath();
  ctx.moveTo(fx, fy + petalRy * 0.5);
  ctx.quadraticCurveTo(fx - size * 0.005, fy + petalRy + size * 0.01, fx - size * 0.008, fy + size * 0.02 + petalRy);
  ctx.strokeStyle = darkenColor(primary, 20);
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
// 19. NEURAL BAND — Neural Interface Headset
// ═══════════════════════════════════════════════════════════════

function drawNeuralBand({ ctx, size, cx, cy, faceR, primary }: AccParams): void {
  const bandW = faceR * 1.7;
  const bandH = size * 0.015;
  const bandX = cx - bandW / 2;
  const bandY = cy - faceR * 0.35;

  // Dark metallic band
  const bandGrad = ctx.createLinearGradient(bandX, bandY, bandX + bandW, bandY);
  bandGrad.addColorStop(0, darkenColor(primary, 35));
  bandGrad.addColorStop(0.3, darkenColor(primary, 20));
  bandGrad.addColorStop(0.5, darkenColor(primary, 15));
  bandGrad.addColorStop(0.7, darkenColor(primary, 20));
  bandGrad.addColorStop(1, darkenColor(primary, 35));
  ctx.beginPath();
  ctx.roundRect(bandX, bandY, bandW, bandH, size * 0.003);
  ctx.fillStyle = bandGrad;
  ctx.fill();

  // Top edge highlight
  ctx.beginPath();
  ctx.moveTo(bandX + 2, bandY + 0.5);
  ctx.lineTo(bandX + bandW - 2, bandY + 0.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.3;
  ctx.stroke();

  // Temple nodes — 2 glowing circles at each end
  const nodes = [
    { x: bandX + size * 0.01, y: bandY + bandH / 2 },
    { x: bandX + bandW - size * 0.01, y: bandY + bandH / 2 },
  ];

  for (const node of nodes) {
    // Node glow
    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = primary;
    ctx.beginPath();
    ctx.arc(node.x, node.y, size * 0.007, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(primary, 0.5);
    ctx.fill();
    ctx.restore();

    // Bright center dot
    ctx.beginPath();
    ctx.arc(node.x, node.y, size * 0.003, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(lightenColor(primary, 40), 0.7);
    ctx.fill();
  }

  // Active neural link — faint line connecting the two nodes
  ctx.save();
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(nodes[0].x + size * 0.01, nodes[0].y);
  ctx.lineTo(nodes[1].x - size * 0.01, nodes[1].y);
  ctx.strokeStyle = withAlpha(primary, 0.1);
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Center status indicator — tiny blinking dot
  ctx.save();
  ctx.shadowBlur = 3;
  ctx.shadowColor = primary;
  ctx.beginPath();
  ctx.arc(cx, bandY + bandH / 2, size * 0.004, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(primary, 0.6);
  ctx.fill();
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// 20. HUD LENS — Holographic Heads-Up Display
// ═══════════════════════════════════════════════════════════════

function drawHudLens({ ctx, size, cx, cy, faceR, primary, serial }: AccParams): void {
  const { eyeY, rightEyeX } = eyePositions(cx, cy, faceR);
  const lensW = faceR * 0.65;
  const lensH = faceR * 0.45;
  const lensX = rightEyeX - lensW * 0.4;
  const lensY = eyeY - lensH / 2;
  const lensRx = size * 0.008;

  // Nearly transparent holographic screen — faction color 5%
  ctx.beginPath();
  ctx.roundRect(lensX, lensY, lensW, lensH, lensRx);
  ctx.fillStyle = withAlpha(primary, 0.05);
  ctx.fill();

  // Thin bright border
  ctx.beginPath();
  ctx.roundRect(lensX, lensY, lensW, lensH, lensRx);
  ctx.strokeStyle = withAlpha(primary, 0.15);
  ctx.lineWidth = 0.4;
  ctx.stroke();

  // HUD content — tiny faction-colored text
  const fontSize = Math.max(3, size * 0.018);
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = withAlpha(primary, 0.2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Line 1: Status
  ctx.fillText('SYS:OK', lensX + size * 0.008, lensY + size * 0.008);

  // Line 2: Serial code
  ctx.fillText(serial, lensX + size * 0.008, lensY + size * 0.008 + fontSize * 1.3);

  // Targeting crosshair in corner
  const chX = lensX + lensW - size * 0.02;
  const chY = lensY + size * 0.015;
  const chLen = size * 0.008;

  ctx.strokeStyle = withAlpha(primary, 0.18);
  ctx.lineWidth = 0.4;
  // Horizontal
  ctx.beginPath();
  ctx.moveTo(chX - chLen, chY);
  ctx.lineTo(chX + chLen, chY);
  ctx.stroke();
  // Vertical
  ctx.beginPath();
  ctx.moveTo(chX, chY - chLen);
  ctx.lineTo(chX, chY + chLen);
  ctx.stroke();
  // Center dot
  ctx.beginPath();
  ctx.arc(chX, chY, 0.6, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(primary, 0.25);
  ctx.fill();

  // Scan line — horizontal progress bar at bottom of HUD
  const barY = lensY + lensH - size * 0.008;
  const barW = lensW * 0.6;
  const barX = lensX + (lensW - barW) / 2;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barW, barY);
  ctx.strokeStyle = withAlpha(primary, 0.08);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Active segment of progress bar
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barW * 0.6, barY);
  ctx.strokeStyle = withAlpha(primary, 0.2);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Arm connecting HUD to the temple
  ctx.beginPath();
  ctx.moveTo(lensX + lensW, eyeY);
  ctx.lineTo(lensX + lensW + faceR * 0.15, eyeY + size * 0.005);
  ctx.strokeStyle = withAlpha(primary, 0.12);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Reset text settings
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}
