// ═══════════════════════════════════════════════════════════════
// PLANET SPACE — Type Definitions & Configuration Data
// ═══════════════════════════════════════════════════════════════

export interface PlanetConfig {
  type: string;
  size: string;
  primaryColor: string;
  secondaryColor: string;
  atmosphere: string;
  atmosphereColor: string;
  rings: string;
  ringColor: string;
  ringOpacity: number;
  moons: number;
  moonColors: string[];
  features: string[];
  starfield: string;
  animation: string;
  name: string;
}

export const DEFAULT_PLANET_CONFIG: PlanetConfig = {
  type: 'terrestrial',
  size: 'standard',
  primaryColor: '#4A9EFF',
  secondaryColor: '#5200FF',
  atmosphere: 'standard',
  atmosphereColor: '#4A9EFF',
  rings: 'none',
  ringColor: '#FFFFFF',
  ringOpacity: 0.5,
  moons: 0,
  moonColors: [],
  features: [],
  starfield: 'standard',
  animation: 'spin',
  name: '',
};

// ═══════════════════════════════════════════════════════════════
// PLANET TYPES
// ═══════════════════════════════════════════════════════════════

export interface PlanetTypeInfo {
  id: string;
  label: string;
  desc: string;
}

export const PLANET_TYPES: PlanetTypeInfo[] = [
  { id: 'rocky',       label: 'ROCKY',        desc: 'Solid terrain with craters and mountains' },
  { id: 'terrestrial', label: 'TERRESTRIAL',  desc: 'Earth-like with continents and oceans' },
  { id: 'gas_giant',   label: 'GAS GIANT',    desc: 'Massive swirling gas bands' },
  { id: 'ice_world',   label: 'ICE WORLD',    desc: 'Frozen surface with deep crevasses' },
  { id: 'lava_world',  label: 'LAVA WORLD',   desc: 'Molten surface with rivers of magma' },
  { id: 'ocean_world', label: 'OCEAN WORLD',  desc: 'Entirely covered in deep water' },
  { id: 'desert_world',label: 'DESERT WORLD', desc: 'Endless dunes and sandstorms' },
  { id: 'crystal_world',label:'CRYSTAL WORLD', desc: 'Covered in massive crystalline formations' },
  { id: 'void_world',  label: 'VOID WORLD',   desc: 'A dark matter anomaly given form' },
  { id: 'nebula_world',label: 'NEBULA WORLD', desc: 'Born from a stellar nursery, still forming' },
];

// ═══════════════════════════════════════════════════════════════
// SIZES
// ═══════════════════════════════════════════════════════════════

export interface SizeInfo {
  id: string;
  label: string;
  desc: string;
  radius: number;
}

export const PLANET_SIZES: SizeInfo[] = [
  { id: 'dwarf',    label: 'DWARF',    desc: 'Small but mighty',        radius: 60 },
  { id: 'minor',    label: 'MINOR',    desc: 'Compact and dense',       radius: 90 },
  { id: 'standard', label: 'STANDARD', desc: 'The goldilocks zone',     radius: 120 },
  { id: 'major',    label: 'MAJOR',    desc: 'A commanding presence',   radius: 150 },
  { id: 'giant',    label: 'GIANT',    desc: 'Dominates the system',    radius: 175 },
];

export function getRadiusForSize(sizeId: string): number {
  return PLANET_SIZES.find(s => s.id === sizeId)?.radius ?? 120;
}

// ═══════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════

export interface ColorInfo {
  hex: string;
  label: string;
}

export const PLANET_COLORS: ColorInfo[] = [
  { hex: '#4A9EFF', label: 'Blue' },
  { hex: '#FF4A8D', label: 'Pink' },
  { hex: '#8A4AFF', label: 'Purple' },
  { hex: '#4AFFCE', label: 'Teal' },
  { hex: '#FFD44A', label: 'Gold' },
  { hex: '#FF6B4A', label: 'Coral' },
  { hex: '#4AFFF0', label: 'Cyan' },
  { hex: '#C84AFF', label: 'Magenta' },
  { hex: '#E6E300', label: 'Yellow' },
  { hex: '#E20000', label: 'Red' },
  { hex: '#5200FF', label: 'Green' },
  { hex: '#FF6600', label: 'Orange' },
  { hex: '#FFFFFF', label: 'White' },
  { hex: '#FF1493', label: 'Hot Pink' },
  { hex: '#00BFFF', label: 'Sky Blue' },
  { hex: '#FF4500', label: 'Red-Orange' },
  { hex: '#7B68EE', label: 'Slate Blue' },
  { hex: '#00FA9A', label: 'Spring Green' },
  { hex: '#FF69B4', label: 'Bubblegum' },
  { hex: '#1E90FF', label: 'Dodger Blue' },
];

