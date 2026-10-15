import React, { useEffect } from 'react';
import { PlanetData } from './types';

interface PlanetWorkspaceModalProps {
  planet: PlanetData;
  onClose: () => void;
  onGoHome: () => void;
}

export const PlanetWorkspaceModal: React.FC<PlanetWorkspaceModalProps> = ({
  planet,
  onClose,
  onGoHome,
}) => {
  // ESC key listener to return to universe
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="workspace-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-title"
    >
      <div
        className="workspace-modal-card"
        style={{ borderColor: `${planet.accentColor}40` }}
      >
        {/* Glowing Top Atmospheric Bar */}
        <div
          className="workspace-modal-top-glow"
          style={{
            background: `linear-gradient(90deg, transparent, ${planet.accentColor}50, transparent)`,
          }}
        />

        {/* Modal Header */}
        <div className="workspace-modal-header">
          <div className="workspace-brand-left">
            <div
              className="workspace-icon-orb"
              style={{
                backgroundColor: `${planet.accentColor}25`,
                borderColor: `${planet.accentColor}80`,
                boxShadow: `0 0 20px ${planet.accentColor}30`,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: planet.accentColor, fontSize: '24px' }}
              >
                {planet.icon}
              </span>
            </div>
            <div>
              <div className="workspace-breadcrumb">
                <span>Stella Universe</span>
                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                  chevron_right
                </span>
                <span style={{ color: planet.accentColor }}>{planet.name} Core</span>
              </div>
              <h2 id="workspace-title" className="workspace-title">
                {planet.name} — {planet.role}
              </h2>
              <p className="workspace-subtitle">{planet.tagline}</p>
            </div>
          </div>

          <div className="workspace-header-actions">
            <button
              type="button"
              className="workspace-action-pill"
              onClick={onClose}
              title="Return to Universe overview"
              aria-label="Return to Universe"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                hub
              </span>
              <span>Return to Universe</span>
            </button>

            <button
              type="button"
              className="workspace-action-pill-secondary"
              onClick={onGoHome}
              title="Return to Home dashboard"
              aria-label="Return to Home"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                home
              </span>
              <span>Home</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="workspace-modal-body">
          {/* Left Column: Purpose & Themed Workspace Pod */}
          <div className="workspace-main-panel">
            <div className="panel-box">
              <h3 className="panel-title">
                <span className="material-symbols-outlined" style={{ color: planet.accentColor }}>
                  explore
                </span>
                <span>Workspace Architecture & Scope</span>
              </h3>
              <p className="panel-description">{planet.description}</p>

              <div className="telemetry-grid">
                <div className="telemetry-card">
                  <div className="telemetry-label">Operational State</div>
                  <div className="telemetry-val" style={{ color: planet.accentColor }}>
                    <span className="status-dot-mini" />
                    {planet.sampleStatus.health} (Local Standby)
                  </div>
                </div>

                <div className="telemetry-card">
                  <div className="telemetry-label">Active Manifest</div>
                  <div className="telemetry-val">{planet.sampleStatus.activeItems}</div>
                </div>

                <div className="telemetry-card">
                  <div className="telemetry-label">Performance Metric</div>
                  <div className="telemetry-val">{planet.sampleStatus.metrics}</div>
                </div>

                <div className="telemetry-card">
                  <div className="telemetry-label">Security Clearance</div>
                  <div className="telemetry-val">Isolated Sandbox</div>
                </div>
              </div>
            </div>

            {/* Simulated Workspace Capabilities */}
            <div className="panel-box" style={{ marginTop: '16px' }}>
              <h3 className="panel-title">
                <span className="material-symbols-outlined" style={{ color: planet.accentColor }}>
                  settings_suggest
                </span>
                <span>Assigned Capabilities & Modules</span>
              </h3>
              <div className="capabilities-tags">
                <span className="cap-tag">Local-First Persistence</span>
                <span className="cap-tag">Direct Memory Cache</span>
                <span className="cap-tag">Deterministic Sandbox</span>
                <span className="cap-tag">Contract Dispatcher</span>
                <span className="cap-tag">Zero Telemetry Leak</span>
              </div>
            </div>
          </div>

          {/* Right Column: Controls & Actions */}
          <div className="workspace-side-panel">
            <div className="panel-box">
              <h3 className="panel-title">
                <span className="material-symbols-outlined" style={{ color: planet.accentColor }}>
                  tune
                </span>
                <span>Workspace Controls</span>
              </h3>
              <div className="workspace-btn-list">
                <button
                  type="button"
                  className="ws-control-btn active"
                  style={{
                    backgroundColor: `${planet.accentColor}20`,
                    borderColor: `${planet.accentColor}60`,
                    color: planet.accentColor,
                  }}
                  onClick={() => alert(`Launching ${planet.name} diagnostics monitor.`)}
                >
                  <span className="material-symbols-outlined">insights</span>
                  <span>Inspect Telemetry</span>
                </button>
                <button
                  type="button"
                  className="ws-control-btn"
                  onClick={() => alert(`${planet.name} local cache snapshot verified.`)}
                >
                  <span className="material-symbols-outlined">sync</span>
                  <span>Sync Local Cache</span>
                </button>
                <button
                  type="button"
                  className="ws-control-btn"
                  onClick={() => alert(`Configuration exported for ${planet.name}.`)}
                >
                  <span className="material-symbols-outlined">description</span>
                  <span>Export Manifest</span>
                </button>
              </div>

              <div className="panel-note">
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                  info
                </span>
                <span>
                  Phase 1 visual prototype. Live AI backend & VRM avatar integration are intentionally decoupled.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="workspace-modal-footer">
          <div className="footer-status-pill">
            <span className="status-dot-mini" />
            <span>Connected: RTX 3050 Local Render Node</span>
          </div>

          <button
            type="button"
            className="workspace-close-primary-btn"
            style={{
              backgroundColor: planet.accentColor,
              color: '#0f0a14',
            }}
            onClick={onClose}
          >
            <span>Back to Universe Orbit</span>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              arrow_back
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
