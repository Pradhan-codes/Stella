import React, { useState, useEffect } from 'react';
import { useSystemMonitoring } from './useSystemMonitoring';
import {
  cantarellaExpressionController,
  CantarellaExpressionName,
  ExpressionStatus,
} from '../CompanionPanel/CantarellaExpressionController';
import {
  cantarellaAnimationManager,
  VRMA_MOTIONS,
  AnimationStatus,
} from '../CompanionPanel/CantarellaAnimationManager';

export const StellaStatePanel: React.FC = () => {
  const { metrics, companionState, weatherState } = useSystemMonitoring();
  const [activeTab, setActiveTab] = useState<'system' | 'companion' | 'weather' | null>('system');
  const [expressionStatus, setExpressionStatus] = useState<ExpressionStatus>(() =>
    cantarellaExpressionController.getStatus()
  );
  const [animationStatus, setAnimationStatus] = useState<AnimationStatus>(() =>
    cantarellaAnimationManager.getStatus()
  );
  const [expressionNotice, setExpressionNotice] = useState<string | null>(null);

  useEffect(() => {
    return cantarellaExpressionController.subscribe(setExpressionStatus);
  }, []);

  useEffect(() => {
    return cantarellaAnimationManager.subscribe(setAnimationStatus);
  }, []);

  const toggleTab = (tab: 'system' | 'companion' | 'weather') => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  };

  return (
    <div className="side r" id="stella-state-panel">
      <h3>Stella's state</h3>

      {/* 1. Primary Core Key-Values */}
      <div className="kv">
        <span>Local engine</span>
        <b>Offline</b>
      </div>
      <div className="kv">
        <span>Companion</span>
        <b>Standby</b>
      </div>
      <div className="kv">
        <span>Workspaces mapped</span>
        <b>8</b>
      </div>
      <div className="kv">
        <span>Workspaces connected</span>
        <b>None yet</b>
      </div>

      {/* 2. Compact Extended Telemetry Sections */}
      <div className="state-sections" aria-label="Extended Stella State Telemetry">
        {/* Section A: System Monitoring */}
        <div className="state-group">
          <button
            type="button"
            className={`state-group-header ${activeTab === 'system' ? 'open' : ''}`}
            onClick={() => toggleTab('system')}
            aria-expanded={activeTab === 'system'}
          >
            <span>System Monitoring</span>
            <span className="state-toggle-icon">{activeTab === 'system' ? '−' : '+'}</span>
          </button>

          {activeTab === 'system' && (
            <div className="state-group-content" id="system-monitoring-details">
              <div className="sub-kv">
                <span>Power / Battery</span>
                <b>{metrics.batteryStatus}</b>
              </div>
              <div className="sub-kv">
                <span>CPU Allocation</span>
                <b>{metrics.cpuCores}</b>
              </div>
              <div className="sub-kv">
                <span>CPU Utilization / Temp</span>
                <b className="unavailable">{metrics.cpuUtilization}</b>
              </div>
              <div className="sub-kv">
                <span>Graphics (GPU)</span>
                <b>{metrics.gpuRenderer}</b>
              </div>
              <div className="sub-kv">
                <span>GPU Utilization / Temp</span>
                <b className="unavailable">{metrics.gpuUtilization}</b>
              </div>
              <div className="sub-kv">
                <span>System RAM</span>
                <b>{metrics.ramApprox}</b>
              </div>
              <div className="sub-kv">
                <span>Designated VRAM</span>
                <b>{metrics.vram}</b>
              </div>
              <p className="state-footnote">
                Honest state: Host daemon is offline; live performance telemetry is withheld.
              </p>
            </div>
          )}
        </div>

        {/* Section B: Companion State */}
        <div className="state-group">
          <button
            type="button"
            className={`state-group-header ${activeTab === 'companion' ? 'open' : ''}`}
            onClick={() => toggleTab('companion')}
            aria-expanded={activeTab === 'companion'}
          >
            <span>Companion Persona</span>
            <span className="state-toggle-icon">{activeTab === 'companion' ? '−' : '+'}</span>
          </button>

          {activeTab === 'companion' && (
            <div className="state-group-content" id="companion-persona-details">
              <div className="sub-kv">
                <span>Engine status</span>
                <b>{companionState.engineStatus}</b>
              </div>
              <div className="sub-kv">
                <span>Presence state</span>
                <b>{companionState.presenceState}</b>
              </div>
              <div className="sub-kv">
                <span>Persona mood</span>
                <b>{companionState.personaMood}</b>
              </div>
              <div className="sub-kv">
                <span>Active expression</span>
                <b style={{ textTransform: 'capitalize', color: 'var(--teal)' }}>
                  {expressionStatus.currentExpression}
                  {expressionStatus.isTransitioning ? ' (~)' : ''}
                </b>
              </div>
              <div className="sub-kv">
                <span>Active motion</span>
                <b style={{ color: animationStatus.isPlaying ? 'var(--teal)' : 'var(--silver)' }}>
                  {animationStatus.activeMotionName || 'Rest Pose'}
                  {animationStatus.isLoading ? ' (loading...)' : animationStatus.isPlaying ? ' (~)' : ''}
                </b>
              </div>
              <div className="sub-kv">
                <span>Speech engine</span>
                <b className="unavailable">{companionState.speechEngine}</b>
              </div>

              {/* Expression Controller Foundation (Phase 2) */}
              <div className="expression-picker-group">
                <span className="expression-picker-label">Facial Expression (Phase 2):</span>
                <div className="expression-buttons-row">
                  {(['neutral', 'happy', 'sad', 'angry', 'playful', 'shy'] as CantarellaExpressionName[]).map((name) => {
                    const isSelected = expressionStatus.targetExpression === name;
                    const isSupported = cantarellaExpressionController.isExpressionSupported(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        id={`btn-expr-${name}`}
                        className={`expression-btn ${isSelected ? 'active' : ''} ${!isSupported ? 'unsupported' : ''}`}
                        title={!isSupported ? 'Unsupported by model (no blendshape group)' : `Transition to ${name}`}
                        onClick={() => {
                          const res = cantarellaExpressionController.setExpression(name);
                          if (!res.success && res.message) {
                            setExpressionNotice(res.message);
                          } else {
                            setExpressionNotice(null);
                          }
                        }}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
                {expressionNotice && (
                  <p className="expression-notice">{expressionNotice}</p>
                )}
              </div>

              {/* Fallback Gestures */}
              <div className="expression-picker-group">
                <span className="expression-picker-label">Gestures (Fallback):</span>
                <div className="expression-buttons-row">
                  <button
                    type="button"
                    id="btn-observatory-wave"
                    className="expression-btn"
                    title="Gentle greeting wave (hand-coded fallback)"
                    onClick={() => cantarellaExpressionController.playGesture('wave')}
                  >
                    Wave 👋
                  </button>
                  <button
                    type="button"
                    id="btn-observatory-nod"
                    className="expression-btn"
                    title="Gentle affirmation nod (hand-coded fallback)"
                    onClick={() => cantarellaExpressionController.playGesture('nod')}
                  >
                    Nod 🙏
                  </button>
                </div>
              </div>

              {/* Animation-Test Controls (VRMA Motion Pack) */}
              <div className="expression-picker-group">
                <div className="vrma-section-header">
                  <span className="expression-picker-label">Animation-Test Controls (VRMA):</span>
                  {animationStatus.isPlaying && (
                    <button
                      type="button"
                      id="btn-observatory-vrma-stop"
                      className="vrma-stop-btn"
                      onClick={() => cantarellaAnimationManager.stopMotion(0.35)}
                      title="Stop animation and return smoothly to rest pose"
                    >
                      Stop
                    </button>
                  )}
                </div>
                <div className="expression-buttons-row">
                  {VRMA_MOTIONS.map((motion) => {
                    const isActive = animationStatus.activeMotionId === motion.id && animationStatus.isPlaying;
                    const isLoading = animationStatus.activeMotionId === motion.id && animationStatus.isLoading;
                    return (
                      <button
                        key={motion.id}
                        type="button"
                        id={`btn-observatory-vrma-${motion.id.toLowerCase()}`}
                        className={`expression-btn vrma-btn ${isActive ? 'active' : ''} ${isLoading ? 'loading' : ''}`}
                        title={`${motion.name} (${motion.file}): ${motion.hint}`}
                        onClick={() => {
                          if (isActive) {
                            cantarellaAnimationManager.stopMotion(0.35);
                          } else {
                            cantarellaAnimationManager.playMotion(motion.id);
                          }
                        }}
                      >
                        {motion.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="state-footnote">
                Stella is resting in offline standby. No AI inference is running in background.
              </p>
            </div>
          )}
        </div>

        {/* Section C: Weather */}
        <div className="state-group">
          <button
            type="button"
            className={`state-group-header ${activeTab === 'weather' ? 'open' : ''}`}
            onClick={() => toggleTab('weather')}
            aria-expanded={activeTab === 'weather'}
          >
            <span>Weather Telemetry</span>
            <span className="state-toggle-icon">{activeTab === 'weather' ? '−' : '+'}</span>
          </button>

          {activeTab === 'weather' && (
            <div className="state-group-content" id="weather-details">
              <div className="sub-kv">
                <span>Current conditions</span>
                <b className="unavailable">{weatherState.status}</b>
              </div>
              <div className="sub-kv">
                <span>Temperature</span>
                <b className="unavailable">{weatherState.temperature}</b>
              </div>
              <div className="sub-kv">
                <span>Forecast</span>
                <b className="unavailable">{weatherState.forecast}</b>
              </div>
              <p className="state-footnote">{weatherState.note}</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Empty Activity Note */}
      <p className="empty">
        <em>No recent activity.</em>
        Work you do in any workspace will be logged here.
      </p>
    </div>
  );
};
