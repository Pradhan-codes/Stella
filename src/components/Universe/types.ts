export type PlanetId =
  | 'yuki'
  | 'asuna'
  | 'rei'
  | 'sakura'
  | 'rin'
  | 'hina'
  | 'rem'
  | 'akari';

export interface PlanetData {
  id: PlanetId;
  name: string;
  role: string;
  tagline: string;
  description: string;
  icon: string;
  accentColor: string;
  glowColor: string;
  ringColor?: string;
  size: number;
  // Distinct 3D Orbital Geometry
  orbitRadius: number;
  semiMajorAxis: number;
  semiMinorAxis: number;
  orbitRotation: [number, number, number]; // [rotX, rotY, rotZ] in radians
  orbitAngle: number; // in radians (initial phase)
  orbitSpeed: number; // orbital angular velocity
  rotationSpeed: number; // axial rotation velocity
  inclination: number; // slight orbit tilt
  features: {
    hasRings: boolean;
    ringInnerRadius?: number;
    ringOuterRadius?: number;
    ringTilt?: [number, number, number];
    surfaceTextureType: 'crystalline' | 'sanctuary' | 'oceanic' | 'blossom' | 'cyber' | 'chronos' | 'network' | 'automation';
    cloudColor?: string;
    hasMoons?: boolean;
    satellitesCount?: number;
  };
  category?: string;
  statBadge?: string;
  sampleStatus: {
    health: 'Optimal' | 'Ready' | 'Standby' | 'Active';
    activeItems: string;
    metrics: string;
  };
}

export type CameraViewMode = 'entering' | 'overview' | 'zoomed' | 'returning';
