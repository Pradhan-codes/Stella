import React, { useState, useEffect } from 'react';
import { useSystemMonitoring } from './useSystemMonitoring';
import {
  cantarellaExpressionController,
  CantarellaExpressionName,
  ExpressionStatus,
} from '../CompanionPanel/CantarellaExpressionController';
import {
  cantarellaAnimationManager,
  AnimationStatus,
} from '../CompanionPanel/CantarellaAnimationManager';
import { DiscoveredAnimationItem, AnimationCategory } from '../../types/animation';
import { HealthResponsePayload } from '../../services/brainService';

interface StellaStatePanelProps {
  isOnline?: boolean;
  health?: HealthResponsePayload | null;
}

export const StellaStatePanel: React.FC<StellaStatePanelProps> = ({
  isOnline = false,
  health = null,
}) => {
  const { metrics, companionState, weatherState } = useSystemMonitoring();
  const [activeTab, setActiveTab] = useState<'system' | 'companion' | 'weather' | null>('system');
  const [expressionStatus, setExpressionStatus] = useState<ExpressionStatus>(() =>
    cantarellaExpressionController.getStatus()
  );
  const [animationStatus, setAnimationStatus] = useState<AnimationStatus>(() =>
    cantarellaAnimationManager.getStatus()
  );
  const [discoveredMotions, setDiscoveredMotions] = useState<DiscoveredAnimationItem[]>(() =>
    cantarellaAnimationManager.getDiscoveredMotions()
  );
  const [selectedCategory, setSelectedCategory] = useState<AnimationCategory | 'all'>('all');
  const [isRescanning, setIsRescanning] = useState<boolean>(false);
  const [expressionNotice, setExpressionNotice] = useState<string | null>(null);
  const [animationNotice, setAnimationNotice] = useState<string | null>(null);

  useEffect(() => {
    return cantarellaExpressionController.subscribe(setExpressionStatus);
  }, []);

  useEffect(() => {
    return cantarellaAnimationManager.subscribe((status) => {
      setAnimationStatus(status);
      setDiscoveredMotions(cantarellaAnimationManager.getDiscoveredMotions());
    });
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
        <b style={{ color: isOnline ? 'var(--teal)' : 'var(--silver)' }}>
          {isOnline ? `Active (${health?.model || '127.0.0.1'})` : 'Offline'}
        </b>
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
                <b style={{ color: isOnline ? 'var(--teal)' : undefined }}>
                  {isOnline ? `Online (${health?.fsm_state || 'STANDBY'})` : companionState.engineStatus}
                </b>
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

              {/* Dynamic VRM Animation Explorer */}
              <div className="expression-picker-group">
                <div className="anim-explorer-header">
                  <span className="expression-picker-label">Animation Explorer:</span>
                  <div className="anim-action-controls">
                    <button
                      type="button"
                      id="btn-observatory-rescan"
                      className="anim-rescan-btn"
                      onClick={async () => {
                        setIsRescanning(true);
                        try {
                          const items = await cantarellaAnimationManager.discoverAndRegisterAnimations(true);
                          setDiscoveredMotions(items);
                          setAnimationNotice(`Scanned ${items.length} animations (${items.filter((i) => i.compatibility === 'compatible').length} compatible)`);
                          setTimeout(() => setAnimationNotice(null), 3000);
                        } catch (err: any) {
                          setAnimationNotice(`Rescan error: ${err.message}`);
                        } finally {
                          setIsRescanning(false);
                        }
                      }}
                      title="Rescan animations folder for newly dropped files"
                    >
                      {isRescanning ? 'Scanning...' : 'Rescan ↻'}
                    </button>
                    {animationStatus.isPlaying && (
                      <>
                        <button
                          type="button"
                          id="btn-observatory-vrma-pause"
                          className="anim-pause-btn"
                          onClick={() => {
                            if (animationStatus.isPaused) {
                              cantarellaAnimationManager.resumeMotion();
                            } else {
                              cantarellaAnimationManager.pauseMotion();
                            }
                          }}
                          title={animationStatus.isPaused ? 'Resume playback' : 'Pause playback'}
                        >
                          {animationStatus.isPaused ? 'Resume' : 'Pause'}
                        </button>
                        <button
                          type="button"
                          id="btn-observatory-vrma-stop"
                          className="vrma-stop-btn"
                          onClick={() => cantarellaAnimationManager.stopMotion(0.35)}
                          title="Stop animation and return smoothly to rest pose"
                        >
                          Stop
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Category Filter Pills */}
                <div className="anim-cat-filter-row" role="tablist" aria-label="Animation Categories">
                  {(['all', 'idle', 'dance', 'cute_poses', 'conversational', 'action', 'reactions_surprised', 'custom'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      id={`btn-anim-cat-${cat}`}
                      className={`anim-cat-pill ${selectedCategory === cat ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat === 'all' ? 'All' : cat.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                {/* Motion Pills Grid */}
                <div className="expression-buttons-row">
                  {discoveredMotions
                    .filter((m) => selectedCategory === 'all' || m.category === selectedCategory)
                    .map((motion) => {
                      const isActive = animationStatus.activeMotionId === motion.id && animationStatus.isPlaying;
                      const isLoading = animationStatus.activeMotionId === motion.id && animationStatus.isLoading;
                      const isCompatible = motion.compatibility === 'compatible';

                      return (
                        <button
                          key={motion.id}
                          type="button"
                          id={`btn-observatory-vrma-${motion.id.toLowerCase()}`}
                          className={`expression-btn vrma-btn ${isActive ? 'active' : ''} ${isLoading ? 'loading' : ''} ${!isCompatible ? 'incompatible' : ''}`}
                          title={`${motion.displayName} (${motion.fileName})\nDuration: ${motion.duration.toFixed(1)}s\nStatus: ${motion.compatibility}${motion.compatibilityReason ? `\nNote: ${motion.compatibilityReason}` : ''}`}
                          onClick={() => {
                            if (!isCompatible) {
                              setAnimationNotice(`Incompatible '${motion.displayName}': ${motion.compatibilityReason || 'Unsupported format'}`);
                              return;
                            }
                            setAnimationNotice(null);
                            if (isActive) {
                              cantarellaAnimationManager.stopMotion(0.35);
                            } else {
                              cantarellaAnimationManager.playMotion(motion.id, { loop: motion.isLoop });
                            }
                          }}
                        >
                          {!isCompatible ? '⚠️ ' : ''}
                          {motion.displayName}
                          <span className="anim-meta-badge">
                            {motion.isLoop ? '🔁' : `${motion.duration.toFixed(0)}s`}
                          </span>
                        </button>
                      );
                    })}
                </div>

                {animationNotice && (
                  <p className="anim-error-notice">{animationNotice}</p>
                )}
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
