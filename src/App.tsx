import React, { useState, Suspense, lazy } from 'react';
import { PresentationProvider, usePresentation } from './context/PresentationContext';
import { ObservatoryHome } from './components/Observatory/ObservatoryHome';
import { CompanionOverlay } from './components/CompanionOverlay/CompanionOverlay';

// Lazy-load 3D Universe scene so GPU resources are initialized only when opened
const UniverseView = lazy(() =>
  import('./components/Universe/UniverseView').then((m) => ({ default: m.UniverseView }))
);

const StellaPresentationManager: React.FC = () => {
  const { windowType } = usePresentation();
  const [activeNavId, setActiveNavId] = useState<string>('home');

  const handleLaunchUniverse = () => {
    setActiveNavId('universe');
  };

  const handleBackToHome = () => {
    setActiveNavId('home');
  };

  const isUniverse = activeNavId === 'universe';

  // Standalone Companion Window: Renders ONLY Cantarella and minimal overlay controls
  // Zero Observatory, zero 3D Universe, zero opaque desktop dashboard
  if (windowType === 'companion') {
    return <CompanionOverlay />;
  }

  return (
    <div className="app-container" id="stella-app-root">
      {/* Approved Stella Observatory Home UI (Preserved across ordinary navigation) */}
      <div
        className="observatory-view-container"
        style={{
          display: isUniverse ? 'none' : 'contents',
        }}
      >
        <ObservatoryHome onLaunchUniverse={handleLaunchUniverse} />
      </div>

      {/* 3D Universe Mode (Mounted lazily on demand when entered, cleanly unmounted on exit) */}
      {isUniverse && (
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
          <UniverseView onBackToHome={handleBackToHome} />
        </Suspense>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <PresentationProvider>
      <StellaPresentationManager />
    </PresentationProvider>
  );
};

export default App;
