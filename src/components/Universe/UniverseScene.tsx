import React from 'react';
import { DeepSpaceBackground } from './DeepSpaceBackground';
import { BlackHole } from './BlackHole';
import { NebulaAtmosphere } from './NebulaAtmosphere';
import { OrbitalGuideLines } from './OrbitalGuideLines';
import { PlanetNode } from './PlanetNode';
import { CameraController } from './CameraController';
import { PLANETS_DATA } from './planetData';
import { PlanetData, PlanetId, CameraViewMode } from './types';

interface UniverseSceneProps {
  cameraMode: CameraViewMode;
  hoveredPlanetId: PlanetId | null;
  selectedPlanet: PlanetData | null;
  onHoverPlanet: (id: PlanetId | null) => void;
  onSelectPlanet: (planet: PlanetData) => void;
  onEntryComplete: () => void;
  onZoomComplete: () => void;
  onReturnComplete: () => void;
  reducedMotion: boolean;
}

export const UniverseScene: React.FC<UniverseSceneProps> = ({
  cameraMode,
  hoveredPlanetId,
  selectedPlanet,
  onHoverPlanet,
  onSelectPlanet,
  onEntryComplete,
  onZoomComplete,
  onReturnComplete,
  reducedMotion,
}) => {
  return (
    <>
      {/* 1. Celestial Core & Directional Lighting */}
      <ambientLight intensity={0.42} color="#c7d2fe" />
      {/* Central Black Hole Accretion Disk Radiant Point Light */}
      <pointLight position={[0, 0, 0]} intensity={3.5} distance={60} decay={2} color="#38bdf8" />
      <pointLight position={[0, 1.2, 0]} intensity={2.2} distance={45} decay={2} color="#c084fc" />
      {/* Celestial Fill / Rim Lights */}
      <directionalLight
        position={[20, 28, 18]}
        intensity={0.9}
        color="#fdf4ff"
      />
      <directionalLight
        position={[-24, -12, -18]}
        intensity={0.4}
        color="#38bdf8"
      />

      {/* 2. Deep Space Environment */}
      <DeepSpaceBackground />

      {/* 3. Layered Nebula Fog & Cosmic Dust */}
      <NebulaAtmosphere />

      {/* 4. Central Focal Point: Relativistic Black Hole with Accretion Disk & Cosmic Fog (Reference-Locked) */}
      <BlackHole position={[0, 0, 0]} />

      {/* 5. Glowing Orbital Guide Lines & Traveling Highlights */}
      <OrbitalGuideLines />

      {/* 6. The Eight Revolving Workspace Planets */}
      <group>
        {PLANETS_DATA.map((planet) => (
          <PlanetNode
            key={planet.id}
            planet={planet}
            isHovered={hoveredPlanetId === planet.id}
            isSelected={selectedPlanet?.id === planet.id}
            onHover={onHoverPlanet}
            onSelect={onSelectPlanet}
            reducedMotion={reducedMotion}
          />
        ))}
      </group>

      {/* 7. Cinematic Camera Controller */}
      <CameraController
        mode={cameraMode}
        selectedPlanet={selectedPlanet}
        onEntryComplete={onEntryComplete}
        onZoomComplete={onZoomComplete}
        onReturnComplete={onReturnComplete}
        reducedMotion={reducedMotion}
      />
    </>
  );
};
