import React from 'react';

interface HeaderProps {
  onLaunchUniverse?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLaunchUniverse }) => {
  return (
    <header className="header-bar" id="stella-header">
      {/* Brand + Constellation Badge */}
      <div className="brand-section">
        <div className="brand-icon-box" aria-hidden="true">
          <span className="material-symbols-outlined">auto_awesome</span>
        </div>
        <div className="brand-title-wrap">
          <span className="brand-title">Stella</span>
          <span className="brand-version-pill">v0.5</span>
        </div>

        {/* Honest connection status pill */}
        <div
          className="status-indicator-pill"
          id="system-status-indicator"
          title="System is running purely in local standby mode; model engine is offline."
        >
          <span className="status-dot" aria-hidden="true" />
          <span>Local Standby • Offline</span>
        </div>
      </div>

      {/* Integrated Search Bar */}
      <div className="header-search-wrap">
        <div className="search-bar">
          <span className="material-symbols-outlined search-icon" aria-hidden="true">
            search
          </span>
          <input
            id="stella-global-search"
            type="text"
            className="search-input"
            placeholder="Ask Stella or search memory..."
            readOnly
            aria-label="Quick Search (Standby)"
          />
          <kbd className="kbd-shortcut" aria-label="Keyboard shortcut: Command K">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Quick Actions */}
      <div className="header-actions">
        <button
          type="button"
          id="btn-settings-quick"
          className="icon-button"
          aria-label="Settings"
          title="Dashboard Settings (Phase 1)"
        >
          <span className="material-symbols-outlined">tune</span>
        </button>

        <button
          type="button"
          id="btn-launch-universe"
          className="launch-universe-btn"
          title="Enter Stella's 3D celestial universe"
          onClick={onLaunchUniverse}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
            hub
          </span>
          <span>Launch Universe</span>
        </button>
      </div>
    </header>
  );
};