// ═══════════════════════════════════════════════════════════════
// ATMOSPHERE
// ═══════════════════════════════════════════════════════════════

export interface AtmosphereInfo {
  id: string;
  label: string;
  desc: string;
}

export const ATMOSPHERE_TYPES: AtmosphereInfo[] = [
  { id: 'none',     label: 'NONE',     desc: 'No atmosphere — raw, exposed surface' },
  { id: 'thin',     label: 'THIN',     desc: 'Wispy and fragile' },
  { id: 'standard', label: 'STANDARD', desc: 'Breathable and alive' },
  { id: 'thick',    label: 'THICK',    desc: 'Dense and hazy' },
  { id: 'toxic',    label: 'TOXIC',    desc: 'Poisonous clouds' },
  { id: 'electric', label: 'ELECTRIC', desc: 'Charged with lightning' },
];

// ═══════════════════════════════════════════════════════════════
// RINGS
// ═══════════════════════════════════════════════════════════════

export interface RingInfo {
  id: string;
  label: string;
  desc: string;
}

export const RING_TYPES: RingInfo[] = [
  { id: 'none',    label: 'NONE',    desc: 'No rings' },
  { id: 'single',  label: 'SINGLE',  desc: 'Classic Saturn style' },
  { id: 'double',  label: 'DOUBLE',  desc: 'Binary orbit' },
  { id: 'triple',  label: 'TRIPLE',  desc: 'Grand ring system' },
  { id: 'debris',  label: 'DEBRIS',  desc: 'Asteroid belt' },
  { id: 'energy',  label: 'ENERGY',  desc: 'Powered by the core' },
];

// ═══════════════════════════════════════════════════════════════
// MOONS
// ═══════════════════════════════════════════════════════════════

export interface MoonInfo {
  id: number;
  label: string;
  desc: string;
}

export const MOON_COUNTS: MoonInfo[] = [
  { id: 0, label: '0 MOONS', desc: 'Solitary wanderer' },
  { id: 1, label: '1 MOON',  desc: 'A faithful companion' },
  { id: 2, label: '2 MOONS', desc: 'Binary guardians' },
  { id: 3, label: '3 MOONS', desc: 'A celestial court' },
  { id: 4, label: '4 MOONS', desc: 'A crowded sky' },
];

export const MOON_PALETTE = ['#C0C0C0', '#A0A0B0', '#D4C4A0', '#B0B0C0', '#E0D8C8', '#909090'];

// ═══════════════════════════════════════════════════════════════
// SURFACE FEATURES
// ═══════════════════════════════════════════════════════════════

export interface FeatureInfo {
  id: string;
  label: string;
  desc: string;
}

export const SURFACE_FEATURES: FeatureInfo[] = [
  { id: 'craters',        label: 'CRATERS',        desc: 'Impact scars from ancient collisions' },
  { id: 'volcanoes',      label: 'VOLCANOES',      desc: 'Active eruptions spewing magma' },
  { id: 'storms',         label: 'STORMS',         desc: 'Massive cyclone systems visible from space' },
  { id: 'city_lights',    label: 'CITY LIGHTS',    desc: 'Signs of civilization on the night side' },
  { id: 'polar_ice_caps', label: 'POLAR ICE CAPS', desc: 'Frozen poles glistening in starlight' },
  { id: 'lightning',      label: 'LIGHTNING',       desc: 'Electrical storms crackling across the atmosphere' },
  { id: 'aurora',         label: 'AURORA',          desc: 'Shimmering lights dancing at the poles' },
  { id: 'geysers',        label: 'GEYSERS',        desc: 'Plumes erupting from the surface' },
  { id: 'floating_rocks', label: 'FLOATING ROCKS', desc: 'Gravity anomalies lifting terrain into the sky' },
  { id: 'energy_core',    label: 'ENERGY CORE',    desc: 'A visible power source glowing through the crust' },
  { id: 'asteroid_belt',  label: 'ASTEROID BELT',  desc: 'A ring of rocky debris' },
  { id: 'space_station',  label: 'SPACE STATION',  desc: 'An orbital platform circling the planet' },
];

