import React from 'react';

interface UniverseOverlayProps {
  onBackToHome: () => void;
  onResetCamera?: () => void;
}

export const UniverseOverlay: React.FC<UniverseOverlayProps> = ({
  onBackToHome,
  onResetCamera,
}) => {
  return (
    <div className="universe-ui-layer" id="universe-ui-overlay">
      {/* 1. Top Bar matching Reference Image */}
      <header className="universe-top-bar">
        <div className="top-bar-left">
          {/* Reference Saturn Logo + Brand */}
          <div className="universe-brand" onClick={onResetCamera} role="button" tabIndex={0} title="Reset Universe Perspective">
            <span className="material-symbols-outlined brand-saturn-icon">
              radio_button_unchecked
            </span>
            <div className="brand-title-wrap">
              <span className="brand-text">STELLA</span>
              <span className="brand-divider">|</span>
              <span className="brand-preview-tag">PREVIEW</span>
            </div>
          </div>

          {/* Back to Home Button */}
          <button
            type="button"
            className="universe-back-btn"
            id="btn-back-to-home"
            onClick={onBackToHome}
            aria-label="Back to Home Dashboard"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
              arrow_back
            </span>
            <span>Back to Home</span>
          </button>
        </div>

        {/* Top Right: Reference Action Buttons (Grid, Settings, Overview Reset) */}
        <div className="top-bar-right">
          <button
            type="button"
            className="universe-icon-btn"
            onClick={onResetCamera}
            title="Reset overview perspective"
            aria-label="Grid Overview"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              grid_view
            </span>
          </button>

          <button
            type="button"
            className="universe-icon-btn"
            onClick={onResetCamera}
            title="Universe Settings"
            aria-label="Settings"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              settings
            </span>
          </button>

          <button
            type="button"
            className="universe-add-pill-btn"
            id="btn-universe-overview-reset"
            onClick={onResetCamera}
            title="Reset Universe Perspective"
            aria-label="Reset Universe"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              refresh
            </span>
            <span>OVERVIEW</span>
          </button>
        </div>
      </header>

      {/* 2. Left Navigation Sidebar */}
      <aside className="universe-side-nav" aria-label="Universe Navigation">
        <div className="nav-items-group">
          {/* Active Universe Item */}
          <button
            type="button"
            className="universe-nav-item active"
            id="universe-nav-universe"
            aria-current="page"
          >
            <span className="material-symbols-outlined">public</span>
            <span>Universe</span>
          </button>

          {/* Home Item */}
          <button
            type="button"
            className="universe-nav-item"
            id="universe-nav-home"
            onClick={onBackToHome}
            aria-label="Go to Home"
          >
            <span className="material-symbols-outlined">home</span>
            <span>Home</span>
          </button>

          {/* Projects */}
          <button
            type="button"
            className="universe-nav-item disabled"
            id="universe-nav-projects"
            title="Projects (Planned)"
          >
            <span className="material-symbols-outlined">folder</span>
            <span>Projects</span>
          </button>

          {/* Memory */}
          <button
            type="button"
            className="universe-nav-item disabled"
            id="universe-nav-memory"
            title="Memory (Planned)"
          >
            <span className="material-symbols-outlined">neurology</span>
            <span>Memory</span>
          </button>

          {/* Agents */}
          <button
            type="button"
            className="universe-nav-item disabled"
            id="universe-nav-agents"
            title="Agents (Planned)"
          >
            <span className="material-symbols-outlined">smart_toy</span>
            <span>Agents</span>
          </button>
        </div>
      </aside>

      {/* 3. Bottom Center: THE VERSE Typography matching Reference Image */}
      <div className="universe-watermark" id="universe-verse-title">
        <span>THE VERSE</span>
      </div>

      {/* 4. Bottom-Left Badge Pill */}
      <div className="universe-bottom-left-pill" id="universe-bottom-manifest">
        <div className="pill-star-orb">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            auto_awesome
          </span>
        </div>
        <div className="pill-text-wrap">
          <span className="manifest-title">Stella Universe</span>
          <span className="manifest-subtitle">8 worlds • Reference-locked orbital system</span>
        </div>
      </div>

      {/* 5. Bottom-Right Controls Hint Pill */}
      <div className="universe-bottom-right-pill" id="universe-bottom-hint">
        <span className="material-symbols-outlined hint-mouse-icon">
          mouse
        </span>
        <div className="hint-text-wrap">
          <span className="hint-title">Click planet to enter</span>
          <span className="hint-subtitle">Scroll to zoom • Drag to orbit</span>
        </div>
      </div>
    </div>
  );
};
