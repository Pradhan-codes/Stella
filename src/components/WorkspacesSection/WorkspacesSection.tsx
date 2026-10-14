import React from 'react';
import { WorkspaceCardData } from '../../types/dashboard';

interface WorkspacesSectionProps {
  workspaces: WorkspaceCardData[];
}

export const WorkspacesSection: React.FC<WorkspacesSectionProps> = ({ workspaces }) => {
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
        <a
          href="#all-workspaces"
          className="section-link"
          id="link-all-workspaces"
          title="Workspaces explorer preview"
        >
          <span>View all workspaces</span>
          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
            arrow_forward
          </span>
        </a>
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
