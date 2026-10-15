import * as THREE from 'three';
import { PlanetData } from './types';

/**
 * Calculates 3D orbital position along a planet's distinct orbit in the shared reference plane.
 * The shared reference plane is oriented such that when viewed from the side (equator),
 * the orbits converge into a narrow, coherent horizontal band.
 * In the default elevated view (52°), the orbits project as distinct portrait ellipses.
 */
export function getPlanetOrbitPosition(
  planet: PlanetData,
  angle: number
): THREE.Vector3 {
  // Local 2D coordinates in the horizontal reference plane:
  // semiMinorAxis along X (width), semiMajorAxis along Z (depth/height in projection)
  const localX = planet.semiMinorAxis * Math.sin(angle);
  const localZ = -planet.semiMajorAxis * Math.cos(angle);
  const pos = new THREE.Vector3(localX, 0, localZ);

  // Apply shared reference plane orientation (-0.10 rad counter-clockwise tilt around Y)
  // and small, coordinated 3D orbital inclinations (within ±1.4° relative to the reference plane)
  if (planet.orbitRotation) {
    const euler = new THREE.Euler(
      planet.orbitRotation[0], // small coordinated inclination around X (±0.02 rad)
      planet.orbitRotation[1], // shared reference plane in-plane tilt around Y (-0.10 rad)
      planet.orbitRotation[2], // small coordinated inclination around Z (±0.015 rad)
      'YXZ'
    );
    pos.applyEuler(euler);
  }

  return pos;
}

/**
 * Live position of a planet along its distinct orbit, accounting for elapsed time.
 */
export function getPlanetLivePosition(
  planet: PlanetData,
  time: number,
  reducedMotion: boolean = false
): THREE.Vector3 {
  const angle = reducedMotion ? planet.orbitAngle : planet.orbitAngle + time * planet.orbitSpeed;
  return getPlanetOrbitPosition(planet, angle);
}

/**
 * Backwards compatibility helper for legacy coordinate queries.
 */
export function getOrbitPosition(
  orbitRadius: number,
  angle: number,
  inclination: number = 0.05
): THREE.Vector3 {
  const rx = orbitRadius * 0.78;
  const ry = orbitRadius;
  const tiltAngle = -0.1;
  const cosT = Math.cos(tiltAngle);
  const sinT = Math.sin(tiltAngle);

  const baseX = Math.sin(angle) * rx;
  const baseY = Math.cos(angle) * ry;

  const x = baseX * cosT - baseY * sinT;
  const y = baseX * sinT + baseY * cosT;
  const z = -Math.cos(angle) * 2.6 + Math.sin(angle * 2) * (orbitRadius * inclination * 0.5);

  return new THREE.Vector3(x, y, z);
}

