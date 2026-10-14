import React from 'react';
import { CelestialAvatar } from './CelestialAvatar';

export const CompanionPanel: React.FC = () => {
  return (
    <aside className="right-column" id="stella-companion-column" aria-label="Celestial Companion Stage">
      <div className="companion-card" id="companion-card">
        {/* Soft Glowing Atmospheric Nebula Halo */}
        <div className="companion-nebula-halo" aria-hidden="true" />

        {/* Top Header in Companion Card */}
        <div className="companion-header">
          <div className="companion-title-group">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }} aria-hidden="true">
              auto_awesome
            </span>
            <div>
              <h3 className="companion-title">Stella AI</h3>
              <span className="companion-subtitle">Celestial Companion</span>
            </div>
          </div>

          <div
            className="companion-status-pill"
            id="companion-status-pill"
            title="AI model engine is currently offline."
          >
            <span className="status-dot" aria-hidden="true" />
            <span>Offline</span>
          </div>
        </div>

        {/* Emotional Centerpiece: Calm Celestial Anime Companion Stage */}
        <div className="companion-stage">
          {/* Floating Crystalline Stars Accent */}
          <span className="floating-star star-1" aria-hidden="true">
            ✦
          </span>
          <span className="floating-star star-2" aria-hidden="true">
            ✧
          </span>
          <span className="floating-star star-3" aria-hidden="true">
            ✦
          </span>

          {/* Serene Anime Avatar Composition (Enhanced 2–2.5x Scale) */}
          <div className="avatar-wrapper">
            <div className="avatar-halo-circle" aria-hidden="true" />
            <CelestialAvatar />
          </div>
        </div>

        {/* Warm Welcoming Dialogue Bubble */}
        <div className="dialogue-bubble" role="status">
          <div className="dialogue-bubble-tail" aria-hidden="true" />
          <p className="dialogue-text">
            “Welcome back. Your universe is waiting.”
          </p>
        </div>

        {/* Honest Inactive Message Input */}
        <div className="companion-input-container">
          <div className="companion-input-bar">
            <span
              className="material-symbols-outlined mic-off-icon"
              title="Voice/microphone inactive"
              aria-label="Microphone inactive"
            >
              mic_off
            </span>
            <input
              id="companion-message-input"
              type="text"
              className="companion-disabled-input"
              placeholder="Message Stella... (Engine offline)"
              disabled
              aria-label="Message Stella (Engine offline)"
            />
            <button
              id="btn-companion-send"
              type="button"
              className="companion-disabled-send"
              disabled
              aria-label="Send message (disabled)"
            >
              <span>Send</span>
              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                send
              </span>
            </button>
          </div>

          <div className="companion-footer-meta">
            <span>Local Companion Standby • Not connected</span>
            <span>v0.5 Prototype</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
