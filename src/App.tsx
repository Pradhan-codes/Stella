import React, { useState, Suspense, lazy } from 'react';
import { ObservatoryHome } from './components/Observatory/ObservatoryHome';

// Lazy-load 3D Universe scene so GPU resources are initialized only when opened
const UniverseView = lazy(() =>
  import('./components/Universe/UniverseView').then((m) => ({ default: m.UniverseView }))
);

export const App: React.FC = () => {
  const [activeNavId, setActiveNavId] = useState<string>('home');

  const handleLaunchUniverse = () => {
    setActiveNavId('universe');
  };

  const handleBackToHome = () => {
    setActiveNavId('home');
  };

  return (
    <div className="app-container" id="stella-app-root">
      {/* 3D Universe Mode (Active when user enters Universe) */}
      {activeNavId === 'universe' ? (
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
      ) : (
        /* Approved Stella Observatory Home UI */
        <ObservatoryHome onLaunchUniverse={handleLaunchUniverse} />
      )}
    </div>
  );
};

export default App;
