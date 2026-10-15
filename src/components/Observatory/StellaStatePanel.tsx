import React, { useState } from 'react';
import { useSystemMonitoring } from './useSystemMonitoring';

export const StellaStatePanel: React.FC = () => {
  const { metrics, companionState, weatherState } = useSystemMonitoring();
  const [activeTab, setActiveTab] = useState<'system' | 'companion' | 'weather' | null>('system');

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
                <span>Speech engine</span>
                <b className="unavailable">{companionState.speechEngine}</b>
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
