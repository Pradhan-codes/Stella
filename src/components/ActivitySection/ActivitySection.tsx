import React from 'react';
import { ActivityItem } from '../../types/dashboard';

interface ActivitySectionProps {
  activities: ActivityItem[];
}

export const ActivitySection: React.FC<ActivitySectionProps> = ({ activities }) => {
  return (
    <section className="activity-section" id="activity-section" aria-labelledby="activity-heading">
      {/* Activity Table Header */}
      <div className="activity-header">
        <div className="section-title-wrap">
          <span className="material-symbols-outlined text-outline" style={{ fontSize: '16px' }} aria-hidden="true">
            history
          </span>
          <h3 id="activity-heading" className="section-heading" style={{ fontSize: '12px' }}>
            Recent Activity
          </h3>
          <span className="sample-tag">Sample Data</span>
        </div>
        <span className="activity-telemetry-notice">Live Telemetry Paused</span>
      </div>

      {/* Content-Driven Activity Table */}
      <div className="activity-table-wrap">
        <table className="activity-table" aria-label="Recent system activity table">
          <thead>
            <tr>
              <th scope="col">Action</th>
              <th scope="col">Workspace</th>
              <th scope="col">Status</th>
              <th scope="col" style={{ textAlign: 'right' }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((act) => {
              const isCompleted = act.status.includes('Completed');

              return (
                <tr key={act.id} id={`activity-row-${act.id}`}>
                  <td>
                    <div className="activity-action-cell">
                      <span className={`activity-dot ${act.workspaceAccent}`} aria-hidden="true" />
                      <span>{act.action}</span>
                    </div>
                  </td>
                  <td className={`activity-workspace-cell ${act.workspaceAccent}`}>
                    {act.workspace}
                  </td>
                  <td>
                    <span className={`activity-badge ${isCompleted ? 'completed' : 'standby'}`}>
                      {act.status}
                    </span>
                  </td>
                  <td className="activity-time-cell">
                    {act.time}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Subtle Integrated Quick-Actions Launchpad */}
      <div className="quick-actions-panel" id="quick-actions-panel">
        <div className="quick-actions-header">
          <span className="quick-actions-title">Quick Actions</span>
          <span className="sample-tag">Demo</span>
        </div>
        <div className="quick-actions-grid">
          <button
            type="button"
            className="quick-action-tile accent-primary"
            title="Inspect Yuki offline memory vault (Demo)"
            id="qa-yuki-vault"
          >
            <span className="material-symbols-outlined quick-action-icon">neurology</span>
            <div className="quick-action-meta">
              <span className="quick-action-label">Inspect Memory Vault</span>
              <span className="quick-action-sub">Yuki Core • Standby</span>
            </div>
          </button>

          <button
            type="button"
            className="quick-action-tile accent-tertiary"
            title="Open Rin local sandbox environment (Demo)"
            id="qa-rin-sandbox"
          >
            <span className="material-symbols-outlined quick-action-icon">terminal</span>
            <div className="quick-action-meta">
              <span className="quick-action-label">Launch Code Sandbox</span>
              <span className="quick-action-sub">Rin Agent • Isolated</span>
            </div>
          </button>

          <button
            type="button"
            className="quick-action-tile accent-secondary"
            title="Open Sakura visual canvas draft (Demo)"
            id="qa-sakura-canvas"
          >
            <span className="material-symbols-outlined quick-action-icon">palette</span>
            <div className="quick-action-meta">
              <span className="quick-action-label">Resume Canvas Draft</span>
              <span className="quick-action-sub">Sakura Pod • Ready</span>
            </div>
          </button>
        </div>
      </div>
    </section>
  );
};
