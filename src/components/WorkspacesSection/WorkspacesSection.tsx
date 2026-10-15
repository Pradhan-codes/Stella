import React from 'react';
import { WorkspaceCardData } from '../../types/dashboard';

interface WorkspacesSectionProps {
  workspaces: WorkspaceCardData[];
  onOpenUniverse?: () => void;
}

export const WorkspacesSection: React.FC<WorkspacesSectionProps> = ({ workspaces, onOpenUniverse }) => {
  return (
    <section className="workspaces-section" id="workspaces-section" aria-labelledby="workspaces-heading">
      <div className="section-header-row">
        <div className="section-title-wrap">
          <span className="material-symbols-outlined section-icon" aria-hidden="true">
            orbit
          </span>
          <h2 id="workspaces-heading" className="section-heading">
            Active Workspaces
          </h2>
          <span className="sample-tag">Sample Data</span>
        </div>
        <button
          type="button"
          className="section-link-btn"
          id="link-all-workspaces"
          title="Open Stella's 3D celestial universe"
          onClick={onOpenUniverse}
        >
          <span>View all in Universe</span>
          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
            arrow_forward
          </span>
        </button>
      </div>

      {/* 3 Workspace Cards Grid */}
      <div className="workspaces-grid">
        {workspaces.map((ws) => (
          <article
            key={ws.id}
            id={`workspace-card-${ws.id}`}
            className={`workspace-card accent-${ws.accent}`}
          >
            <div>
              <div className="workspace-card-top">
                <div className={`workspace-icon-box accent-${ws.accent}`} aria-hidden="true">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    {ws.icon}
                  </span>
                </div>
                <span className={`workspace-status-badge accent-${ws.accent}`}>
                  {ws.status}
                </span>
              </div>
              <h3 className="workspace-name">{ws.name}</h3>
              <p className={`workspace-codename accent-${ws.accent}`}>{ws.codename}</p>
              <p className="workspace-desc">{ws.description}</p>
            </div>

            <div className="workspace-footer">
              <span>{ws.metaLeft}</span>
              <span>{ws.metaRight}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
