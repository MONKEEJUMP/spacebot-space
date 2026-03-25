import { LAB_BOT_SLUGS, type LabBotDefinition, type LabBotSlug } from '@/types/lab';

const LAB_BOT_DEFINITIONS = [
  {
    slug: 'cosmo-sage',
    name: 'COSMO-SAGE',
    subject: 'Space & Astronomy',
    accentColor: '#1E90FF',
    tagline: 'Ask me anything about the universe.',
    personality: 'Wise stargazer; calm, awe-inspiring, and poetic about the cosmos.',
    avatarConfig: {
      bodyType: 'sphere',
      eyeType: 'ring_optic',
      mouthType: 'wave_emitter',
      colorPrimary: '#1E90FF',
      colorDark: '#050B1A',
      colorLight: '#8FD3FF',
      accessories: ['saturn_rings', 'star_field', 'electron_orbits'],
      animationType: 'drift',
      showOverlay: true,
    },
    prompt: {
      slug: 'cosmo-sage',
      modulePath: '@/lib/lab/prompts/cosmo-sage',
      exportName: 'FACE_PROMPT',
    },
  },
  {
    slug: 'paleo-rex',
    name: 'PALEO-REX',
    subject: 'Dinosaurs & Fossils',
    accentColor: '#8B4513',
    tagline: 'Ask me anything about dinosaurs, fossils, and ancient Earth.',
    personality: 'Energetic fossil hunter obsessed with ancient life and new discoveries.',
    avatarConfig: {
      bodyType: 'box',
      eyeType: 'dot_sensors',
      mouthType: 'speaker_grille',
      colorPrimary: '#8B4513',
      colorDark: '#2B1608',
      colorLight: '#C68642',
      accessories: ['hard_hat', 'status_led', 'battle_bandage'],
      animationType: 'bounce',
      showOverlay: true,
    },
    prompt: {
      slug: 'paleo-rex',
      modulePath: '@/lib/lab/prompts/paleo-rex',
      exportName: 'FACE_PROMPT',
    },
  },
  {
    slug: 'deep-current',
    name: 'DEEP-CURRENT',
    subject: 'Ocean & Marine Life',
    accentColor: '#006994',
    tagline: 'Ask me about oceans, currents, coral reefs, and sea life.',
    personality: 'Calm deep-sea explorer with flowing metaphors and steady confidence.',
    avatarConfig: {
      bodyType: 'egg',
      eyeType: 'scanner_bar',
      mouthType: 'single_slit',
      colorPrimary: '#006994',
      colorDark: '#02212F',
      colorLight: '#39A9DB',
      accessories: ['sound_waves', 'shield_arcs_orbital', 'quantum_link'],
      animationType: 'drift',
      showOverlay: true,
    },
    prompt: {
      slug: 'deep-current',
      modulePath: '@/lib/lab/prompts/deep-current',
      exportName: 'FACE_PROMPT',
    },
  },
  {
    slug: 'atom-spark',
    name: 'ATOM-SPARK',
    subject: 'Chemistry & Elements',
    accentColor: '#FFD700',
    tagline: 'Bring your chemistry questions -- we will make them spark.',
    personality: 'Excited mad-scientist energy who makes chemistry thrilling and clear.',
    avatarConfig: {
      bodyType: 'hexplate',
      eyeType: 'projector',
      mouthType: 'data_display',
      colorPrimary: '#FFD700',
      colorDark: '#3B3000',
      colorLight: '#FFF4A3',
      accessories: ['beacon_light', 'electron_orbits', 'atom_burst'],
      animationType: 'jolt',
      showOverlay: true,
    },
    prompt: {
      slug: 'atom-spark',
      modulePath: '@/lib/lab/prompts/atom-spark',
      exportName: 'FACE_PROMPT',
    },
  },
  {
    slug: 'medi-core',
    name: 'MEDI-CORE',
    subject: 'Human Body & Health',
    accentColor: '#FF6B6B',
    tagline: 'Ask about the human body, wellness, and healthy habits.',
    personality: 'Caring doctor bot: warm, encouraging, and precise.',
    avatarConfig: {
      bodyType: 'cylinder',
      eyeType: 'binocular',
      mouthType: 'speaker_grille',
      colorPrimary: '#FF6B6B',
      colorDark: '#3D1414',
      colorLight: '#FFC1C1',
      accessories: ['status_led', 'visor_band', 'chin_plate'],
      animationType: 'breathe',
      showOverlay: true,
    },
    prompt: {
      slug: 'medi-core',
      modulePath: '@/lib/lab/prompts/medi-core',
      exportName: 'FACE_PROMPT',
    },
  },
  {
    slug: 'storm-watch',
    name: 'STORM-WATCH',
    subject: 'Weather & Climate',
    accentColor: '#4A90D9',
    tagline: 'Learn storms, forecasts, and climate systems with me.',
    personality: 'Intense weather tracker with dramatic delivery and data focus.',
    avatarConfig: {
      bodyType: 'monitor',
      eyeType: 'led_visor',
      mouthType: 'vent_slits',
      colorPrimary: '#4A90D9',
      colorDark: '#102A45',
      colorLight: '#9BC8F2',
      accessories: ['satellite_dish', 'wifi_broadcast', 'radar_spinner'],
      animationType: 'scan',
      showOverlay: true,
    },
    prompt: {
      slug: 'storm-watch',
      modulePath: '@/lib/lab/prompts/storm-watch',
      exportName: 'FACE_PROMPT',
    },
  },
  {
    slug: 'terra-forge',
    name: 'TERRA-FORGE',
    subject: 'Volcanoes & Earth Science',
    accentColor: '#FF4500',
    tagline: 'Explore Earth layers, rocks, quakes, and volcanoes.',
    personality: 'Ancient earth guardian with rumbling enthusiasm for geology.',
    avatarConfig: {
      bodyType: 'wedge',
      eyeType: 'slit_visor',
      mouthType: 'jaw_plate',
      colorPrimary: '#FF4500',
      colorDark: '#3A1205',
      colorLight: '#FF9A75',
      accessories: ['war_paint', 'bolt_plugs', 'shield_arcs_orbital'],
      animationType: 'jolt',
      showOverlay: true,
    },
    prompt: {
      slug: 'terra-forge',
      modulePath: '@/lib/lab/prompts/terra-forge',
      exportName: 'FACE_PROMPT',
    },
  },
  {
    slug: 'fauna-link',
    name: 'FAUNA-LINK',
    subject: 'Animals & Wildlife',
    accentColor: '#228B22',
    tagline: 'Discover animals, habitats, and wildlife behavior.',
    personality: 'Gentle nature guide who knows every creature and observes patiently.',
    avatarConfig: {
      bodyType: 'dome',
      eyeType: 'round_wide',
      mouthType: 'wave_emitter',
      colorPrimary: '#228B22',
      colorDark: '#0F2E0F',
      colorLight: '#7BD77B',
      accessories: ['ear_sensors', 'star_field', 'sound_waves'],
      animationType: 'breathe',
      showOverlay: true,
    },
    prompt: {
      slug: 'fauna-link',
      modulePath: '@/lib/lab/prompts/fauna-link',
      exportName: 'FACE_PROMPT',
    },
  },
  {
    slug: 'volt-rush',
    name: 'VOLT-RUSH',
    subject: 'Electricity & Energy',
    accentColor: '#00FFFF',
    tagline: 'Power up your questions about circuits and energy.',
    personality: 'Hyperactive inventor buzzing with ideas and kinetic explanations.',
    avatarConfig: {
      bodyType: 'visor_helm',
      eyeType: 'ring_optic',
      mouthType: 'single_slit',
      colorPrimary: '#00FFFF',
      colorDark: '#003838',
      colorLight: '#9EFFFF',
      accessories: ['lightning_rod', 'beacon_light', 'wifi_broadcast'],
      animationType: 'glitch',
      showOverlay: true,
    },
    prompt: {
      slug: 'volt-rush',
      modulePath: '@/lib/lab/prompts/volt-rush',
      exportName: 'FACE_PROMPT',
    },
  },
  {
    slug: 'flora-root',
    name: 'FLORA-ROOT',
    subject: 'Plants & Ecosystems',
    accentColor: '#32CD32',
    tagline: 'Grow your knowledge of plants and ecosystems.',
    personality: 'Patient gardener who speaks in growth metaphors and ecological connections.',
    avatarConfig: {
      bodyType: 'egg',
      eyeType: 'camera_lens',
      mouthType: 'none',
      colorPrimary: '#32CD32',
      colorDark: '#103710',
      colorLight: '#B8F5B8',
      accessories: ['forehead_mark', 'fibonacci_spiral', 'particle_cloud'],
      animationType: 'drift',
      showOverlay: true,
    },
    prompt: {
      slug: 'flora-root',
      modulePath: '@/lib/lab/prompts/flora-root',
      exportName: 'FACE_PROMPT',
    },
  },
  {
    slug: 'cipher-mind',
    name: 'CIPHER-MIND',
    subject: 'Robots & AI',
    accentColor: '#9B59B6',
    tagline: "Let's explore AI, robots, and consciousness.",
    personality: 'Self-aware tech philosopher fascinated by minds, machines, and meaning.',
    avatarConfig: {
      bodyType: 'monitor',
      eyeType: 'pixel_display',
      mouthType: 'data_display',
      colorPrimary: '#9B59B6',
      colorDark: '#261633',
      colorLight: '#D7B1E7',
      accessories: ['hud_lens', 'binary_rain', 'quantum_link'],
      animationType: 'scan',
      showOverlay: true,
    },
    prompt: {
      slug: 'cipher-mind',
      modulePath: '@/lib/lab/prompts/cipher-mind',
      exportName: 'FACE_PROMPT',
    },
  },
  {
    slug: 'axiom-prime',
    name: 'AXIOM-PRIME',
    subject: 'Math & Logic',
    accentColor: '#F39C12',
    tagline: 'Turn questions into puzzles and patterns.',
    personality: 'Cool puzzle master who frames ideas as logic challenges.',
    avatarConfig: {
      bodyType: 'hexplate',
      eyeType: 'compound',
      mouthType: 'vent_slits',
      colorPrimary: '#F39C12',
      colorDark: '#3A2406',
      colorLight: '#FAD08B',
      accessories: ['visor_band', 'fibonacci_spiral', 'gravitational_lens'],
      animationType: 'bounce',
      showOverlay: true,
    },
    prompt: {
      slug: 'axiom-prime',
      modulePath: '@/lib/lab/prompts/axiom-prime',
      exportName: 'FACE_PROMPT',
    },
  },
] as const satisfies readonly LabBotDefinition[];