export const PLANETS_DATA: PlanetData[] = [
  {
    id: 'asuna',
    name: 'Asuna',
    role: 'Home & Navigation',
    category: 'HOME',
    statBadge: 'System Anchors',
    tagline: 'Your journey begins here.',
    description: 'The luminous sanctuary world serving as the gateway to Stella. Houses high-level navigation, system anchors, and core spatial orientation.',
    icon: 'home',
    accentColor: '#4ade80', // vibrant emerald green matching reference
    glowColor: '#22c55e',
    ringColor: undefined,
    size: 0.50,
    orbitRadius: 17.4,
    semiMajorAxis: 17.4,
    semiMinorAxis: 10.8,
    orbitRotation: [0.012, -0.10, 0.008],
    orbitAngle: 0.0, // 0 rad (Top / 12:00 in projection)
    orbitSpeed: 0.012,
    rotationSpeed: 0.008,
    inclination: 0.05,
    features: {
      hasRings: false,
      surfaceTextureType: 'sanctuary',
      cloudColor: '#bbf7d0',
      satellitesCount: 2,
    },
    sampleStatus: {
      health: 'Optimal',
      activeItems: 'System Anchors',
      metrics: 'Latency 1.2ms',
    },
  },
  {
    id: 'rei',
    name: 'Rei',
    role: 'Knowledge',
    category: 'KNOWLEDGE',
    statBadge: 'Knowledge Index',
    tagline: 'Learn and discover.',
    description: 'The coral research archives holding interconnected graph knowledge, semantic documents, and persistent index nodes.',
    icon: 'menu_book',
    accentColor: '#fb7185', // warm peach / coral matching reference
    glowColor: '#f43f5e',
    ringColor: '#fda4af',
    size: 0.48,
    orbitRadius: 15.8,
    semiMajorAxis: 15.8,
    semiMinorAxis: 9.8,
    orbitRotation: [-0.024, -0.10, -0.016],
    orbitAngle: Math.PI * 0.25, // 45° (Top-Right / 1:30)
    orbitSpeed: 0.014,
    rotationSpeed: 0.012,
    inclination: -0.05,
    features: {
      hasRings: true,
      ringInnerRadius: 0.72,
      ringOuterRadius: 1.45,
      ringTilt: [-Math.PI * 0.5 + 0.32, 0.22, 0.10],
      surfaceTextureType: 'oceanic',
      cloudColor: '#ffe4e6',
      satellitesCount: 1,
    },
    sampleStatus: {
      health: 'Ready',
      activeItems: 'Knowledge Index',
      metrics: 'Cache Hit 98.4%',
    },
  },
  {
    id: 'rin',
    name: 'Rin',
    role: 'Coding',
    category: 'CODE',
    statBadge: 'WASM Runtime',
    tagline: 'Build and improve.',
    description: 'Cybernetic planetary matrix containing isolated developer runtimes, test sandboxes, script executors, and repository watchers.',
    icon: 'code',
    accentColor: '#2dd4bf', // mint / cyan-green matching reference
    glowColor: '#0d9488',
    ringColor: '#99f6e4',
    size: 0.49,
    orbitRadius: 11.0,
    semiMajorAxis: 11.0,
    semiMinorAxis: 6.8,
    orbitRotation: [0.022, -0.10, 0.015],
    orbitAngle: Math.PI * 0.50, // 90° (Mid-Right / 3:00)
    orbitSpeed: 0.020,
    rotationSpeed: 0.015,
    inclination: -0.06,
    features: {
      hasRings: true,
      ringInnerRadius: 0.72,
      ringOuterRadius: 1.35,
      ringTilt: [-Math.PI * 0.5 + 0.20, 0.15, -0.05],
      surfaceTextureType: 'cyber',
      cloudColor: '#ccfbf1',
      satellitesCount: 2,
    },
    sampleStatus: {
      health: 'Standby',
      activeItems: 'WASM Runtime',
      metrics: 'Isolated Sandbox',
    },
  },
  {
    id: 'yuki',
    name: 'Yuki',
    role: 'Memory',
    category: 'MEMORY',
    statBadge: 'Vault: 2025-Notes',
    tagline: 'Your past, your context.',
    description: 'The frosty crystalline planet preserving chronological memories, relational personal vaults, reflection graphs, and emotional context.',
    icon: 'psychology',
    accentColor: '#38bdf8', // frosted cyan / glacial blue matching reference
    glowColor: '#0284c7',
    ringColor: '#bae6fd',
    size: 0.48,
    orbitRadius: 14.2,
    semiMajorAxis: 14.2,
    semiMinorAxis: 8.8,
    orbitRotation: [0.018, -0.10, 0.012],
    orbitAngle: Math.PI * 0.75, // 135° (Lower-Right / 4:30)
    orbitSpeed: 0.016,
    rotationSpeed: 0.01,
    inclination: -0.04,
    features: {
      hasRings: true,
      ringInnerRadius: 0.72,
      ringOuterRadius: 1.32,
      ringTilt: [-Math.PI * 0.5 + 0.28, 0.25, 0.15],
      surfaceTextureType: 'crystalline',
      cloudColor: '#e0f2fe',
      satellitesCount: 2,
    },
    sampleStatus: {
      health: 'Optimal',
      activeItems: 'Vault: 2025-Notes',
      metrics: 'Encrypted Local DB',
    },
  },
  {
    id: 'akari',
    name: 'Akari',
    role: 'Agents & Automation',
    category: 'AGENTS',
    statBadge: 'Autonomous Agents',
    tagline: 'Automate and assist.',
    description: 'The radiant star sphere where autonomous agent workflows, scheduled background executors, and task delegations assemble.',
    icon: 'smart_toy',
    accentColor: '#e0f2fe', // brilliant silvery white-cyan star with glint flare
    glowColor: '#38bdf8',
    ringColor: undefined,
    size: 0.46,
    orbitRadius: 7.8,
    semiMajorAxis: 7.8,
    semiMinorAxis: 4.8,
    orbitRotation: [0.015, -0.10, 0.010],
    orbitAngle: Math.PI * 1.00, // 180° (Bottom Center / 6:00 in projection)
    orbitSpeed: 0.026,
    rotationSpeed: 0.011,
    inclination: 0.05,
    features: {
      hasRings: false,
      surfaceTextureType: 'automation',
      cloudColor: '#ffffff',
      satellitesCount: 2,
    },
    sampleStatus: {
      health: 'Ready',
      activeItems: 'Autonomous Agents',
      metrics: 'Background Queue 0',
    },
  },
  {
    id: 'rem',
    name: 'Rem',
    role: 'Integrations',
    category: 'INTEGRATIONS',
    statBadge: 'Integration Hub',
    tagline: 'Connect your tools.',
    description: 'A lavender network world with interconnected spires linking local OS tools, external APIs, filesystem bridges, and peripheral hubs.',
    icon: 'hub',
    accentColor: '#c084fc', // lavender / soft purple matching reference
    glowColor: '#9333ea',
    ringColor: '#e9d5ff',
    size: 0.48,
    orbitRadius: 12.6,
    semiMajorAxis: 12.6,
    semiMinorAxis: 7.8,
    orbitRotation: [-0.020, -0.10, -0.014],
    orbitAngle: Math.PI * 1.25, // 225° (Lower-Left / 7:30)
    orbitSpeed: 0.018,
    rotationSpeed: 0.009,
    inclination: -0.05,
    features: {
      hasRings: true,
      ringInnerRadius: 0.70,
      ringOuterRadius: 1.30,
      ringTilt: [-Math.PI * 0.5 + 0.30, -0.18, 0.20],
      surfaceTextureType: 'network',
      cloudColor: '#f3e8ff',
      satellitesCount: 2,
    },
    sampleStatus: {
      health: 'Optimal',
      activeItems: 'Integration Hub',
      metrics: 'Zero Packet Loss',
    },
  },
  {
    id: 'hina',
    name: 'Hina',
    role: 'Time & Routines',
    category: 'ROUTINES',
    statBadge: 'Active Timers',
    tagline: 'Plan your day.',
    description: 'The celestial clockwork spark world coordinating reminders, recurring schedules, and circadian workflows.',
    icon: 'schedule',
    accentColor: '#f472b6', // soft lilac / pastel pinkish-white matching reference
    glowColor: '#e879f9',
    ringColor: undefined,
    size: 0.47,
    orbitRadius: 9.4,
    semiMajorAxis: 9.4,
    semiMinorAxis: 5.8,
    orbitRotation: [-0.018, -0.10, -0.012],
    orbitAngle: Math.PI * 1.50, // 270° (Mid-Left / 9:00)
    orbitSpeed: 0.023,
    rotationSpeed: 0.007,
    inclination: 0.06,
    features: {
      hasRings: false,
      surfaceTextureType: 'chronos',
      cloudColor: '#fdf2f8',
      satellitesCount: 1,
    },
    sampleStatus: {
      health: 'Optimal',
      activeItems: 'Active Timers',
      metrics: 'Next Sync 22:30',
    },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    role: 'Creativity',
    category: 'CREATIVITY',
    statBadge: 'Canvas #04',
    tagline: 'Imagine and create.',
    description: 'A radiant blossom world for ideation, generative canvas buffers, visual mood boards, and expressive companion concepts.',
    icon: 'palette',
    accentColor: '#ec4899', // vibrant cherry blossom pink matching reference
    glowColor: '#db2777',
    ringColor: '#fbcfe8',
    size: 0.50,
    orbitRadius: 19.0,
    semiMajorAxis: 19.0,
    semiMinorAxis: 11.8,
    orbitRotation: [-0.022, -0.10, -0.015],
    orbitAngle: Math.PI * 1.75, // 315° (Upper-Left / 10:30)
    orbitSpeed: 0.010,
    rotationSpeed: 0.01,
    inclination: 0.04,
    features: {
      hasRings: true,
      ringInnerRadius: 0.85,
      ringOuterRadius: 2.1,
      ringTilt: [-Math.PI * 0.5 + 0.18, -0.15, 0.10],
      surfaceTextureType: 'blossom',
      cloudColor: '#fdf2f8',
      satellitesCount: 2,
    },
    sampleStatus: {
      health: 'Active',
      activeItems: 'Canvas #04',
      metrics: 'Local Draft v0.5',
    },
  },
];
