import React, { useState } from 'react';
import { Header } from './components/Header/Header';
import { NavigationRail } from './components/NavigationRail/NavigationRail';
import { WorkspacesSection } from './components/WorkspacesSection/WorkspacesSection';
import { ActivitySection } from './components/ActivitySection/ActivitySection';
import { CompanionPanel } from './components/CompanionPanel/CompanionPanel';
import { NAV_ITEMS, SAMPLE_WORKSPACES, SAMPLE_ACTIVITIES } from './data/demoData';

export const App: React.FC = () => {
  const [activeNavId, setActiveNavId] = useState<string>('home');

  return (
    <div className="app-container" id="stella-app-root">
      {/* Top Ambient Glow Spots */}
      <div className="ambient-glow-layer" aria-hidden="true">
        <div className="glow-spot glow-spot-1" />
        <div className="glow-spot glow-spot-2" />
        <div className="glow-spot glow-spot-3" />
      </div>

      {/* 1. Compact Header Bar */}
      <Header />

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
              <WorkspacesSection workspaces={SAMPLE_WORKSPACES} />
              <ActivitySection activities={SAMPLE_ACTIVITIES} />
            </div>

            {/* RIGHT COLUMN: ~40% - Celestial Companion Panel as Centerpiece */}
            <CompanionPanel />
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