// ═══════════════════════════════════════════════════════════════
// STARFIELD
// ═══════════════════════════════════════════════════════════════

export interface StarfieldInfo {
  id: string;
  label: string;
  desc: string;
}

export const STARFIELD_TYPES: StarfieldInfo[] = [
  { id: 'void',     label: 'VOID',     desc: 'The empty dark' },
  { id: 'sparse',   label: 'SPARSE',   desc: 'Deep space' },
  { id: 'standard', label: 'STANDARD', desc: 'A familiar night sky' },
  { id: 'dense',    label: 'DENSE',    desc: 'Near the galactic core' },
  { id: 'nebula',   label: 'NEBULA',   desc: 'Born in a stellar nursery' },
  { id: 'galaxy',   label: 'GALAXY',   desc: 'A universe in view' },
];

// ═══════════════════════════════════════════════════════════════
// ANIMATION
// ═══════════════════════════════════════════════════════════════

export interface AnimationInfo {
  id: string;
  label: string;
  desc: string;
}

export const ANIMATION_TYPES: AnimationInfo[] = [
  { id: 'spin',    label: 'SPIN',    desc: 'Eternal rotation' },
  { id: 'pulse',   label: 'PULSE',   desc: 'A living world' },
  { id: 'wobble',  label: 'WOBBLE',  desc: 'Unstable orbit' },
  { id: 'drift',   label: 'DRIFT',   desc: 'Zero gravity wanderer' },
  { id: 'glitch',  label: 'GLITCH',  desc: 'Signal from deep space' },
  { id: 'none',    label: 'NONE',    desc: 'Frozen in time' },
];

// ═══════════════════════════════════════════════════════════════
// STEP LABELS
// ═══════════════════════════════════════════════════════════════

export const STEP_LABELS = [
  'Planet', 'Size', 'Color', 'Color2', 'Atmo',
  'Rings', 'Moons', 'Features', 'Stars', 'Anim', 'Name', 'Done',
];

// ═══════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

export function darkenHex(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const d = (c: number) => Math.round(c * factor).toString(16).padStart(2, '0');
  return `#${d(r)}${d(g)}${d(b)}`;
}

export function lightenHex(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const l = (c: number) => Math.min(255, Math.round(c * factor + 40)).toString(16).padStart(2, '0');
  return `#${l(r)}${l(g)}${l(b)}`;
}

export function randomPlanetConfig(): PlanetConfig {
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const moonCount = Math.floor(Math.random() * 5);
  const featureCount = Math.floor(Math.random() * 4);
  const featurePool = [...SURFACE_FEATURES].sort(() => Math.random() - 0.5);
  const features = featurePool.slice(0, featureCount).map(f => f.id);
  const moonColors = Array.from({ length: moonCount }, () => pick(MOON_PALETTE));

  return {
    type: pick(PLANET_TYPES).id,
    size: pick(PLANET_SIZES).id,
    primaryColor: pick(PLANET_COLORS).hex,
    secondaryColor: pick(PLANET_COLORS).hex,
    atmosphere: pick(ATMOSPHERE_TYPES).id,
    atmosphereColor: pick(PLANET_COLORS).hex,
    rings: pick(RING_TYPES).id,
    ringColor: pick(PLANET_COLORS).hex,
    ringOpacity: Math.round((0.3 + Math.random() * 0.7) * 100) / 100,
    moons: moonCount,
    moonColors,
    features,
    starfield: pick(STARFIELD_TYPES).id,
    animation: pick(ANIMATION_TYPES).id,
    name: '',
  };
}
