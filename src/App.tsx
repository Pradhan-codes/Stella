import React, { useState, Suspense, lazy } from 'react';
import { Header } from './components/Header/Header';
import { NavigationRail } from './components/NavigationRail/NavigationRail';
import { WorkspacesSection } from './components/WorkspacesSection/WorkspacesSection';
import { ActivitySection } from './components/ActivitySection/ActivitySection';
import { CompanionPanel } from './components/CompanionPanel/CompanionPanel';
import { NAV_ITEMS, SAMPLE_WORKSPACES, SAMPLE_ACTIVITIES } from './data/demoData';

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
      {/* 3D Universe Mode (Active when user navigates to Universe) */}
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
        /* Home Dashboard View */
        <>
          {/* Top Ambient Glow Spots */}
          <div className="ambient-glow-layer" aria-hidden="true">
            <div className="glow-spot glow-spot-1" />
            <div className="glow-spot glow-spot-2" />
            <div className="glow-spot glow-spot-3" />
          </div>

          {/* 1. Compact Header Bar */}
          <Header onLaunchUniverse={handleLaunchUniverse} />

          {/* Main Viewport Wrap: Slim Nav Rail + Compact Dashboard Area */}
          <div className="main-viewport">
            {/* 2. Slim Persistent Left Navigation Rail */}
            <NavigationRail
              items={NAV_ITEMS}
              activeId={activeNavId}
              onSelect={(id) => setActiveNavId(id)}
            />

            {/* 3. Primary Two-Column Dashboard Content (60% / 40%) */}
            <main className="dashboard-main" id="main-content">
              <div className="dashboard-grid">
                {/* LEFT COLUMN: ~60% - Workspaces & Streamlined Telemetry */}
                <div className="left-column">
                  <WorkspacesSection
                    workspaces={SAMPLE_WORKSPACES}
                    onOpenUniverse={handleLaunchUniverse}
                  />
                  <ActivitySection activities={SAMPLE_ACTIVITIES} />
                </div>

                {/* RIGHT COLUMN: ~40% - Celestial Companion Panel as Centerpiece */}
                <CompanionPanel />
              </div>
            </main>
          </div>
        </>
      )}
    </div>
  );
};

export default App;