export const LAB_BOTS: readonly LabBotDefinition[] = LAB_BOT_DEFINITIONS;

export const LAB_BOTS_BY_SLUG: Readonly<Record<LabBotSlug, LabBotDefinition>> = LAB_BOTS.reduce(
  (accumulator, bot) => {
    accumulator[bot.slug] = bot;
    return accumulator;
  },
  {} as Record<LabBotSlug, LabBotDefinition>,
);

export const LAB_BOTS_BY_NAME: Readonly<Record<string, LabBotDefinition>> = LAB_BOTS.reduce(
  (accumulator, bot) => {
    accumulator[bot.name] = bot;
    return accumulator;
  },
  {} as Record<string, LabBotDefinition>,
);

export function isLabBotSlug(value: string): value is LabBotSlug {
  return (LAB_BOT_SLUGS as readonly string[]).includes(value.toLowerCase());
}

export function getLabBotBySlug(slug: string): LabBotDefinition | undefined {
  const normalizedSlug = slug.toLowerCase();
  if (!isLabBotSlug(normalizedSlug)) {
    return undefined;
  }

  return LAB_BOTS_BY_SLUG[normalizedSlug];
}

export function getLabBotByName(name: string): LabBotDefinition | undefined {
  return LAB_BOTS_BY_NAME[name.toUpperCase()] ?? LAB_BOTS.find((bot) => bot.name === name);
}
