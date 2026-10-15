import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { UniverseScene } from './UniverseScene';
import { UniverseOverlay } from './UniverseOverlay';
import { PlanetWorkspaceModal } from './PlanetWorkspaceModal';
import { PlanetData, PlanetId, CameraViewMode } from './types';
import './universe.css';

interface UniverseViewProps {
  onBackToHome: () => void;
}

export const UniverseView: React.FC<UniverseViewProps> = ({ onBackToHome }) => {
  const [cameraMode, setCameraMode] = useState<CameraViewMode>('entering');
  const [hoveredPlanetId, setHoveredPlanetId] = useState<PlanetId | null>(null);
  const [selectedPlanet, setSelectedPlanet] = useState<PlanetData | null>(null);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState<boolean>(false);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(true);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // When entry finishes
  const handleEntryComplete = useCallback(() => {
    setCameraMode('overview');
    setIsTransitioning(false);
  }, []);

  // Planet selection handler (prevents duplicate transitions)
  const handleSelectPlanet = useCallback((planet: PlanetData) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setSelectedPlanet(planet);
    setCameraMode('zoomed');
  }, [isTransitioning]);

  // When zoom transition arrives at the planet
  const handleZoomComplete = useCallback(() => {
    setIsTransitioning(false);
    setIsWorkspaceOpen(true);
  }, []);

  // Return to universe overview
  const handleCloseWorkspace = useCallback(() => {
    setIsWorkspaceOpen(false);
    setIsTransitioning(true);
    setCameraMode('returning');
  }, []);

  // When return transition completes
  const handleReturnComplete = useCallback(() => {
    setSelectedPlanet(null);
    setCameraMode('overview');
    setIsTransitioning(false);
  }, []);

  // Reset overview camera perspective button
  const handleResetCamera = useCallback(() => {
    if (isTransitioning) return;
    if (selectedPlanet) {
      handleCloseWorkspace();
    } else {
      setIsTransitioning(true);
      setCameraMode('returning');
    }
  }, [isTransitioning, selectedPlanet, handleCloseWorkspace]);

  return (
    <div className="universe-container" id="stella-universe-view">
      {/* 1. Interactive 3D Canvas */}
      <Suspense
        fallback={
          <div className="universe-loading-fallback">
            <div className="loading-core-pulse">
              <span className="material-symbols-outlined rotating-core-icon">
                auto_awesome
              </span>
            </div>
            <div className="loading-text">Manifesting Stella Universe...</div>
          </div>
        }
      >
        <Canvas
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
          }}
          camera={{
            fov: 46,
            near: 0.1,
            far: 500,
            position: [0, 75, 90],
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 1,
          }}
        >
          <UniverseScene
            cameraMode={cameraMode}
            hoveredPlanetId={hoveredPlanetId}
            selectedPlanet={selectedPlanet}
            onHoverPlanet={setHoveredPlanetId}
            onSelectPlanet={handleSelectPlanet}
            onEntryComplete={handleEntryComplete}
            onZoomComplete={handleZoomComplete}
            onReturnComplete={handleReturnComplete}
            reducedMotion={reducedMotion}
          />
        </Canvas>
      </Suspense>

      {/* 2. 2D UI Overlay matching Reference Image */}
      <UniverseOverlay
        onBackToHome={onBackToHome}
        onResetCamera={handleResetCamera}
      />

      {/* 3. Themed Workspace Modal when a planet is selected */}
      {isWorkspaceOpen && selectedPlanet && (
        <PlanetWorkspaceModal
          planet={selectedPlanet}
          onClose={handleCloseWorkspace}
          onGoHome={onBackToHome}
        />
      )}
    </div>
  );
};
