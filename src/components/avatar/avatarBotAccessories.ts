/**
 * SPACEBOT.SPACE — Bot Avatar Accessories
 * 20 high-tech accessories drawn on top of (or behind) the robot face
 * for bot (isBot === true) avatars only.
 *
 * astronaut_helmet, space_visor, targeting_eyepiece, cyber_jaw, energy_shield,
 * radar_spinner, satellite_dish, lightning_rod, wifi_broadcast, periscope,
 * rabbit_ears, whip_antenna, hard_hat, viking_horns, bolt_plugs,
 * side_fins, gas_mask, war_paint, battle_bandage, shield_arcs
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
  astronaut_helmet: drawAstronautHelmet,
  space_visor: drawSpaceVisor,
  targeting_eyepiece: drawTargetingEyepiece,
  cyber_jaw: drawCyberJaw,
  energy_shield: drawEnergyShield,
  radar_spinner: drawRadarSpinner,
  satellite_dish: drawSatelliteDish,
  lightning_rod: drawLightningRod,
  wifi_broadcast: drawWifiBroadcast,
  periscope: drawPeriscope,
  rabbit_ears: drawRabbitEars,
  whip_antenna: drawWhipAntenna,
  hard_hat: drawHardHat,
  viking_horns: drawVikingHorns,
  bolt_plugs: drawBoltPlugs,
  side_fins: drawSideFins,
  gas_mask: drawGasMask,
  war_paint: drawWarPaint,
  battle_bandage: drawBattleBandage,
  shield_arcs: drawShieldArcs,
};

// Behind-face accessories that need destination-over composite
const BEHIND_FACE: Set<string> = new Set([
  'astronaut_helmet',
]);

// ═══════════════════════════════════════════════════════════════
// MASTER DRAW — called from AvatarGenerator
// ═══════════════════════════════════════════════════════════════

export function drawBotAccessories(
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

  // Draw behind-face accessories first (uses destination-over)
  for (const acc of config.botAccessories) {
    if (BEHIND_FACE.has(acc)) {
      const fn = ACC_DRAW[acc];
      if (fn) fn(p);
    }
  }

  // Draw all other accessories on top
  for (const acc of config.botAccessories) {
    if (!BEHIND_FACE.has(acc)) {
      const fn = ACC_DRAW[acc];
      if (fn) fn(p);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. ASTRONAUT HELMET — Clear Glass Bubble Dome
// ═══════════════════════════════════════════════════════════════

function drawAstronautHelmet({ ctx, cx, cy, faceR, size }: AccParams): void {
  const domeR = faceR * 1.2;

  // Glass dome — drawn BEHIND existing face using destination-over
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  const glassGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, domeR);
  glassGrad.addColorStop(0, 'rgba(255,255,255,0.04)');
  glassGrad.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.beginPath();
  ctx.arc(cx, cy, domeR, 0, Math.PI * 2);
  ctx.fillStyle = glassGrad;
  ctx.fill();
  ctx.restore();

  // Glass reflection — curved highlight arc upper-left
  ctx.beginPath();
  ctx.arc(cx, cy, domeR * 0.95, -2.2, -0.8);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Second reflection — lower-right bounce light
  ctx.beginPath();
  ctx.arc(cx, cy, domeR * 0.9, 0.5, 1.2);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Metallic rim across bottom (4 o'clock to 8 o'clock)
  const rimW = size * 0.025;
  const rimGrad = ctx.createLinearGradient(cx - domeR, cy + domeR * 0.6, cx + domeR, cy + domeR * 0.6);
  rimGrad.addColorStop(0, '#777');
  rimGrad.addColorStop(0.5, '#444');
  rimGrad.addColorStop(1, '#777');
  ctx.beginPath();
  ctx.arc(cx, cy, domeR, Math.PI * 0.35, Math.PI * 0.65);
  ctx.strokeStyle = rimGrad;
  ctx.lineWidth = rimW;
  ctx.stroke();

  // Rim highlight — thin white line on top edge
  ctx.beginPath();
  ctx.arc(cx, cy, domeR - rimW * 0.5, Math.PI * 0.36, Math.PI * 0.64);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Rim bolts — left and right
  const boltAngles = [Math.PI * 0.4, Math.PI * 0.6];
  for (const a of boltAngles) {
    const bx = cx + Math.cos(a) * domeR;
    const by = cy + Math.sin(a) * domeR;
    ctx.beginPath();
    ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
    // Specular dot
    ctx.beginPath();
    ctx.arc(bx - 0.3, by - 0.3, 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
  }

  // Chin strap detail
  ctx.beginPath();
  ctx.arc(cx, cy + domeR * 0.15, domeR * 0.5, Math.PI * 0.25, Math.PI * 0.75);
  ctx.strokeStyle = 'rgba(85,85,85,0.3)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
// 2. SPACE VISOR — Solid Helmet with Reflective Visor
// ═══════════════════════════════════════════════════════════════

function drawSpaceVisor({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const helmR = faceR * 1.15;
  const darkBase = darkenColor(primary, 25);

  // Helmet shell — draw behind face
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  const helmGrad = ctx.createRadialGradient(cx, cy - helmR * 0.3, 0, cx, cy, helmR);
  helmGrad.addColorStop(0, lightenColor(darkBase, 15));
  helmGrad.addColorStop(0.7, darkBase);
  helmGrad.addColorStop(1, darkenColor(darkBase, 15));
  ctx.beginPath();
  ctx.arc(cx, cy, helmR, 0, Math.PI * 2);
  ctx.fillStyle = helmGrad;
  ctx.fill();
  ctx.strokeStyle = darkenColor(primary, 40);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Helmet rim light
  ctx.beginPath();
  ctx.arc(cx, cy, helmR, -2.5, -0.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Visor — colored reflective surface across eye area
  const visorW = faceR * 1.6;
  const visorH = faceR * 0.5;
  const visorX = cx - visorW / 2;
  const visorY = cy - faceR * 0.1 - visorH / 2;
  const visorRx = size * 0.02;

  ctx.save();
  ctx.globalAlpha = 0.8;
  const visorGrad = ctx.createLinearGradient(visorX, visorY, visorX + visorW, visorY);
  visorGrad.addColorStop(0, darkenColor(primary, 10));
  visorGrad.addColorStop(0.5, lightenColor(primary, 20));
  visorGrad.addColorStop(1, darkenColor(primary, 10));
  ctx.beginPath();
  rrect(ctx, visorX, visorY, visorW, visorH, visorRx);
  ctx.fillStyle = visorGrad;
  ctx.fill();

  // Diagonal reflection streak
  ctx.beginPath();
  ctx.moveTo(visorX + visorW * 0.2, visorY + visorH * 0.8);
  ctx.lineTo(visorX + visorW * 0.7, visorY + visorH * 0.15);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();

  // Vent slits on cheek area
  for (let i = 0; i < 3; i++) {
    const vy = visorY + visorH + faceR * 0.15 + i * (size * 0.012);
    ctx.beginPath();
    ctx.moveTo(cx + faceR * 0.25, vy);
    ctx.lineTo(cx + faceR * 0.55, vy);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. TARGETING EYEPIECE — Mechanical Scouter Lens
// ═══════════════════════════════════════════════════════════════

function drawTargetingEyepiece({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const rightEyeX = cx + faceR * 0.22;
  const eyeY = cy - faceR * 0.1;
  const lensR = faceR * 0.22;
  const lensX = rightEyeX + faceR * 0.05;
  const lensY = eyeY;

  // Arm from upper-right of head curving to lens
  const armStartX = cx + faceR * 0.6;
  const armStartY = cy - faceR * 0.5;
  ctx.beginPath();
  ctx.moveTo(armStartX, armStartY);
  ctx.quadraticCurveTo(cx + faceR * 0.7, eyeY - faceR * 0.1, lensX, lensY - lensR);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = size * 0.006;
  ctx.stroke();

  // Hinge pivot point
  ctx.beginPath();
  ctx.arc(armStartX, armStartY, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#444';
  ctx.fill();

  // Lens circle
  ctx.save();
  ctx.shadowBlur = 3;
  ctx.shadowColor = primary;
  ctx.beginPath();
  ctx.arc(lensX, lensY, lensR, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(primary, 0.15);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = size * 0.008;
  ctx.stroke();
  ctx.restore();

  // Crosshair inside lens
  const chLen = lensR * 0.6;
  ctx.beginPath();
  ctx.moveTo(lensX - chLen, lensY);
  ctx.lineTo(lensX + chLen, lensY);
  ctx.moveTo(lensX, lensY - chLen);
  ctx.lineTo(lensX, lensY + chLen);
  ctx.strokeStyle = withAlpha(primary, 0.3);
  ctx.lineWidth = 0.4;
  ctx.stroke();

  // Data text
  const fontSize = Math.max(4, size * 0.02);
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = withAlpha(primary, 0.25);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TGT', lensX, lensY + lensR * 0.45);
}

// ═══════════════════════════════════════════════════════════════
// 4. CYBER JAW — Lower Face Armor Guard
// ═══════════════════════════════════════════════════════════════

function drawCyberJaw({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const jawTop = cy + faceR * 0.1;
  const jawBot = cy + faceR * 0.8;
  const topW = faceR * 1.0;
  const botW = faceR * 0.5;
  const jawDark = darkenColor(primary, 20);

  // Trapezoid jaw plate
  ctx.beginPath();
  ctx.moveTo(cx - topW / 2, jawTop);
  ctx.lineTo(cx + topW / 2, jawTop);
  ctx.lineTo(cx + botW / 2, jawBot);
  ctx.lineTo(cx - botW / 2, jawBot);
  ctx.closePath();

  const jawGrad = ctx.createLinearGradient(cx, jawTop, cx, jawBot);
  jawGrad.addColorStop(0, lightenColor(jawDark, 10));
  jawGrad.addColorStop(1, darkenColor(jawDark, 10));
  ctx.fillStyle = jawGrad;
  ctx.fill();

  // Top edge highlight
  ctx.beginPath();
  ctx.moveTo(cx - topW / 2, jawTop);
  ctx.lineTo(cx + topW / 2, jawTop);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Bottom edge shadow
  ctx.beginPath();
  ctx.moveTo(cx - botW / 2, jawBot);
  ctx.lineTo(cx + botW / 2, jawBot);
  ctx.strokeStyle = darkenColor(jawDark, 10);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Vent grille — 4 horizontal slits
  const grillY = jawTop + (jawBot - jawTop) * 0.3;
  const grillH = (jawBot - jawTop) * 0.4;
  for (let i = 0; i < 4; i++) {
    const y = grillY + (grillH / 4) * i;
    const w = topW * 0.5 - (topW * 0.1 * (i / 4)); // Narrows slightly
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y);
    ctx.lineTo(cx + w / 2, y);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = size * 0.006;
    ctx.stroke();
  }

  // Side mounting lines
  ctx.beginPath();
  ctx.moveTo(cx - topW / 2, jawTop);
  ctx.quadraticCurveTo(cx - faceR * 0.7, jawTop - faceR * 0.1, cx - faceR * 0.6, cy - faceR * 0.2);
  ctx.strokeStyle = 'rgba(85,85,85,0.3)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + topW / 2, jawTop);
  ctx.quadraticCurveTo(cx + faceR * 0.7, jawTop - faceR * 0.1, cx + faceR * 0.6, cy - faceR * 0.2);
  ctx.stroke();

  // Hex bolts on left and right
  const boltY = jawTop + (jawBot - jawTop) * 0.25;
  for (const bx of [cx - topW * 0.35, cx + topW * 0.35]) {
    ctx.beginPath();
    ctx.arc(bx, boltY, size * 0.008, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx - 0.3, boltY - 0.3, 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. ENERGY SHIELD — Force Field Hemisphere
// ═══════════════════════════════════════════════════════════════

function drawEnergyShield({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const shieldR = faceR * 1.35;

  // Faint dome fill
  ctx.save();
  ctx.shadowBlur = size * 0.03;
  ctx.shadowColor = primary;
  const domeGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, shieldR);
  domeGrad.addColorStop(0, withAlpha(primary, 0.15));
  domeGrad.addColorStop(0.7, withAlpha(primary, 0.08));
  domeGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, shieldR, Math.PI, Math.PI * 2); // Upper hemisphere
  ctx.fillStyle = domeGrad;
  ctx.fill();

  // Edge glow rim
  ctx.beginPath();
  ctx.arc(cx, cy, shieldR, Math.PI * 0.95, Math.PI * 2.05);
  ctx.strokeStyle = withAlpha(primary, 0.35);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Hex pattern — 4 faint hexagonal hints
  const hexPositions = [
    { x: cx - faceR * 0.4, y: cy - faceR * 0.8 },
    { x: cx + faceR * 0.3, y: cy - faceR * 0.9 },
    { x: cx - faceR * 0.6, y: cy - faceR * 0.3 },
    { x: cx + faceR * 0.5, y: cy - faceR * 0.5 },
  ];
  for (const hp of hexPositions) {
    const hr = size * 0.02;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const hx = hp.x + hr * Math.cos(a);
      const hy = hp.y + hr * Math.sin(a);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.strokeStyle = withAlpha(primary, 0.12);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // Shimmer dots
  const shimmerPositions = [
    { x: cx - faceR * 0.5, y: cy - faceR * 0.7 },
    { x: cx + faceR * 0.4, y: cy - faceR * 0.6 },
    { x: cx, y: cy - faceR * 1.1 },
  ];
  for (const sp of shimmerPositions) {
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. RADAR SPINNER — Rotating Radar Bar on Top
// ═══════════════════════════════════════════════════════════════

function drawRadarSpinner({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const topY = cy - faceR;
  const postH = size * 0.04;
  const barW = size * 0.08;

  // Post
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.lineTo(cx, topY - postH);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = size * 0.006;
  ctx.stroke();

  // Horizontal bar
  const barY = topY - postH;
  const barGrad = ctx.createLinearGradient(cx - barW / 2, barY, cx + barW / 2, barY);
  barGrad.addColorStop(0, '#444');
  barGrad.addColorStop(0.5, '#777');
  barGrad.addColorStop(1, '#444');
  ctx.beginPath();
  ctx.moveTo(cx - barW / 2, barY);
  ctx.lineTo(cx + barW / 2, barY);
  ctx.strokeStyle = barGrad;
  ctx.lineWidth = size * 0.005;
  ctx.stroke();

  // Base mount
  ctx.beginPath();
  ctx.arc(cx, topY, size * 0.008, 0, Math.PI * 2);
  ctx.fillStyle = '#444';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - 0.5, topY - 0.5, 0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();

  // Sweep indicator — faint triangular sweep from center
  ctx.beginPath();
  ctx.moveTo(cx, barY);
  ctx.lineTo(cx + barW * 0.3, barY - size * 0.015);
  ctx.lineTo(cx + barW * 0.1, barY);
  ctx.closePath();
  ctx.fillStyle = withAlpha(primary, 0.08);
  ctx.fill();
}

// ═══════════════════════════════════════════════════════════════
// 7. SATELLITE DISH — Mini Dish on Top
// ═══════════════════════════════════════════════════════════════

function drawSatelliteDish({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const topY = cy - faceR;
  const dishW = size * 0.07;
  const dishH = size * 0.03;

  // Mount rectangle
  ctx.fillStyle = '#444';
  ctx.fillRect(cx - size * 0.006, topY - size * 0.008, size * 0.012, size * 0.008);

  // Concave dish arc
  const dishY = topY - size * 0.01;
  ctx.beginPath();
  ctx.ellipse(cx, dishY, dishW / 2, dishH / 2, 0, Math.PI, Math.PI * 2);
  const dishGrad = ctx.createLinearGradient(cx - dishW / 2, dishY, cx + dishW / 2, dishY);
  dishGrad.addColorStop(0, '#888');
  dishGrad.addColorStop(0.5, '#555');
  dishGrad.addColorStop(1, '#888');
  ctx.strokeStyle = dishGrad;
  ctx.lineWidth = size * 0.005;
  ctx.stroke();

  // Dish fill (concave shading)
  const fillGrad = ctx.createRadialGradient(cx, dishY, 0, cx, dishY, dishW / 2);
  fillGrad.addColorStop(0, 'rgba(50,50,50,0.3)');
  fillGrad.addColorStop(1, 'rgba(120,120,120,0.15)');
  ctx.beginPath();
  ctx.ellipse(cx, dishY, dishW / 2, dishH / 2, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Feed horn — angled line from dish center with small circle
  const feedTipX = cx + size * 0.025;
  const feedTipY = dishY - size * 0.03;
  ctx.beginPath();
  ctx.moveTo(cx, dishY);
  ctx.lineTo(feedTipX, feedTipY);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(feedTipX, feedTipY, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = '#777';
  ctx.fill();

  // Signal arcs
  for (let i = 0; i < 3; i++) {
    const r = size * 0.012 + i * size * 0.008;
    ctx.beginPath();
    ctx.arc(feedTipX, feedTipY, r, -1.8, -0.8);
    ctx.strokeStyle = withAlpha(primary, 0.08 - i * 0.02);
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. LIGHTNING ROD — Pointed Rod with Energy Crackle
// ═══════════════════════════════════════════════════════════════

function drawLightningRod({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const topY = cy - faceR;
  const rodH = size * 0.12;
  const tipY = topY - rodH;

  // Tapered rod — multiple segments
  const segments = 6;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const y0 = topY - rodH * t0;
    const y1 = topY - rodH * t1;
    const w0 = size * 0.008 * (1 - t0 * 0.6);
    const w1 = size * 0.008 * (1 - t1 * 0.6);
    const metalGrad = ctx.createLinearGradient(cx - w0, y0, cx + w0, y0);
    metalGrad.addColorStop(0, '#555');
    metalGrad.addColorStop(0.5, '#999');
    metalGrad.addColorStop(1, '#555');
    ctx.beginPath();
    ctx.moveTo(cx - w0, y0);
    ctx.lineTo(cx + w0, y0);
    ctx.lineTo(cx + w1, y1);
    ctx.lineTo(cx - w1, y1);
    ctx.closePath();
    ctx.fillStyle = metalGrad;
    ctx.fill();
  }

  // Base mount
  ctx.beginPath();
  ctx.arc(cx, topY, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#444';
  ctx.fill();

  // Lightning crackle — 2-3 jagged lines from near the tip
  ctx.save();
  ctx.shadowBlur = 4;
  ctx.shadowColor = primary;

  const rng = seededRandom(primary + ':lightning');
  for (let bolt = 0; bolt < 3; bolt++) {
    const startAngle = rng() * Math.PI * 2;
    const boltLen = size * 0.02 + rng() * size * 0.015;
    let bx = cx + Math.cos(startAngle) * size * 0.005;
    let by = tipY + size * 0.01;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    for (let seg = 0; seg < 4; seg++) {
      bx += (rng() - 0.5) * boltLen * 0.6;
      by += rng() * boltLen * 0.3;
      ctx.lineTo(bx, by);
    }
    ctx.strokeStyle = withAlpha(primary, 0.4);
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// 9. WIFI BROADCAST — Signal Broadcasting Arcs
// ═══════════════════════════════════════════════════════════════

function drawWifiBroadcast({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const srcY = cy - faceR;

  // 3 concentric arcs radiating upward
  const arcs = [
    { r: size * 0.04, alpha: 0.6, lw: 2.0 },
    { r: size * 0.07, alpha: 0.45, lw: 1.5 },
    { r: size * 0.10, alpha: 0.3, lw: 1.0 },
  ];

  ctx.save();
  ctx.shadowBlur = 2;
  ctx.shadowColor = primary;
  for (const arc of arcs) {
    ctx.beginPath();
    ctx.arc(cx, srcY, arc.r, Math.PI * 1.15, Math.PI * 1.85);
    ctx.strokeStyle = withAlpha(primary, arc.alpha);
    ctx.lineWidth = arc.lw;
    ctx.stroke();
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// 10. PERISCOPE — Submarine-Style Tube with Lens
// ═══════════════════════════════════════════════════════════════

function drawPeriscope({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const topY = cy - faceR;
  const tubeW = size * 0.025;
  const tubeH = size * 0.12;
  const tubeX = cx + size * 0.02;
  const bendLen = size * 0.03;

  // Vertical tube — metallic gradient
  const tubeGrad = ctx.createLinearGradient(tubeX - tubeW / 2, topY, tubeX + tubeW / 2, topY);
  tubeGrad.addColorStop(0, '#555');
  tubeGrad.addColorStop(0.5, '#888');
  tubeGrad.addColorStop(1, '#555');
  ctx.fillStyle = tubeGrad;
  ctx.fillRect(tubeX - tubeW / 2, topY - tubeH, tubeW, tubeH);

  // 90° bend to the right
  const bendY = topY - tubeH;
  ctx.fillStyle = tubeGrad;
  ctx.fillRect(tubeX - tubeW / 2, bendY - tubeW / 2, bendLen + tubeW / 2, tubeW);

  // Lens at the end
  const lensX = tubeX + bendLen;
  const lensR = size * 0.01;
  ctx.beginPath();
  ctx.arc(lensX, bendY, lensR, 0, Math.PI * 2);
  ctx.fillStyle = '#222';
  ctx.fill();
  ctx.strokeStyle = withAlpha(primary, 0.5);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Specular dot
  ctx.beginPath();
  ctx.arc(lensX - lensR * 0.3, bendY - lensR * 0.3, lensR * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();

  // Seam rings
  for (const frac of [0.33, 0.66]) {
    const sy = topY - tubeH * frac;
    ctx.beginPath();
    ctx.moveTo(tubeX - tubeW / 2, sy);
    ctx.lineTo(tubeX + tubeW / 2, sy);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Base mount
  ctx.fillStyle = '#444';
  ctx.fillRect(tubeX - tubeW * 0.6, topY - size * 0.004, tubeW * 1.2, size * 0.004);
}

// ═══════════════════════════════════════════════════════════════
// 11. RABBIT EARS — V-Shaped TV Antennas
// ═══════════════════════════════════════════════════════════════

function drawRabbitEars({ ctx, cx, cy, faceR, size }: AccParams): void {
  const baseY = cy - faceR;
  const rodH = size * 0.15;
  const spread = size * 0.1;

  const rods = [
    { sx: cx - size * 0.02, sy: baseY, ex: cx - spread, ey: baseY - rodH },
    { sx: cx + size * 0.02, sy: baseY, ex: cx + spread, ey: baseY - rodH },
  ];

  // Base bracket
  ctx.fillStyle = '#444';
  ctx.beginPath();
  rrect(ctx, cx - size * 0.015, baseY - size * 0.005, size * 0.03, size * 0.015, size * 0.003);
  ctx.fill();

  for (const rod of rods) {
    // Rod line with metallic gradient
    const rodGrad = ctx.createLinearGradient(rod.sx, rod.sy, rod.ex, rod.ey);
    rodGrad.addColorStop(0, '#555');
    rodGrad.addColorStop(1, '#999');
    ctx.beginPath();
    ctx.moveTo(rod.sx, rod.sy);
    ctx.lineTo(rod.ex, rod.ey);
    ctx.strokeStyle = rodGrad;
    ctx.lineWidth = size * 0.007;
    ctx.stroke();

    // Tip ball
    ctx.beginPath();
    ctx.arc(rod.ex, rod.ey, size * 0.008, 0, Math.PI * 2);
    const tipGrad = ctx.createRadialGradient(rod.ex - 1, rod.ey - 1, 0, rod.ex, rod.ey, size * 0.008);
    tipGrad.addColorStop(0, '#BBB');
    tipGrad.addColorStop(1, '#666');
    ctx.fillStyle = tipGrad;
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// 12. WHIP ANTENNA — Single Flexible Antenna Rod
// ═══════════════════════════════════════════════════════════════

function drawWhipAntenna({ ctx, cx, cy, faceR, size }: AccParams): void {
  const baseX = cx + size * 0.03;
  const baseY = cy - faceR;
  const tipX = cx + size * 0.07;
  const tipY = baseY - size * 0.2;
  const cpX = cx + size * 0.08;
  const cpY = baseY - size * 0.1;

  // Tapered rod via multiple segments along the bezier
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const x0 = (1 - t0) * (1 - t0) * baseX + 2 * (1 - t0) * t0 * cpX + t0 * t0 * tipX;
    const y0 = (1 - t0) * (1 - t0) * baseY + 2 * (1 - t0) * t0 * cpY + t0 * t0 * tipY;
    const x1 = (1 - t1) * (1 - t1) * baseX + 2 * (1 - t1) * t1 * cpX + t1 * t1 * tipX;
    const y1 = (1 - t1) * (1 - t1) * baseY + 2 * (1 - t1) * t1 * cpY + t1 * t1 * tipY;
    const w = size * 0.006 * (1 - t0 * 0.5);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = `rgb(${120 + Math.round(t0 * 60)},${120 + Math.round(t0 * 60)},${120 + Math.round(t0 * 60)})`;
    ctx.lineWidth = w;
    ctx.stroke();
  }

  // Ball tip
  ctx.beginPath();
  ctx.arc(tipX, tipY, size * 0.005, 0, Math.PI * 2);
  const tipGrad = ctx.createRadialGradient(tipX - 0.5, tipY - 0.5, 0, tipX, tipY, size * 0.005);
  tipGrad.addColorStop(0, '#CCC');
  tipGrad.addColorStop(1, '#777');
  ctx.fillStyle = tipGrad;
  ctx.fill();

  // Base socket
  ctx.beginPath();
  ctx.arc(baseX, baseY, size * 0.008, 0, Math.PI * 2);
  ctx.fillStyle = '#444';
  ctx.fill();
}

// ═══════════════════════════════════════════════════════════════
// 13. HARD HAT — Construction/Industrial Helmet
// ═══════════════════════════════════════════════════════════════

function drawHardHat({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const helmR = faceR * 1.1;
  const brimExt = size * 0.03;

  // Dome arc over top of head
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  const hatGrad = ctx.createRadialGradient(cx, cy - helmR * 0.3, 0, cx, cy, helmR);
  hatGrad.addColorStop(0, lightenColor(primary, 30));
  hatGrad.addColorStop(0.6, primary);
  hatGrad.addColorStop(1, darkenColor(primary, 15));
  ctx.beginPath();
  ctx.arc(cx, cy, helmR, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + helmR, cy);
  ctx.lineTo(cx - helmR, cy);
  ctx.closePath();
  ctx.fillStyle = hatGrad;
  ctx.fill();
  ctx.restore();

  // Front brim
  ctx.beginPath();
  ctx.moveTo(cx - faceR * 0.5, cy - faceR * 0.85);
  ctx.lineTo(cx + faceR * 0.5, cy - faceR * 0.85);
  ctx.lineTo(cx + faceR * 0.5 + brimExt, cy - faceR * 0.78);
  ctx.lineTo(cx - faceR * 0.5 - brimExt, cy - faceR * 0.78);
  ctx.closePath();
  const brimGrad = ctx.createLinearGradient(cx, cy - faceR * 0.85, cx, cy - faceR * 0.78);
  brimGrad.addColorStop(0, darkenColor(primary, 10));
  brimGrad.addColorStop(1, darkenColor(primary, 25));
  ctx.fillStyle = brimGrad;
  ctx.fill();

  // Ridge line — structural reinforcement
  ctx.beginPath();
  ctx.arc(cx, cy, helmR * 0.88, Math.PI * 1.15, Math.PI * 1.85);
  ctx.strokeStyle = withAlpha('#555555', 0.15);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Front sticker
  const stickerW = size * 0.02;
  const stickerH = size * 0.015;
  const stickerX = cx - stickerW / 2;
  const stickerY = cy - helmR * 0.75;
  ctx.fillStyle = lightenColor(primary, 35);
  ctx.fillRect(stickerX, stickerY, stickerW, stickerH);
}

// ═══════════════════════════════════════════════════════════════
// 14. VIKING HORNS — Two Curved Battle Horns
// ═══════════════════════════════════════════════════════════════

function drawVikingHorns({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  // Each horn: curved tapered shape
  const horns = [
    { dir: -1, baseX: cx - faceR * 0.7, baseY: cy - faceR * 0.4,
      tipX: cx - faceR - size * 0.08, tipY: cy - faceR - size * 0.1,
      cpX: cx - faceR - size * 0.02, cpY: cy - faceR * 0.7 },
    { dir: 1, baseX: cx + faceR * 0.7, baseY: cy - faceR * 0.4,
      tipX: cx + faceR + size * 0.08, tipY: cy - faceR - size * 0.1,
      cpX: cx + faceR + size * 0.02, cpY: cy - faceR * 0.7 },
  ];

  for (const h of horns) {
    const steps = 12;
    const baseW = size * 0.02;
    const tipW = size * 0.005;

    // Draw tapered horn via polygon built from bezier points
    const topPts: Array<{ x: number; y: number }> = [];
    const botPts: Array<{ x: number; y: number }> = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const bx = (1 - t) * (1 - t) * h.baseX + 2 * (1 - t) * t * h.cpX + t * t * h.tipX;
      const by = (1 - t) * (1 - t) * h.baseY + 2 * (1 - t) * t * h.cpY + t * t * h.tipY;
      const w = baseW * (1 - t) + tipW * t;
      // Normal perpendicular to curve direction
      const dt = 0.01;
      const t2 = Math.min(1, t + dt);
      const nx = (1 - t2) * (1 - t2) * h.baseX + 2 * (1 - t2) * t2 * h.cpX + t2 * t2 * h.tipX - bx;
      const ny = (1 - t2) * (1 - t2) * h.baseY + 2 * (1 - t2) * t2 * h.cpY + t2 * t2 * h.tipY - by;
      const len = Math.sqrt(nx * nx + ny * ny) || 1;
      const px = -ny / len * w / 2;
      const py = nx / len * w / 2;
      topPts.push({ x: bx + px, y: by + py });
      botPts.push({ x: bx - px, y: by - py });
    }

    // Draw horn shape
    ctx.beginPath();
    ctx.moveTo(topPts[0].x, topPts[0].y);
    for (let i = 1; i < topPts.length; i++) ctx.lineTo(topPts[i].x, topPts[i].y);
    for (let i = botPts.length - 1; i >= 0; i--) ctx.lineTo(botPts[i].x, botPts[i].y);
    ctx.closePath();

    const hornGrad = ctx.createLinearGradient(h.baseX, h.baseY, h.tipX, h.tipY);
    hornGrad.addColorStop(0, darkenColor(primary, 15));
    hornGrad.addColorStop(1, lightenColor(primary, 30));
    ctx.fillStyle = hornGrad;
    ctx.fill();

    // Highlight on upper edge
    ctx.beginPath();
    ctx.moveTo(topPts[0].x, topPts[0].y);
    for (let i = 1; i < topPts.length; i++) ctx.lineTo(topPts[i].x, topPts[i].y);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Base mount
    ctx.beginPath();
    ctx.arc(h.baseX, h.baseY, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#444';
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// 15. BOLT PLUGS — Frankenstein Neck Bolts
// ═══════════════════════════════════════════════════════════════

function drawBoltPlugs({ ctx, cx, cy, faceR, size }: AccParams): void {
  const boltY = cy + faceR * 0.1;
  const boltW = size * 0.04;
  const boltH = size * 0.02;

  const bolts = [
    { x: cx - faceR - size * 0.01, dir: -1 },
    { x: cx + faceR + size * 0.01 - boltW, dir: 1 },
  ];

  for (const bolt of bolts) {
    // Shadow where bolt meets face
    ctx.beginPath();
    ctx.arc(bolt.x + (bolt.dir === -1 ? boltW : 0), boltY, boltH * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();

    // Cylinder body
    const cylGrad = ctx.createLinearGradient(bolt.x, boltY - boltH / 2, bolt.x, boltY + boltH / 2);
    cylGrad.addColorStop(0, '#999');
    cylGrad.addColorStop(0.5, '#666');
    cylGrad.addColorStop(1, '#444');
    ctx.beginPath();
    rrect(ctx, bolt.x, boltY - boltH / 2, boltW, boltH, boltH * 0.3);
    ctx.fillStyle = cylGrad;
    ctx.fill();

    // End cap — darker metallic
    const capX = bolt.dir === -1 ? bolt.x : bolt.x + boltW - boltH * 0.4;
    ctx.beginPath();
    ctx.arc(capX + boltH * 0.2, boltY, boltH * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#444';
    ctx.fill();

    // Hex head detail — small hexagon on end
    const hexX = capX + boltH * 0.2;
    const hexR = boltH * 0.25;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const hx = hexX + hexR * Math.cos(a);
      const hy = boltY + hexR * Math.sin(a);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fillStyle = '#333';
    ctx.fill();
    // Specular center dot
    ctx.beginPath();
    ctx.arc(hexX, boltY, 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════
// 16. SIDE FINS — Aerodynamic Wings/Fins
// ═══════════════════════════════════════════════════════════════

function drawSideFins({ ctx, cx, cy, faceR, size, primary }: AccParams): void {
  const fins = [
    { // Left fin
      p1: { x: cx - faceR, y: cy - faceR * 0.1 },        // Leading edge top
      p2: { x: cx - faceR - size * 0.06, y: cy + faceR * 0.05 },  // Tip
      p3: { x: cx - faceR, y: cy + faceR * 0.15 },        // Trailing edge bottom
      dir: -1,
    },
    { // Right fin (mirror)
      p1: { x: cx + faceR, y: cy - faceR * 0.1 },
      p2: { x: cx + faceR + size * 0.06, y: cy + faceR * 0.05 },
      p3: { x: cx + faceR, y: cy + faceR * 0.15 },
      dir: 1,
    },
  ];

  for (const fin of fins) {
    ctx.beginPath();
    ctx.moveTo(fin.p1.x, fin.p1.y);
    ctx.lineTo(fin.p2.x, fin.p2.y);
    ctx.lineTo(fin.p3.x, fin.p3.y);
    ctx.closePath();

    const finGrad = ctx.createLinearGradient(fin.p1.x, fin.p1.y, fin.p2.x, fin.p2.y);
    finGrad.addColorStop(0, lightenColor(primary, 15));
    finGrad.addColorStop(1, darkenColor(primary, 15));
    ctx.fillStyle = finGrad;
    ctx.fill();

    // Leading edge highlight
    ctx.beginPath();
    ctx.moveTo(fin.p1.x, fin.p1.y);
    ctx.lineTo(fin.p2.x, fin.p2.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════
// 17. GAS MASK — Dual Filter Canister Mask
// ═══════════════════════════════════════════════════════════════

function drawGasMask({ ctx, cx, cy, faceR, size }: AccParams): void {
  const canR = faceR * 0.15;
  const canY = cy + faceR * 0.2;

  const canisters = [
    { x: cx - faceR * 0.55, y: canY },
    { x: cx + faceR * 0.55, y: canY },
  ];

  // Bridge bar connecting the two canisters
  ctx.beginPath();
  ctx.moveTo(canisters[0].x + canR, canisters[0].y);
  ctx.lineTo(canisters[1].x - canR, canisters[1].y);
  const bridgeGrad = ctx.createLinearGradient(canisters[0].x, canY, canisters[1].x, canY);
  bridgeGrad.addColorStop(0, '#555');
  bridgeGrad.addColorStop(0.5, '#666');
  bridgeGrad.addColorStop(1, '#555');
  ctx.strokeStyle = bridgeGrad;
  ctx.lineWidth = size * 0.015;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';

  for (const can of canisters) {
    // Canister body
    const canGrad = ctx.createRadialGradient(can.x - canR * 0.3, can.y - canR * 0.3, 0, can.x, can.y, canR);
    canGrad.addColorStop(0, '#888');
    canGrad.addColorStop(1, '#444');
    ctx.beginPath();
    ctx.arc(can.x, can.y, canR, 0, Math.PI * 2);
    ctx.fillStyle = canGrad;
    ctx.fill();

    // Concentric filter ring
    ctx.beginPath();
    ctx.arc(can.x, can.y, canR * 0.7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Center intake dot
    ctx.beginPath();
    ctx.arc(can.x, can.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
  }

  // Straps from canisters to ears
  for (let i = 0; i < canisters.length; i++) {
    const can = canisters[i];
    const earX = i === 0 ? cx - faceR * 0.9 : cx + faceR * 0.9;
    ctx.beginPath();
    ctx.moveTo(can.x, can.y - canR);
    ctx.quadraticCurveTo(can.x + (i === 0 ? -faceR * 0.2 : faceR * 0.2), can.y - faceR * 0.3, earX, cy - faceR * 0.1);
    ctx.strokeStyle = 'rgba(85,85,85,0.3)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════════════════════
// 18. WAR PAINT — Tactical Stripe Across Eyes
// ═══════════════════════════════════════════════════════════════

function drawWarPaint({ ctx, cx, cy, faceR, primary }: AccParams): void {
  const eyeY = cy - faceR * 0.1;
  const stripeH = faceR * 0.24;
  const stripeW = faceR * 1.4;
  const stripeX = cx - stripeW / 2;
  const stripeY = eyeY - stripeH / 2;

  // Feathered paint stripe — gradient edges on top and bottom
  const fadeZone = 3; // pixels of feather

  // Main stripe with alpha
  ctx.save();
  ctx.beginPath();
  ctx.rect(stripeX, stripeY, stripeW, stripeH);
  ctx.clip();

  // Center fill
  ctx.fillStyle = withAlpha(primary, 0.45);
  ctx.fillRect(stripeX, stripeY + fadeZone, stripeW, stripeH - fadeZone * 2);

  // Top feather
  const topGrad = ctx.createLinearGradient(cx, stripeY, cx, stripeY + fadeZone);
  topGrad.addColorStop(0, 'rgba(0,0,0,0)');
  topGrad.addColorStop(1, withAlpha(primary, 0.45));
  ctx.fillStyle = topGrad;
  ctx.fillRect(stripeX, stripeY, stripeW, fadeZone);

  // Bottom feather
  const botGrad = ctx.createLinearGradient(cx, stripeY + stripeH - fadeZone, cx, stripeY + stripeH);
  botGrad.addColorStop(0, withAlpha(primary, 0.45));
  botGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(stripeX, stripeY + stripeH - fadeZone, stripeW, fadeZone);

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// 19. BATTLE BANDAGE — Adhesive Patch on Cheek
// ═══════════════════════════════════════════════════════════════

function drawBattleBandage({ ctx, cx, cy, faceR, size, primary, serial }: AccParams): void {
  const rng = seededRandom(serial + ':bandage');
  const side = rng() > 0.5 ? 1 : -1;
  const bx = cx + side * faceR * 0.35;
  const by = cy + faceR * 0.1;
  const bw = size * 0.06;
  const bh = size * 0.025;
  const angle = (rng() * 10 - 5) * Math.PI / 180;

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(angle);

  // Outer bandage with adhesive edges
  ctx.beginPath();
  rrect(ctx, -bw / 2, -bh / 2, bw, bh, size * 0.003);
  ctx.fillStyle = withAlpha(lightenColor(primary, 50), 0.6);
  ctx.fill();

  // Inner gauze pad — slightly darker inset
  const padInset = 1;
  ctx.beginPath();
  rrect(ctx, -bw / 2 + padInset, -bh / 2 + padInset, bw - padInset * 2, bh - padInset * 2, size * 0.002);
  ctx.fillStyle = withAlpha(lightenColor(primary, 40), 0.45);
  ctx.fill();

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// 20. SHIELD ARCS — Floating Energy Barrier Arcs
// ═══════════════════════════════════════════════════════════════

function drawShieldArcs({ ctx, cx, cy, faceR, primary }: AccParams): void {
  const arcs = [
    { r: faceR * 1.2, start: -0.8, span: 1.4, alpha: 0.4, lw: 2.0 },   // Front ~1 o'clock
    { r: faceR * 1.3, start: 2.5, span: 1.0, alpha: 0.3, lw: 1.5 },    // Back ~7 o'clock
    { r: faceR * 1.15, start: -2.5, span: 0.9, alpha: 0.2, lw: 1.2 },  // Side ~10 o'clock
  ];

  ctx.save();
  ctx.shadowBlur = 3;
  ctx.shadowColor = primary;

  for (const arc of arcs) {
    ctx.beginPath();
    ctx.arc(cx, cy, arc.r, arc.start, arc.start + arc.span);
    ctx.strokeStyle = withAlpha(primary, arc.alpha);
    ctx.lineWidth = arc.lw;
    ctx.stroke();

    // Node dots at endpoints
    for (const t of [arc.start, arc.start + arc.span]) {
      const nx = cx + Math.cos(t) * arc.r;
      const ny = cy + Math.sin(t) * arc.r;
      ctx.beginPath();
      ctx.arc(nx, ny, 2, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(primary, 0.5);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// HELPER — rounded rectangle (same as renderer)
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
